import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { ChevronLeft, ZoomIn, ZoomOut, Crown, Swords, BookOpen, Sparkles, Users, Compass, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  CENTURIES, ERA_BACKDROPS,
  TIMELINE_START, TIMELINE_END, LANE_META, TONE_CLASSES,
  type TimelineLane, type TimelinePoint, type TimelineBand,
} from "@/lib/timeline";
import { useTimelineBands, useTimelinePoints } from "@/lib/timeline-source";

export const Route = createFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "الخط الزمني الكبير — حكايا" },
      { name: "description", content: "ارحل عبر قرون التاريخ الإسلامي: خلافات، معارك، أعلام، وكتبٌ غيّرت العالم." },
    ],
  }),
  component: TimelinePage,
});

// Three zoom presets — pixels per year along the rail.
const ZOOMS = [
  { id: "centuries", label: "قرون",  px: 1.6 },
  { id: "decades",   label: "عقود",  px: 4.4 },
  { id: "years",     label: "سنين",  px: 12 },
] as const;

type ZoomId = (typeof ZOOMS)[number]["id"];

const LANES: { id: TimelineLane; icon: typeof Crown }[] = [
  { id: "caliphate", icon: Crown },
  { id: "figure",    icon: Users },
  { id: "battle",    icon: Swords },
  { id: "book",      icon: BookOpen },
  { id: "event",     icon: Sparkles },
];

const LANE_TOP = 96; // px below the year ruler where lane stack begins
const LANE_GAP = 14;

function laneY(idx: number) {
  let y = LANE_TOP;
  for (let i = 0; i < idx; i++) y += rowHeight(i) + LANE_GAP;
  return y;
}
function rowHeight(idx: number) {
  const id = LANES[idx]?.id;
  if (!id) return 36;
  // multi-row stacking for caliphates & figures
  if (id === "caliphate") return 28 * 3 + 6 * 2; // 3 stacked rows
  if (id === "figure")    return 18 * 4 + 4 * 3; // 4 stacked rows
  return 44;
}

/** Greedy lane packing: returns row index for each band so no two overlap on same row. */
function packRows<T extends { start: number; end: number }>(items: T[], maxRows: number) {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const rows: number[] = []; // end year per row
  const assignment = new Map<T, number>();
  for (const item of sorted) {
    let placed = -1;
    for (let r = 0; r < rows.length; r++) {
      if (rows[r] <= item.start) { placed = r; break; }
    }
    if (placed === -1) {
      if (rows.length < maxRows) { rows.push(item.end); placed = rows.length - 1; }
      else {
        // overflow → put on last row anyway
        placed = rows.length - 1;
        rows[placed] = Math.max(rows[placed], item.end);
      }
    } else {
      rows[placed] = item.end;
    }
    assignment.set(item, placed);
  }
  return assignment;
}

