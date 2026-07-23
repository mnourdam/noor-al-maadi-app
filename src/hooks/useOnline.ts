// ============================================================
// useOnline — reactive navigator.onLine
// ------------------------------------------------------------
// Reactions (§P6.1) are intentionally online-only. Components
// use this hook to disable controls and show a small offline
// hint. No outbox, no optimistic success.
// ============================================================

import { useEffect, useState } from "react";

function currentlyOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => currentlyOnline());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Sync once in case the initial SSR value drifted from the client.
    setOnline(currentlyOnline());
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}
