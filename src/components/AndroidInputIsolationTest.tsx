import * as React from "react";

declare global {
  interface Window {
    __irthAndroidInputTest?: boolean;
  }
}

const PREFIX = "[android-input-test]";

export function isAndroidInputTestPath(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  return pathname === "/android-input-test" || pathname.endsWith("/android-input-test");
}

function safeKey(key: string) {
  return key.length === 1 ? "printable" : key;
}

function log(event: string, detail: Record<string, unknown> = {}) {
  // Do not log typed text. Lengths/event order are enough for Logcat diagnosis.
  // eslint-disable-next-line no-console
  console.info(PREFIX, event, detail);
}

function targetLength(target: EventTarget | null) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target.value.length;
  return undefined;
}

function fieldListeners(field: string): Record<string, EventListener> {
  return {
    focus: (event: Event) => log("focus", { field, length: targetLength(event.target) }),
    keydown: (event: Event) => log("keydown", { field, key: safeKey((event as KeyboardEvent).key || "unknown") }),
    beforeinput: (event: Event) => log("beforeinput", { field, inputType: (event as InputEvent).inputType || "unknown", length: targetLength(event.target) }),
    input: (event: Event) => log("input", { field, length: targetLength(event.target) }),
    change: (event: Event) => log("change", { field, length: targetLength(event.target) }),
    compositionstart: (_event: Event) => log("compositionstart", { field }),
    compositionend: (event: Event) => log("compositionend", { field, length: targetLength(event.target) }),
    blur: (event: Event) => log("blur", { field, length: targetLength(event.target) }),
  };
}

function attachNativeDiagnostics(el: HTMLInputElement | HTMLTextAreaElement | null, field: string) {
  if (!el) return () => {};
  const listeners = fieldListeners(field);
  for (const [event, listener] of Object.entries(listeners)) el.addEventListener(event, listener, { passive: true });
  return () => {
    for (const [event, listener] of Object.entries(listeners)) el.removeEventListener(event, listener);
  };
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #c9c9c9",
  borderRadius: 6,
  background: "#ffffff",
  color: "#111111",
  font: "16px system-ui, sans-serif",
  lineHeight: 1.4,
  padding: "12px 14px",
  outline: "none",
  transform: "none",
  filter: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#111111",
  font: "13px system-ui, sans-serif",
  fontWeight: 700,
  marginBottom: 8,
};

const groupStyle: React.CSSProperties = {
  margin: "0 0 18px",
};

