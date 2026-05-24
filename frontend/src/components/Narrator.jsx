import { AnimatePresence, motion } from "framer-motion";

const TONE_ICON = { out: "📈", in: "📉", hot: "🔥", calm: "😌", info: "💬" };

export default function Narrator({ events }) {
  return (
    <div className="narrator">
      <div className="narrator-head">📣 What's happening</div>
      {events.length === 0 ? (
        <div className="narrator-empty">
          Press a “Flood” button to start. I'll explain every move the Auto Scaler makes.
        </div>
      ) : (
        <div className="narrator-list">
          <AnimatePresence initial={false}>
            {events.map((e) => (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className={`narrator-item tone-${e.tone}`}
              >
                <span className="narrator-icon">{TONE_ICON[e.tone] || "💬"}</span>
                <span className="narrator-text">{e.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
