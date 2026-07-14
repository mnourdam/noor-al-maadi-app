import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useAccount } from "@/lib/account";

const STORAGE_KEY = "irth.onboarded.v1";
export const ONBOARDING_COMPLETED_EVENT = "irth:onboarding-completed";

interface Step {
  title: string;
  body: string;
  glyph: string;
}

const STEPS: Step[] = [
  {
    title: "مرحبًا بك في إرث",
    body: "انطلق في رحلة تفاعلية عبر التاريخ الإسلامي. استكشف الحضارات، وعِش الأحداث، واكتشف الشخصيات التي صنعت التاريخ.",
    glyph: "🕌",
  },
  {
    title: "العب... وتعلّم",
    body: "أكمل الحملات التاريخية، وافتح شخصيات وآثارًا ومدنًا جديدة، واكسب الخبرة والدنانير مع كل إنجاز.",
    glyph: "⚔️",
  },
  {
    title: "موسوعة حيّة بين يديك",
    body: "تصفّح آلاف الشخصيات والأحداث والمعارك والآثار، جميعها مترابطة لتمنحك تجربة استكشاف متكاملة.",
    glyph: "📚",
  },
  {
    title: "رحلتك تبدأ الآن",
    body: "أنشئ حسابًا لحفظ تقدمك على جميع أجهزتك، أو ابدأ مباشرة كضيف، ويمكنك إنشاء حساب لاحقًا في أي وقت.",
    glyph: "✨",
  },
];

export function OnboardingTour() {
  const { user, loadingSession } = useAccount();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [drag, setDrag] = useState(0); // px offset while dragging
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; t: number; id: number; locked: null | "x" | "y" } | null>(null);
  const widthRef = useRef(0);

  useEffect(() => {
    setMounted(true);
    try { localStorage.setItem("irth.diag.onboarding.mounted", "1"); } catch { /* */ }
    if (loadingSession) {
      try { localStorage.setItem("irth.diag.onboarding.skipReason", "loading-session"); } catch { /* */ }
      return;
    }
    try { localStorage.setItem("irth.diag.auth.hydrated", "1"); } catch { /* */ }
    if (user) {
      try {
        localStorage.setItem(STORAGE_KEY, "1");
        localStorage.setItem("irth.diag.onboarding.skipReason", "authenticated");
      } catch { /* ignore */ }
      return;
    }
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem("irth.diag.onboarding.skipReason", "showing");
        setOpen(true);
      } else {
        localStorage.setItem("irth.diag.onboarding.skipReason", "flag-already-set");
      }
    } catch { /* ignore */ }
  }, [user, loadingSession]);

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

  const last = i === STEPS.length - 1;

  function finish(neverAgain = true) {
    if (neverAgain) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    }
    setOpen(false);
    try { window.dispatchEvent(new CustomEvent(ONBOARDING_COMPLETED_EVENT)); } catch { /* ignore */ }
  }

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, next));
    setI(clamped);
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    widthRef.current = trackRef.current?.clientWidth ?? 0;
    pointerStart.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, locked: null };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = pointerStart.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      s.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (s.locked === "x") {
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
      }
    }
    if (s.locked !== "x") return;
    e.preventDefault();
    // Rubber-band at edges. In Arabic RTL:
    //   • swipe right (dx > 0) advances to the next slide
    //   • swipe left  (dx < 0) returns to the previous slide
    // At the first slide there is no previous → resist leftward drag.
    // At the last slide there is no next     → resist rightward drag.
    let d = dx;
    if ((i === 0 && d < 0) || (i === STEPS.length - 1 && d > 0)) d *= 0.35;
    setDrag(d);
  };

  const endDrag = (e: React.PointerEvent) => {
    const s = pointerStart.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dt = performance.now() - s.t;
    const w = widthRef.current || 1;
    const velocity = dx / Math.max(1, dt); // px per ms
    pointerStart.current = null;
    setDragging(false);
    setDrag(0);
    if (s.locked !== "x") return;
    const flick = Math.abs(velocity) > 0.5;
    const threshold = w * 0.2;
    // RTL gesture semantics — hard-coded, independent of navigator.language,
    // device locale, or the OS reading direction reported to the WebView.
    if (dx > 0 && (dx > threshold || flick)) {
      // swipe right → next
      goTo(i + 1);
    } else if (dx < 0 && (Math.abs(dx) > threshold || flick)) {
      // swipe left → previous
      goTo(i - 1);
    }
  };

  // Slides rendered right-to-left: logical index 0 sits at the rightmost
  // visual slot, so translating the track rightward reveals the next
  // (higher-index) slide — matching an Arabic RTL swipe-right → next.
  const visualIndex = STEPS.length - 1 - i;
  const baseOffset = -visualIndex * 100; // percentage
  const dragPct = widthRef.current ? (drag / widthRef.current) * 100 : 0;
  const trackStyle: React.CSSProperties = {
    transform: `translate3d(calc(${baseOffset}% + ${dragPct}%), 0, 0)`,
    transition: dragging ? "none" : "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
  };

  // Progress indicator reflects drag in the RTL sense: dragging right
  // (positive drag) advances toward index + 1.
  const progressIndex = i + (widthRef.current ? drag / widthRef.current : 0);


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
      <div className="relative w-full max-w-sm max-h-[90vh] overflow-hidden rounded-3xl border border-gold/40 bg-surface p-5 shadow-elegant">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] tracking-[0.3em] text-gold">جولة تعريفية · {i + 1}/{STEPS.length}</span>
          <button onClick={() => finish(true)} aria-label="تخطّي" className="rounded-full border border-white/10 p-1 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Swipeable slide viewport */}
        <div
          className="relative -mx-1 overflow-hidden select-none"
          style={{ touchAction: "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div ref={trackRef} className="flex w-full" style={trackStyle} dir="ltr">
            {STEPS.map((s, idx) => {
              const active = idx === i && !dragging;
              return (
                <div key={idx} className="w-full shrink-0 px-1" dir="rtl">
                  <div
                    className={`mb-4 grid size-16 place-items-center rounded-2xl bg-gold/15 text-3xl transition-all duration-500 ${
                      active ? "opacity-100 scale-100" : "opacity-80 scale-95"
                    }`}
                    aria-hidden
                  >
                    <span className="leading-none">{s.glyph}</span>
                  </div>
                  <h2
                    className={`font-display text-xl font-bold transition-all duration-500 ${
                      active ? "opacity-100 translate-y-0" : "opacity-90 translate-y-1"
                    }`}
                  >
                    {s.title}
                  </h2>
                  <p
                    className={`mt-2 text-sm leading-relaxed text-muted-foreground transition-all duration-500 ${
                      active ? "opacity-100 translate-y-0" : "opacity-80 translate-y-1"
                    }`}
                  >
                    {s.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          {STEPS.map((_, idx) => {
            const distance = Math.abs(idx - progressIndex);
            const isActive = distance < 0.5;
            return (
              <span
                key={idx}
                className="h-1.5 rounded-full bg-white/20 transition-all duration-200"
                style={{
                  width: isActive ? `${24 - distance * 12}px` : "6px",
                  backgroundColor: isActive ? "hsl(var(--gold, 42 65% 55%))" : undefined,
                  opacity: isActive ? 1 - distance * 0.3 : 0.6,
                }}
              />
            );
          })}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => (i === 0 ? finish(true) : goTo(i - 1))}
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
              ابدأ رحلتك
              <ChevronLeft className="size-4" />
            </button>
          ) : (
            <button
              onClick={() => goTo(i + 1)}
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
