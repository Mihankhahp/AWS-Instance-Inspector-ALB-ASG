const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 4000;
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const LOCAL_DEV = process.env.LOCAL_DEV === 'true';

app.use(cors());
app.use(express.json());

// ─── EC2 Metadata helpers (IMDSv2) ──────────────────────────────────────────
const METADATA_BASE = 'http://169.254.169.254/latest';

async function getMetadataToken() {
  const res = await axios.put(`${METADATA_BASE}/api/token`, null, {
    headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
    timeout: 1000,
  });
  return res.data;
}

async function getMetadata(path, token) {
  const res = await axios.get(`${METADATA_BASE}/meta-data/${path}`, {
    headers: { 'X-aws-ec2-metadata-token': token },
    timeout: 1000,
  });
  return res.data;
}

// Resolve the region we're running in: env first (set via systemd), then EC2
// instance metadata, then a safe default. EC2 does NOT set AWS_REGION for us,
// so without this the SDK would query the wrong region and see no ASGs.
let cachedRegion = null;
async function getRegion() {
  if (cachedRegion) return cachedRegion;
  const envRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (envRegion) {
    cachedRegion = envRegion;
    return cachedRegion;
  }
  try {
    const token = await getMetadataToken();
    cachedRegion = await getMetadata('placement/region', token);
  } catch (_) {
    cachedRegion = 'us-east-1';
  }
  return cachedRegion;
}

// ─── Local-dev simulator ─────────────────────────────────────────────────────
// A small in-memory model so the visualizer is fully demoable without AWS.
// Reacts to /api/stress and /stress-fe, scales out/in like a real ASG.
const sim = (() => {
  // Mirrors the production ALB policy: scale out above 500 req/min/instance,
  // scale in below 10 req/min/instance.
  const SCALE_OUT_RPM = 500;
  const SCALE_IN_RPM  = 10;
  const WARMUP_MS   = 8000;
  const DRAIN_MS    = 5000;
  const COOLDOWN_MS = 10000;

  let seq = 1;
  function makeInstance(tier) {
    return {
      id: `i-0${tier[0]}${(seq++).toString().padStart(6, '0')}`,
      az: `${REGION}${seq % 2 ? 'a' : 'b'}`,
      state: 'booting',
      bornAt: Date.now(),
      leaveAt: null,
      cpu: 5,
    };
  }

  function makeFleet(tier) {
    const f = {
      tier,
      asgName: `inspector-${tier}`,
      min: 2,
      max: 4,
      desired: 2,
      scalesOn: 'requests',
      reqCount: 0, // requests received since last tick
      lastScaleAt: 0,
      activities: [],
      instances: [],
    };
    f.instances = [makeInstance(tier), makeInstance(tier)];
    f.instances.forEach((i) => { i.state = 'healthy'; i.bornAt = 0; });
    return f;
  }

  const fleets = { frontend: makeFleet('frontend'), backend: makeFleet('backend') };
  let lastTick = Date.now();

  function logActivity(f, description) {
    f.activities.unshift({
      id: `a-${seq++}`,
      code: 'Successful',
      description,
      cause: 'simulated',
      time: new Date().toISOString(),
    });
    f.activities = f.activities.slice(0, 8);
  }

  function addRequest(tier) {
    const f = fleets[tier];
    if (f) f.reqCount++;
  }

  function tick() {
    const now = Date.now();
    const dt = Math.max((now - lastTick) / 1000, 0.001);
    lastTick = now;

    for (const f of Object.values(fleets)) {
      // Promote booting → healthy after warmup; remove drained instances
      f.instances.forEach((i) => {
        if (i.state === 'booting' && now - i.bornAt > WARMUP_MS) i.state = 'healthy';
      });
      f.instances = f.instances.filter((i) => !(i.state === 'leaving' && now > i.leaveAt));

      const active = f.instances.filter((i) => i.state !== 'leaving');
      const reqPerSec = f.reqCount / dt;
      const reqPerMinPerTarget = active.length ? (reqPerSec * 60) / active.length : 0;
      f.reqCount = 0; // reset for the next tick window

      // CPU tracks request load (caps at ~95%) with per-instance jitter
      f.instances.forEach((i) => {
        const load = i.state === 'leaving' ? 0 : Math.min(90, reqPerMinPerTarget * 1.6);
        const target = Math.min(99, 5 + load + Math.random() * 5);
        i.cpu = Math.round(i.cpu + (target - i.cpu) * Math.min(1, dt * 2));
      });

      const healthy = f.instances.filter((i) => i.state === 'healthy');
      const canScale = now - f.lastScaleAt > COOLDOWN_MS;

      if (canScale && reqPerMinPerTarget > SCALE_OUT_RPM && f.desired < f.max) {
        f.desired++;
        f.instances.push(makeInstance(f.tier));
        f.lastScaleAt = now;
        logActivity(f, `Launching a new EC2 instance: ${Math.round(reqPerMinPerTarget)} req/min/target > ${SCALE_OUT_RPM}`);
      } else if (canScale && reqPerMinPerTarget < SCALE_IN_RPM && f.desired > f.min && healthy.length > f.min) {
        f.desired--;
        const victim = [...f.instances].reverse().find((i) => i.state === 'healthy');
        if (victim) {
          victim.state = 'leaving';
          victim.leaveAt = now + DRAIN_MS;
          f.lastScaleAt = now;
          logActivity(f, `Terminating an EC2 instance: ${Math.round(reqPerMinPerTarget)} req/min/target < ${SCALE_IN_RPM}`);
        }
      }
    }
  }

  function snapshot() {
    tick();
    const toFleet = (f) => {
      const live = f.instances.filter((i) => i.state === 'healthy');
      const avgCpu = live.length ? Math.round(live.reduce((s, i) => s + i.cpu, 0) / live.length) : 0;
      return {
        tier: f.tier,
        asgName: f.asgName,
        min: f.min,
        max: f.max,
        desired: f.desired,
        scalesOn: f.scalesOn,
        avgCpu,
        instances: f.instances.map((i) => ({
          id: i.id,
          az: i.az,
          lifecycle: i.state === 'booting' ? 'Pending' : i.state === 'leaving' ? 'Terminating' : 'InService',
          state: i.state,
          cpu: i.cpu,
        })),
        activities: f.activities,
      };
    };
    return {
      mode: 'local',
      region: REGION,
      timestamp: new Date().toISOString(),
      fleets: [toFleet(fleets.frontend), toFleet(fleets.backend)],
    };
  }

  return { addRequest, snapshot };
})();

