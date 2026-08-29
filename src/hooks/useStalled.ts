import { useEffect, useState } from "react";

/**
 * Fail-safe for "permanent spinner" states.
 *
 * Returns true only after `active` has stayed true for `ms` without
 * settling. Generous by design (default 20s) so slow-but-valid loads on
 * poor Android connections still finish normally; it exists purely so a
 * route can eventually show a controlled unavailable state instead of an
 * endless "جارٍ التحميل…".
 */
export function useStalled(active: boolean, ms = 20_000): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!active) {
      setStalled(false);
      return;
    }
    const t = setTimeout(() => setStalled(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return active && stalled;
}
