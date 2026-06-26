type AndroidFreezeState = {
  installed: boolean;
  route: string;
  fps: number;
  frameDelayMs: number;
  lastInputAt: number;
  lastInputType: string;
  lastRouteAt: number;
  lastRouteEvent: string;
  lastViewportAt: number;
  lastViewportEvent: string;
  activeTimers: number;
  recentAction: string;
  lastLongTask: string;
};

type DiagnosticWindow = Window & {
  __irthAndroidFreeze?: AndroidFreezeState;
  __irthAndroidFreezeInstalled?: boolean;
  __irthAndroidOriginalTimers?: {
    setTimeout: typeof window.setTimeout;
    clearTimeout: typeof window.clearTimeout;
    setInterval: typeof window.setInterval;
    clearInterval: typeof window.clearInterval;
  };
  __irthAndroidOriginalStorageSetItem?: Storage["setItem"];
  __irthAndroidOriginalFetch?: typeof window.fetch;
};

type TimeoutId = number;
type IntervalId = number;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
let lastOverlayPaintAt = 0;
let overlayTimer: number | null = null;
let lastViewportLogAt = 0;
let lastFrameDelayLogAt = 0;
let lastStorageLogAt = 0;
let lastNetworkLogAt = 0;

export function isAndroidNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        getPlatform?: () => string;
      };
    }).Capacitor;
    return !!cap?.isNativePlatform?.() && cap?.getPlatform?.() === "android";
  } catch {
    return false;
  }
}

export function isAndroidUltraStableMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("android-ultra-stable");
}

function getState(): AndroidFreezeState | null {
  if (typeof window === "undefined") return null;
  const w = window as DiagnosticWindow;
  if (!w.__irthAndroidFreeze) {
    w.__irthAndroidFreeze = {
      installed: false,
      route: routeNow(),
      fps: 0,
      frameDelayMs: 0,
      lastInputAt: 0,
      lastInputType: "none",
      lastRouteAt: Date.now(),
      lastRouteEvent: "boot",
      lastViewportAt: 0,
      lastViewportEvent: "none",
      activeTimers: 0,
      recentAction: "boot",
      lastLongTask: "none",
    };
  }
  return w.__irthAndroidFreeze;
}

function routeNow(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
}

function activeElementSummary(): string {
  if (typeof document === "undefined") return "none";
  const el = document.activeElement as HTMLElement | null;
  if (!el) return "none";
  const tag = el.tagName.toLowerCase();
  const type = tag === "input" ? (el as HTMLInputElement).type || "text" : "";
  const id = el.id ? `#${el.id}` : "";
  const name = (el.getAttribute("name") || el.getAttribute("aria-label") || "").slice(0, 40);
  return `${tag}${type ? `[${type}]` : ""}${id}${name ? `(${name})` : ""}`;
}

function logFreeze(label: string, detail: Record<string, unknown> = {}) {
  if (!isAndroidNativeApp() && !isAndroidUltraStableMode()) return;
  const state = getState();
  // Never log field values; only structural diagnostics.
  // eslint-disable-next-line no-console
  console.warn("[android:freeze]", label, {
    route: routeNow(),
    activeElement: activeElementSummary(),
    recentAction: state?.recentAction ?? "unknown",
    timers: state?.activeTimers ?? 0,
    ...detail,
  });
}

function paintOverlay() {
  if (typeof document === "undefined") return;
  if (!document.body) return;
  const state = getState();
  if (!state) return;
  let el = document.getElementById("android-freeze-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "android-freeze-overlay";
    el.setAttribute("dir", "ltr");
    el.setAttribute("aria-hidden", "true");
    el.className = "android-freeze-overlay";
    document.body.appendChild(el);
  }
  const sinceInput = state.lastInputAt ? `${Math.max(0, Date.now() - state.lastInputAt)}ms` : "never";
  const sinceRoute = state.lastRouteAt ? `${Math.max(0, Date.now() - state.lastRouteAt)}ms` : "never";
  const sinceViewport = state.lastViewportAt ? `${Math.max(0, Date.now() - state.lastViewportAt)}ms` : "never";
  el.textContent = [
    `route ${state.route}`,
    `fps ${state.fps} · delay ${Math.round(state.frameDelayMs)}ms`,
    `input ${state.lastInputType} · ${sinceInput}`,
    `routeChange ${state.lastRouteEvent} · ${sinceRoute}`,
    `viewport ${state.lastViewportEvent} · ${sinceViewport}`,
    `timers ${state.activeTimers}`,
    `last ${state.recentAction}`,
    `long ${state.lastLongTask}`,
  ].join("\n");
  lastOverlayPaintAt = Date.now();
}

