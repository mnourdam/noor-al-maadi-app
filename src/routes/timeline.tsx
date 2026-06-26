// ============================================================
// Timeline Renaissance — رحلة عبر الزمن (player experience)
//
// Data engine: src/lib/timeline-journey.ts (encyclopedia_entities)
// This file is presentation only — no historical data lives here.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, BookOpen, Compass, Search, X,
  Swords, Crown, User, Building2, Landmark as LandmarkIcon,
  Gem, CalendarDays, Sparkles, Layers,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AndroidSafeInput } from "@/components/AndroidSafeTextInput";
import { ERAS, useTimelineJourney, type EraDef, type EraId, type JourneyEntry } from "@/lib/timeline-journey";

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

const ENTITY_TYPE_LABEL: Record<string, string> = {
  event: "حدث", battle: "معركة", state: "دولة", city: "مدينة",
  figure: "علم", landmark: "معلم", artifact: "أثر",
};

const ENTITY_ICON: Record<string, typeof Swords> = {
  event: CalendarDays, battle: Swords, state: Crown, city: Building2,
  figure: User, landmark: LandmarkIcon, artifact: Gem,
};

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ENTITY_ICON[type] ?? CalendarDays;
  return <Icon className={className} aria-hidden />;
}

function TimelinePage() {
  const { byEra, entries, totals, isLoading, isError, noChronology } = useTimelineJourney();
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

  const visibleEras = useMemo(
    () => ERAS.filter((e) => (filteredByEra[e.id]?.length ?? 0) > 0),
    [filteredByEra],
  );
  const totalShown = useMemo(
    () => visibleEras.reduce((n, e) => n + (filteredByEra[e.id]?.length ?? 0), 0),
    [visibleEras, filteredByEra],
  );

  // Journey stats (hero) — derived, not invented.
  const stats = useMemo(() => {
    const erasCount = ERAS.filter((e) => (byEra[e.id]?.length ?? 0) > 0).length;
    const years = (() => {
      const yrs = entries.map((e) => e.year).filter((y): y is number => typeof y === "number");
      if (!yrs.length) return null;
      const lo = Math.min(...yrs), hi = Math.max(...yrs);
      return Math.max(0, hi - lo);
    })();
    return { erasCount, entities: totals.all, years };
  }, [byEra, entries, totals.all]);

  const jumpTo = (id: EraId) => {
    const el = sectionRefs.current[id];
    if (!el) return;
    setActiveEra(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
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
      {/* ===== Hero ===== */}
      <header className="relative overflow-hidden px-5 pt-8 pb-6" dir="rtl">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(60% 50% at 80% 0%, color-mix(in oklab, var(--color-gold) 18%, transparent), transparent 60%), radial-gradient(50% 40% at 10% 30%, color-mix(in oklab, var(--color-gold) 10%, transparent), transparent 70%)",
          }}
          aria-hidden
        />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.32em] text-gold/80">JOURNEY · رحلة</p>
            <h1 className="font-display mt-1 text-3xl font-bold leading-tight text-foreground sm:text-4xl">
              رحلة عبر الزمن
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              من فجر الجزيرة إلى القسطنطينية — رحلةٌ سينمائية في عصور أمّةٍ، يُروى فيها كلُّ حدث من الموسوعة.
            </p>
          </div>
          <Link
            to="/"
            className="glass rounded-full border border-white/15 p-2 text-muted-foreground hover:text-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            aria-label="العودة للرئيسية"
          >
            <ChevronLeft className="size-5" />
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Stat icon={<Layers className="size-3.5" />} label="عصور" value={stats.erasCount} />
          <Stat icon={<Sparkles className="size-3.5" />} label="مدخلات" value={stats.entities} />
          <Stat
            icon={<CalendarDays className="size-3.5" />}
            label="سنة من التاريخ"
            value={stats.years != null ? stats.years : "—"}
          />
        </div>

        <div className="ornament-divider mt-6" />
      </header>

      {/* ===== Sticky controls + era nav ===== */}
      <div
        className="sticky top-0 z-30 -mt-px border-b border-white/5 bg-background/80 px-5 py-3 backdrop-blur-md"
        dir="rtl"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="glass inline-flex items-center gap-1 rounded-full border border-gold/30 p-1" role="tablist" aria-label="وضع العرض">
            {(["brief", "detailed"] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${
                  mode === m ? "bg-gradient-gold text-primary-foreground" : "text-white/70 hover:text-white"
                }`}
              >
                {m === "brief" ? "مختصر" : "تفصيلي"}
              </button>
            ))}
          </div>

          <div className="glass relative flex min-w-[180px] flex-1 items-center gap-2 rounded-full border border-white/15 px-3 py-1">
            <Search className="size-3.5 text-white/50" aria-hidden />
            <AndroidSafeInput
              value={query}
              onValueChange={setQuery}
              commitMode="blur"
              onEnter={setQuery}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="ابحث في الرحلة…"
              aria-label="ابحث في الرحلة"
              dir="rtl"
              className="w-full bg-transparent text-[12px] text-white placeholder:text-white/40 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="مسح البحث"
                className="text-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <span className="text-[10px] text-white/45" aria-live="polite">
            {totalShown} / {mode === "brief" ? totals.major : totals.all}
          </span>
        </div>

        <nav
          aria-label="تنقل بين العصور"
          className="-mr-5 mt-3 flex gap-2 overflow-x-auto pr-5 pb-1"
        >
          {ERAS.map((e) => {
            const count = filteredByEra[e.id]?.length ?? 0;
            const on = activeEra === e.id;
            return (
              <button
                key={e.id}
                onClick={() => jumpTo(e.id)}
                disabled={count === 0}
                aria-current={on ? "true" : undefined}
                className={`shrink-0 rounded-full border px-3 py-1 text-[10.5px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 ${
                  on
                    ? "border-gold/60 bg-gold/15 text-gold shadow-[0_0_14px_-2px_oklch(0.82_0.14_85/.55)]"
                    : count === 0
                      ? "border-white/5 bg-transparent text-white/25"
                      : "border-white/10 bg-black/30 text-white/70 hover:border-gold/40 hover:text-gold"
                }`}
              >
                {e.label} <span className="text-white/40">· {count}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ===== Journey body ===== */}
      <section className="relative px-5 pb-20 pt-6 scroll-smooth" dir="rtl">
        {isLoading && (
          <div className="py-24 text-center text-sm text-white/55">…تُحضَّر الرحلة</div>
        )}
        {isError && !isLoading && (
          <div className="py-24 text-center text-sm text-rose-300">تعذّر تحميل الرحلة. حاول لاحقًا.</div>
        )}
        {!isLoading && !isError && totalShown === 0 && (
          <div className="py-24 text-center text-sm text-white/55">
            {q ? "لا نتائج مطابقة لبحثك." : "لا توجد مدخلات للعرض في هذا الوضع."}
          </div>
        )}

        {!isLoading && totalShown > 0 && (
          <div className="relative mx-auto max-w-3xl">
            {/* Continuous golden rail (RTL: anchored to the right) */}
            <div
              className="pointer-events-none absolute bottom-0 right-[22px] top-0 w-px bg-gradient-to-b from-transparent via-gold/55 to-transparent"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-0 right-[20px] top-0 w-[5px] rounded-full bg-gold/5 blur-[2px]"
              aria-hidden
            />

            {visibleEras.map((era, idx) => {
              const list = filteredByEra[era.id]!;
              return (
                <EraSection
                  key={era.id}
                  era={era}
                  list={list}
                  index={idx}
                  refCb={(el) => { sectionRefs.current[era.id] = el; }}
                />
              );
            })}
          </div>
        )}

        {noChronology > 0 && !isLoading && (
          <p className="mt-10 text-center text-[10px] text-white/35">
            {noChronology} مدخل بلا بيانات زمنية — أضف <code>timeline_order</code> أو سنة لإظهاره.
          </p>
        )}
        <p className="mt-8 text-center text-[11px] italic text-white/55">
          «التاريخ ليس صفحاتٍ في كتاب، بل رحلةٌ في وجدان أمّة»
        </p>
      </section>
    </AppShell>
  );
}

/* ============================================================
 * Era section — premium hero band + nodes
 * ========================================================== */
function EraSection({
  era, list, index, refCb,
}: {
  era: EraDef;
  list: JourneyEntry[];
  index: number;
  refCb: (el: HTMLElement | null) => void;
}) {
  return (
    <section
      data-era-id={era.id}
      ref={refCb}
      className="relative scroll-mt-28 pt-14 first:pt-2"
      aria-labelledby={`era-${era.id}`}
    >
      {/* Era hero band */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-gold/15 bg-black/30 px-5 py-5 pr-12">
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-l ${era.accent}`}
          aria-hidden
        />
        <span
          className="absolute right-[10px] top-1/2 size-6 -translate-y-1/2 rounded-full border-2 border-gold bg-background shadow-[0_0_14px_-2px_oklch(0.82_0.14_85/.7)]"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[10px] tracking-[0.32em] text-gold/80">
            الفصل {String(index + 1).padStart(2, "0")}
          </p>
          <h2 id={`era-${era.id}`} className="font-display mt-1 text-2xl font-bold text-gold">
            {era.label}
          </h2>
          <p className="mt-1 text-[12px] text-white/65">{era.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-white/55">
            <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5">
              {era.startCE < 0 ? "—" : `${era.startCE}`} – {era.endCE} م
            </span>
            <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5">
              {list.length} مدخلًا
            </span>
          </div>
        </div>
      </div>

      {/* Entries */}
      <ol className="space-y-4" role="list">
        {list.map((e) => (
          <li key={e.id} className="animate-[reveal_.5s_ease-out_both]">
            <EntryCard entry={e} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ============================================================
 * Entry card — premium with image, icon node, hover lift
 * ========================================================== */
function EntryCard({ entry }: { entry: JourneyEntry }) {
  return (
    <article className="group relative pr-12">
      {/* Node on the rail */}
      <span
        className="absolute right-[14px] top-7 grid size-6 place-items-center rounded-full border-2 border-gold bg-background shadow-[0_0_10px_-1px_oklch(0.82_0.14_85/.5)] transition group-hover:scale-110"
        aria-hidden
      >
        <TypeIcon type={entry.entityType} className="size-3 text-gold" />
      </span>
      {/* Connector tick from rail to card */}
      <span
        className="absolute right-[20px] top-9 h-px w-3 bg-gold/40"
        aria-hidden
      />

      <Link
        to="/encyclopedia/entity/$id"
        params={{ id: entry.slug }}
        className="glass block overflow-hidden rounded-2xl border border-gold/20 bg-black/35 backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-[0_18px_40px_-22px_oklch(0.82_0.14_85/.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
      >
        {entry.imageUrl && (
          <div className="relative aspect-[16/7] w-full overflow-hidden">
            <img
              src={entry.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition duration-700 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" aria-hidden />
            <div className="absolute bottom-2 right-3 text-[10px] tracking-widest text-gold/90">
              {entry.yearLabel}
            </div>
          </div>
        )}

        <div className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            {!entry.imageUrl && (
              <div className="text-[10px] tracking-widest text-gold/80">{entry.yearLabel}</div>
            )}
            <div className="ms-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[9.5px] text-white/65">
              <TypeIcon type={entry.entityType} className="size-2.5 text-gold/80" />
              {ENTITY_TYPE_LABEL[entry.entityType] ?? entry.entityType}
            </div>
          </div>

          <h3 className="font-display mt-1 text-base font-bold text-foreground" dir="rtl">
            {entry.title}
          </h3>
          {entry.subtitle && (
            <p className="mt-0.5 text-[12px] text-white/65" dir="rtl">{entry.subtitle}</p>
          )}
          {entry.summary && (
            <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-white/75" dir="rtl">
              {entry.summary}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2 pt-1" dir="rtl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] text-gold">
              <BookOpen className="size-3" /> افتح في الموسوعة
            </span>
            {entry.hasAtlas && (
              <AtlasPill slug={entry.slug} />
            )}
            {entry.worldSlug && (
              <WorldPill slug={entry.worldSlug} />
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

function AtlasPill({ slug }: { slug: string }) {
  return (
    <Link
      to="/map"
      search={{ focus: slug } as never}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/75 hover:border-gold/40 hover:text-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
    >
      <Compass className="size-3" /> اعرض على الأطلس
    </Link>
  );
}

function WorldPill({ slug }: { slug: string }) {
  return (
    <Link
      to="/worlds/$slug"
      params={{ slug }}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-white/75 hover:border-gold/40 hover:text-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
    >
      <Sparkles className="size-3" /> العالم
    </Link>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="glass rounded-2xl border border-gold/15 bg-black/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] tracking-widest text-gold/80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-display mt-1 text-xl font-bold text-foreground tabular-nums">{value}</div>
    </div>
  );
}
