import { motion } from "framer-motion";
import { cpuColor, heatEmoji, shortId, STATE_META } from "../theme";

export default function ServerCard({ instance, tierColor }) {
  const { id, az, cpu, state } = instance;
  const meta = STATE_META[state] || STATE_META.healthy;
  const isBooting = state === "booting";
  const isLeaving = state === "leaving";
  const color = isBooting || isLeaving ? meta.color : cpuColor(cpu);
  const fill = cpu == null ? 0 : Math.max(3, Math.min(100, cpu));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.6, y: 16 }}
      animate={{ opacity: isLeaving ? 0.55 : 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.6, y: -16 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="card"
      style={{ borderColor: color + "88", boxShadow: `0 0 0 1px ${color}22, 0 6px 18px #0008` }}
    >
      <div className="card-top">
        <span className="card-id" title={id}>
          {isBooting ? <span className="spinner" /> : <span>🖥️</span>} {shortId(id)}
        </span>
        <span className="state-dot" style={{ background: meta.dot }} />
      </div>

      <div className="card-az">🌍 {az}</div>

      {isBooting ? (
        <div className="card-booting">
          <div className="shimmer" />
          <span>starting up…</span>
        </div>
      ) : (
        <>
          <div className="gauge">
            <motion.div
              className="gauge-fill"
              style={{ background: color }}
              animate={{ width: `${fill}%` }}
              transition={{ type: "tween", duration: 0.5 }}
            />
          </div>
          <div className="card-cpu">
            <span style={{ color }}>{cpu == null ? "—" : `${cpu}%`} CPU</span>
            <span className="heat">{heatEmoji(cpu)}</span>
          </div>
        </>
      )}

      <div className="card-state" style={{ color: meta.color }}>
        {meta.label}
      </div>
    </motion.div>
  );
}
