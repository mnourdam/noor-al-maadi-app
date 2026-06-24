import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChevronRight, Database } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import { supabase } from "@/integrations/supabase/client";
import {
  isUuid,
  type SupabaseEncyclopediaEntity,
} from "@/lib/encyclopedia-source";
import { parseEncyclopediaArticle } from "@/types/encyclopediaArticle";
import { EncyclopediaArticleBody } from "@/components/encyclopedia/EncyclopediaArticleBody";

const TYPE_LABEL: Record<string, string> = {
  state: "دولة",
  figure: "شخصية",
  scholar: "عالم",
  city: "مدينة",
  battle: "معركة",
  event: "حدث",
  landmark: "معلم",
  artifact: "أثر",
};
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
const SUPA_GLYPH: Record<string, string> = {
  artifact: "🗝️",
  figure: "🪶",
  city: "🏙️",
  battle: "⚔️",
  state: "🏛️",
  landmark: "🕌",
  event: "📜",
};

function metaObj(entity: Pick<SupabaseEncyclopediaEntity, "metadata">): Record<string, unknown> {
  return entity.metadata && typeof entity.metadata === "object"
    ? (entity.metadata as Record<string, unknown>)
    : {};
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const s = (typeof o.slug === "string" && o.slug) || (typeof o.id === "string" && o.id) || (typeof o.entity_slug === "string" && o.entity_slug) || (typeof o.entity_id === "string" && o.entity_id);
      if (typeof s === "string" && s) out.push(s);
    }
  }
  return out;
}

export const Route = createFileRoute("/encyclopedia/entity/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} — الموسوعة التاريخية` },
      { name: "description", content: "عنصر في موسوعة إرث." },
    ],
  }),
  component: EntityPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-10 text-center">
        <h1 className="font-display text-xl">العنصر غير موجود</h1>
        <Link to="/encyclopedia" className="mt-4 inline-block text-gold underline">عُد إلى الموسوعة</Link>
      </div>
    </AppShell>
  ),
});