// ─── State ─────────────────────────────────────────────────────────────────
let requestCount = 0;
const startTime = Date.now();

function uptimeString() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ─── Routes ────────────────────────────────────────────────────────────────

// Which single instance answered this request (used for the LB round-robin view)
app.get('/api/info', async (req, res) => {
  requestCount++;

  if (LOCAL_DEV) {
    return res.json({
      instanceId: 'i-LOCAL-DEV',
      availabilityZone: `${REGION}a`,
      privateIp: '127.0.0.1',
      instanceType: 't3.micro',
      requestCount,
      uptime: uptimeString(),
    });
  }

  try {
    const token = await getMetadataToken();
    const [instanceId, az, privateIp, instanceType] = await Promise.all([
      getMetadata('instance-id', token),
      getMetadata('placement/availability-zone', token),
      getMetadata('local-ipv4', token),
      getMetadata('instance-type', token),
    ]);
    res.json({ instanceId, availabilityZone: az, privateIp, instanceType, requestCount, uptime: uptimeString() });
  } catch (err) {
    res.status(500).json({ error: 'Not running on EC2. Set LOCAL_DEV=true for local testing.' });
  }
});

// Health check — used by ALB target group
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: uptimeString() });
});

// Stress endpoints — respond immediately; the *volume* of requests from the
// flood buttons is what crosses the 500 req/min/target threshold and triggers
// the ASG scaling policy. No CPU burn needed.
app.get('/api/stress', (req, res) => {
  if (LOCAL_DEV) sim.addRequest('backend');
  res.json({ tier: 'backend', status: 'ok' });
});

// In production Nginx proxies /stress-fe to the tiny Node service on port 5000.
// This route handles local-dev so the frontend flood button works without AWS.
app.get('/stress-fe', (req, res) => {
  if (LOCAL_DEV) sim.addRequest('frontend');
  res.json({ tier: 'frontend', done: true });
});

// ─── Cluster view ────────────────────────────────────────────────────────────
// The endpoint the visualizer polls. Returns the real fleet state for both
// tiers (frontend + backend ASGs) so the UI can draw servers, CPU, and scaling.
let clusterCache = { at: 0, data: null };
const CLUSTER_TTL_MS = 8000;

app.get('/api/cluster', async (req, res) => {
  if (LOCAL_DEV) return res.json(sim.snapshot());

  if (clusterCache.data && Date.now() - clusterCache.at < CLUSTER_TTL_MS) {
    return res.json(clusterCache.data);
  }
  try {
    const data = await getLiveCluster();
    clusterCache = { at: Date.now(), data };
    res.json(data);
  } catch (err) {
    console.error('cluster error:', err.message);
    res.status(502).json({ error: `Could not read AWS cluster state: ${err.message}` });
  }
});

