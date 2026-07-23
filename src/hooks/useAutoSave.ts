// Debounced auto-save hook. `saver` is called at most once per debounce
// window, with the LATEST value. Returns state useful for UI indicators.

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function useAutoSave<T>(
  value: T,
  saver: (v: T) => Promise<void>,
  opts: { delayMs?: number; enabled?: boolean } = {},
) {
  const { delayMs = 1000, enabled = true } = opts;
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(value);
  const lastSaved = useRef<T | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  latest.current = value;

  const flush = useCallback(async () => {
    if (inflight.current) { await inflight.current.catch(() => {}); }
    const snapshot = latest.current;
    setStatus("saving");
    setError(null);
    const p = (async () => {
      try {
        await saver(snapshot);
        lastSaved.current = snapshot;
        // If nothing changed during save, mark saved. Otherwise remain dirty.
        if (latest.current === snapshot) {
          setStatus("saved");
          if (savedTimer.current) clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setStatus((s) => s === "saved" ? "idle" : s), 1800);
        } else {
          setStatus("dirty");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = p;
    await p;
  }, [saver]);

  useEffect(() => {
    if (!enabled) return;
    if (lastSaved.current === value) return;   // no-op on first mount
    if (lastSaved.current === null) { lastSaved.current = value; return; }
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, delayMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, delayMs, enabled, flush]);

  // Browser-close protection while dirty or saving.
  useEffect(() => {
    if (status !== "dirty" && status !== "saving") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  return { status, error, flushNow: flush, isDirty: status === "dirty" || status === "saving" };
}
