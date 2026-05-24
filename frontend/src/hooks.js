import { useState, useEffect, useRef, useCallback } from "react";

// Poll /api/cluster on an interval and expose the latest fleet snapshot.
export function useCluster(intervalMs = 2500) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/cluster");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (alive) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e.message);
      }
    }
    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { data, error };
}

// Sustained load generator: while active, fire `intensity` concurrent requests
// every 2.5s so server CPU stays high long enough for the ASG alarm to fire.
export function useFlood(path, intensityRef, onFire) {
  const [active, setActive] = useState(false);
  const timerRef = useRef(null);

  const fireBatch = useCallback(() => {
    const n = intensityRef.current;
    for (let k = 0; k < n; k++) {
      fetch(`${path}?ms=3000`).catch(() => {});
    }
    onFire?.(n);
  }, [path, intensityRef, onFire]);

  useEffect(() => {
    if (active) {
      fireBatch();
      timerRef.current = setInterval(fireBatch, 2500);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [active, fireBatch]);

  return {
    active,
    toggle: () => setActive((a) => !a),
    stop: () => setActive(false),
  };
}