function updateOverlay() {
  if (typeof window === "undefined") return;
  const elapsed = Date.now() - lastOverlayPaintAt;
  if (elapsed >= 250) {
    paintOverlay();
    return;
  }
  if (overlayTimer !== null) return;
  overlayTimer = window.setTimeout(() => {
    overlayTimer = null;
    paintOverlay();
  }, Math.max(50, 250 - elapsed)) as unknown as number;
}

function logViewportEvent(event: string, detail: Record<string, unknown>) {
  const t = Date.now();
  if (t - lastViewportLogAt < 750) return;
  lastViewportLogAt = t;
  logFreeze("viewport", { event, ...detail });
}

export function recordAndroidAction(action: string, detail?: Record<string, unknown>) {
  if (!isAndroidUltraStableMode() && !isAndroidNativeApp()) return;
  const state = getState();
  if (!state) return;
  state.recentAction = action;
  if (detail) logFreeze(`action:${action}`, detail);
  updateOverlay();
}

export function androidMark(name: string, detail?: Record<string, unknown>) {
  if (!isAndroidUltraStableMode() && !isAndroidNativeApp()) return;
  const mark = `android:${name}`;
  try { performance.mark(mark); } catch { /* noop */ }
  const state = getState();
  if (state) state.recentAction = name;
  if (detail) logFreeze(`mark:${name}`, detail);
}

export function androidMeasure(name: string, startedAt: number, detail?: Record<string, unknown>) {
  if (!isAndroidUltraStableMode() && !isAndroidNativeApp()) return;
  const duration = now() - startedAt;
  try {
    performance.measure(`android:${name}`, { start: startedAt, end: now() });
  } catch { /* noop */ }
  if (duration > 100) logFreeze(`slow:${name}`, { duration: Math.round(duration), ...detail });
}

function installTimerDiagnostics() {
  const w = window as DiagnosticWindow;
  if (w.__irthAndroidOriginalTimers) return;
  const original = {
    setTimeout: window.setTimeout.bind(window) as typeof window.setTimeout,
    clearTimeout: window.clearTimeout.bind(window) as typeof window.clearTimeout,
    setInterval: window.setInterval.bind(window) as typeof window.setInterval,
    clearInterval: window.clearInterval.bind(window) as typeof window.clearInterval,
  };
  w.__irthAndroidOriginalTimers = original;
  const activeTimeouts = new Set<TimeoutId>();
  const activeIntervals = new Set<IntervalId>();
  const sync = () => {
    const state = getState();
    if (state) state.activeTimers = activeTimeouts.size + activeIntervals.size;
  };

  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    let id = 0 as TimeoutId;
    const wrapped = (...cbArgs: unknown[]) => {
      activeTimeouts.delete(id);
      sync();
      const started = now();
      try {
        if (typeof handler === "function") return handler(...cbArgs);
        return undefined;
      } finally {
        androidMeasure("timer.timeout", started, { timeout });
      }
    };
    id = original.setTimeout(wrapped, timeout, ...args) as unknown as number;
    activeTimeouts.add(id);
    sync();
    return id;
  }) as unknown as typeof window.setTimeout;

  window.clearTimeout = ((id?: TimeoutId) => {
    if (id !== undefined) activeTimeouts.delete(id);
    sync();
    return original.clearTimeout(id);
  }) as typeof window.clearTimeout;

  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = original.setInterval(() => {
      const started = now();
      try {
        if (typeof handler === "function") return handler(...args);
        return undefined;
      } finally {
        androidMeasure("timer.interval", started, { timeout });
      }
    }, timeout) as unknown as number;
    activeIntervals.add(id);
    sync();
    return id;
  }) as unknown as typeof window.setInterval;

  window.clearInterval = ((id?: IntervalId) => {
    if (id !== undefined) activeIntervals.delete(id);
    sync();
    return original.clearInterval(id);
  }) as typeof window.clearInterval;
}

function installStorageDiagnostics() {
  const w = window as DiagnosticWindow;
  if (w.__irthAndroidOriginalStorageSetItem) return;
  try {
    const proto = Storage.prototype;
    const original = proto.setItem;
    w.__irthAndroidOriginalStorageSetItem = original;
    proto.setItem = function (this: Storage, key: string, value: string) {
      const started = now();
      try {
        return original.call(this, key, value);
      } finally {
        const duration = now() - started;
        const t = Date.now();
        if (duration > 50 || t - lastStorageLogAt > 3000) {
          lastStorageLogAt = t;
          logFreeze(duration > 50 ? "slow:storage.setItem" : "storage.setItem", {
            key: key.slice(0, 80),
            bytes: typeof value === "string" ? value.length : 0,
            duration: Math.round(duration),
          });
        }
      }
    };
  } catch { /* storage may be locked down */ }
}

