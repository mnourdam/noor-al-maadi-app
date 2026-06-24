import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Database, Network, BookOpen } from "lucide-react";
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
import {
  resolveRelatedEntities,
  groupRelatedByReason,
} from "@/lib/relationship-graph";
import { buildContextBlocks } from "@/lib/context-blocks";

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
const SUPA_GLYPH: Record<string, string> = {
  artifact: "🗝️",
  figure: "🪶",
  city: "🏙️",
  battle: "⚔️",
  state: "🏛️",
  landmark: "🕌",
  event: "📜",
};

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

  // Relationship-graph (Phase 1 — Knowledge Graph experience).
  const relatedQuery = useQuery({
    queryKey: ["encyclopedia", "graph", entity?.id ?? ""],
    enabled: !!entity,
    staleTime: 60_000,
    queryFn: async () => (entity ? resolveRelatedEntities(entity) : []),
  });

  const groups = groupRelatedByReason(relatedQuery.data ?? []);


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

        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Network className="size-4 text-gold" />
            <h2 className="font-display text-base font-bold">شبكة التاريخ المرتبط</h2>
            {relatedQuery.data && relatedQuery.data.length > 0 && (
              <span className="ms-auto rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                {relatedQuery.data.length}
              </span>
            )}
          </div>

          {relatedQuery.isLoading ? (
            <p className="text-center text-[12px] text-muted-foreground py-6">جارٍ بناء الشبكة…</p>
          ) : groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gold/20 bg-black/20 p-6 text-center">
              <p className="text-[12px] text-muted-foreground">لا توجد روابط تاريخية موثقة بعد</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.reason}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[10px] text-gold">
                      {g.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{g.items.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {g.items.slice(0, 12).map((n) => (
                      <EncyclopediaCard key={n.entity.id} entity={n.entity} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="h-10" />
      </div>

    </AppShell>
  );
}
