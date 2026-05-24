import { AnimatePresence, motion } from "framer-motion";
import ServerCard from "./ServerCard";
import { TIER, cpuColor } from "../theme";

export default function Fleet({ fleet }) {
  const meta = TIER[fleet.tier] || { label: fleet.tier, sub: "", color: "#8b949e", emoji: "🖥️" };
  const instances = fleet.instances || [];
  const ghostCount = Math.max(0, (fleet.desired || 0) - instances.length);
  const avg = fleet.avgCpu;

  return (
    <div className="fleet" style={{ borderTopColor: meta.color }}>
      <div className="fleet-head">
        <div>
          <div className="fleet-title" style={{ color: meta.color }}>
            {meta.emoji} {meta.label} fleet
          </div>
          <div className="fleet-sub">{meta.sub}</div>
        </div>
        <span className="badge">scales on {fleet.scalesOn === 'requests' ? 'requests' : 'CPU'}</span>
      </div>

      <div className="fleet-meta">
        <span>
          <strong style={{ color: meta.color }}>{instances.filter((i) => i.state !== "leaving").length}</strong> servers
          <span className="muted"> (min {fleet.min} · max {fleet.max})</span>
        </span>
        <span>
          avg CPU <strong style={{ color: cpuColor(avg) }}>{avg == null ? "—" : `${avg}%`}</strong>
        </span>
      </div>

      <div className="fleet-grid">
        <AnimatePresence mode="popLayout">
          {instances.map((inst) => (
            <ServerCard key={inst.id} instance={inst} tierColor={meta.color} />
          ))}
          {Array.from({ length: ghostCount }).map((_, i) => (
            <motion.div
              key={`ghost-${i}`}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="card ghost"
            >
              <div className="spinner big" />
              <div className="ghost-label">waiting for AWS…</div>
              <div className="ghost-sub">the Auto Scaler is launching a server</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
