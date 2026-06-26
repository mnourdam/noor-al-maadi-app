// ============================================================
// Android Input Trace
// ------------------------------------------------------------
// Pure instrumentation. No fixes. Captures the exact sequence
// of input/IME/pointer/frame events around the first keystroke
// in the Android WebView so we can identify what blocks the
// main thread.
//
// All entries are appended to `window.__IRTH_INPUT_TRACE__`
// and can be exported via /debug/input-trace.
// ============================================================

declare global {
  interface Window {
    __IRTH_INPUT_TRACE__?: TraceEntry[];
    __irthInputTraceInstalled?: boolean;
    __irthForceDumpInputTrace?: () => TraceEntry[];
    IrthNativeDiagnostics?: {
      logInputEvent?: (eventName: string, payload: string) => void;
    };
  }
}

export type TraceEntry = {
  t: number; // performance.now()
  kind: string;
  route?: string;
  target?: {
    tag?: string;
    type?: string;
    name?: string;
    id?: string;
    cls?: string;
    path?: string;
  };
  data?: Record<string, unknown>;
};

const MAX_ENTRIES = 2000;
const FREEZE_STORAGE_KEY = "irth_input_trace_last_freeze";
const INPUT_WINDOW_MS = 5_000;
const FREEZE_THRESHOLD_MS = 500;

export function hasStoredInputFreezeTrace(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(FREEZE_STORAGE_KEY));
  } catch {
    return false;
  }
}

function isAndroid(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if ((window as any).Capacitor?.isNativePlatform?.()) return true;
  } catch { /* ignore */ }
  return /Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

function describeTarget(el: EventTarget | null): TraceEntry["target"] {
  if (!el || !(el as any).tagName) return undefined;
  const e = el as HTMLElement & { type?: string; name?: string };
  return {
    tag: e.tagName,
    type: (e as HTMLInputElement).type,
    name: (e as HTMLInputElement).name,
    id: e.id || undefined,
    cls: typeof e.className === "string" ? e.className.slice(0, 120) : undefined,
  };
}

function targetPath(ev: Event): string | undefined {
  try {
    const path = (ev.composedPath?.() ?? []) as HTMLElement[];
    return path
      .slice(0, 8)
      .map((n) => {
        if (!n || !(n as any).tagName) return "";
        const id = n.id ? `#${n.id}` : "";
        const cls = typeof n.className === "string" && n.className
          ? `.${n.className.split(/\s+/).slice(0, 2).join(".")}`
          : "";
        return `${n.tagName.toLowerCase()}${id}${cls}`;
      })
      .filter(Boolean)
      .join(" > ");
  } catch { return undefined; }
}

function push(entry: TraceEntry) {
  const arr = window.__IRTH_INPUT_TRACE__!;
  arr.push(entry);
  if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);
}

function nativeLog(kind: string, ev?: Event, data?: Record<string, unknown>) {
  try {
    window.IrthNativeDiagnostics?.logInputEvent?.(kind, JSON.stringify({
      t: Math.round(performance.now()),
      route: typeof location !== "undefined" ? location.pathname + location.hash : undefined,
      target: ev ? describeTarget(ev.target) : undefined,
      path: ev ? targetPath(ev) : undefined,
      active: document.activeElement ? describeTarget(document.activeElement) : undefined,
      data,
    }));
  } catch { /* native logging must never affect input */ }
}

function dumpTraceToConsoleAndStorage(reason: string): TraceEntry[] {
  const arr = window.__IRTH_INPUT_TRACE__ ?? [];
  const payload = JSON.stringify(arr, null, 2);
  try {
    window.localStorage.setItem(FREEZE_STORAGE_KEY, payload);
  } catch { /* ignore */ }
  // eslint-disable-next-line no-console
  console.log("IRTH_INPUT_TRACE_JSON_START");
  // eslint-disable-next-line no-console
  console.log(payload);
  // eslint-disable-next-line no-console
  console.log("IRTH_INPUT_TRACE_JSON_END", reason);
  return arr;
}