// ─── Live AWS fleet reader (SDK lazy-loaded so LOCAL_DEV needs no AWS deps) ───
async function getLiveCluster() {
  const { AutoScalingClient, DescribeAutoScalingGroupsCommand, DescribeScalingActivitiesCommand } =
    require('@aws-sdk/client-auto-scaling');
  const { CloudWatchClient, GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

  const region = await getRegion();
  const asClient = new AutoScalingClient({ region });
  const cwClient = new CloudWatchClient({ region });

  // 1. Find our two ASGs by the inspector:tier tag
  const groups = [];
  let token;
  do {
    const page = await asClient.send(new DescribeAutoScalingGroupsCommand({ NextToken: token }));
    groups.push(...(page.AutoScalingGroups || []));
    token = page.NextToken;
  } while (token);

  const tierOf = (g) => (g.Tags || []).find((t) => t.Key === 'inspector:tier')?.Value;
  const ours = groups.filter((g) => ['frontend', 'backend'].includes(tierOf(g)));

  // 2. Gather every instance id so we can pull CPU in one CloudWatch call
  const allInstanceIds = ours.flatMap((g) => (g.Instances || []).map((i) => i.InstanceId));
  const cpuById = await getCpuByInstance(cwClient, GetMetricDataCommand, allInstanceIds);

  // 3. Recent scaling activities per group (for the narrator)
  const fleets = await Promise.all(
    ours.map(async (g) => {
      const tier = tierOf(g);
      let activities = [];
      try {
        const act = await asClient.send(
          new DescribeScalingActivitiesCommand({ AutoScalingGroupName: g.AutoScalingGroupName, MaxRecords: 8 }),
        );
        activities = (act.Activities || []).map((a) => ({
          id: a.ActivityId,
          code: a.StatusCode,
          description: a.Description,
          cause: a.Cause,
          time: a.StartTime,
        }));
      } catch (_) {}

      const instances = (g.Instances || []).map((i) => ({
        id: i.InstanceId,
        az: i.AvailabilityZone,
        lifecycle: i.LifecycleState,
        state: mapLifecycle(i.LifecycleState, i.HealthStatus),
        cpu: cpuById[i.InstanceId] ?? null,
      }));

      const live = instances.filter((i) => i.cpu != null);
      const avgCpu = live.length ? Math.round(live.reduce((s, i) => s + i.cpu, 0) / live.length) : null;

      return {
        tier,
        asgName: g.AutoScalingGroupName,
        min: g.MinSize,
        max: g.MaxSize,
        desired: g.DesiredCapacity,
        scalesOn: 'requests',
        avgCpu,
        instances,
        activities,
      };
    }),
  );

  // Stable order: frontend first, then backend
  fleets.sort((a, b) => (a.tier === 'frontend' ? -1 : 1));

  return { mode: 'live', region, timestamp: new Date().toISOString(), fleets };
}

async function getCpuByInstance(cwClient, GetMetricDataCommand, instanceIds) {
  if (!instanceIds.length) return {};
  const queries = instanceIds.map((id, idx) => ({
    Id: `cpu${idx}`,
    MetricStat: {
      Metric: {
        Namespace: 'AWS/EC2',
        MetricName: 'CPUUtilization',
        Dimensions: [{ Name: 'InstanceId', Value: id }],
      },
      Period: 60,
      Stat: 'Average',
    },
    ReturnData: true,
  }));

  const result = await cwClient.send(
    new GetMetricDataCommand({
      StartTime: new Date(Date.now() - 10 * 60 * 1000),
      EndTime: new Date(),
      MetricDataQueries: queries,
      ScanBy: 'TimestampDescending',
    }),
  );

  const byId = {};
  (result.MetricDataResults || []).forEach((r) => {
    const idx = parseInt(r.Id.replace('cpu', ''), 10);
    const id = instanceIds[idx];
    if (r.Values && r.Values.length) byId[id] = Math.round(r.Values[0]);
  });
  return byId;
}

function mapLifecycle(lifecycle = '', health = '') {
  if (health && health !== 'Healthy' && lifecycle === 'InService') return 'unhealthy';
  if (lifecycle === 'InService') return 'healthy';
  if (lifecycle.startsWith('Terminating') || lifecycle === 'Detaching') return 'leaving';
  return 'booting'; // Pending, Pending:Wait, Pending:Proceed, etc.
}

app.listen(PORT, () => {
  console.log(`Instance Inspector API running on :${PORT}`);
  console.log(`Mode: ${LOCAL_DEV ? 'LOCAL_DEV (simulated cluster)' : 'LIVE (region ' + REGION + ')'}`);
});
