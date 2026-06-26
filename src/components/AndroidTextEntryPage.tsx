import * as React from "react";

import {
  ANDROID_TEXT_ENTRY_REQUEST_KEY,
  ANDROID_TEXT_ENTRY_RESULT_PREFIX,
  type StoredTextEntryRequest,
  type StoredTextEntryResult,
} from "@/components/AndroidTextEntry";

const GOLD = "#d4af5a";
const GOLD_SOFT = "#e8c878";
const INK = "#0c0a07";
const SURFACE = "#171210";
const SURFACE_2 = "#1f1813";
const BORDER = "#3a2d20";
const TEXT = "#f5ecd9";

export function isAndroidTextEntryPath(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  return pathname === "/android-text-entry" || pathname.endsWith("/android-text-entry");
}

function readRequest(): StoredTextEntryRequest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ANDROID_TEXT_ENTRY_REQUEST_KEY)
      ?? window.localStorage.getItem(ANDROID_TEXT_ENTRY_REQUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTextEntryRequest;
    if (parsed?.version === 1 && parsed.fieldKey && typeof parsed.returnPath === "string") return parsed;
  } catch { /* ignore malformed request */ }
  return null;
}

function safeReturnPath(request: StoredTextEntryRequest | null) {
  const fallback = "/";
  const path = request?.returnPath || fallback;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\n")) return fallback;
  if (isAndroidTextEntryPath(path.split(/[?#]/)[0])) return fallback;
  return path;
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  background: SURFACE_2,
  color: TEXT,
  font: "16px system-ui, -apple-system, sans-serif",
  lineHeight: 1.5,
  padding: "14px 14px",
  outline: "none",
  transform: "none",
  filter: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
  caretColor: GOLD,
};

const buttonBase: React.CSSProperties = {
  borderRadius: 10,
  font: "800 15px system-ui, sans-serif",
  padding: "13px 14px",
};

export function AndroidTextEntryPage() {
  const request = React.useMemo(readRequest, []);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [status, setStatus] = React.useState(request ? "" : "لم يتم العثور على طلب إدخال نشط.");

  React.useEffect(() => {
    document.documentElement.classList.add("android-text-entry-active");
    document.documentElement.classList.remove("irth-booting");
    document.getElementById("irth-boot-splash")?.remove();
    return () => document.documentElement.classList.remove("android-text-entry-active");
  }, []);

  const goBack = React.useCallback(() => {
    window.location.href = safeReturnPath(request);
  }, [request]);

  const save = React.useCallback(() => {
    if (!request) { goBack(); return; }
    const value = request.multiline ? (textareaRef.current?.value ?? "") : (inputRef.current?.value ?? "");
    const result: StoredTextEntryResult = {
      version: 1,
      fieldKey: request.fieldKey,
      value,
      savedAt: Date.now(),
    };
    try {
      const key = `${ANDROID_TEXT_ENTRY_RESULT_PREFIX}${request.fieldKey}`;
      const raw = JSON.stringify(result);
      window.sessionStorage.setItem(key, raw);
      window.localStorage.setItem(key, raw);
      window.sessionStorage.removeItem(ANDROID_TEXT_ENTRY_REQUEST_KEY);
      window.localStorage.removeItem(ANDROID_TEXT_ENTRY_REQUEST_KEY);
      goBack();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "تعذّر حفظ النص.");
    }
  }, [goBack, request]);

  const cancel = React.useCallback(() => {
    try {
      window.sessionStorage.removeItem(ANDROID_TEXT_ENTRY_REQUEST_KEY);
      window.localStorage.removeItem(ANDROID_TEXT_ENTRY_REQUEST_KEY);
    } catch { /* ignore */ }
    goBack();
  }, [goBack]);

  const commonProps = request ? {
    defaultValue: request.initialValue,
    placeholder: request.placeholder ?? "",
    maxLength: request.maxLength,
    autoComplete: request.autoComplete ?? "off",
    autoCorrect: "off",
    autoCapitalize: "none",
    spellCheck: false,
    dir: request.dir ?? "rtl",
  } as const : null;

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: "max(28px, env(safe-area-inset-top)) 18px max(28px, env(safe-area-inset-bottom))",
        background: `radial-gradient(ellipse at top, #2a1d10 0%, ${INK} 62%, #050403 100%)`,
        color: TEXT,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        transform: "none",
        filter: "none",
        backdropFilter: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>{`
        html.android-text-entry-active,
        html.android-text-entry-active body,
        html.android-text-entry-active #root {
          margin: 0 !important;
          min-height: 100% !important;
          background: ${INK} !important;
          overflow: auto !important;
          overscroll-behavior: auto !important;
          touch-action: manipulation !important;
        }
        html.android-text-entry-active *,
        html.android-text-entry-active *::before,
        html.android-text-entry-active *::after {
          animation: none !important;
          transition: none !important;
          transform: none !important;
          filter: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          contain: none !important;
          content-visibility: visible !important;
        }
        html.android-text-entry-active input,
        html.android-text-entry-active textarea {
          -webkit-user-select: text !important;
          user-select: text !important;
          -webkit-text-size-adjust: 100% !important;
          caret-color: ${GOLD} !important;
        }
        html.android-text-entry-active input::placeholder,
        html.android-text-entry-active textarea::placeholder {
          color: #6b5a44 !important;
        }
      `}</style>

      <div style={{ width: "100%", maxWidth: 430 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img
            src="/assets/splash/irth-logo.png"
            alt="إرث"
            width={72}
            height={72}
            style={{ display: "inline-block", marginBottom: 12 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <h1 style={{ margin: 0, font: "800 26px system-ui, sans-serif", color: GOLD }}>
            {request?.title ?? "إدخال النص"}
          </h1>
          <p style={{ margin: "7px 0 0", color: "#9a8a6e", font: "13px/1.6 system-ui, sans-serif" }}>
            {request?.label ?? "صفحة إدخال مستقلة لنظام أندرويد"}
          </p>
        </div>

        <section
          style={{
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: 22,
            boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(212,175,90,0.08)",
          }}
        >
          {request && commonProps ? (
            request.multiline ? (
              <textarea
                ref={textareaRef}
                {...commonProps}
                rows={7}
                style={{ ...inputStyle, minHeight: 170, resize: "vertical" }}
              />
            ) : (
              <input
                ref={inputRef}
                {...commonProps}
                type="text"
                inputMode={request.inputMode}
                style={inputStyle}
              />
            )
          ) : (
            <p style={{ margin: 0, color: "#d8c3a0", font: "14px/1.8 system-ui, sans-serif", textAlign: "center" }}>{status}</p>
          )}

          {status && request && <p style={{ margin: "12px 0 0", color: "#fca5a5", font: "12px/1.6 system-ui, sans-serif" }}>{status}</p>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
            <button
              type="button"
              onClick={save}
              disabled={!request}
              style={{
                ...buttonBase,
                border: `1px solid ${GOLD}`,
                background: `linear-gradient(180deg, ${GOLD_SOFT} 0%, ${GOLD} 100%)`,
                color: "#1a1208",
                boxShadow: "0 6px 18px rgba(212,175,90,0.24)",
                opacity: request ? 1 : 0.5,
              }}
            >
              حفظ
            </button>
            <button
              type="button"
              onClick={cancel}
              style={{ ...buttonBase, border: `1px solid ${BORDER}`, background: "transparent", color: GOLD_SOFT }}
            >
              إلغاء
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}