function TimelinePage() {
  const [zoom, setZoom] = useState<ZoomId>("decades");
  const [active, setActive] = useState<TimelinePoint | TimelineBand | null>(null);
  const [enabledLanes, setEnabledLanes] = useState<Record<TimelineLane, boolean>>({
    caliphate: true, figure: true, battle: true, book: true, event: true,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const pxPerYear = ZOOMS.find((z) => z.id === zoom)!.px;
  const totalWidth = Math.ceil((TIMELINE_END - TIMELINE_START) * pxPerYear) + 240;

  const x = (year: number) => (year - TIMELINE_START) * pxPerYear + 120;

  // Supabase-backed timeline content with safe fallback to legacy arrays.
  // When Supabase returns at least one band/point, it becomes the source of
  // truth; otherwise we fall back to the legacy static/pack-derived dataset.
  const sbBands = useTimelineBands();
  const sbPoints = useTimelinePoints();
  const BANDS_ALL: TimelineBand[]  = useMemo(() => sbBands.bands,  [sbBands.bands]);
  const POINTS_ALL: TimelinePoint[] = useMemo(() => sbPoints.points, [sbPoints.points]);

  // Debug: open /timeline?debug=1 to inspect the Supabase-backed dataset.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    // eslint-disable-next-line no-console
    console.log("[timeline] supabase bands:", sbBands.bands.length,
      sbBands.bands.slice(0, 5).map(b => `${b.id}:${b.label}:${b.start}-${b.end}`));
    // eslint-disable-next-line no-console
    console.log("[timeline] supabase points:", sbPoints.points.length,
      sbPoints.points.slice(0, 8).map(p => `${p.id}:${p.label}:${p.year}:${p.lane}`));
  }, [sbBands.bands, sbPoints.points]);
  // Pack stacked rows for caliphate & figure lanes.
  const caliphateBands = useMemo(() => BANDS_ALL.filter((b) => b.lane === "caliphate"), [BANDS_ALL]);
  const figureBands    = useMemo(() => BANDS_ALL.filter((b) => b.lane === "figure"), [BANDS_ALL]);
  const caliphateRows  = useMemo(() => packRows(caliphateBands, 3), [caliphateBands]);
  const figureRows     = useMemo(() => packRows(figureBands, 4), [figureBands]);

  // Scroll to most recent on first mount.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // RTL: scroll so that the year ~1100 (golden age) is in view first
    const target = x(1100) - el.clientWidth / 2;
    el.scrollLeft = target;
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const jumpTo = (year: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: x(year) - el.clientWidth / 2, behavior: "smooth" });
  };

  return (
    <AppShell>
      <div className="px-5 pt-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.3em] text-gold/80">رحلة عبر الزمن</p>
            <h1 className="font-display mt-1 text-3xl font-bold text-foreground">الخط الزمني الكبير</h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              من بعثة النبي ﷺ إلى عصرنا — خلافاتٌ ومعاركٌ وأعلامٌ وكتبٌ، كلّها على لوحٍ واحد.
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
            <ZoomOut className="mx-1 size-3.5 text-gold/70" />
            {ZOOMS.map((z) => (
              <button
                key={z.id}
                onClick={() => setZoom(z.id)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                  zoom === z.id ? "bg-gradient-gold text-primary-foreground" : "text-white/70 hover:text-white"
                }`}
              >
                {z.label}
              </button>
            ))}
            <ZoomIn className="mx-1 size-3.5 text-gold/70" />
          </div>

          <div className="h-6 w-px bg-white/15" />

          {LANES.map(({ id, icon: Icon }) => {
            const on = enabledLanes[id];
            return (
              <button
                key={id}
                onClick={() => setEnabledLanes((s) => ({ ...s, [id]: !s[id] }))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] transition ${
                  on ? "border-gold/40 bg-gold/10 text-gold" : "border-white/10 bg-transparent text-white/40"
                }`}
              >
                <Icon className="size-3" />
                {LANE_META[id].label}
              </button>
            );
          })}
        </div>

        {/* Era quick-jump */}
        <div className="-mr-5 mt-3 flex gap-2 overflow-x-auto pr-5 pb-1">
          {ERA_BACKDROPS.map((e) => (
            <button
              key={e.id}
              onClick={() => jumpTo((e.start + e.end) / 2)}
              className="glass shrink-0 rounded-full border border-white/10 px-3 py-1 text-[10px] text-white/70 transition hover:border-gold/40 hover:text-gold"
            >
              {e.label} <span className="text-white/40">· {e.start}–{e.end}</span>
            </button>
          ))}
        </div>
      </div>

      {/* === The Timeline Canvas === */}
      <section className="relative mt-6 px-2">
        <div className="parchment-rail relative overflow-hidden rounded-3xl border border-gold/25">
          <div className="arabesque-layer" />
          {/* Horizontal scroller */}
          <div
            ref={scrollRef}
            className="relative overflow-x-auto overflow-y-hidden"
            dir="ltr"
          >
            <div
              className="relative"
              style={{ width: totalWidth, height: LANE_TOP + LANES.reduce((acc, _, i) => acc + rowHeight(i) + LANE_GAP, 0) + 40 }}
            >
              {/* Era backdrops */}
              {ERA_BACKDROPS.map((e) => (
                <div
                  key={e.id}
                  className={`pointer-events-none absolute top-0 bottom-0 bg-gradient-to-b ${e.tone} to-transparent`}
                  style={{ left: x(e.start), width: (e.end - e.start) * pxPerYear }}
                />
              ))}

              {/* Year ruler */}
              <div className="absolute left-0 right-0 top-0 h-20">
                <div className="absolute left-0 right-0 top-12 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
                {CENTURIES.map((c) => (
                  <div key={c.year} className="absolute top-0 flex h-20 flex-col items-center" style={{ left: x(c.year) - 24, width: 48 }}>
                    <span className="font-display text-xs font-bold text-gold/90" dir="rtl">{c.label} م</span>
                    <span className="mt-1 h-2 w-px bg-gold/40" />
                  </div>
                ))}
                {/* Decade ticks when zoomed in */}
                {zoom !== "centuries" &&
                  Array.from({ length: Math.ceil((TIMELINE_END - TIMELINE_START) / 10) }).map((_, i) => {
                    const y = TIMELINE_START + i * 10;
                    if (y % 100 === 0) return null;
                    return (
                      <div key={y} className="absolute top-11 h-2 w-px bg-white/15" style={{ left: x(y) }} />
                    );
                  })}
              </div>

              {/* === Lanes === */}
              {LANES.map(({ id }, idx) => {
                if (!enabledLanes[id]) return null;
                const top = laneY(idx);
                const h = rowHeight(idx);
                return (
                  <div key={id} className="absolute left-0 right-0" style={{ top, height: h }}>
                    {/* lane backdrop */}
                    <div className="absolute inset-0 rounded-md bg-white/[0.02] ring-1 ring-inset ring-white/5" />

                    {/* lane title (sticky-ish on the right edge for RTL feel) */}
                    <div
                      className="sticky-lane-title font-display absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] tracking-widest text-gold/90 backdrop-blur"
                      dir="rtl"
                    >
                      {LANE_META[id].label}
                    </div>

                    {/* === Caliphate / figure bands === */}
                    {id === "caliphate" && caliphateBands.map((b) => {
                      const row = caliphateRows.get(b) ?? 0;
                      const left = x(b.start);
                      const width = Math.max(40, (b.end - b.start) * pxPerYear);
                      const tone = TONE_CLASSES[b.tone ?? "gold"];
                      const rowH = 28;
                      const inner = (
                        <div
                          className={`group/band absolute flex h-7 items-center gap-2 overflow-hidden rounded-md border ${tone.bg} ${tone.border} px-2 backdrop-blur transition hover:brightness-125`}
                          style={{ left, width, top: row * (rowH + 6) }}
                        >
                          <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
                          <span className={`truncate text-[11px] font-bold ${tone.text}`} dir="rtl">{b.label}</span>
                          {b.sub && width > 110 && (
                            <span className="ml-auto truncate text-[9px] text-white/55" dir="rtl">{b.sub}</span>
                          )}
                        </div>
                      );
                      return b.href ? (
                        <button key={b.id} onClick={() => { setActive(b); }} className="contents">{inner}</button>
                      ) : (
                        <button key={b.id} onClick={() => setActive(b)} className="contents">{inner}</button>
                      );
                    })}

                    {id === "figure" && figureBands.map((b) => {
                      const row = figureRows.get(b) ?? 0;
                      const left = x(b.start);
                      const width = Math.max(36, (b.end - b.start) * pxPerYear);
                      const tone = TONE_CLASSES[b.tone ?? "gold"];
                      const rowH = 18;
                      return (
                        <button
                          key={b.id}
                          onClick={() => setActive(b)}
                          className={`group absolute flex h-[18px] items-center gap-1 overflow-hidden rounded-full border px-2 ${tone.border} bg-black/30 transition hover:bg-black/50`}
                          style={{ left, width, top: row * (rowH + 4) }}
                        >
                          <span className={`size-1 shrink-0 rounded-full ${tone.dot}`} />
                          <span className={`truncate text-[9.5px] ${tone.text}`} dir="rtl">{b.label}</span>
                        </button>
                      );
                    })}

                    {/* === Point lanes (battle, book, event) === */}
                    {(id === "battle" || id === "book" || id === "event") &&
                      POINTS_ALL.filter((p) => p.lane === id).map((p) => {
                        const tone = TONE_CLASSES[p.tone ?? "gold"];
                        const left = x(p.year);
                        return (
                          <button
                            key={p.id}
                            onClick={() => setActive(p)}
                            className="group absolute flex flex-col items-center"
                            style={{ left: left - 16, top: 4, width: 32 }}
                          >
                            <div className={`relative grid size-7 place-items-center rounded-full border ${tone.border} ${tone.bg} text-[14px] shadow-[0_4px_14px_-2px_oklch(0_0_0/0.4)] transition group-hover:scale-110`}>
                              <span>{p.glyph ?? "✦"}</span>
                              <span className={`absolute -inset-0.5 -z-10 rounded-full ${tone.dot} opacity-0 blur-md transition group-hover:opacity-60`} />
                            </div>
                            {zoom !== "centuries" && (
                              <span className={`mt-1 max-w-[120px] truncate rounded-sm bg-black/55 px-1 text-[8.5px] ${tone.text}`} dir="rtl">
                                {p.label}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                );
              })}

              {/* Edge fog */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
            </div>
          </div>
        </div>

        {/* Hint */}
        <p className="mt-3 px-3 text-center text-[11px] text-muted-foreground">
          اسحب أفقيًا للتنقّل بين القرون · اضغط على أي عنصر لكشف تفاصيله
        </p>
      </section>

      {/* === Discovery panel === */}
      {active && (
        <DetailSheet
          item={active}
          onClose={() => setActive(null)}
          onOpen={(href) => { setActive(null); navigate({ to: href as "/" }); }}
        />
      )}

      {/* Legend / context */}
      <section className="mt-10 px-5 pb-12">
        <div className="ornament-divider mb-5" />
        <h2 className="font-display text-lg font-bold">دلالات الخريطة</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <Legend tone="gold"    label="ذهبي · مفاصل العصر" />
          <Legend tone="emerald" label="أخضر · الفتوحات والخلافة" />
          <Legend tone="violet"  label="بنفسجي · العلوم والمعرفة" />
          <Legend tone="rose"    label="وردي · المغرب والأندلس" />
          <Legend tone="indigo"  label="نيلي · المشرق والسلاجقة" />
          <Legend tone="ruby"    label="ياقوتي · الصدامات الكبرى" />
        </div>
        <p className="mt-6 text-center text-[12px] italic text-white/55">
          «التاريخ ليس صفحاتٍ في كتاب، بل رحلةٌ في وجدان أمّة»
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/map" className="glass inline-flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-[11px] text-gold hover:bg-gold/10">
            <Compass className="size-3.5" /> تابع رحلتك على الخارطة
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  const t = TONE_CLASSES[tone];
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2.5 rounded-full ${t.dot}`} />
      <span>{label}</span>
    </div>
  );
}

function isPoint(x: TimelinePoint | TimelineBand): x is TimelinePoint {
  return (x as TimelinePoint).year !== undefined;
}

function DetailSheet({
  item, onClose, onOpen,
}: { item: TimelinePoint | TimelineBand; onClose: () => void; onOpen: (href: string) => void }) {
  const tone = TONE_CLASSES[(item.tone ?? "gold") as string];
  const point = isPoint(item);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="parchment-dark relative w-full max-w-md rounded-t-3xl border border-gold/30 p-6 shadow-elegant animate-curtain"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="glass absolute right-3 top-3 rounded-full border border-white/15 p-1.5 text-white/70 hover:text-white">
          <X className="size-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${tone.dot}`} />
          <span className="text-[10px] tracking-[0.3em] text-gold/80">
            {point ? LANE_META[(item as TimelinePoint).lane].label : LANE_META[(item as TimelineBand).lane].label}
          </span>
        </div>
        <h3 className="font-display mt-2 text-2xl font-bold text-white">{item.label}</h3>
        <p className="mt-2 text-[12px] text-gold/90">
          {point
            ? `${(item as TimelinePoint).year} م`
            : `${(item as TimelineBand).start} – ${(item as TimelineBand).end} م`}
          {!point && (item as TimelineBand).sub ? ` · ${(item as TimelineBand).sub}` : ""}
        </p>
        {point && (item as TimelinePoint).hint && (
          <p className="mt-3 text-sm leading-relaxed text-white/80">{(item as TimelinePoint).hint}</p>
        )}
        {!point && (
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            امتدّت {item.label} نحو {(item as TimelineBand).end - (item as TimelineBand).start} سنة، شكّلت خلالها ملامح العالم الإسلامي وأنتجت
            فيها أعلامٌ ومعاركُ وكتبٌ كثيرة. تابع رحلتك واستكشف ما جرى في زمنها.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {item.href && (
            <button
              onClick={() => onOpen(item.href!)}
              className="bg-gradient-gold text-primary-foreground shadow-gold inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-bold"
            >
              فتح الصفحة الكاملة <ChevronLeft className="size-3.5" />
            </button>
          )}
          <button onClick={onClose} className="glass rounded-full border border-white/15 px-4 py-2 text-[12px] text-white/70">
            متابعة الاستكشاف
          </button>
        </div>
      </div>
    </div>
  );
}