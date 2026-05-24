import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import { Construct } from 'constructs';

class ComputeConstruct extends Construct {
  constructor(scope, id, props) {
    super(scope, id, props);

    const {
      vpc,
      frontendSg,
      backendSg,
      instanceRole,
      frontendBucket,
      backendBucket,
      frontendTg,
      backendTg,
      alb,
      frontendDeployment,
      backendDeployment,
    } = props;

    const region = cdk.Stack.of(this).region;
    const ami = ec2.MachineImage.latestAmazonLinux2023();

    // ── User Data: Frontend ───────────────────────────────────────────────
    const frontendUserData = ec2.UserData.forLinux();
    frontendUserData.addCommands(
      'yum update -y',
      'yum install -y nginx',
      // Node is needed only for the tiny CPU-burn service that lets the demo
      // stress the frontend tier (Nginx itself barely uses CPU serving statics).
      'curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -',
      'yum install -y nodejs',
      // Nginx config: serve the SPA on 3000 and proxy /stress-fe to the burner
      `cat > /etc/nginx/conf.d/app.conf << 'EOF'
server {
    listen 3000;
    root /usr/share/nginx/html;
    index index.html;
    location /stress-fe {
        proxy_pass http://127.0.0.1:5000;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
    gzip on;
    gzip_types text/plain application/javascript text/css application/json image/svg+xml;
}
EOF`,
      // Remove default server block (binds port 80, conflicts with target group)
      'rm -f /etc/nginx/conf.d/default.conf',
      // Pull built React app from S3
      'mkdir -p /usr/share/nginx/html',
      `aws s3 sync s3://${frontendBucket.bucketName}/ /usr/share/nginx/html/ --region ${region}`,
      'chown -R nginx:nginx /usr/share/nginx/html',
      // Tiny responder on 127.0.0.1:5000 — only reachable via the Nginx proxy.
      // Responds immediately; request *volume* (not CPU) triggers the ASG policy.
      'mkdir -p /opt/stress',
      `cat > /opt/stress/stress.js << 'EOF'
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ tier: 'frontend', done: true }));
}).listen(5000, '127.0.0.1', () => console.log('frontend stress responder on 5000'));
EOF`,
      `cat > /etc/systemd/system/stress-fe.service << 'EOF'
[Unit]
Description=Frontend CPU burner
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /opt/stress/stress.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF`,
      // CloudWatch agent — ships Nginx access/error logs to the log group
      'yum install -y amazon-cloudwatch-agent',
      `cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/nginx/access.log",
            "log_group_name": "/inspector/frontend",
            "log_stream_name": "{instance_id}/access"
          },
          {
            "file_path": "/var/log/nginx/error.log",
            "log_group_name": "/inspector/frontend",
            "log_stream_name": "{instance_id}/error"
          }
        ]
      }
    }
  }
}
EOF`,
      '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json',
      'systemctl daemon-reload',
      'systemctl start stress-fe',
      'systemctl enable stress-fe',
      'systemctl start nginx',
      'systemctl enable nginx',
    );

    // ── User Data: Backend ────────────────────────────────────────────────
    const backendUserData = ec2.UserData.forLinux();
    backendUserData.addCommands(
      'yum update -y',
      'curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -',
      'yum install -y nodejs amazon-cloudwatch-agent',
      'mkdir -p /app /var/log/inspector',
      `aws s3 sync s3://${backendBucket.bucketName}/ /app/ --region ${region}`,
      'cd /app && npm install',
      `cat > /etc/systemd/system/app.service << 'EOF'
[Unit]
Description=Instance Inspector Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/app
Environment=AWS_REGION=${region}
Environment=AWS_DEFAULT_REGION=${region}
Environment=ALB_FULL_NAME=${alb.loadBalancerFullName}
Environment=FRONTEND_TG_FULL_NAME=${frontendTg.targetGroupFullName}
Environment=BACKEND_TG_FULL_NAME=${backendTg.targetGroupFullName}
ExecStart=/usr/bin/node /app/server.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/inspector/backend.log
StandardError=append:/var/log/inspector/backend.log

[Install]
WantedBy=multi-user.target
EOF`,
      // CloudWatch agent — ships /var/log/inspector/backend.log to the log group
      `cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/inspector/backend.log",
            "log_group_name": "/inspector/backend",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
EOF`,
      '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json',
      'systemctl daemon-reload',
      'systemctl start app',
      'systemctl enable app',
    );

    // ── Launch Templates ──────────────────────────────────────────────────
    const frontendLt = new ec2.LaunchTemplate(this, 'FrontendLt', {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      machineImage: ami,
      securityGroup: frontendSg,
      role: instanceRole,
      userData: frontendUserData,
      associatePublicIpAddress: true,
      // 1-min CPU metrics so the demo reacts in ~1 min instead of ~5
      detailedMonitoring: true,
    });

    const backendLt = new ec2.LaunchTemplate(this, 'BackendLt', {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      machineImage: ami,
      securityGroup: backendSg,
      role: instanceRole,
      userData: backendUserData,
      associatePublicIpAddress: true,
      detailedMonitoring: true,
    });

    // ── Auto Scaling Groups ───────────────────────────────────────────────
    this.frontendAsg = new autoscaling.AutoScalingGroup(this, 'FrontendAsg', {
      vpc,
      launchTemplate: frontendLt,
      minCapacity: 2,
      maxCapacity: 4,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    this.backendAsg = new autoscaling.AutoScalingGroup(this, 'BackendAsg', {
      vpc,
      launchTemplate: backendLt,
      minCapacity: 2,
      maxCapacity: 4,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // Tag both groups so the backend can discover them via DescribeAutoScalingGroups
    cdk.Tags.of(this.frontendAsg).add('inspector:tier', 'frontend');
    cdk.Tags.of(this.backendAsg).add('inspector:tier', 'backend');

    // Ensure S3 files are uploaded before EC2s boot
    this.frontendAsg.node.addDependency(frontendDeployment);
    this.backendAsg.node.addDependency(backendDeployment);

    // attachToApplicationTargetGroup must come before scaleOnRequestCount —
    // CDK needs the ALB association established before building the metric.
    this.frontendAsg.attachToApplicationTargetGroup(frontendTg);
    this.backendAsg.attachToApplicationTargetGroup(backendTg);

    // Traffic-based scaling: triggers when ALB routes more than 500 req/min
    // to each target instance.
    this.frontendAsg.scaleOnRequestCount('FrontendRequestScale', {
      targetRequestsPerMinute: 500,
      targetGroup: frontendTg,
      estimatedInstanceWarmup: cdk.Duration.seconds(60),
    });
    this.backendAsg.scaleOnRequestCount('BackendRequestScale', {
      targetRequestsPerMinute: 500,
      targetGroup: backendTg,
      estimatedInstanceWarmup: cdk.Duration.seconds(60),
    });

    // Enable ASG group metrics (off by default in AWS).
    // Without this the Dashboard capacity widgets have no data.
    for (const asg of [this.frontendAsg, this.backendAsg]) {
      const cfnAsg = asg.node.defaultChild;
      cfnAsg.metricsCollection = [
        {
          granularity: '1Minute',
          metrics: [
            'GroupDesiredCapacity',
            'GroupInServiceInstances',
            'GroupPendingInstances',
            'GroupTerminatingInstances',
          ],
        },
      ];
    }
  }
}

export { ComputeConstruct };
