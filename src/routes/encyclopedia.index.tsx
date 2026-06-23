import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Screen } from "@/components/AppShell";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";

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
  state: "الدول",
  figure: "الشخصيات",
  battle: "المعارك",
  city: "المدن",
  event: "الأحداث",
  landmark: "المعالم",
  artifact: "الآثار",
};
const SECTION_GLYPHS: Record<string, string> = {
  state: "🏛️",
  figure: "🪶",
  battle: "⚔️",
  city: "🏙️",
  event: "📜",
  landmark: "🕌",
  artifact: "🗝️",
};
const SECTIONS = Object.keys(SECTION_LABELS);

function useAllEncyclopedia() {
  return useQuery({
    queryKey: ["encyclopedia", "all-min"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("encyclopedia_entities")
        .select("id,slug,entity_type,title,subtitle,summary,metadata")
        .eq("enabled", true)
        .order("title");
      if (error) throw error;
      return (data ?? []) as SupabaseEncyclopediaEntity[];
    },
  });
}

function metaEra(entity: SupabaseEncyclopediaEntity): string {
  const m = entity.metadata && typeof entity.metadata === "object"
    ? (entity.metadata as Record<string, unknown>)
    : {};
  return typeof m.era === "string" ? (m.era as string) : "";
}

function EncyclopediaHub() {
  const [query, setQuery] = useState("");
  const [era, setEra] = useState<string>("");

  const { data: all = [], isLoading } = useAllEncyclopedia();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of SECTIONS) c[s] = 0;
    for (const e of all) c[e.entity_type] = (c[e.entity_type] ?? 0) + 1;
    return c;
  }, [all]);

  const eras = useMemo(() => {
    const set = new Set<string>();
    for (const e of all) {
      const er = metaEra(e);
      if (er) set.add(er);
    }
    return Array.from(set).sort();
  }, [all]);

  const states = useMemo(
    () => all.filter((e) => e.entity_type === "state"),
    [all],
  );

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return all
      .filter((e) => !era || metaEra(e) === era)
      .filter((e) => {
        const hay = `${e.title} ${e.subtitle ?? ""} ${e.summary ?? ""} ${e.slug}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 30);
  }, [all, q, era]);

  return (
    <AppShell>
      <Screen
        title="الموسوعة التاريخية"
        subtitle="تصفّح حرّ في كل المحتوى — دون انتظار الحملات أو الفتوحات."
      >
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gold/70" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن شخصية، مدينة، معركة، حدث…"
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

        {eras.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <FilterChip active={era === ""} onClick={() => setEra("")}>كل العصور</FilterChip>
            {eras.map((e) => (
              <FilterChip key={e} active={era === e} onClick={() => setEra(e)}>
                {e}
              </FilterChip>
            ))}
          </div>
        )}

        {isLoading ? (
          <p className="mt-8 text-center text-xs text-muted-foreground">جارٍ التحميل…</p>
        ) : all.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-surface/70 p-6 text-center text-xs text-muted-foreground">
            لا توجد عناصر في الموسوعة بعد.
          </p>
        ) : q ? (
          <section className="mt-6">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="font-display text-sm font-bold">نتائج البحث</h2>
              <span className="rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                {results.length}
              </span>
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
            {states.length > 0 && (
              <section className="mt-6">
                <h2 className="font-display mb-2 text-sm font-bold">الدول</h2>
                <div className="grid grid-cols-1 gap-2.5">
                  {states.map((s) => (
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

            <section className="mt-6">
              <h2 className="font-display mb-2 text-sm font-bold">الأقسام</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {SECTIONS.map((s) => (
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
                        {counts[s] ?? 0}
                      </span>
                    </div>
                    <p className="font-display mt-2 text-sm font-bold">{SECTION_LABELS[s]}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      تصفّح كل {SECTION_LABELS[s]}
                    </p>
                  </Link>
                ))}
              </div>
            </section>

            <p className="mt-6 text-center text-[10px] text-muted-foreground">
              كل المحتوى مفتوح للتصفّح بدون اشتراطات تقدّم.
            </p>
          </>
        )}
      </Screen>
    </AppShell>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[10px] transition ${
        active
          ? "border-gold/50 bg-gold/15 text-gold"
          : "border-white/10 bg-transparent text-white/60 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
