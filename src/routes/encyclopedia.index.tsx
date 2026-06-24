import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, X, Clock, Sparkles, Shuffle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Screen } from "@/components/AppShell";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { canonicalEraLabel, eraSortIndex, toCanonicalEra } from "@/lib/era-canonical";

export const Route = createFileRoute("/encyclopedia/")({
  head: () => ({
    meta: [
      { title: "الموسوعة التاريخية — إرث" },
      { name: "description", content: "تصفّح حر لكل الدول والشخصيات والعلماء والمعارك والمدن والأحداث والمعالم والآثار في عالم إرث." },
      { property: "og:title", content: "الموسوعة التاريخية — إرث" },
      { property: "og:description", content: "تصفّح حر لكل المحتوى التاريخي في إرث." },
    ],
  }),
  component: EncyclopediaHub,
});

const SECTION_LABELS: Record<string, string> = {
  figure: "الشخصيات",
  state: "الدول والحضارات",
  city: "المدن",
  battle: "المعارك",
  event: "الأحداث",
  landmark: "المعالم",
  artifact: "الآثار",
};
const SECTION_GLYPHS: Record<string, string> = {
  figure: "🪶",
  state: "🏛️",
  city: "🏙️",
  battle: "⚔️",
  event: "📜",
  landmark: "🕌",
  artifact: "🗝️",
};
const SECTIONS = Object.keys(SECTION_LABELS);
const DISCOVERY_TYPES = ["figure", "city", "battle", "landmark"];