function installNetworkDiagnostics() {
  const w = window as DiagnosticWindow;
  if (w.__irthAndroidOriginalFetch || typeof window.fetch !== "function") return;
  const original = window.fetch.bind(window);
  w.__irthAndroidOriginalFetch = original;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = now();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    try {
      const res = await original(input, init);
      const duration = now() - started;
      if (duration > 1000 || Date.now() - lastNetworkLogAt > 5000) {
        lastNetworkLogAt = Date.now();
        logFreeze(duration > 1000 ? "slow:fetch" : "fetch", {
          url: url.slice(0, 120),
          status: res.status,
          duration: Math.round(duration),
        });
      }
      return res;
    } catch (error) {
      logFreeze("fetch:error", { url: url.slice(0, 120), message: (error as Error)?.message ?? String(error) });
      throw error;
    }
  }) as typeof window.fetch;
}

function installRouteDiagnostics() {
  const state = getState();
  if (!state) return;
  const recordRoute = (event: string) => {
    state.route = routeNow();
    state.lastRouteAt = Date.now();
    state.lastRouteEvent = event;
    state.recentAction = `route:${event}`;
    logFreeze("route", { event });
    updateOverlay();
  };
  const wrap = (name: "pushState" | "replaceState") => {
    const original = history[name];
    history[name] = function (this: History, ...args) {
      recordRoute(`${name}:before`);
      const result = original.apply(this, args as Parameters<typeof original>);
      queueMicrotask(() => recordRoute(`${name}:after`));
      return result;
    } as History[typeof name];
  };
  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", () => recordRoute("popstate"), { passive: true });
  window.addEventListener("hashchange", () => recordRoute("hashchange"), { passive: true });
}

function installInputViewportDiagnostics() {
  const state = getState();
  if (!state) return;
  const inputEvents = ["beforeinput", "input", "change", "keydown", "keyup", "compositionstart", "compositionend", "focusin", "focusout", "pointerdown", "click", "touchstart"] as const;
  const onInput = (event: Event) => {
    const target = event.target as HTMLElement | null;
    state.lastInputAt = Date.now();
    state.lastInputType = event.type;
    state.recentAction = `${event.type}:${target?.tagName?.toLowerCase() ?? "unknown"}`;
    updateOverlay();
  };
  for (const event of inputEvents) window.addEventListener(event, onInput, { capture: true, passive: true });

  const viewportEvents = ["resize", "focus", "blur", "orientationchange", "keyboardWillShow", "keyboardDidShow", "keyboardWillHide", "keyboardDidHide"] as const;
  const onViewport = (event: Event) => {
    state.lastViewportAt = Date.now();
    state.lastViewportEvent = event.type;
    state.recentAction = `viewport:${event.type}`;
    logViewportEvent(event.type, { innerHeight: window.innerHeight, innerWidth: window.innerWidth });
    updateOverlay();
  };
  for (const event of viewportEvents) window.addEventListener(event, onViewport, { passive: true });
}

function installLongTaskDiagnostics() {
  const state = getState();
  if (!state) return;
  try {
    const Observer = window.PerformanceObserver;
    if (Observer) {
      const observer = new Observer((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration <= 100) continue;
          state.lastLongTask = `${Math.round(entry.duration)}ms longtask`;
          logFreeze("longtask", { duration: Math.round(entry.duration), startTime: Math.round(entry.startTime) });
          updateOverlay();
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    }
  } catch { /* longtask unsupported */ }

  let frames = 0;
  let last = now();
  let lastFpsAt = last;
  const loop = () => {
    const t = now();
    const delta = t - last;
    last = t;
    frames += 1;
    state.frameDelayMs = Math.max(0, delta - 16.7);
    if (delta > 100) {
      state.lastLongTask = `${Math.round(delta)}ms frame`;
      const tNow = Date.now();
      if (tNow - lastFrameDelayLogAt > 1000) {
        lastFrameDelayLogAt = tNow;
        logFreeze("frame-delay", { delta: Math.round(delta) });
      }
    }
    if (t - lastFpsAt >= 1000) {
      state.fps = Math.round((frames * 1000) / (t - lastFpsAt));
      frames = 0;
      lastFpsAt = t;
      updateOverlay();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function installAndroidFreezeDiagnostics() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (!isAndroidNativeApp()) return false;
  const w = window as DiagnosticWindow;
  if (w.__irthAndroidFreezeInstalled) return true;
  w.__irthAndroidFreezeInstalled = true;
  const html = document.documentElement;
  html.classList.add("is-android", "is-capacitor", "perf-lite", "perf-no-motion", "android-ultra-stable");
  const state = getState();
  if (state) state.installed = true;
  installTimerDiagnostics();
  installStorageDiagnostics();
  installNetworkDiagnostics();
  installRouteDiagnostics();
  installInputViewportDiagnostics();
  installLongTaskDiagnostics();
  window.setTimeout(() => {
    try { document.getElementById("irth-boot-splash")?.remove(); } catch { /* noop */ }
    updateOverlay();
    logFreeze("diagnostics-installed");
  }, 0);
  return true;
}