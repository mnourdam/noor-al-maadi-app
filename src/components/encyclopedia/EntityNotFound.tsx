import { Link } from "@tanstack/react-router";
import { BookMarked, Compass, ArrowRight } from "lucide-react";

/**
 * Premium "content not yet available" empty state for encyclopedia entities.
 * Used whenever an entity, slug, or related link cannot be resolved so the
 * player experiences a calm, intentional pause rather than a technical error.
 */
export function EntityNotFound() {
  return (
    <div className="relative mx-auto max-w-[560px] px-5 pt-10 pb-16 text-center">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-x-0 -top-6 mx-auto h-56 w-56 rounded-full bg-gold/10 blur-3xl" />

      {/* Illustration: closed manuscript + compass medallion */}
      <div className="relative mx-auto mb-8 grid size-32 place-items-center">
        <div className="absolute inset-0 rounded-[28px] border border-gold/25 bg-gradient-to-br from-[#1a1f2e] via-[#10131c] to-black shadow-[0_30px_80px_-40px_rgba(212,175,90,0.45)]" />
        <div className="absolute inset-2 rounded-[22px] ring-1 ring-inset ring-white/5" />
        {/* Arabesque dots */}
        <div
          className="absolute inset-0 rounded-[28px] opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 30%, rgba(212,175,90,1) 1px, transparent 1.5px), radial-gradient(circle at 70% 70%, rgba(212,175,90,1) 1px, transparent 1.5px)",
            backgroundSize: "22px 22px",
          }}
        />
        <BookMarked className="relative size-12 text-gold" strokeWidth={1.2} />
        <span className="absolute -bottom-2 -left-2 grid size-9 place-items-center rounded-full border border-gold/40 bg-background text-gold shadow-[0_8px_24px_-10px_rgba(212,175,90,0.6)]">
          <Compass className="size-4" strokeWidth={1.5} />
        </span>
      </div>

      <span className="font-display text-[10px] tracking-[0.5em] text-gold/85">
        قيد الإعداد
      </span>
      <h1 className="font-display mt-3 text-[22px] font-bold leading-tight text-foreground">
        لم نصل إلى هذا المحتوى بعد
      </h1>
      <p className="mx-auto mt-3 max-w-[420px] text-[13.5px] leading-[2] text-muted-foreground">
        يبدو أن هذا العنصر غير متوفر حاليًا أو ما زال قيد الإعداد.
        <br />
        نعمل باستمرار على توسيع موسوعة إرث وإضافة المزيد من المحتوى التاريخي.
      </p>

      {/* Ornament */}
      <div className="my-7 flex items-center justify-center gap-3" aria-hidden>
        <span className="h-px w-16 bg-gradient-to-l from-gold/40 to-transparent" />
        <span className="grid size-4 rotate-45 place-items-center rounded-sm border border-gold/40">
          <span className="size-1 -rotate-45 rounded-full bg-gold" />
        </span>
        <span className="h-px w-16 bg-gradient-to-r from-gold/40 to-transparent" />
      </div>

      <div className="flex flex-col items-center gap-2.5">
        <Link
          to="/encyclopedia"
          className="group inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gradient-to-b from-gold/20 to-gold/5 px-5 py-2.5 text-[13px] font-medium text-gold shadow-[0_10px_30px_-15px_rgba(212,175,90,0.6)] transition hover:border-gold/60 hover:from-gold/25 hover:to-gold/10 active:scale-[0.98]"
        >
          العودة إلى الموسوعة
          <ArrowRight className="size-4 rotate-180 transition group-hover:-translate-x-0.5" strokeWidth={1.6} />
        </Link>
        <button
          type="button"
          disabled
          className="cursor-not-allowed text-[11.5px] text-muted-foreground/70"
          aria-disabled="true"
          title="سيتوفر لاحقًا"
        >
          إبلاغ عن المشكلة
        </button>
      </div>
    </div>
  );
}
