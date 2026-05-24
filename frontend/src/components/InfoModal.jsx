import { motion } from "framer-motion";

const ITEMS = [
  {
    icon: "🖥️",
    term: "EC2 instance",
    plain: "A computer in Amazon's cloud. We call each one a “server.” It does the actual work.",
  },
  {
    icon: "⚖️",
    term: "Load Balancer (ALB)",
    plain: "Like a teacher handing out worksheets evenly. Every request goes to a server that isn't too busy, so no single server gets overwhelmed.",
  },
  {
    icon: "📊",
    term: "CPU %",
    plain: "How hard a server is working right now — shown as a health indicator. 0% = idle, 100% = maxed out. This app scales on request count, not CPU.",
  },
  {
    icon: "🤖",
    term: "Auto Scaling Group (ASG)",
    plain: "The robot manager. It watches how many requests per minute are hitting each server. Too many requests? It hires more servers (scale OUT). Traffic drops? It sends some home to save money (scale IN).",
  },
  {
    icon: "⏳",
    term: "Why the wait?",
    plain: "Real AWS doesn't add servers instantly — it waits ~1–2 minutes to be sure the rush is real, then a new server takes a moment to boot up.",
  },
];

export default function InfoModal({ onClose }) {
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>How it works</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="modal-intro">
          This app runs on real Amazon servers. Add traffic and watch the cloud grow and shrink to
          handle it — exactly how big websites stay fast during a rush.
        </p>
        <div className="modal-items">
          {ITEMS.map((it) => (
            <div className="modal-item" key={it.term}>
              <span className="modal-item-icon">{it.icon}</span>
              <div>
                <div className="modal-item-term">{it.term}</div>
                <div className="modal-item-plain">{it.plain}</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
