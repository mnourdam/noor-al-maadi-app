import * as React from "react";

import type { CampaignActivity } from "@/types/campaign";

const GOLD = "#d4af5a";
const GOLD_SOFT = "#e8c878";
const INK = "#0c0a07";
const SURFACE = "#171210";
const SURFACE_2 = "#211812";
const BORDER = "#3a2d20";
const TEXT = "#f5ecd9";

type Stage = "plain" | "container" | "renderer" | "checking" | "progress" | "rewards" | "ledger";

type ActivityRendererComponent = React.ComponentType<{
  activity: CampaignActivity;
  onResolve: (correct: boolean) => void;
  alreadyDone?: boolean;
}>;

const STAGES: Array<{ id: Stage; label: string; description: string }> = [
  { id: "plain", label: "1 · Plain", description: "مدخلات فقط بلا حاوية الحملة." },
  { id: "container", label: "2 · Container", description: "إضافة شكل حاوية النشاط فقط." },
  { id: "renderer", label: "3 · Renderer", description: "تحميل ActivityRenderer فقط." },
  { id: "checking", label: "4 · Checking", description: "التحقق المحلي من الإجابة فقط." },
  { id: "progress", label: "5 · Progress", description: "محاكاة حفظ تقدّم محلي بسيط." },
  { id: "rewards", label: "6 · Rewards", description: "محاكاة قلوب و XP ودنانير محلية." },
  { id: "ledger", label: "7 · Ledger", description: "اختبار دفتر الحملات/المزامنة بشكل صريح عند الإرسال." },
];

const SAMPLE_FILL_ACTIVITY: CampaignActivity = {
  id: "android-campaign-input-min-fill",
  type: "fill_blank",
  prompt: "ما المدينة التي اتخذها العباسيون عاصمة لهم؟",
  contextText: "اختبار تشخيصي مستقل لحقل إجابة حملة.",
  correctAnswer: "بغداد",
  feedbackCorrect: "إجابة صحيحة.",
  feedbackWrong: "تم التحقق من الإجابة دون تحديث أثناء الكتابة.",
  hint: "مدينة مدوّرة على دجلة.",
  xpReward: 10,
  coinsReward: 5,
  heartsPenalty: 1,
};

const SAMPLE_REFLECTION_ACTIVITY: CampaignActivity = {
  id: "android-campaign-input-min-reflection",
  type: "reflection_prompt",
  prompt: "اكتب تأمّلًا قصيرًا عن دور المدن العلمية في حفظ المعرفة.",
  contextText: "اختبار ActivityRenderer دون تحقق من إجابة صحيحة/خاطئة.",
  feedbackCorrect: "تم تسجيل التأمّل محليًا.",
  xpReward: 10,
  coinsReward: 5,
  heartsPenalty: 1,
};

export function isAndroidCampaignInputMinPath(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  return pathname === "/android-campaign-input-min" || pathname.endsWith("/android-campaign-input-min");
}

function readStage(): Stage {
  if (typeof window === "undefined") return "plain";
  try {
    const raw = new URLSearchParams(window.location.search).get("stage") as Stage | null;
    return STAGES.some((stage) => stage.id === raw) ? raw! : "plain";
  } catch {
    return "plain";
  }
}

