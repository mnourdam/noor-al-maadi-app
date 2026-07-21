import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useRef } from "react";
import { useEntityReadCompletion } from "@/hooks/useEntityReadCompletion";
import { useAccount } from "@/lib/account";
import {
  ChevronRight,
  
  Users,
  Building2,
  Swords,
  ScrollText,
  Castle,
  Gem,
  Landmark,
  Info,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { FeedbackCTA } from "@/components/feedback/FeedbackCTA";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import { EntityNotFound } from "@/components/encyclopedia/EntityNotFound";
import { EncyclopediaArticleBody } from "@/components/encyclopedia/EncyclopediaArticleBody";
import { EncyclopediaHero } from "@/components/encyclopedia/EncyclopediaHero";
import { parseEncyclopediaArticle } from "@/types/encyclopediaArticle";
import {
  fetchEncyclopediaByIdLocalFirst,
  fetchEncyclopediaBySlugLocalFirst,
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

// Ordered list of metadata keys we display in the "معلومات الدولة"
// panel. Extend by appending — display order follows this array.
const META_FIELDS: { key: string; label: string }[] = [
  { key: "period",     label: "الفترة" },
  { key: "duration",   label: "المدة" },
  { key: "founded",    label: "التأسيس" },
  { key: "ended",      label: "النهاية" },
  { key: "capital",    label: "العاصمة" },
  { key: "founder",    label: "المؤسس" },
  { key: "government", label: "نظام الحكم" },
  { key: "religion",   label: "الديانة" },
  { key: "currency",   label: "العملة" },
  { key: "languages",  label: "اللغات" },
  { key: "language",   label: "اللغة" },
  { key: "region",     label: "المنطقة" },
  { key: "location",   label: "الموقع" },
  { key: "era",        label: "الحقبة" },
];

function metaValueToString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const parts = v
      .map((x) => (typeof x === "string" ? x : typeof x === "number" ? String(x) : null))
      .filter((s): s is string => !!s && s.trim().length > 0);
    return parts.length ? parts.join("، ") : null;
  }
  return null;
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
      <EntityNotFound />
    </AppShell>
  ),
});