export function AndroidInputIsolationTest() {
  const plainHostRef = React.useRef<HTMLDivElement | null>(null);
  const uncontrolledRef = React.useRef<HTMLInputElement | null>(null);
  const [controlled, setControlled] = React.useState("");

  React.useEffect(() => {
    window.__irthAndroidInputTest = true;
    document.documentElement.classList.add("android-input-test-active");
    document.documentElement.classList.remove("irth-booting");
    document.getElementById("irth-boot-splash")?.remove();
    log("page mounted", {
      path: window.location.pathname,
      userAgent: navigator.userAgent.includes("Android") ? "Android" : "non-Android",
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
    });

    const globalListeners: Array<[EventTarget, string, EventListener, AddEventListenerOptions]> = [
      [document, "visibilitychange", () => log("document.visibilitychange", { hidden: document.hidden }), { passive: true }],
      [window, "focus", () => log("window.focus", { hasFocus: document.hasFocus() }), { passive: true }],
      [window, "blur", () => log("window.blur", { hasFocus: document.hasFocus() }), { passive: true }],
      [document, "focusin", (event: Event) => log("document.focusin", { target: (event.target as HTMLElement | null)?.id || (event.target as HTMLElement | null)?.tagName, active: (document.activeElement as HTMLElement | null)?.id || (document.activeElement as HTMLElement | null)?.tagName }), { passive: true, capture: true }],
      [document, "beforeinput", (event: Event) => log("document.beforeinput", { target: (event.target as HTMLElement | null)?.id || (event.target as HTMLElement | null)?.tagName, inputType: (event as InputEvent).inputType || "unknown", length: targetLength(event.target) }), { passive: true, capture: true }],
      [document, "input", (event: Event) => log("document.input", { target: (event.target as HTMLElement | null)?.id || (event.target as HTMLElement | null)?.tagName, length: targetLength(event.target) }), { passive: true, capture: true }],
    ];
    for (const [target, event, listener, options] of globalListeners) target.addEventListener(event, listener, options);

    const host = plainHostRef.current;
    if (host) {
      host.innerHTML = `
        <div style="margin:0 0 18px">
          <label for="plain-html-input" style="display:block;color:#111;font:700 13px system-ui,sans-serif;margin-bottom:8px">Plain HTML input</label>
          <input id="plain-html-input" type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" style="display:block;width:100%;box-sizing:border-box;border:1px solid #c9c9c9;border-radius:6px;background:#fff;color:#111;font:16px system-ui,sans-serif;line-height:1.4;padding:12px 14px;outline:none;transform:none;filter:none;backdrop-filter:none" />
        </div>
        <div style="margin:0 0 18px">
          <label for="plain-html-textarea" style="display:block;color:#111;font:700 13px system-ui,sans-serif;margin-bottom:8px">Plain HTML textarea</label>
          <textarea id="plain-html-textarea" rows="4" autocomplete="off" autocapitalize="none" spellcheck="false" style="display:block;width:100%;box-sizing:border-box;border:1px solid #c9c9c9;border-radius:6px;background:#fff;color:#111;font:16px system-ui,sans-serif;line-height:1.4;padding:12px 14px;outline:none;resize:vertical;transform:none;filter:none;backdrop-filter:none"></textarea>
        </div>
      `;
    }

    const cleanups = [
      attachNativeDiagnostics(document.getElementById("plain-html-input") as HTMLInputElement | null, "plain-html-input"),
      attachNativeDiagnostics(document.getElementById("plain-html-textarea") as HTMLTextAreaElement | null, "plain-html-textarea"),
    ];

    return () => {
      log("page unmounted");
      window.__irthAndroidInputTest = false;
      document.documentElement.classList.remove("android-input-test-active");
      cleanups.forEach((cleanup) => cleanup());
      for (const [target, event, listener, options] of globalListeners) target.removeEventListener(event, listener, options);
    };
  }, []);

  const reactUncontrolled = fieldListeners("react-uncontrolled-input");
  const reactControlled = fieldListeners("react-controlled-input");

  return (
    <main
      dir="ltr"
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: "max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom))",
        background: "#f4f4f4",
        color: "#111111",
        fontFamily: "system-ui, sans-serif",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        transform: "none",
        filter: "none",
        backdropFilter: "none",
      }}
    >
      <style>{`
        html.android-input-test-active,
        html.android-input-test-active body,
        html.android-input-test-active #root {
          margin: 0 !important;
          min-height: 100% !important;
          background: #f4f4f4 !important;
          overflow: auto !important;
          overscroll-behavior: auto !important;
          touch-action: manipulation !important;
        }
        html.android-input-test-active *,
        html.android-input-test-active *::before,
        html.android-input-test-active *::after {
          animation: none !important;
          transition: none !important;
          transform: none !important;
          filter: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          box-shadow: none !important;
          contain: none !important;
          content-visibility: visible !important;
        }
        html.android-input-test-active input,
        html.android-input-test-active textarea {
          -webkit-user-select: text !important;
          user-select: text !important;
          -webkit-text-size-adjust: 100% !important;
          caret-color: #111 !important;
        }
      `}</style>

      <div ref={plainHostRef} />

      <button
        type="button"
        onClick={() => {
          log("open-native-html-test");
          window.location.href = "/native-input-test.html";
        }}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          margin: "0 0 18px",
          border: "1px solid #111111",
          borderRadius: 6,
          background: "#eeeeee",
          color: "#111111",
          font: "700 16px system-ui, sans-serif",
          padding: "12px 14px",
        }}
      >
        Open bare native HTML input test
      </button>

      <div style={groupStyle}>
        <label htmlFor="react-uncontrolled-input" style={labelStyle}>Uncontrolled React input</label>
        <input
          ref={uncontrolledRef}
          id="react-uncontrolled-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue=""
          style={inputStyle}
          onFocus={(event) => reactUncontrolled.focus(event.nativeEvent)}
          onKeyDown={(event) => reactUncontrolled.keydown(event.nativeEvent)}
          onBeforeInput={(event) => reactUncontrolled.beforeinput(event.nativeEvent)}
          onInput={(event) => reactUncontrolled.input(event.nativeEvent)}
          onChange={(event) => reactUncontrolled.change(event.nativeEvent)}
          onCompositionStart={(event) => reactUncontrolled.compositionstart(event.nativeEvent)}
          onCompositionEnd={(event) => reactUncontrolled.compositionend(event.nativeEvent)}
          onBlur={(event) => reactUncontrolled.blur(event.nativeEvent)}
        />
      </div>

      <div style={groupStyle}>
        <label htmlFor="react-controlled-input" style={labelStyle}>Controlled React input</label>
        <input
          id="react-controlled-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={controlled}
          style={inputStyle}
          onFocus={(event) => reactControlled.focus(event.nativeEvent)}
          onKeyDown={(event) => reactControlled.keydown(event.nativeEvent)}
          onBeforeInput={(event) => reactControlled.beforeinput(event.nativeEvent)}
          onInput={(event) => reactControlled.input(event.nativeEvent)}
          onChange={(event) => {
            setControlled(event.currentTarget.value);
            reactControlled.change(event.nativeEvent);
          }}
          onCompositionStart={(event) => reactControlled.compositionstart(event.nativeEvent)}
          onCompositionEnd={(event) => reactControlled.compositionend(event.nativeEvent)}
          onBlur={(event) => reactControlled.blur(event.nativeEvent)}
        />
      </div>
    </main>
  );
}
