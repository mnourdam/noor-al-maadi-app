import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, BookOpen, Compass, Sparkles, Search, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ERAS, useTimelineJourney, type EraId, type JourneyEntry } from "@/lib/timeline-journey";

export const Route = createFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "رحلة عبر الزمن — حكايا" },
      { name: "description", content: "رحلة سينمائية في التاريخ الإسلامي: عصور وأحداث ودول تُروى من الموسوعة." },
    ],
  }),
  component: TimelinePage,
});

type Mode = "brief" | "detailed";

function TimelinePage() {
  const { byEra, totals, isLoading, isError, noChronology } = useTimelineJourney();
  const [mode, setMode] = useState<Mode>("brief");
  const [query, setQuery] = useState("");
  const [activeEra, setActiveEra] = useState<EraId | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const q = query.trim().toLowerCase();
  const filteredByEra = useMemo(() => {
    const out = {} as Record<EraId, JourneyEntry[]>;
    for (const era of ERAS) {
      let list = byEra[era.id] ?? [];
      if (mode === "brief") list = list.filter((e) => e.isMajor);
      if (q) {
        list = list.filter((e) =>
          e.title.toLowerCase().includes(q) ||
          (e.subtitle ?? "").toLowerCase().includes(q) ||
          (e.summary ?? "").toLowerCase().includes(q),
        );
      }
      out[era.id] = list;
    }
    return out;
  }, [byEra, mode, q]);

  const totalShown = useMemo(
    () => ERAS.reduce((n, e) => n + (filteredByEra[e.id]?.length ?? 0), 0),
    [filteredByEra],
  );

  const jumpTo = (id: EraId) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    setActiveEra(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Track which era is in view for highlight.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = (e.target as HTMLElement).dataset.eraId as EraId | undefined;
            if (id) setActiveEra(id);
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    for (const era of ERAS) {
      const el = sectionRefs.current[era.id];
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [totalShown]);

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.3em] text-gold/80">JOURNEY</p>
            <h1 className="font-display mt-1 text-3xl font-bold text-foreground">رحلة عبر الزمن</h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              من ما قبل الإسلام حتى الدولة العثمانية — قصص ودول وأعلام، مصدرها الموسوعة.
            </p>
          </div>
          <Link to="/" className="glass rounded-full border border-white/15 p-2 text-muted-foreground">
            <ChevronLeft className="size-5" />
          </Link>
        </div>
        <div className="ornament-divider mt-4" />

        {/* Controls */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="glass inline-flex items-center gap-1 rounded-full border border-gold/30 p-1">
            {(["brief", "detailed"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                  mode === m ? "bg-gradient-gold text-primary-foreground" : "text-white/70 hover:text-white"
                }`}
              >
                {m === "brief" ? "مختصر" : "تفصيلي"}
              </button>
            ))}
          </div>

          <div className="glass relative flex min-w-[180px] flex-1 items-center gap-2 rounded-full border border-white/15 px-3 py-1">
            <Search className="size-3.5 text-white/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في الرحلة…"
              dir="rtl"
              className="w-full bg-transparent text-[12px] text-white placeholder:text-white/40 focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-white/40 hover:text-white">
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <span className="text-[10px] text-white/45">
            {totalShown} / {mode === "brief" ? totals.major : totals.all}
          </span>
        </div>

        {/* Era jump nav */}
        <div className="-mr-5 mt-3 flex gap-2 overflow-x-auto pr-5 pb-1" dir="rtl">
          {ERAS.map((e) => {
            const count = filteredByEra[e.id]?.length ?? 0;
            const on = activeEra === e.id;
            return (
              <button
                key={e.id}
                onClick={() => jumpTo(e.id)}
                disabled={count === 0}
                className={`shrink-0 rounded-full border px-3 py-1 text-[10px] transition ${
                  on
                    ? "border-gold/60 bg-gold/15 text-gold"
                    : count === 0
                      ? "border-white/5 bg-transparent text-white/25"
                      : "border-white/10 bg-black/30 text-white/70 hover:border-gold/40 hover:text-gold"
                }`}
              >
                {e.label} <span className="text-white/40">· {count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Journey */}
      <section className="relative mt-8 px-5 pb-16">
        {isLoading && (
          <div className="py-20 text-center text-sm text-white/50">…تُحضَّر الرحلة</div>
        )}
        {isError && !isLoading && (
          <div className="py-20 text-center text-sm text-rose-300">تعذّر تحميل الرحلة. حاول لاحقًا.</div>
        )}
        {!isLoading && !isError && totalShown === 0 && (
          <div className="py-20 text-center text-sm text-white/50">
            {q ? "لا نتائج مطابقة لبحثك." : "لا توجد مدخلات للعرض في هذا الوضع."}
          </div>
        )}

        {!isLoading && totalShown > 0 && (
          <div className="relative mx-auto max-w-3xl">
            {/* golden rail */}
            <div
              className="pointer-events-none absolute bottom-0 right-[18px] top-0 w-px bg-gradient-to-b from-transparent via-gold/55 to-transparent"
              aria-hidden
            />
            {ERAS.map((era) => {
              const list = filteredByEra[era.id];
              if (!list || list.length === 0) return null;
              return (
                <section
                  key={era.id}
                  data-era-id={era.id}
                  ref={(el) => { sectionRefs.current[era.id] = el; }}
                  className="relative scroll-mt-24 pt-10"
                >
                  <header className="relative mb-5 flex items-baseline gap-3 pr-10">
                    <span className="absolute right-[10px] top-2 size-4 rounded-full border-2 border-gold bg-background" aria-hidden />
                    <h2 className="font-display text-xl font-bold text-gold">{era.label}</h2>
                    <span className="text-[10px] text-white/45">
                      {era.startCE < 0 ? "—" : `${era.startCE}`} – {era.endCE} م · {list.length}
                    </span>
                  </header>

                  <div className="space-y-4">
                    {list.map((e) => (
                      <EntryCard key={e.id} entry={e} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {noChronology > 0 && !isLoading && (
          <p className="mt-10 text-center text-[10px] text-white/35">
            {noChronology} مدخل بلا بيانات زمنية — أضف <code>timeline_order</code> أو سنة لإظهاره.
          </p>
        )}
        <p className="mt-6 text-center text-[11px] italic text-white/55">
          «التاريخ ليس صفحاتٍ في كتاب، بل رحلةٌ في وجدان أمّة»
        </p>
      </section>
    </AppShell>
  );
}

function EntryCard({ entry }: { entry: JourneyEntry }) {
  return (
    <article className="relative pr-10">
      <span className="absolute right-[14px] top-6 size-2.5 rounded-full bg-gold shadow-[0_0_8px_2px_oklch(0.82_0.14_85/.45)]" aria-hidden />
      <div className="glass rounded-2xl border border-gold/20 bg-black/35 p-4 backdrop-blur transition hover:border-gold/40">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[10px] tracking-widest text-gold/80">{entry.yearLabel}</div>
          <div className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[9.5px] text-white/60">
            {ENTITY_TYPE_LABEL[entry.entityType] ?? entry.entityType}
          </div>
        </div>
        <h3 className="font-display mt-1 text-base font-bold text-foreground" dir="rtl">{entry.title}</h3>
        {entry.subtitle && (
          <p className="mt-0.5 text-[12px] text-white/65" dir="rtl">{entry.subtitle}</p>
        )}
        {entry.summary && (
          <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-white/75" dir="rtl">
            {entry.summary}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2 pt-1" dir="rtl">
          <Link
            to="/encyclopedia/entity/$id"
            params={{ id: entry.slug }}
            className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] text-gold hover:bg-gold/20"
          >
            <BookOpen className="size-3" /> افتح في الموسوعة
          </Link>
          {entry.hasAtlas && (
            <Link
              to="/map"
              search={{ focus: entry.slug } as never}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/75 hover:border-gold/40 hover:text-gold"
            >
              <Compass className="size-3" /> اعرض على الأطلس
            </Link>
          )}
          {entry.worldSlug && (
            <Link
              to="/worlds/$slug"
              params={{ slug: entry.worldSlug }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/75 hover:border-gold/40 hover:text-gold"
            >
              <Sparkles className="size-3" /> العالم
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  event: "حدث",
  battle: "معركة",
  state: "دولة",
  city: "مدينة",
  figure: "علم",
  landmark: "معلم",
  artifact: "أثر",
};