function EntityPage() {
  const { id } = Route.useParams();

  const query = useQuery({
    queryKey: ["encyclopedia", "entity", id],
    staleTime: 60_000,
    queryFn: async () => {
      if (isUuid(id)) {
        const res = await supabase
          .from("encyclopedia_entities")
          .select("*")
          .eq("enabled", true)
          .eq("id", id)
          .maybeSingle();
        return (res.data ?? null) as SupabaseEncyclopediaEntity | null;
      }
      const res = await supabase
        .from("encyclopedia_entities")
        .select("*")
        .eq("enabled", true)
        .eq("slug", id);
      const rows = (res.data ?? []) as SupabaseEncyclopediaEntity[];
      if (rows.length > 0) return rows[0];

      const alias = await supabase
        .from("encyclopedia_entities")
        .select("*")
        .eq("enabled", true)
        .or(
          `metadata.cs.{"aliases":["${id}"]},metadata.cs.{"legacy_id":"${id}"}`,
        )
        .limit(1);
      return ((alias.data ?? [])[0] ?? null) as SupabaseEncyclopediaEntity | null;
    },
  });

  const entity = query.data ?? null;

  // Relationship-priority related query (NOT era-based).
  const relatedQuery = useQuery({
    queryKey: ["encyclopedia", "entity-related-v2", entity?.id ?? ""],
    enabled: !!entity,
    staleTime: 60_000,
    queryFn: async () => {
      const meta = metaObj(entity!);
      const scores = new Map<string, number>(); // key=slug, value=score

      const bump = (refs: string[], score: number) => {
        for (const r of refs) {
          const key = r.toLowerCase();
          if (!key || key === entity!.slug.toLowerCase() || key === entity!.id) continue;
          scores.set(key, Math.max(scores.get(key) ?? 0, score));
        }
      };

      // 1. Explicit relationships in metadata.
      bump(asStringList(meta.related_entities), 100);
      bump(asStringList(meta.related), 100);
      bump(asStringList(meta.relationships), 90);

      // 2. Same campaign (core/supporting_entities containing this slug).
      const { data: camps } = await supabase
        .from("admin_campaigns")
        .select("data")
        .limit(500);
      for (const c of camps ?? []) {
        const cm = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
        const core = asStringList(cm.core_entities);
        const sup = asStringList(cm.supporting_entities);
        const all = [...core, ...sup].map((s) => s.toLowerCase());
        if (!all.includes(entity!.slug.toLowerCase())) continue;
        bump(core, 80);
        bump(sup, 70);
      }

      // 3. Same city / state (explicit references).
      const cityRef = typeof meta.city === "string" ? meta.city : "";
      const stateRef = typeof meta.state === "string" ? meta.state : "";
      const ors: string[] = [];
      if (cityRef) ors.push(`metadata->>city.eq.${cityRef}`);
      if (stateRef) ors.push(`metadata->>state.eq.${stateRef}`);
      if (entity!.entity_type === "city" || entity!.entity_type === "state") {
        ors.push(`metadata->>${entity!.entity_type}.eq.${entity!.slug}`);
      }
      if (ors.length > 0) {
        const { data: geo } = await supabase
          .from("encyclopedia_entities")
          .select("slug")
          .eq("enabled", true)
          .neq("id", entity!.id)
          .or(ors.join(","))
          .limit(60);
        bump((geo ?? []).map((r: { slug: string }) => r.slug), 60);
      }

      // 4. Atlas relationship — same atlas_id family.
      const atlasId = typeof meta.atlas_id === "string" ? meta.atlas_id : "";
      if (atlasId) {
        const { data: atl } = await supabase
          .from("encyclopedia_entities")
          .select("slug")
          .eq("enabled", true)
          .neq("id", entity!.id)
          .contains("metadata", { atlas_id: atlasId })
          .limit(30);
        bump((atl ?? []).map((r: { slug: string }) => r.slug), 40);
      }

      if (scores.size === 0) return [];

      // Resolve to entities.
      const keys = Array.from(scores.keys());
      const { data: rows } = await supabase
        .from("encyclopedia_entities")
        .select("id,slug,entity_type,title,subtitle,summary,metadata")
        .eq("enabled", true)
        .in("slug", keys);
      const list = ((rows ?? []) as SupabaseEncyclopediaEntity[])
        .map((r) => ({ r, s: scores.get(r.slug.toLowerCase()) ?? 0 }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.r);
      return list;
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

  if (query.isLoading) {
    return (
      <AppShell>
        <div className="px-5 pt-10 text-center text-muted-foreground text-sm">جارٍ التحميل…</div>
      </AppShell>
    );
  }

  if (!entity) {
    return (
      <AppShell>
        <div className="px-5 pt-10 text-center">
          <h1 className="font-display text-xl">العنصر غير موجود</h1>
          <Link to="/encyclopedia" className="mt-4 inline-block text-gold underline">عُد إلى الموسوعة</Link>
        </div>
      </AppShell>
    );
  }

  const meta = (entity.metadata && typeof entity.metadata === "object"
    ? (entity.metadata as Record<string, unknown>)
    : {});
  const isScholar =
    entity.entity_type === "figure" &&
    (typeof meta.kind === "string" ? (meta.kind as string) : "") === "scholar";
  const typeLabel = isScholar
    ? "عالم"
    : TYPE_LABEL[entity.entity_type] ?? entity.entity_type;
  const glyph =
    (typeof meta.glyph === "string" && (meta.glyph as string)) ||
    SUPA_GLYPH[entity.entity_type] ||
    "📜";

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Link to="/encyclopedia" className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold">
          <ChevronRight className="size-3.5" /> الموسوعة
        </Link>

        <div className="mt-3 rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/10 via-transparent to-transparent p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-black/40 text-3xl ring-1 ring-white/10">
              {glyph}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] tracking-[0.3em] text-gold/80">{typeLabel}</p>
              <h1 className="font-display text-2xl font-bold">{entity.title}</h1>
              {entity.subtitle && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{entity.subtitle}</p>
              )}
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-300">
                <Database className="size-2.5" /> من قاعدة البيانات
              </span>
            </div>
          </div>
          {entity.summary && (
            <p className="mt-3 text-[13px] leading-7 text-foreground/90">{entity.summary}</p>
          )}
        </div>

        <EncyclopediaArticleBody article={parseEncyclopediaArticle(entity.body, entity.metadata)} />

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
                {list.slice(0, 12).map((n) => <EncyclopediaCard key={n.id} entity={n} />)}
              </div>
            </section>
          );
        })}

        <div className="h-10" />
      </div>
    </AppShell>
  );
}
