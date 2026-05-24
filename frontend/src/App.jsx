import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { useCluster, useFlood } from "./hooks";
import { TIER } from "./theme";
import Diagram from "./components/Diagram";
import ControlPanel from "./components/ControlPanel";
import MetricsBar from "./components/MetricsBar";
import Narrator from "./components/Narrator";
import InfoModal from "./components/InfoModal";

let eventId = 0;

export default function App() {
  const { data, error } = useCluster(25000);
  const [intensity, setIntensity] = useState(15);
  const [requestsSent, setRequestsSent] = useState(0);
  const [events, setEvents] = useState([]);
  const [showInfo, setShowInfo] = useState(false);

  const intensityRef = useRef(intensity);
  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  const bumpRequests = useCallback((n) => setRequestsSent((r) => r + n), []);

  const frontendFlood = useFlood("/stress-fe", intensityRef, bumpRequests);
  const backendFlood = useFlood("/api/stress", intensityRef, bumpRequests);

  function pushEvent(text, tone) {
    setEvents((prev) => [{ id: ++eventId, text, tone }, ...prev].slice(0, 14));
  }

  // Diff each cluster snapshot against the last to narrate scaling moves.
  const prevRef = useRef(null);
  useEffect(() => {
    if (!data) return;
    const prev = prevRef.current;
    prevRef.current = data;
    if (!prev) return;

    const prevByTier = Object.fromEntries(prev.fleets.map((f) => [f.tier, f]));
    for (const f of data.fleets) {
      const p = prevByTier[f.tier];
      if (!p) continue;
      const name = TIER[f.tier]?.label || f.tier;

      if (f.desired > p.desired)
        pushEvent(`${name} has hit the request threshold — the Auto Scaler is launching a new server (target: ${f.desired}).`, "out");
      if (f.desired < p.desired)
        pushEvent(`${name} request load dropped — the Auto Scaler is terminating a server to save money (target: ${f.desired}).`, "in");

      // A booting server became ready
      const prevStates = Object.fromEntries(p.instances.map((i) => [i.id, i.state]));
      for (const inst of f.instances) {
        if (prevStates[inst.id] === "booting" && inst.state === "healthy")
          pushEvent(`A new ${name} server finished booting and is now taking traffic. 🎉`, "out");
      }

      // CPU crossing commentary — CPU is a health indicator, not the scaling trigger
      if (p.avgCpu != null && f.avgCpu != null) {
        if (p.avgCpu < 75 && f.avgCpu >= 75) pushEvent(`${name} servers are heating up under the load — avg CPU at ${f.avgCpu}%.`, "hot");
        if (p.avgCpu >= 40 && f.avgCpu < 40 && f.avgCpu > 0) pushEvent(`${name} has cooled down — avg CPU back to ${f.avgCpu}%.`, "calm");
      }
    }
  }, [data]);

  const stopAll = () => {
    frontendFlood.stop();
    backendFlood.stop();
  };

  const flood = { frontend: frontendFlood.active, backend: backendFlood.active };
  const fleets = data?.fleets || [];

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>🔍 Instance Inspector</h1>
          <p>Watch AWS add and remove servers as you pour traffic on the app.</p>
        </div>
        <div className="header-right">
          {data && (
            <span className={`mode-pill ${data.mode}`}>
              {data.mode === "live" ? "● LIVE on AWS" : "● LOCAL demo"}
              {data.region ? ` · ${data.region}` : ""}
            </span>
          )}
          <button className="info-btn" onClick={() => setShowInfo(true)}>
            How it works
          </button>
        </div>
      </header>

      {error && !data && (
        <div className="banner error">
          Couldn't reach the cluster: {error}. Is the backend running? (Local dev needs{" "}
          <code>LOCAL_DEV=true</code>.)
        </div>
      )}

      {data && <MetricsBar fleets={fleets} requestsSent={requestsSent} />}

      <ControlPanel
        frontendFlood={frontendFlood}
        backendFlood={backendFlood}
        intensity={intensity}
        setIntensity={setIntensity}
        onStopAll={stopAll}
      />

      <div className="main">
        {data ? (
          <Diagram fleets={fleets} flood={flood} />
        ) : (
          !error && <div className="loading">Connecting to the cluster…</div>
        )}
        <Narrator events={events} />
      </div>

      <footer className="footer">
        Instance Inspector · a hands-on look at AWS Load Balancers &amp; Auto Scaling Groups
      </footer>

      <AnimatePresence>{showInfo && <InfoModal onClose={() => setShowInfo(false)} />}</AnimatePresence>
    </div>
  );
}
