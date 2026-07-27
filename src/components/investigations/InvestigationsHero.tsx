import heroArt from "@/assets/investigations-hero.jpg";

/**
 * The cinematic plate that opens the case-files section: a candlelit
 * historian's desk that dissolves into the Irth navy. The painting is a
 * bundled local asset, so it costs no network on any surface.
 */
export function InvestigationsHero({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="relative -mx-5 -mt-6 mb-4 overflow-hidden">
      <div className="relative h-[280px] w-full">
        {/* The plate itself is dissolved with a long alpha mask, so there is
            never a straight edge or a black rectangle over the painting. */}
        <img
          src={heroArt}
          alt=""
          aria-hidden
          width={1536}
          height={768}
          decoding="async"
          className="absolute inset-0 size-full object-cover object-[50%_28%] animate-fade-in [filter:brightness(1.18)_contrast(1.04)_saturate(1.05)]"
          style={{
            maskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 38%, rgba(0,0,0,0.85) 58%, rgba(0,0,0,0.45) 78%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 38%, rgba(0,0,0,0.85) 58%, rgba(0,0,0,0.45) 78%, rgba(0,0,0,0) 100%)",
          }}
        />
        {/* Gentle, long tint that only lands under the text block. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-transparent"
        />
      </div>

      <div className="relative -mt-16 px-5">
        <span className="inline-flex items-center rounded-full border border-gold/35 bg-gold/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-gold">
          ملفات القضايا
        </span>

        <h1 className="font-display mt-2 text-[22px] font-bold leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[12.5px] leading-6 text-foreground/80">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
