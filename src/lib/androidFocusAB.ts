export type AndroidFocusABFlagKey =
  | "disableGlobalFocusBlur"
  | "disableSelectionChange"
  | "disableFocusVisualToggles"
  | "disableKeyboardViewportResize"
  | "disableScrollIntoView"
  | "disableCampaignFocusLogic";

export type AndroidFocusABFlags = Record<AndroidFocusABFlagKey, boolean>;

export const ANDROID_FOCUS_AB_STORAGE_KEY = "irth:android-focus-ab";

const DEFAULT_FLAGS: AndroidFocusABFlags = {
  disableGlobalFocusBlur: false,
  disableSelectionChange: false,
  disableFocusVisualToggles: false,
  disableKeyboardViewportResize: false,
  disableScrollIntoView: false,
  disableCampaignFocusLogic: false,
};

const QUERY_KEYS: Record<AndroidFocusABFlagKey, string> = {
  disableGlobalFocusBlur: "abNoFocusBlur",
  disableSelectionChange: "abNoSelection",
  disableFocusVisualToggles: "abNoFocusVisuals",
  disableKeyboardViewportResize: "abNoKeyboardResize",
  disableScrollIntoView: "abNoScrollIntoView",
  disableCampaignFocusLogic: "abNoCampaignFocus",
};

export const ANDROID_FOCUS_AB_LABELS: Array<{ key: AndroidFocusABFlagKey; label: string; description: string }> = [
  { key: "disableGlobalFocusBlur", label: "Disable global focus/blur listeners", description: "Blocks window/document/body focus, blur, focusin, and focusout listeners." },
  { key: "disableSelectionChange", label: "Disable selectionchange listeners", description: "Blocks document-level selectionchange listeners." },
  { key: "disableFocusVisualToggles", label: "Disable focus visual/perf class toggles", description: "Skips Android perf-lite/is-android class application and marks CSS with an A/B class." },
  { key: "disableKeyboardViewportResize", label: "Disable keyboard/viewport/resize handlers", description: "Blocks resize, orientationchange, visualViewport, and keyboard visibility listeners." },
  { key: "disableScrollIntoView", label: "Disable scrollIntoView", description: "No-ops Element.scrollIntoView during this test run." },
  { key: "disableCampaignFocusLogic", label: "Disable campaign answer focus logic", description: "Lets campaign/game answer code skip explicit focus/selection advancement when wired." },
];

function isAndroid(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.() && cap?.getPlatform?.() === "android") return true;
  } catch { /* ignore */ }
  return /Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

function parseStoredFlags(): Partial<AndroidFocusABFlags> {
  try {
    const raw = window.localStorage.getItem(ANDROID_FOCUS_AB_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AndroidFocusABFlags>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistFlags(flags: AndroidFocusABFlags) {
  try { window.localStorage.setItem(ANDROID_FOCUS_AB_STORAGE_KEY, JSON.stringify(flags)); } catch { /* ignore */ }
}

export function readAndroidFocusABFlags(): AndroidFocusABFlags {
  if (typeof window === "undefined") return { ...DEFAULT_FLAGS };
  const cached = (window as any).__IRTH_ANDROID_FOCUS_AB__ as AndroidFocusABFlags | undefined;
  if (cached) return cached;

  const flags: AndroidFocusABFlags = { ...DEFAULT_FLAGS, ...parseStoredFlags() };
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const [key, queryKey] of Object.entries(QUERY_KEYS) as Array<[AndroidFocusABFlagKey, string]>) {
      const value = url.searchParams.get(queryKey);
      if (value === "1" || value === "true") { flags[key] = true; changed = true; }
      if (value === "0" || value === "false") { flags[key] = false; changed = true; }
    }
    if (changed) persistFlags(flags);
  } catch { /* ignore */ }

  (window as any).__IRTH_ANDROID_FOCUS_AB__ = flags;
  return flags;
}

export function writeAndroidFocusABFlags(flags: AndroidFocusABFlags) {
  if (typeof window === "undefined") return;
  const next = { ...DEFAULT_FLAGS, ...flags };
  (window as any).__IRTH_ANDROID_FOCUS_AB__ = next;
  persistFlags(next);
  logAndroidFocusABFlags("flags-updated");
}

export function isAndroidFocusABDisabled(key: AndroidFocusABFlagKey): boolean {
  if (!isAndroid()) return false;
  return !!readAndroidFocusABFlags()[key];
}

export function logAndroidFocusABFlags(reason = "flags") {
  if (typeof window === "undefined" || !isAndroid()) return;
  const flags = readAndroidFocusABFlags();
  const route = window.location.pathname + window.location.search + window.location.hash;
  try {
    (window as any).__IRTH_INPUT_TRACE__?.push({
      t: typeof performance !== "undefined" ? performance.now() : Date.now(),
      kind: "android-focus-ab-flags",
      route,
      data: { reason, flags },
    });
  } catch { /* ignore */ }
  try {
    (window as any).IrthNativeDiagnostics?.logInputEvent?.("focusAB.flags", JSON.stringify({ reason, route, flags }));
  } catch { /* ignore */ }
  // eslint-disable-next-line no-console
  console.info("IRTH_ANDROID_FOCUS_AB", { reason, route, flags });
}

function targetName(target: EventTarget) {
  if (target === window) return "window";
  if (target === document) return "document";
  if (target === document.body) return "body";
  if (target === document.documentElement) return "html";
  if (target === window.visualViewport) return "visualViewport";
  return (target as Element | null)?.nodeName ?? "unknown";
}

function shouldBlockListener(target: EventTarget, type: string, flags: AndroidFocusABFlags) {
  const globalTarget = target === window || target === document || target === document.body || target === document.documentElement;
  if (flags.disableGlobalFocusBlur && globalTarget && ["focus", "blur", "focusin", "focusout"].includes(type)) return true;
  if (flags.disableSelectionChange && target === document && type === "selectionchange") return true;
  if (flags.disableKeyboardViewportResize && globalTarget && ["resize", "orientationchange", "keyboardWillShow", "keyboardDidShow", "keyboardWillHide", "keyboardDidHide"].includes(type)) return true;
  if (flags.disableKeyboardViewportResize && target === window.visualViewport && ["resize", "scroll"].includes(type)) return true;
  return false;
}

export function installAndroidFocusABSwitches() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!isAndroid()) return;
  const flags = readAndroidFocusABFlags();
  logAndroidFocusABFlags("boot");
  if ((window as any).__irthAndroidFocusABInstalled) return;
  (window as any).__irthAndroidFocusABInstalled = true;

  if (flags.disableFocusVisualToggles) {
    document.documentElement.classList.add("irth-ab-no-focus-visuals");
  }

  if (flags.disableGlobalFocusBlur || flags.disableSelectionChange || flags.disableKeyboardViewportResize) {
    const originalAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function patchedAddEventListener(
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (typeof type === "string" && shouldBlockListener(this, type, flags)) {
        try {
          (window as any).IrthNativeDiagnostics?.logInputEvent?.("focusAB.blockListener", JSON.stringify({ type, target: targetName(this), flags }));
        } catch { /* ignore */ }
        return undefined;
      }
      return originalAdd.call(this, type, listener, options);
    };
  }

  if (flags.disableScrollIntoView) {
    Element.prototype.scrollIntoView = function noopScrollIntoView() {
      try {
        (window as any).IrthNativeDiagnostics?.logInputEvent?.("focusAB.blockScrollIntoView", JSON.stringify({ tag: this.tagName, id: this.id || undefined }));
      } catch { /* ignore */ }
    };
  }
}