import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  X,
  Clock,
  Sparkles,
  Shuffle,
  Compass,
  Library,
  ChevronLeft,
  TrendingUp,
  Users,
  Landmark,
  Building2,
  Swords,
  ScrollText,
  Castle,
  Gem,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ReadingScale } from "@/components/ReadingScale";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AndroidPlainTextInput } from "@/components/AndroidPlainTextInput";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { cachedEncyclopediaList } from "@/lib/offline-fallback";
import { canonicalEraLabel, eraSortIndex, toCanonicalEra } from "@/lib/era-canonical";
import { iconForType } from "@/lib/encyclopedia-icons";
import { androidMark, isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";

export const Route = createFileRoute("/encyclopedia/")({
  head: () => ({
    meta: [
      { title: "الموسوعة التاريخية — إرث" },
      { name: "description", content: "المكتبة التاريخية الكبرى لإرث: شخصيات، دول، مدن، معارك، أحداث، معالم وآثار." },
      { property: "og:title", content: "الموسوعة التاريخية — إرث" },
      { property: "og:description", content: "ادخل المكتبة التاريخية الكبرى. تصفّح حر، اكتشاف يومي، وعمق موسوعي." },
    ],
  }),
  component: EncyclopediaHub,
});

type CategoryDef = {
  key: string;
  label: string;
  caption: string;
  icon: LucideIcon;
};

const CATEGORIES: CategoryDef[] = [
  { key: "figure",   label: "الشخصيات", caption: "قادة، علماء، فاتحون", icon: Users },
  { key: "state",    label: "الدول والحضارات", caption: "ممالك وخلافات", icon: Landmark },
  { key: "city",     label: "المدن", caption: "حواضر التاريخ", icon: Building2 },
  { key: "battle",   label: "المعارك", caption: "أيام فاصلة", icon: Swords },
  { key: "event",    label: "الأحداث", caption: "محطات تحوّل", icon: ScrollText },
  { key: "landmark", label: "المعالم", caption: "عمارة وأثر", icon: Castle },
  { key: "artifact", label: "الآثار", caption: "نفائس وكنوز", icon: Gem },
];

const POPULAR_QUERIES = [
  "صلاح الدين", "بغداد", "قرطبة", "حطين", "القدس", "ابن سينا", "دمشق", "الأندلس",
];

const DISCOVERY_TYPES = ["figure", "city", "battle", "landmark", "artifact", "event"];
const RECENT_KEY = "irth.enc.recent-searches";
const RECENT_VIEW_KEY = "irth.enc.recent-views";

function useAllEncyclopedia() {
  return useQuery({
    queryKey: ["encyclopedia", "all-min-v2"],
    staleTime: 60_000,
    queryFn: async () => {
      const PAGE = 1000;
      const rows: SupabaseEncyclopediaEntity[] = [];
      try {
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
        if (rows.length > 0) return rows;
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[encyclopedia.index] online fetch failed, using snapshot", e);
      }
      // Offline / failure fallback — use bundled / synced snapshot so
      // stats, search and category counts keep working without network.
      return (await cachedEncyclopediaList()) as SupabaseEncyclopediaEntity[];
    },
  });
}

function metaEra(entity: SupabaseEncyclopediaEntity): string {
  const m = entity.metadata && typeof entity.metadata === "object"
    ? (entity.metadata as Record<string, unknown>)
    : {};
  return typeof m.era === "string" ? (m.era as string).trim() : "";
}

function seededPick<T>(arr: T[], seed: number, n: number): T[] {
  const a = arr.slice();
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function readRecent(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch { return []; }
}

function pushRecent(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    const cur = readRecent(key);
    const next = [value, ...cur.filter((v) => v !== value)].slice(0, 8);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch { /* noop */ }
}

function EncyclopediaHub() {
  androidMark("render:Encyclopedia");
  if (isAndroidUltraStableMode()) return <AndroidStableEncyclopedia />;

  return <EncyclopediaHubFull />;
}

function EncyclopediaHubFull() {
  const [query, setQuery] = useState("");
  const [era, setEra] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showAllEras, setShowAllEras] = useState(false);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setRecent(readRecent(RECENT_KEY)); }, []);

  const { data: all = [], isLoading } = useAllEncyclopedia();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
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
    return Array.from(m.entries()).sort((a, b) => {
      const ai = eraSortIndex(a[0]);
      const bi = eraSortIndex(b[0]);
      if (ai !== bi) return ai - bi;
      return b[1] - a[1];
    });
  }, [all]);

  const recentlyAdded = useMemo(
    () => all.slice().sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 6),
    [all],
  );
  const recentlyUpdated = useMemo(
    () => all.slice().sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")).slice(0, 6),
    [all],
  );

  // Today's discoveries — one per category, deterministic per day
  const todaysPicks = useMemo(() => {
    const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const out: { type: string; label: string; entity: SupabaseEncyclopediaEntity }[] = [];
    for (const cat of CATEGORIES) {
      if (cat.key === "state") continue;
      const pool = all.filter((e) => e.entity_type === cat.key);
      if (!pool.length) continue;
      const picked = seededPick(pool, day + cat.key.charCodeAt(0), 1)[0];
      if (picked) out.push({ type: cat.key, label: cat.label, entity: picked });
    }
    return out.slice(0, 6);
  }, [all]);

  const discovery = useMemo(() => {
    const pool = all.filter((e) => DISCOVERY_TYPES.includes(e.entity_type));
    const seed = Math.floor(Date.now() / (1000 * 60 * 30));
    return seededPick(pool, seed, 6);
  }, [all]);

  // Recently viewed (client-side)
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  useEffect(() => { setViewedIds(readRecent(RECENT_VIEW_KEY)); }, []);
  const recentlyViewed = useMemo(() => {
    if (!viewedIds.length || !all.length) return [];
    const map = new Map(all.map((e) => [e.slug, e] as const));
    return viewedIds.map((s) => map.get(s)).filter(Boolean).slice(0, 6) as SupabaseEncyclopediaEntity[];
  }, [viewedIds, all]);

  const q = query.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (!q) return [];
    return all
      .filter((e) => typeFilter === "all" || e.entity_type === typeFilter)
      .filter((e) => {
        const hay = `${e.title} ${e.subtitle ?? ""} ${e.slug}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 6);
  }, [all, q, typeFilter]);

  const results = useMemo(() => {
    if (!q && !era && typeFilter === "all") return [];
    return all
      .filter((e) => typeFilter === "all" || e.entity_type === typeFilter)
      .filter((e) => !era || (toCanonicalEra(metaEra(e)) ?? metaEra(e)) === era)
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.title} ${e.subtitle ?? ""} ${e.summary ?? ""} ${e.slug}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 60);
  }, [all, q, era, typeFilter]);

  const total = all.length;
  const submitRecent = (value: string) => {
    const v = value.trim();
    if (!v) return;
    pushRecent(RECENT_KEY, v);
    setRecent(readRecent(RECENT_KEY));
  };

  return (
    <AppShell>
      <ReadingScale className="px-5 pt-2">

        <Breadcrumbs
          className="mb-2"
          items={[
            { label: "الرئيسية", to: "/" },
            { label: "الموسوعة" },
          ]}
        />
        {/* Cinematic Hero */}
        <section className="relative -mx-5 -mt-2 border-b border-gold/15 bg-gradient-to-b from-gold/[0.08] via-background to-background px-5 pb-6 pt-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at top, rgba(212,175,55,0.5), transparent 60%), repeating-linear-gradient(45deg, rgba(212,175,55,0.15) 0 2px, transparent 2px 14px)",
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.4em] text-gold/70">
              <Library className="size-3.5" />
              <span>المكتبة الكبرى</span>
            </div>
            <h1 className="font-display mt-2 text-3xl font-bold leading-tight text-foreground">
              الموسوعة <span className="text-gold">التاريخية</span>
            </h1>
            <p className="mt-1 max-w-md text-[12px] leading-6 text-muted-foreground">
              ادخل قاعة الذاكرة. تصفّح حر بين الشخصيات والدول والمدن والمعارك والآثار — كل ما تركه الزمن.
            </p>

            {/* Live stats */}
            <div className="mt-4 grid grid-cols-4 gap-2 rounded-2xl border border-gold/20 bg-black/30 p-3 text-center">
              <div className="border-l border-gold/15 pl-2">
                <p className="font-display text-lg font-bold text-gold leading-none">
                  {total.toLocaleString("en-US")}
                </p>
                <p className="mt-1 text-[9px] text-muted-foreground">إجمالي</p>
              </div>
              <div className="border-l border-gold/15 pl-2">
                <p className="font-display text-lg font-bold text-foreground leading-none">{counts.figure ?? 0}</p>
                <p className="mt-1 text-[9px] text-muted-foreground">شخصيات</p>
              </div>
              <div className="border-l border-gold/15 pl-2">
                <p className="font-display text-lg font-bold text-foreground leading-none">{counts.city ?? 0}</p>
                <p className="mt-1 text-[9px] text-muted-foreground">مدن</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-foreground leading-none">{counts.battle ?? 0}</p>
                <p className="mt-1 text-[9px] text-muted-foreground">معارك</p>
              </div>
            </div>

            {/* Search */}
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-gold/70" />
              <AndroidPlainTextInput
                ref={inputRef}
                value={query}
                onValueChange={setQuery}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
                onEnter={() => submitRecent(query)}
                androidEntryKey="encyclopedia.search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="ابحث في المكتبة… اسم، مدينة، معركة، عصر"
                className="w-full rounded-2xl border border-gold/30 bg-surface/90 py-3.5 pr-11 pl-10 text-right text-sm text-foreground placeholder:text-muted-foreground/80 shadow-[0_0_0_1px_rgba(212,175,55,0.05),0_8px_30px_-12px_rgba(212,175,55,0.25)] focus:border-gold/60 focus:outline-none"
                dir="rtl"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                  aria-label="مسح"
                >
                  <X className="size-4" />
                </button>
              )}

              {/* Suggestions / Recent / Popular dropdown */}
              {focused && (
                <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-gold/25 bg-surface shadow-xl animate-fade-in">
                  {q && suggestions.length > 0 && (
                    <div className="p-2">
                      <p className="px-2 py-1 text-[10px] tracking-[0.3em] text-gold/70">اقتراحات</p>
                      <ul>
                        {suggestions.map((s) => {
                          const SIcon = iconForType(s.entity_type);
                          return (
                            <li key={s.id}>
                              <Link
                                to={s.entity_type === "state" ? "/encyclopedia/state/$id" : "/encyclopedia/entity/$id"}
                                params={{ id: s.slug }}
                                onClick={() => { submitRecent(s.title); pushRecent(RECENT_VIEW_KEY, s.slug); }}
                                className="flex items-center gap-3 rounded-xl px-2 py-2 text-right hover:bg-surface-2"
                              >
                                <SIcon className="size-4 text-gold/70" strokeWidth={1.5} />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[12px] font-bold">{s.title}</p>
                                  {s.subtitle && (
                                    <p className="truncate text-[10px] text-muted-foreground">{s.subtitle}</p>
                                  )}
                                </div>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {!q && recent.length > 0 && (
                    <div className="border-b border-white/5 p-2">
                      <p className="px-2 py-1 text-[10px] tracking-[0.3em] text-gold/70">عمليات بحث أخيرة</p>
                      <div className="flex flex-wrap gap-1.5 px-2 pb-1">
                        {recent.map((r) => (
                          <button
                            key={r}
                            onMouseDown={(e) => { e.preventDefault(); setQuery(r); inputRef.current?.focus(); }}
                            className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] hover:border-gold/40"
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!q && (
                    <div className="p-2">
                      <p className="px-2 py-1 text-[10px] tracking-[0.3em] text-gold/70">بحث شائع</p>
                      <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                        {POPULAR_QUERIES.map((p) => (
                          <button
                            key={p}
                            onMouseDown={(e) => { e.preventDefault(); setQuery(p); inputRef.current?.focus(); }}
                            className="rounded-full border border-gold/20 bg-gold/5 px-2.5 py-1 text-[11px] text-gold/90 hover:border-gold/50"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Type filter chips */}
            <div className="relative z-10 -mx-5 mt-3 overflow-x-auto px-5 pb-1 scrollbar-thin" dir="rtl">
              <div className="flex items-center gap-1.5">
                {[{ key: "all", label: "الكل" }, ...CATEGORIES.map((c) => ({ key: c.key, label: c.label }))].map((t) => {
                  const active = typeFilter === t.key;
                  const n = t.key === "all" ? total : (counts[t.key] ?? 0);
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTypeFilter(t.key)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition ${
                        active
                          ? "border-gold/60 bg-gold/15 text-gold shadow-[0_0_0_1px_rgba(212,175,55,0.25)]"
                          : "border-white/10 bg-black/30 text-muted-foreground hover:border-gold/40 hover:text-foreground"
                      }`}
                    >
                      <span className="font-bold">{t.label}</span>
                      <span className={`ms-1.5 text-[10px] ${active ? "text-gold/80" : "text-muted-foreground/70"}`}>
                        {n}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>


        {isLoading ? (
          <p className="mt-10 text-center text-xs text-muted-foreground">جارٍ فتح المكتبة…</p>
        ) : total === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-surface/70 p-6 text-center text-xs text-muted-foreground">
            لا توجد عناصر في الموسوعة بعد.
          </p>
        ) : (q || era || typeFilter !== "all") ? (
          <section className="mt-6 animate-fade-in">
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
            {/* Discover by Category — immersive cards */}
            <section className="mt-7 animate-fade-in">
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <p className="text-[10px] tracking-[0.4em] text-gold/70">قاعات المكتبة</p>
                  <h2 className="font-display text-base font-bold">استكشف حسب النوع</h2>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {CATEGORIES.map((c) => {
                  const n = counts[c.key] ?? 0;
                  const Icon = c.icon;
                  return (
                    <Link
                      key={c.key}
                      to="/encyclopedia/type/$type"
                      params={{ type: c.key }}
                      className="group relative overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-br from-surface to-black/50 p-3 text-right transition hover:border-gold/50"
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -left-6 -top-6 size-28 rounded-full bg-gold/10 blur-2xl transition group-hover:bg-gold/20"
                      />
                      <div className="relative flex items-center justify-between gap-2">
                        <span className="grid size-11 place-items-center rounded-xl bg-black/40 ring-1 ring-gold/20 text-gold">
                          <Icon className="size-5" strokeWidth={1.4} />
                        </span>
                        <span className="rounded-full border border-gold/20 bg-black/40 px-2 py-0.5 text-[10px] text-gold/90">
                          {n}
                        </span>
                      </div>
                      <p className="font-display relative mt-3 text-sm font-bold">{c.label}</p>
                      <p className="relative mt-0.5 text-[10px] text-muted-foreground">{c.caption}</p>
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* Today's Discoveries */}
            {todaysPicks.length > 0 && (
              <section className="mt-7 animate-fade-in">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-gold" />
                    <h2 className="font-display text-sm font-bold">اكتشافات اليوم</h2>
                  </div>
                  <span className="text-[10px] text-muted-foreground">تتجدد يوميًا</span>
                </div>
                <div className="-mx-5 overflow-x-auto px-5 pb-1 scrollbar-thin">
                  <div className="flex gap-2.5">
                    {todaysPicks.map((p) => {
                      const Icon = iconForType(p.type);
                      return (
                        <Link
                          key={p.entity.id}
                          to="/encyclopedia/entity/$id"
                          params={{ id: p.entity.slug }}
                          onClick={() => pushRecent(RECENT_VIEW_KEY, p.entity.slug)}
                          className="group min-w-[180px] max-w-[220px] flex-1 rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/10 via-surface to-black/50 p-3 text-right transition hover:border-gold/50"
                        >
                          <div className="flex items-center gap-2 text-[9px] tracking-[0.3em] text-gold/80">
                            <Icon className="size-3.5" strokeWidth={1.5} />
                            <span>{p.label} اليوم</span>
                          </div>
                          <p className="font-display mt-2 text-[13px] font-bold line-clamp-2">{p.entity.title}</p>
                          {p.entity.subtitle && (
                            <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{p.entity.subtitle}</p>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* Recently Viewed (personal) */}
            {recentlyViewed.length > 0 && (
              <section className="mt-7 animate-fade-in">
                <div className="mb-2 flex items-center gap-2">
                  <Clock className="size-4 text-gold" />
                  <h2 className="font-display text-sm font-bold">تابع القراءة</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {recentlyViewed.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
                </div>
              </section>
            )}

            {/* Explore by Era — horizontal rail */}
            <section className="mt-7 animate-fade-in">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="size-4 text-gold" />
                  <h2 className="font-display text-sm font-bold">العصور التاريخية</h2>
                </div>
                {eraCounts.length > 8 && (
                  <button
                    onClick={() => setShowAllEras((v) => !v)}
                    className="text-[10px] text-gold/80 underline"
                  >
                    {showAllEras ? "أقل" : `المزيد (${eraCounts.length - 8})`}
                  </button>
                )}
              </div>
              {eraCounts.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-surface/70 p-4 text-center text-[11px] text-muted-foreground">
                  لم تُسجَّل عصور بعد.
                </p>
              ) : (
                <div className="-mx-5 overflow-x-auto px-5 pb-1 scrollbar-thin">
                  <div className="flex gap-2">
                    {(showAllEras ? eraCounts : eraCounts.slice(0, 8)).map(([name, n], i) => (
                      <button
                        key={name}
                        onClick={() => setEra(name)}
                        className="group min-w-[150px] rounded-2xl border border-gold/20 bg-gradient-to-bl from-gold/10 via-surface to-black/50 p-3 text-right transition hover:border-gold/50"
                      >
                        <p className="text-[9px] tracking-[0.3em] text-gold/70">عصر {i + 1}</p>
                        <p className="font-display mt-1.5 text-[13px] font-bold leading-tight">
                          {canonicalEraLabel(name)}
                        </p>
                        <p className="mt-1 text-[10px] text-gold/80">{n} عنصر</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Popular / Trending = most recently updated stand-in */}
            {recentlyUpdated.length > 0 && (
              <section className="mt-7 animate-fade-in">
                <div className="mb-2 flex items-center gap-2">
                  <TrendingUp className="size-4 text-gold" />
                  <h2 className="font-display text-sm font-bold">الأكثر تداولًا</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {recentlyUpdated.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
                </div>
              </section>
            )}

            {/* Random discovery */}
            {discovery.length > 0 && (
              <section className="mt-7 animate-fade-in">
                <div className="mb-2 flex items-center gap-2">
                  <Shuffle className="size-4 text-gold" />
                  <h2 className="font-display text-sm font-bold">اكتشاف عشوائي</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {discovery.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
                </div>
              </section>
            )}

            {/* Newly Added */}
            {recentlyAdded.length > 0 && (
              <section className="mt-7 animate-fade-in">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="size-4 text-gold" />
                  <h2 className="font-display text-sm font-bold">أُضيف حديثاً</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {recentlyAdded.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
                </div>
              </section>
            )}

            <div className="mt-8 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <ChevronLeft className="size-3" />
              <span>كل المحتوى مفتوح للتصفّح بدون اشتراطات تقدّم</span>
            </div>
            <div className="h-6" />
          </>
        )}
      </ReadingScale>
    </AppShell>

  );
}

function AndroidStableEncyclopedia() {
  const [query, setQuery] = useState("");
  return (
    <AppShell>
      <ReadingScale as="main" className="px-5 pt-8">

        <section className="rounded-3xl border border-gold/25 bg-surface p-5">
          <p className="text-[11px] tracking-[0.25em] text-gold/80">المكتبة الكبرى</p>
          <h1 className="font-display mt-2 text-2xl font-bold text-foreground">الموسوعة في الوضع المستقر</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            تم تعطيل التحميل الشامل والبطاقات السينمائية مؤقتًا في APK لضمان ثبات التصفح والكتابة.
          </p>
          <label className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-background px-3 py-2">
            <Search className="size-4 text-gold" />
            <AndroidPlainTextInput
              value={query}
              onValueChange={setQuery}
              androidEntryKey="encyclopedia.stableSearch"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="اختبر الكتابة هنا بثبات…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
        </section>
        <section className="mt-5 grid gap-3">
          {CATEGORIES.map(({ key, label, caption, icon: Icon }) => (
            <Link key={key} to="/encyclopedia/type/$type" params={{ type: key }} className="flex items-center justify-between rounded-2xl border border-white/10 bg-surface p-4">
              <span className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-gold/10 text-gold"><Icon className="size-4" /></span>
                <span>
                  <span className="block font-bold text-foreground">{label}</span>
                  <span className="block text-[12px] text-muted-foreground">{caption}</span>
                </span>
              </span>
              <ChevronLeft className="size-4 text-gold" />
            </Link>
          ))}
        </section>
      </ReadingScale>
    </AppShell>

  );
}
