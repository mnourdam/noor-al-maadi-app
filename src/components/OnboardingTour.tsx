import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Swords, BookOpen, Map as MapIcon, Calendar, X, ChevronLeft, ChevronRight } from "lucide-react";

const STORAGE_KEY = "irth.onboarded.v1";

interface Step {
  title: string;
  body: string;
  icon: React.ReactNode;
  href: string;
  cta: string;
}

const STEPS: Step[] = [
  {
    title: "ابدأ حملتك الأولى",
    body: "تابع رحلات تاريخية تفاعلية مع فصول وقصص وأسئلة. ابدأ من الحملة المميّزة على الصفحة الرئيسية.",
    icon: <Swords className="size-6" />,
    href: "/campaigns",
    cta: "إلى الحملات",
  },
  {
    title: "استكشف الموسوعة",
    body: "آلاف المداخل عن الشخصيات والدول والمعارك والمدن. كل ما تحتاجه عن التاريخ الإسلامي في مكان واحد.",
    icon: <BookOpen className="size-6" />,
    href: "/encyclopedia",
    cta: "افتح الموسوعة",
  },
  {
    title: "زر الأطلس الإسلامي",
    body: "تجوّل عبر الخارطة التاريخية واكتشف الأقاليم والممالك التي شكّلت تاريخنا.",
    icon: <MapIcon className="size-6" />,
    href: "/map",
    cta: "افتح الخارطة",
  },
  {
    title: "اكتشف حدث اليوم",
    body: "في كل يوم نختار لك حدثًا مفصليًا من التاريخ الإسلامي والعربي. لا تفوّت قصص اليوم.",
    icon: <Calendar className="size-6" />,
    href: "/on-this-day",
    cta: "حدث اليوم",
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch { /* ignore */ }
  }, []);

  // Lock body scroll while the dialog is open so the background never moves.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevTouch = body.style.touchAction;
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    return () => {
      body.style.overflow = prevOverflow;
      body.style.touchAction = prevTouch;
    };
  }, [open]);

  if (!open || !mounted || typeof document === "undefined") return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  function finish(neverAgain = true) {
    if (neverAgain) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    }
    setOpen(false);
  }

  const node = (
    <div
      dir="rtl"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) finish(true); }}
    >
      <div className="relative w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-3xl border border-gold/40 bg-surface p-5 shadow-elegant">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] tracking-[0.3em] text-gold">جولة تعريفية · {i + 1}/{STEPS.length}</span>
          <button onClick={() => finish(true)} aria-label="تخطّي" className="rounded-full border border-white/10 p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gold/15 text-gold">
          {step.icon}
        </div>
        <h2 className="font-display text-xl font-bold">{step.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          {STEPS.map((_, idx) => (
            <span key={idx} className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-gold" : "w-1.5 bg-white/20"}`} />
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => (i === 0 ? finish(true) : setI(i - 1))}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-white/10 py-2.5 text-xs text-muted-foreground"
          >
            <ChevronRight className="size-4" />
            {i === 0 ? "تخطّي" : "السابق"}
          </button>
          {last ? (
            <button
              onClick={() => finish(true)}
              className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-gold py-2.5 text-xs font-bold text-primary-foreground shadow-gold"
            >
              ابدأ رحلتي
              <ChevronLeft className="size-4" />
            </button>
          ) : (
            <button
              onClick={() => setI(i + 1)}
              className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-gold py-2.5 text-xs font-bold text-primary-foreground shadow-gold"
            >
              التالي
              <ChevronLeft className="size-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => finish(true)}
          className="mt-2 w-full text-center text-[10px] text-muted-foreground hover:text-gold"
        >
          لا تُظهر هذه الجولة مجدّدًا
        </button>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
