import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChevronRight, Database } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { cachedEncyclopediaBySlug, cachedEncyclopediaList } from "@/lib/offline-fallback";

const SECTION_LABELS: Record<string, string> = {
  figure: "الشخصيات",
  city: "المدن",
  battle: "المعارك",
  event: "الأحداث",
  landmark: "المعالم",
  artifact: "الآثار",
};
const SECTION_GLYPHS: Record<string, string> = {
  figure: "🪶",
  city: "🏙️",
  battle: "⚔️",
  event: "📜",
  landmark: "🕌",
  artifact: "🗝️",
};
const SECTION_ORDER = Object.keys(SECTION_LABELS);

function metaEra(entity: Pick<SupabaseEncyclopediaEntity, "metadata">): string {
  const m = entity.metadata && typeof entity.metadata === "object"
    ? (entity.metadata as Record<string, unknown>)
    : {};
  return typeof m.era === "string" ? (m.era as string) : "";
}

export const Route = createFileRoute("/encyclopedia/state/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} — الموسوعة التاريخية` },
      { name: "description", content: "صفحة الدولة في موسوعة إرث." },
    ],
  }),
  component: StatePage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-10 text-center">
        <h1 className="font-display text-xl">الدولة غير موجودة</h1>
        <Link to="/encyclopedia" className="mt-4 inline-block text-gold underline">عُد إلى الموسوعة</Link>
      </div>
    </AppShell>
  ),
});

function StatePage() {
  const { id } = Route.useParams();

  // Resolve state by slug OR by metadata.era matching the id (legacy era ids).
  const stateQuery = useQuery({
    queryKey: ["encyclopedia", "state", id],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const bySlug = await supabase
          .from("encyclopedia_entities")
          .select("*")
          .eq("enabled", true)
          .eq("entity_type", "state")
          .eq("slug", id)
          .maybeSingle();
        if (bySlug.data) return bySlug.data as SupabaseEncyclopediaEntity;
        const byEra = await supabase
          .from("encyclopedia_entities")
          .select("*")
          .eq("enabled", true)
          .eq("entity_type", "state")
          .contains("metadata", { era: id })
          .limit(1);
        const row = ((byEra.data ?? [])[0] ?? null) as SupabaseEncyclopediaEntity | null;
        if (row) return row;
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[encyclopedia.state] online fetch failed, using snapshot", e);
      }
      // Offline fallback: by slug, then by metadata.era.
      const bySlug = await cachedEncyclopediaBySlug(id, "state");
      if (bySlug) return bySlug as SupabaseEncyclopediaEntity;
      const all = await cachedEncyclopediaList();
      return (all.find(
        (r) =>
          r?.enabled !== false &&
          r?.entity_type === "state" &&
          (r as any)?.metadata?.era === id,
      ) ?? null) as SupabaseEncyclopediaEntity | null;
    },
  });

  const state = stateQuery.data;
  const era = state ? metaEra(state) : "";

  const relatedQuery = useQuery({
    queryKey: ["encyclopedia", "state-related", era],
    enabled: !!era,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("encyclopedia_entities")
          .select("id,slug,entity_type,title,subtitle,summary,metadata")
          .eq("enabled", true)
          .contains("metadata", { era })
          .neq("entity_type", "state");
        if (error) throw error;
        const rows = (data ?? []) as SupabaseEncyclopediaEntity[];
        if (rows.length > 0) return rows;
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[encyclopedia.state-related] using snapshot", e);
      }
      const all = await cachedEncyclopediaList();
      return all.filter(
        (r) =>
          r?.enabled !== false &&
          r?.entity_type !== "state" &&
          (r as any)?.metadata?.era === era,
      ) as SupabaseEncyclopediaEntity[];
    },
  });

  const groups = useMemo(() => {
    const g: Record<string, SupabaseEncyclopediaEntity[]> = {};
    for (const s of SECTION_ORDER) g[s] = [];
    for (const r of relatedQuery.data ?? []) {
      if (g[r.entity_type]) g[r.entity_type].push(r);
    }
    return g;
  }, [relatedQuery.data]);

  const totalEntities = SECTION_ORDER.reduce((s, k) => s + groups[k].length, 0);

  if (stateQuery.isLoading) {
    return (
      <AppShell>
        <div className="px-5 pt-10 text-center text-muted-foreground text-sm">جارٍ التحميل…</div>
      </AppShell>
    );
  }

  if (!state) {
    return (
      <AppShell>
        <div className="px-5 pt-10 text-center">
          <h1 className="font-display text-xl">الدولة غير موجودة</h1>
          <Link to="/encyclopedia" className="mt-4 inline-block text-gold underline">عُد إلى الموسوعة</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 pt-8">
        {/* Step up to the States listing rather than the encyclopedia root. */}
        <Link
          to="/encyclopedia/type/$type"
          params={{ type: "state" } as any}
          className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold"
        >
          <ChevronRight className="size-3.5" /> الدول
        </Link>

        <div className="mt-3 rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/10 via-transparent to-transparent p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-black/40 text-3xl ring-1 ring-white/10">
              🏛️
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] tracking-[0.3em] text-gold/80">دولة</p>
              <h1 className="font-display text-2xl font-bold">{state.title}</h1>
              {state.subtitle && (
                <p className="mt-1 text-[12px] italic text-white/70">«{state.subtitle}»</p>
              )}
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-300">
                <Database className="size-2.5" /> من قاعدة البيانات
              </span>
            </div>
          </div>
          {state.summary && (
            <p className="mt-3 text-[13px] leading-7 text-foreground/90">{state.summary}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded-full border border-gold/25 bg-black/30 px-2 py-0.5 text-gold/85">
              {totalEntities} عنصرًا تاريخيًا
            </span>
          </div>
        </div>

        {SECTION_ORDER.map((s) => {
          const list = groups[s];
          if (list.length === 0) return null;
          return (
            <section key={s} className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-lg">{SECTION_GLYPHS[s]}</span>
                <h2 className="font-display text-sm font-bold">{SECTION_LABELS[s]}</h2>
                <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                  {list.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {list.map((e) => <EncyclopediaCard key={e.id} entity={e} />)}
              </div>
            </section>
          );
        })}

        {totalEntities === 0 && !relatedQuery.isLoading && (
          <p className="mt-8 rounded-2xl border border-white/10 bg-surface/70 p-6 text-center text-xs text-muted-foreground">
            لا توجد عناصر مرتبطة بهذه الدولة بعد.
          </p>
        )}

        <div className="h-10" />
      </div>
    </AppShell>
  );
}
