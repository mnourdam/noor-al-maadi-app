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
      <div className="relative h-[212px] w-full">
        <img
          src={heroArt}
          alt=""
          aria-hidden
          width={1536}
          height={768}
          decoding="async"
          className="absolute inset-0 size-full animate-fade-in object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent"
        />
      </div>

      <div className="relative -mt-14 px-5">
        <span className="inline-flex items-center rounded-full border border-gold/35 bg-gold/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.2em] text-gold" dir="ltr">
          CASE FILES
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
