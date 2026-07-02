import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ChevronRight,
  Database,
  Users,
  Building2,
  Swords,
  ScrollText,
  Castle,
  Gem,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { FeedbackCTA } from "@/components/feedback/FeedbackCTA";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import { EntityNotFound } from "@/components/encyclopedia/EntityNotFound";
import { supabase } from "@/integrations/supabase/client";
import {
  isDisplayableEntity,
  type SupabaseEncyclopediaEntity,
} from "@/lib/encyclopedia-source";
import { resolveRelatedEntities } from "@/lib/relationship-graph";

const SECTION_LABELS: Record<string, string> = {
  figure: "الشخصيات",
  city: "المدن",
  battle: "المعارك",
  event: "الأحداث",
  landmark: "المعالم",
  artifact: "الآثار",
};
const SECTION_ICONS: Record<string, LucideIcon> = {
  figure: Users,
  city: Building2,
  battle: Swords,
  event: ScrollText,
  landmark: Castle,
  artifact: Gem,
};
const SECTION_ORDER = Object.keys(SECTION_LABELS);

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
      <EntityNotFound />
    </AppShell>
  ),
});

function StatePage() {
  const { id } = Route.useParams();

  // Supabase-only. Resolve strictly by slug on the `state` type.
  const stateQuery = useQuery({
    queryKey: ["encyclopedia", "state", id, "v2"],
    staleTime: 60_000,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      const { data, error } = await supabase
        .from("encyclopedia_entities")
        .select("*")
        .eq("enabled", true)
        .eq("entity_type", "state")
        .eq("slug", id)
        .maybeSingle();
      if (error) throw error;
      return (data as SupabaseEncyclopediaEntity | null) ?? null;
    },
  });

  // A state page must be a real, published, content-rich entity.
  // Anything else is treated as "not found" — no stubs, no fillers.
  const state = stateQuery.data && isDisplayableEntity(stateQuery.data)
    ? stateQuery.data
    : null;

  // Related entities come exclusively from explicit relationships
  // authored on this state (or on entities that point AT this state).
  const relatedQuery = useQuery({
    queryKey: ["encyclopedia", "state-related", state?.id ?? ""],
    enabled: !!state,
    staleTime: 60_000,
    queryFn: async () => (state ? resolveRelatedEntities(state) : []),
  });

  const groups = useMemo(() => {
    const g: Record<string, SupabaseEncyclopediaEntity[]> = {};
    for (const s of SECTION_ORDER) g[s] = [];
    for (const n of relatedQuery.data ?? []) {
      if (g[n.entity.entity_type]) g[n.entity.entity_type].push(n.entity);
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
        <EntityNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Link
          to="/encyclopedia/type/$type"
          params={{ type: "state" } as any}
          className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold"
        >
          <ChevronRight className="size-3.5" /> الدول
        </Link>

        <div className="mt-3 rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/10 via-transparent to-transparent p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-black/40 ring-1 ring-white/10 text-gold">
              <Landmark className="size-6" strokeWidth={1.5} />
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

          {totalEntities > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded-full border border-gold/25 bg-black/30 px-2 py-0.5 text-gold/85">
                {totalEntities} روابط موثقة
              </span>
            </div>
          )}
        </div>

        {SECTION_ORDER.map((s) => {
          const list = groups[s];
          if (list.length === 0) return null;
          const Icon = SECTION_ICONS[s];
          return (
            <section key={s} className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <Icon className="size-4 text-gold" strokeWidth={1.5} />
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
            لا توجد روابط تاريخية متاحة حاليًا.
          </p>
        )}

        <FeedbackCTA
          context={{
            entity_id: state.id,
            slug: state.slug,
            title: state.title,
          }}
        />

        <div className="h-10" />
      </div>
    </AppShell>
  );
}