function log(kind: string, ev?: Event, data?: Record<string, unknown>) {
  try {
    const t = performance.now();
    const target = ev ? describeTarget(ev.target) : undefined;
    const path = ev ? targetPath(ev) : undefined;
    push({
      t,
      kind,
      route: typeof location !== "undefined" ? location.pathname + location.hash : undefined,
      target: target ? { ...target, path } : path ? { path } : undefined,
      data,
    });
  } catch { /* ignore */ }
}

export function installAndroidInputTrace(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!isAndroid()) return;
  if (window.__irthInputTraceInstalled) return;
  window.__irthInputTraceInstalled = true;
  window.__IRTH_INPUT_TRACE__ = window.__IRTH_INPUT_TRACE__ ?? [];

  const opts: AddEventListenerOptions = { capture: true, passive: true };
  let lastInputSignalAt = -Infinity;

  const markInputSignal = () => {
    lastInputSignalAt = performance.now();
  };

  const maybeDumpFreezeTrace = (kind: string, duration: number, startTime?: number) => {
    const now = performance.now();
    if (duration <= FREEZE_THRESHOLD_MS) return;
    const freezeStartedAt = typeof startTime === "number" ? startTime : now - duration;
    const msAfterInputSignal = freezeStartedAt - lastInputSignalAt;
    if (msAfterInputSignal < 0 || msAfterInputSignal > INPUT_WINDOW_MS) return;
    log("auto-freeze-dump", undefined, {
      trigger: kind,
      duration: Math.round(duration),
      msAfterInputSignal: Math.round(msAfterInputSignal),
    });
    dumpTraceToConsoleAndStorage(`${kind}:${Math.round(duration)}ms`);
  };

  const evs = [
    "focusin", "focusout",
    "beforeinput", "input",
    "keydown", "keyup",
    "compositionstart", "compositionupdate", "compositionend",
    "pointerdown", "pointerup",
    "touchstart", "touchend",
  ];
  for (const name of evs) {
    document.addEventListener(name, (ev) => {
      if (name === "focusin" || name === "beforeinput" || name === "keydown" || name === "input") {
        nativeLog(name, ev);
      }
      if (name === "focusin" || name === "beforeinput" || name === "keydown" || name === "input") {
        markInputSignal();
      }
      log(name, ev);
    }, opts);
  }

  document.addEventListener("selectionchange", () => {
    const a = document.activeElement;
    log("selectionchange", undefined, {
      activeTag: a?.tagName,
      activeId: (a as HTMLElement)?.id,
    });
  }, { passive: true });

  // Long Task observer
  try {
    const PO = (window as any).PerformanceObserver;
    if (PO) {
      const obs = new PO((list: any) => {
        for (const entry of list.getEntries()) {
          log("longtask", undefined, {
            duration: Math.round(entry.duration),
            startTime: Math.round(entry.startTime),
            name: entry.name,
          });
          maybeDumpFreezeTrace("longtask", entry.duration, entry.startTime);
        }
      });
      try { obs.observe({ type: "longtask", buffered: true }); }
      catch { obs.observe({ entryTypes: ["longtask"] }); }
    }
  } catch { /* ignore */ }

  // rAF heartbeat — flag gaps > 100ms
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    const gap = now - last;
    if (gap > 100) {
      log("frame-gap", undefined, { gap: Math.round(gap) });
      maybeDumpFreezeTrace("frame-gap", gap);
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  log("trace-installed", undefined, {
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio,
  });

  // Console helpers
  (window as any).__irthDumpInputTrace = () => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(window.__IRTH_INPUT_TRACE__, null, 2));
    return window.__IRTH_INPUT_TRACE__;
  };
  window.__irthForceDumpInputTrace = () => dumpTraceToConsoleAndStorage("manual");
  (window as any).__irthClearInputTrace = () => {
    window.__IRTH_INPUT_TRACE__ = [];
    try { window.localStorage.removeItem(FREEZE_STORAGE_KEY); } catch { /* ignore */ }
  };
}

export { FREEZE_STORAGE_KEY as IRTH_INPUT_TRACE_FREEZE_STORAGE_KEY };
