import * as React from "react";

const GOLD = "#d4af5a";
const GOLD_SOFT = "#e8c878";
const INK = "#0c0a07";
const SURFACE = "#171210";
const SURFACE_2 = "#211812";
const BORDER = "#3a2d20";
const TEXT = "#f5ecd9";

export function isAndroidCampaignInputMinPath(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  return pathname === "/android-campaign-input-min" || pathname.endsWith("/android-campaign-input-min");
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
  boxShadow: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: GOLD_SOFT,
  font: "700 13px system-ui, sans-serif",
  marginBottom: 8,
};

export function AndroidCampaignInputMinTest() {
  const fillBlankRef = React.useRef<HTMLInputElement | null>(null);
  const reflectionRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [status, setStatus] = React.useState("");

  React.useEffect(() => {
    document.documentElement.classList.add("android-campaign-input-min-active");
    document.documentElement.classList.remove("irth-booting");
    document.getElementById("irth-boot-splash")?.remove();
    return () => document.documentElement.classList.remove("android-campaign-input-min-active");
  }, []);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answer = (fillBlankRef.current?.value ?? "").trim();
    const reflection = (reflectionRef.current?.value ?? "").trim();
    const answerState = answer.toLowerCase() === "بغداد" ? "إجابة صحيحة" : "تمت قراءة الإجابة";
    setStatus(`${answerState} · التأمّل ${reflection.length > 0 ? "موجود" : "فارغ"}`);
  };

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
        WebkitBackdropFilter: "none",
      }}
    >
      <style>{`
        html.android-campaign-input-min-active,
        html.android-campaign-input-min-active body,
        html.android-campaign-input-min-active #root {
          margin: 0 !important;
          min-height: 100% !important;
          background: ${INK} !important;
          overflow: auto !important;
          overscroll-behavior: auto !important;
          touch-action: manipulation !important;
        }
        html.android-campaign-input-min-active *,
        html.android-campaign-input-min-active *::before,
        html.android-campaign-input-min-active *::after {
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
        html.android-campaign-input-min-active input,
        html.android-campaign-input-min-active textarea {
          -webkit-user-select: text !important;
          user-select: text !important;
          -webkit-text-size-adjust: 100% !important;
          caret-color: ${GOLD} !important;
        }
        html.android-campaign-input-min-active input::placeholder,
        html.android-campaign-input-min-active textarea::placeholder {
          color: #6b5a44 !important;
        }
      `}</style>

      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 460,
          margin: "0 auto",
          paddingTop: 28,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ margin: 0, font: "800 26px system-ui, sans-serif", color: GOLD }}>
            اختبار إدخال الحملات
          </h1>
          <p style={{ margin: "8px 0 0", color: "#9a8a6e", font: "13px system-ui, sans-serif", lineHeight: 1.7 }}>
            صفحة مستقلة بلا غلاف التطبيق أو مزامنة أو صوت أو بيانات خارجية.
          </p>
        </div>

        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, background: SURFACE, padding: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="android-campaign-fillblank" style={labelStyle}>إجابة قصيرة</label>
            <input
              ref={fillBlankRef}
              id="android-campaign-fillblank"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue=""
              placeholder="اكتب إجابتك…"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="android-campaign-reflection" style={labelStyle}>تأمّل</label>
            <textarea
              ref={reflectionRef}
              id="android-campaign-reflection"
              rows={5}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              defaultValue=""
              placeholder="اكتب تأمّلك…"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <button
            type="submit"
            style={{
              display: "block",
              width: "100%",
              border: 0,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${GOLD_SOFT}, ${GOLD})`,
              color: INK,
              font: "800 15px system-ui, sans-serif",
              padding: "13px 14px",
            }}
          >
            تحقق / إرسال
          </button>

          {status ? (
            <p style={{ margin: "14px 0 0", color: GOLD_SOFT, font: "13px system-ui, sans-serif", textAlign: "center" }}>
              {status}
            </p>
          ) : null}
        </div>
      </form>
    </main>
  );
}