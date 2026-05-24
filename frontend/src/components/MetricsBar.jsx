import { cpuColor, TIER } from "../theme";

function Metric({ label, value, color, sub }) {
  return (
    <div className="metric">
      <div className="metric-value" style={{ color: color || "#e6edf3" }}>{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export default function MetricsBar({ fleets, requestsSent }) {
  const byTier = Object.fromEntries(fleets.map((f) => [f.tier, f]));
  const totalServers = fleets.reduce(
    (n, f) => n + (f.instances || []).filter((i) => i.state !== "leaving").length,
    0,
  );
  const fe = byTier.frontend;
  const be = byTier.backend;

  return (
    <div className="metrics">
      <Metric label="Servers running" value={totalServers} color="#e6edf3" sub="across both fleets" />
      <Metric
        label="Frontend avg CPU"
        value={fe?.avgCpu == null ? "—" : `${fe.avgCpu}%`}
        color={cpuColor(fe?.avgCpu)}
        sub="health indicator · scales on requests"
      />
      <Metric
        label="Backend avg CPU"
        value={be?.avgCpu == null ? "—" : `${be.avgCpu}%`}
        color={cpuColor(be?.avgCpu)}
        sub="health indicator · scales on requests"
      />
      <Metric label="Requests sent" value={requestsSent.toLocaleString()} color="#ff9900" sub="by you, just now" />
    </div>
  );
}