function StatePage() {
  const { id } = Route.useParams();

  const stateQuery = useQuery({
    queryKey: ["encyclopedia", "state", id, "v3"],
    staleTime: 60_000,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      const initial = await fetchEncyclopediaBySlugLocalFirst(id, "state");
      if (!initial) return null;
      // Follow canonical_id / merged_into / converted_to / redirect_to.
      const readTargetId = (row: SupabaseEncyclopediaEntity | null): string | null => {
        if (!row) return null;
        const meta = (row.metadata && typeof row.metadata === "object")
          ? (row.metadata as Record<string, unknown>) : {};
        for (const k of ["canonical_id", "merged_into", "converted_to", "redirect_to"] as const) {
          const v = meta[k];
          if (typeof v === "string" && v.trim() && v.trim() !== row.id) return v.trim();
        }
        return null;
      };
      const seen = new Set<string>([initial.id]);
      let cur = initial;
      for (let hops = 0; hops < 8; hops++) {
        const nextId = readTargetId(cur);
        if (!nextId || seen.has(nextId)) break;
        seen.add(nextId);
        const nxt = await fetchEncyclopediaByIdLocalFirst(nextId);
        if (!nxt || nxt.enabled === false) break;
        cur = nxt;
      }
      return cur;
    },
  });

  const state = stateQuery.data && isDisplayableEntity(stateQuery.data) && stateQuery.data.entity_type === "state"
    ? stateQuery.data
    : null;

  // Daily Quest completion — same shared hook as the generic entity
  // route. Anchors on the "التاريخ المرتبط" section below, with the
  // 88 % scroll fallback covering short states without related rows.
  const { user } = useAccount();
  const userKey = user?.id ?? "guest";
  const relNetworkRef = useRef<HTMLElement | null>(null);
  useEntityReadCompletion({
    entityId: state?.id ?? null,
    entitySlug: state?.slug ?? null,
    entityType: state?.entity_type ?? "state",
    userKey,
    relationshipSectionRef: relNetworkRef,
  });


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

  const article = useMemo(
    () => (state ? parseEncyclopediaArticle(state.body, state.metadata) : null),
    [state],
  );

  const metaEntries = useMemo(() => {
    if (!state) return [] as { label: string; value: string }[];
    const meta = (state.metadata && typeof state.metadata === "object"
      ? (state.metadata as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const seen = new Set<string>();
    const out: { label: string; value: string }[] = [];
    for (const f of META_FIELDS) {
      const v = metaValueToString(meta[f.key]);
      if (v && !seen.has(f.label)) {
        seen.add(f.label);
        out.push({ label: f.label, value: v });
      }
    }
    return out;
  }, [state]);

  // If the redirect chain resolved to a non-state entity type, jump to the
  // generic entity route so the destination still renders.
  const resolvedButNotState =
    stateQuery.data &&
    stateQuery.data.entity_type !== "state" &&
    isDisplayableEntity(stateQuery.data);
  if (resolvedButNotState) {
    return <Navigate to="/encyclopedia/entity/$id" params={{ id: stateQuery.data!.slug }} replace />;
  }

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

        {/* ───────── Hero ─────────
            When the state has a valid, decoded image → cinematic image
            hero (shared with all other entity types). Otherwise → the
            original compact card layout is preserved verbatim below. */}
        <EncyclopediaHero
          imageUrl={state.image_url}
          imageCredit={state.image_credit}
          imageSource={state.image_source}
          eyebrow="دولة"
          Icon={Landmark}
          title={state.title}
          subtitle={state.subtitle ? `«${state.subtitle}»` : null}
          extra={null}
          fallback={
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
                </div>
              </div>
              {state.summary && (
                <p className="mt-3 text-[13px] leading-7 text-foreground/90">{state.summary}</p>
              )}
            </div>
          }
        />

        {/* Summary rendered separately when the image hero takes over so it
            still appears beneath the cinematic hero. */}
        {state.image_url && state.summary && (
          <p className="mt-4 text-[13px] leading-7 text-foreground/90">{state.summary}</p>
        )}


        {/* ───────── Main encyclopedia article body ───────── */}
        {article && (
          <div className="mt-6">
            <EncyclopediaArticleBody article={article} />
          </div>
        )}

        {/* ───────── Metadata ───────── */}
        {metaEntries.length > 0 && (
          <section className="mt-8">
            <div className="mb-2 flex items-center gap-2">
              <Info className="size-4 text-gold" strokeWidth={1.5} />
              <h2 className="font-display text-sm font-bold">معلومات الدولة</h2>
            </div>
            <dl className="grid grid-cols-1 gap-1.5 rounded-2xl border border-white/10 bg-surface/60 p-4 sm:grid-cols-2">
              {metaEntries.map((m) => (
                <div key={m.label} className="flex items-start gap-2 text-[12px] leading-6">
                  <dt className="min-w-[84px] shrink-0 text-muted-foreground">{m.label}</dt>
                  <dd className="min-w-0 flex-1 text-foreground/95">{m.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* ───────── Related knowledge graph ───────── */}
        {totalEntities > 0 && (
          <section ref={relNetworkRef} className="mt-8" data-quest-section="relationship-network">

            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-display text-base font-bold">التاريخ المرتبط</h2>
              <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                {totalEntities}
              </span>
            </div>

            {SECTION_ORDER.map((s) => {
              const list = groups[s];
              if (list.length === 0) return null;
              const Icon = SECTION_ICONS[s];
              return (
                <section key={s} className="mt-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="size-4 text-gold" strokeWidth={1.5} />
                    <h3 className="font-display text-sm font-bold">{SECTION_LABELS[s]}</h3>
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
          </section>
        )}

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
