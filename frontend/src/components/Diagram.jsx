import Fleet from "./Fleet";
import { TIER, AWS_ORANGE } from "../theme";

function Flow({ active, color }) {
  return (
    <div
      className={`flow ${active ? "flow-on" : ""}`}
      style={{ "--flow-color": color, animationDuration: active ? "0.9s" : "2.4s" }}
    />
  );
}

export default function Diagram({ fleets, flood }) {
  const byTier = Object.fromEntries(fleets.map((f) => [f.tier, f]));
  const order = ["frontend", "backend"].filter((t) => byTier[t]);
  const anyActive = flood.frontend || flood.backend;

  return (
    <div className="diagram">
      <div className="node users">
        <div className="node-emoji">👥</div>
        <div className="node-title">Users</div>
        <div className="node-sub">people opening the app</div>
      </div>

      <Flow active={anyActive} color={AWS_ORANGE} />

      <div className="node lb">
        <div className="node-emoji">⚖️</div>
        <div>
          <div className="node-title">Load Balancer <span className="tag">ALB</span></div>
          <div className="node-sub">sends each request to a server that isn't busy</div>
        </div>
      </div>

      <div className="split">
        {order.map((t) => (
          <div key={t} className="split-leg">
            <Flow active={!!flood[t]} color={TIER[t].color} />
          </div>
        ))}
      </div>

      <div className="fleets">
        {order.map((t) => (
          <Fleet key={t} fleet={byTier[t]} />
        ))}
      </div>
    </div>
  );
}
