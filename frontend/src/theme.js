// Shared colors + tiny helpers used across the visualizer.

export const TIER = {
  frontend: { label: "Frontend", sub: "the web servers people see", color: "#58a6ff", emoji: "🖥️" },
  backend: { label: "Backend", sub: "the brains doing the work", color: "#a371f7", emoji: "⚙️" },
};

export const AWS_ORANGE = "#ff9900";

// CPU "heat" → colour. Cool green ramps up to a hot red.
export function cpuColor(cpu) {
  if (cpu == null) return "#6e7681";
  if (cpu < 40) return "#3fb950"; // calm
  if (cpu < 60) return "#d29922"; // warming
  if (cpu < 80) return "#ff9900"; // busy
  return "#f85149"; // overloaded
}

// A face/emoji that tells the story of how hard a server is working.
export function heatEmoji(cpu) {
  if (cpu == null) return "💤";
  if (cpu < 40) return "🙂";
  if (cpu < 60) return "😐";
  if (cpu < 80) return "😅";
  return "🔥";
}

export const STATE_META = {
  booting: { label: "starting up", color: "#d29922", dot: "#d29922" },
  healthy: { label: "ready", color: "#3fb950", dot: "#3fb950" },
  leaving: { label: "shutting down", color: "#f85149", dot: "#f85149" },
  unhealthy: { label: "unhealthy", color: "#f85149", dot: "#f85149" },
};

// "i-0abc1234567890def" → "i-0abc…def"
export function shortId(id = "") {
  if (id.length <= 12) return id;
  return id.slice(0, 7) + "…" + id.slice(-4);
}