function goToStage(stage: Stage) {
  const url = new URL(window.location.href);
  if (stage === "plain") url.searchParams.delete("stage");
  else url.searchParams.set("stage", stage);
  window.location.href = url.pathname + url.search + url.hash;
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
  const stage = readStage();
  const [status, setStatus] = React.useState("");
  const [renderer, setRenderer] = React.useState<ActivityRendererComponent | null>(null);
  const [localProgress, setLocalProgress] = React.useState(0);
  const [rewards, setRewards] = React.useState({ hearts: 5, xp: 0, coins: 0 });

  React.useEffect(() => {
    document.documentElement.classList.add("android-campaign-input-min-active");
    document.documentElement.classList.remove("irth-booting");
    document.getElementById("irth-boot-splash")?.remove();
    return () => document.documentElement.classList.remove("android-campaign-input-min-active");
  }, []);

  React.useEffect(() => {
    if (stage !== "renderer" && stage !== "checking" && stage !== "progress" && stage !== "rewards" && stage !== "ledger") {
      setRenderer(null);
      return;
    }
    let cancelled = false;
    import("@/components/imported-campaign/ActivityRenderer")
      .then((module) => {
        if (!cancelled) setRenderer(() => module.ActivityRenderer);
      })
      .catch((error) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "تعذّر تحميل ActivityRenderer.");
      });
    return () => { cancelled = true; };
  }, [stage]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const answer = (fillBlankRef.current?.value ?? "").trim();
    const reflection = (reflectionRef.current?.value ?? "").trim();
    const answerState = answer.toLowerCase() === "بغداد" ? "إجابة صحيحة" : "تمت قراءة الإجابة";
    if (stage === "progress" || stage === "rewards" || stage === "ledger") {
      setLocalProgress((current) => current + 1);
    }
    if (stage === "rewards" || stage === "ledger") {
      setRewards((current) => answer.toLowerCase() === "بغداد"
        ? { ...current, xp: current.xp + 10, coins: current.coins + 5 }
        : { ...current, hearts: Math.max(0, current.hearts - 1) });
    }
    if (stage === "ledger") {
      try {
        window.localStorage.setItem("irth.android.campaignInputMin.last", JSON.stringify({
          at: Date.now(),
          answerLength: answer.length,
          reflectionLength: reflection.length,
        }));
      } catch { /* ignore diagnostic storage failures */ }
    }
    setStatus(`${answerState} · التأمّل ${reflection.length > 0 ? "موجود" : "فارغ"}`);
  };

  const handleRendererResolve = (correct: boolean) => {
    if (stage === "progress" || stage === "rewards" || stage === "ledger") {
      setLocalProgress((current) => current + 1);
    }
    if (stage === "rewards" || stage === "ledger") {
      setRewards((current) => correct
        ? { ...current, xp: current.xp + 10, coins: current.coins + 5 }
        : { ...current, hearts: Math.max(0, current.hearts - 1) });
    }
    if (stage === "ledger") {
      try {
        window.localStorage.setItem("irth.android.campaignInputMin.renderer", JSON.stringify({ at: Date.now(), correct }));
      } catch { /* ignore diagnostic storage failures */ }
    }
    setStatus(correct ? "ActivityRenderer: إجابة صحيحة" : "ActivityRenderer: إجابة غير صحيحة");
  };

  const activeStage = STAGES.find((item) => item.id === stage) ?? STAGES[0];
  const showContainer = stage !== "plain";
  const showRenderer = stage === "renderer" || stage === "checking" || stage === "progress" || stage === "rewards" || stage === "ledger";
  const rendererActivity = stage === "renderer" ? SAMPLE_REFLECTION_ACTIVITY : SAMPLE_FILL_ACTIVITY;
  const Panel = showContainer ? "section" : "div";

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
            {activeStage.description}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 16 }}>
          {STAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goToStage(item.id)}
              style={{
                border: `1px solid ${item.id === stage ? GOLD : BORDER}`,
                borderRadius: 10,
                background: item.id === stage ? "#2b2116" : SURFACE,
                color: item.id === stage ? GOLD_SOFT : TEXT,
                font: "700 12px system-ui, sans-serif",
                padding: "10px 12px",
                textAlign: "right",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Panel style={{ border: `1px solid ${BORDER}`, borderRadius: showContainer ? 18 : 14, background: SURFACE, padding: showContainer ? 18 : 16 }}>
          {showContainer ? (
            <div style={{ marginBottom: 14, borderBottom: `1px solid ${BORDER}`, paddingBottom: 12 }}>
              <p style={{ margin: 0, color: GOLD_SOFT, font: "800 13px system-ui, sans-serif" }}>حاوية نشاط حملة</p>
              <p style={{ margin: "6px 0 0", color: "#9a8a6e", font: "12px system-ui, sans-serif", lineHeight: 1.6 }}>
                هذه الحاوية محلية داخل صفحة التشخيص وليست AppShell أو مسار الفصل الحقيقي.
              </p>
            </div>
          ) : null}

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

          {(stage === "progress" || stage === "rewards" || stage === "ledger") ? (
            <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 12, color: "#9a8a6e", font: "12px system-ui, sans-serif", lineHeight: 1.8 }}>
              <div>Progress tick: {localProgress}</div>
              {(stage === "rewards" || stage === "ledger") ? <div>Hearts: {rewards.hearts} · XP: {rewards.xp} · Coins: {rewards.coins}</div> : null}
              {stage === "ledger" ? <div>Ledger: localStorage write on submit only</div> : null}
            </div>
          ) : null}
        </Panel>

        {showRenderer ? (
          <section style={{ marginTop: 16, border: `1px solid ${BORDER}`, borderRadius: 18, background: SURFACE, padding: 18 }}>
            <p style={{ margin: "0 0 12px", color: GOLD_SOFT, font: "800 13px system-ui, sans-serif" }}>
              ActivityRenderer stage
            </p>
            {renderer ? React.createElement(renderer, {
              activity: rendererActivity,
              onResolve: handleRendererResolve,
              alreadyDone: false,
            }) : (
              <p style={{ color: "#9a8a6e", font: "12px system-ui, sans-serif" }}>جارٍ تحميل ActivityRenderer…</p>
            )}
          </section>
        ) : null}
      </form>
    </main>
  );
}