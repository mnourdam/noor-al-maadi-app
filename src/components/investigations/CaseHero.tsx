import { Link } from "@tanstack/react-router";
import { ChevronRight, FolderOpen } from "lucide-react";
import { useInvestigationHeroArt } from "@/lib/investigations/hero-art";
import { useCaseNumber } from "@/lib/investigations/case-number";

/**
 * The cinematic opening plate of a case file: a period painting that
 * dissolves into the Irth navy, stamped with the case number, title and
 * brief. This is the ONLY surface that says "ملف القضية" — every other
 * element inside the case uses its own vocabulary (دليل، استنتاج، قرار،
 * إغلاق القضية) so the phrase never turns into wallpaper.
 */
export function CaseHero({
  slug,
  title,
  subtitle,
  description,
  difficultyLabel,
}: {
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  difficultyLabel?: string | null;
}) {
  const art = useInvestigationHeroArt(slug);
  const caseNo = useCaseNumber(slug);

  return (
    <header className="relative -mx-5 -mt-6 mb-5 overflow-hidden">
      {/* Painted plate */}
      <div className="relative h-[248px] w-full">
        {art ? (
          <img
            src={art}
            alt=""
            aria-hidden
            loading="eager"
            decoding="async"
            className="absolute inset-0 size-full animate-fade-in object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gold/15 via-transparent to-transparent" />
        )}

        {/* Natural dissolve into the Irth navy */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-background via-background/72 to-background/25"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent"
        />
      </div>

      {/* Back out of the case */}
      <Link
        to="/investigations"
        className="absolute end-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/15 bg-background/60 px-3 py-1.5 text-[11px] text-foreground/85 backdrop-blur"
      >
        <ChevronRight className="size-3.5" /> كل التحقيقات
      </Link>

      {/* Case identity — pulled up over the dissolve, but kept in normal
          flow so the description can never collide with the title. */}
      <div className="relative -mt-16 px-5 pb-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/35 bg-gold/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-gold">
            <FolderOpen className="size-3" />
            <span dir="ltr">ملف القضية #{caseNo}</span>
          </span>
          {difficultyLabel && (
            <span className="text-[10px] text-muted-foreground">{difficultyLabel}</span>
          )}
        </div>

        <h1 className="font-display mt-2 text-[22px] font-bold leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[12px] text-gold/90">{subtitle}</p>}
        {description && (
          <p className="mt-2.5 text-[12.5px] leading-7 text-foreground/85">{description}</p>
        )}
      </div>

    </header>
  );
}
