import { TIER } from "../theme";

export default function ControlPanel({ frontendFlood, backendFlood, intensity, setIntensity, onStopAll }) {
  const anyActive = frontendFlood.active || backendFlood.active;

  return (
    <div className="controls">
      <div className="controls-row">
        <button
          className={`flood-btn ${frontendFlood.active ? "on" : ""}`}
          style={{ "--btn-color": TIER.frontend.color }}
          onClick={frontendFlood.toggle}
        >
          {frontendFlood.active ? "🔥 Flooding Frontend…" : "🖥️ Flood Frontend"}
        </button>

        <button
          className={`flood-btn ${backendFlood.active ? "on" : ""}`}
          style={{ "--btn-color": TIER.backend.color }}
          onClick={backendFlood.toggle}
        >
          {backendFlood.active ? "🔥 Flooding Backend…" : "⚙️ Flood Backend"}
        </button>

        <button className="stop-btn" onClick={onStopAll} disabled={!anyActive}>
          ⏹ Stop
        </button>
      </div>

      <div className="controls-row slider-row">
        <label htmlFor="intensity">Traffic strength</label>
        <input
          id="intensity"
          type="range"
          min="5"
          max="100"
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
        />
        <span className="slider-val">{intensity} requests / wave</span>
      </div>

      <p className="controls-hint">
        Pour traffic onto a fleet and watch the servers heat up. When requests per server exceed
        the threshold, the Auto Scaler launches a new one. Go quiet and servers get terminated to
        save money.
      </p>
    </div>
  );
}