function useAllEncyclopedia() {
  return useQuery({
    queryKey: ["encyclopedia", "all-min-v2"],
    staleTime: 60_000,
    queryFn: async () => {
      const PAGE = 1000;
      const rows: SupabaseEncyclopediaEntity[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("encyclopedia_entities")
          .select("id,slug,entity_type,title,subtitle,summary,metadata,created_at,updated_at")
          .eq("enabled", true)
          .order("title")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as SupabaseEncyclopediaEntity[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      return rows;
    },
  });
}

function metaEra(entity: SupabaseEncyclopediaEntity): string {
  const m = entity.metadata && typeof entity.metadata === "object"
    ? (entity.metadata as Record<string, unknown>)
    : {};
  return typeof m.era === "string" ? (m.era as string).trim() : "";
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function EncyclopediaHub() {
  const [query, setQuery] = useState("");
  const [era, setEra] = useState<string>("");
  const [showAllEras, setShowAllEras] = useState(false);

  const { data: all = [], isLoading } = useAllEncyclopedia();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of SECTIONS) c[s] = 0;
    for (const e of all) c[e.entity_type] = (c[e.entity_type] ?? 0) + 1;
    return c;
  }, [all]);

  const eraCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of all) {
      const er = metaEra(e);
      if (!er) continue;
      const canon = toCanonicalEra(er) ?? er;
      m.set(canon, (m.get(canon) ?? 0) + 1);
    }
    // chronological order per canonical taxonomy; unknown sinks to the end
    return Array.from(m.entries()).sort((a, b) => {
      const ai = eraSortIndex(a[0]);
      const bi = eraSortIndex(b[0]);
      if (ai !== bi) return ai - bi;
      return b[1] - a[1];
    });
  }, [all]);

  const states = useMemo(
    () => all.filter((e) => e.entity_type === "state"),
    [all],
  );

  const recentlyAdded = useMemo(
    () => all.slice().sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 6),
    [all],
  );
  const recentlyUpdated = useMemo(
    () => all.slice().sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")).slice(0, 6),
    [all],
  );

  const discovery = useMemo(() => {
    const pool = all.filter((e) => DISCOVERY_TYPES.includes(e.entity_type));
    const seed = Math.floor(Date.now() / (1000 * 60 * 30));
    return seededShuffle(pool, seed).slice(0, 8);
  }, [all]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q && !era) return [];
    return all
      .filter((e) => !era || (toCanonicalEra(metaEra(e)) ?? metaEra(e)) === era)
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.title} ${e.subtitle ?? ""} ${e.summary ?? ""} ${e.slug}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 60);
  }, [all, q, era]);

  const total = all.length;

  return (
    <AppShell>
      <Screen
        title="الموسوعة التاريخية"
        subtitle="تصفّح حرّ في كل المحتوى — دون انتظار الحملات أو الفتوحات."
      >
        {/* Hero */}
        <section className="rounded-2xl border border-gold/25 bg-gradient-to-bl from-gold/10 via-transparent to-transparent p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] text-gold/80">إجمالي العناصر</p>
              <p className="font-display text-3xl font-bold text-gold">{total.toLocaleString("en-US")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-muted-foreground">
              <div><div className="text-foreground font-bold">{counts.figure ?? 0}</div>شخصيات</div>
              <div><div className="text-foreground font-bold">{counts.city ?? 0}</div>مدن</div>
              <div><div className="text-foreground font-bold">{counts.battle ?? 0}</div>معارك</div>
            </div>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gold/70" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في الموسوعة…"
              className="w-full rounded-2xl border border-white/10 bg-surface py-3 pr-10 pl-10 text-right text-sm text-foreground placeholder:text-muted-foreground focus:border-gold/40 focus:outline-none"
              dir="rtl"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </section>

        {isLoading ? (
          <p className="mt-8 text-center text-xs text-muted-foreground">جارٍ التحميل…</p>
        ) : total === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-surface/70 p-6 text-center text-xs text-muted-foreground">
            لا توجد عناصر في الموسوعة بعد.
          </p>
        ) : (q || era) ? (
          <section className="mt-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-bold">نتائج البحث</h2>
                <span className="rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                  {results.length}
                </span>
              </div>
              {era && (
                <button onClick={() => setEra("")} className="text-[10px] text-gold/80 underline">
                  مسح فلتر العصر
                </button>
              )}
            </div>
            {results.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-surface/70 p-6 text-center text-xs text-muted-foreground">
                لا توجد نتائج مطابقة.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {results.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Explore by Type */}
            <section className="mt-6">
              <h2 className="font-display mb-2 text-sm font-bold">تصفّح حسب النوع</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {SECTIONS.map((s) => {
                  const n = counts[s] ?? 0;
                  return (
                    <Link
                      key={s}
                      to="/encyclopedia/type/$type"
                      params={{ type: s }}
                      className="group rounded-2xl border border-white/10 bg-surface p-3 text-right transition hover:border-gold/40 hover:bg-surface-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="grid size-10 place-items-center rounded-xl bg-black/35 text-xl ring-1 ring-white/5">
                          {SECTION_GLYPHS[s]}
                        </span>
                        <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                          {n}
                        </span>
                      </div>
                      <p className="font-display mt-2 text-sm font-bold">{SECTION_LABELS[s]}</p>
                      {n === 0 ? (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">لا يوجد بعد</p>
                      ) : (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          تصفّح كل {SECTION_LABELS[s]}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* Explore by Era */}
            <section className="mt-6">
              <h2 className="font-display mb-2 text-sm font-bold">تصفّح حسب العصر</h2>
              {eraCounts.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-surface/70 p-4 text-center text-[11px] text-muted-foreground">
                  لم تُسجَّل عصور بعد.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(showAllEras ? eraCounts : eraCounts.slice(0, 8)).map(([name, n]) => (
                    <button
                      key={name}
                      onClick={() => setEra(name)}
                      className="rounded-2xl border border-white/10 bg-surface px-3 py-2 text-right transition hover:border-gold/40"
                    >
                      <span className="font-display block text-xs font-bold">{canonicalEraLabel(name)}</span>
                      <span className="text-[10px] text-gold/80">{n} عنصر</span>
                    </button>
                  ))}
                  {eraCounts.length > 8 && (
                    <button
                      onClick={() => setShowAllEras((v) => !v)}
                      className="rounded-2xl border border-gold/30 bg-black/30 px-3 py-2 text-[11px] text-gold/90 hover:border-gold/60"
                    >
                      {showAllEras ? "عرض أقل" : `عرض المزيد (${eraCounts.length - 8})`}
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* Featured: recently added / updated */}
            {recentlyAdded.length > 0 && (
              <section className="mt-6">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="size-4 text-gold" />
                  <h2 className="font-display text-sm font-bold">أُضيف حديثاً</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {recentlyAdded.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
                </div>
              </section>
            )}

            {recentlyUpdated.length > 0 && (
              <section className="mt-6">
                <div className="mb-2 flex items-center gap-2">
                  <Clock className="size-4 text-gold" />
                  <h2 className="font-display text-sm font-bold">حُدِّث مؤخراً</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {recentlyUpdated.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
                </div>
              </section>
            )}

            {/* Continue exploring — randomized */}
            {discovery.length > 0 && (
              <section className="mt-6">
                <div className="mb-2 flex items-center gap-2">
                  <Shuffle className="size-4 text-gold" />
                  <h2 className="font-display text-sm font-bold">تابع الاستكشاف</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {discovery.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
                </div>
              </section>
            )}

            {/* States section — now just one section */}
            {states.length > 0 && (
              <section className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-display text-sm font-bold">الدول والحضارات</h2>
                  <Link to="/encyclopedia/type/$type" params={{ type: "state" }} className="text-[10px] text-gold/80 underline">
                    عرض الكل ({states.length})
                  </Link>
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {states.slice(0, 6).map((s) => (
                    <Link
                      key={s.id}
                      to="/encyclopedia/state/$id"
                      params={{ id: s.slug }}
                      className="group flex items-center gap-3 rounded-2xl border border-gold/25 bg-gradient-to-l from-gold/10 via-transparent to-transparent p-3 transition hover:border-gold/50"
                    >
                      <span className="grid size-12 place-items-center rounded-xl bg-black/35 text-2xl ring-1 ring-white/5">
                        🏛️
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-bold">{s.title}</p>
                        {s.subtitle && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
                            {s.subtitle}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <p className="mt-6 text-center text-[10px] text-muted-foreground">
              كل المحتوى مفتوح للتصفّح بدون اشتراطات تقدّم.
            </p>
          </>
        )}
      </Screen>
    </AppShell>
  );
}
