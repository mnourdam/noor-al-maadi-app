import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
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

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch { /* ignore */ }
  }, []);

  if (!open) return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  function finish(neverAgain = true) {
    if (neverAgain) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    }
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-gold/40 bg-surface p-5 shadow-elegant">
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
            <Link
              to={step.href as "/"}
              onClick={() => finish(true)}
              className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-gold py-2.5 text-xs font-bold text-primary-foreground shadow-gold"
            >
              ابدأ الآن
              <ChevronLeft className="size-4" />
            </Link>
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
}