import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronRight,
  Network,
  Compass,
  Sparkles,
  Calendar,
  MapPin,
  Tag,
  ScrollText,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ReadingScale } from "@/components/ReadingScale";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import { supabase } from "@/integrations/supabase/client";
import {
  isUuid,
  pickCanonicalEntity,
  type SupabaseEncyclopediaEntity,
} from "@/lib/encyclopedia-source";
import { cachedEncyclopediaById, cachedEncyclopediaBySlug } from "@/lib/offline-fallback";
import { localEncyclopediaById, localEncyclopediaBySlug } from "@/lib/local-first-store";
import { resolveCanonicalLocal } from "@/lib/encyclopedia-canonical";
import { parseEncyclopediaArticle } from "@/types/encyclopediaArticle";
import { EncyclopediaArticleBody } from "@/components/encyclopedia/EncyclopediaArticleBody";
import {
  resolveRelatedEntities,
  groupRelatedByReason,
} from "@/lib/relationship-graph";
import { buildContextBlocks } from "@/lib/context-blocks";
import { iconForType } from "@/lib/encyclopedia-icons";
import { eraLabel } from "@/lib/era-labels";

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

// Plural labels + parent-route slugs for the in-app breadcrumb so a detail
// page steps up to its direct type listing (e.g. Al-Shirazi → الشخصيات).
// Types not present here fall back to the encyclopedia root.
const TYPE_PARENT: Record<string, { label: string; typeSlug: string }> = {
  figure:   { label: "الشخصيات", typeSlug: "figure" },
  scholar:  { label: "الشخصيات", typeSlug: "figure" },
  state:    { label: "الدول",    typeSlug: "state" },
  city:     { label: "المدن",    typeSlug: "city" },
  battle:   { label: "المعارك",  typeSlug: "battle" },
  landmark: { label: "المعالم",  typeSlug: "landmark" },
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

// ─── Small atelier ornament between sections ─────────────────────────────
function Ornament({ label }: { label?: string }) {
  return (
    <div className="my-10 flex items-center gap-3" aria-hidden={!label}>
      <span className="h-px flex-1 bg-gradient-to-l from-gold/40 to-transparent" />
      <span className="grid size-5 rotate-45 place-items-center rounded-sm border border-gold/40">
        <span className="size-1 -rotate-45 rounded-full bg-gold" />
      </span>
      {label ? (
        <span className="font-display text-[10px] tracking-[0.4em] text-gold/85">
          {label}
        </span>
      ) : null}
      <span className="grid size-5 rotate-45 place-items-center rounded-sm border border-gold/40">
        <span className="size-1 -rotate-45 rounded-full bg-gold" />
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent" />
    </div>
  );
}

function EntityPage() {
  const { id } = Route.useParams();

  const query = useQuery({
    queryKey: ["encyclopedia", "entity", id],
    staleTime: 60_000,
    // Local-first: render the bundled snapshot synchronously so offline /
    // cold-start players see real content immediately, not "جارٍ التحميل…".
    initialData: () => {
      const local = (isUuid(id)
        ? localEncyclopediaById(id)
        : localEncyclopediaBySlug(id)) as SupabaseEncyclopediaEntity | null;
      if (!local) return undefined;
      const canon = resolveCanonicalLocal(local as any) as SupabaseEncyclopediaEntity | null;
      return canon ?? local;
    },
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const fetchById = async (eid: string) => {
        try {
          const r = await supabase.from("encyclopedia_entities").select("*").eq("id", eid).maybeSingle();
          return (r.data ?? null) as SupabaseEncyclopediaEntity | null;
        } catch {
          return null;
        }
      };
      const followCanonical = async (row: SupabaseEncyclopediaEntity | null) => {
        if (!row) return null;
        const meta = (row.metadata && typeof row.metadata === "object") ? row.metadata as any : {};
        const cid = typeof meta.canonical_id === "string" ? meta.canonical_id : null;
        if (cid && cid !== row.id) {
          const canon = (await fetchById(cid)) ?? (await cachedEncyclopediaById(cid));
          if (canon && canon.enabled) return canon;
        }
        return row.enabled ? row : null;
      };

      let primary: SupabaseEncyclopediaEntity | null = null;
      try {
        if (isUuid(id)) {
          primary = await fetchById(id);
        } else {
          const res = await supabase.from("encyclopedia_entities").select("*").eq("slug", id).eq("enabled", true);
          const rows = (res.data ?? []) as SupabaseEncyclopediaEntity[];
          // Pick richest among same-slug rows so the player never lands on a
          // stub when a fuller sibling exists.
          primary = pickCanonicalEntity(rows);
          if (!primary) {
            const alias = await supabase
              .from("encyclopedia_entities").select("*")
              .or(`metadata.cs.{"aliases":["${id}"]},metadata.cs.{"legacy_id":"${id}"}`).limit(1);
            primary = ((alias.data ?? [])[0] ?? null) as SupabaseEncyclopediaEntity | null;
          }
        }
      } catch {
        primary = null;
      }
      // Offline / failure fallback — read from the bundled or synced snapshot.
      if (!primary) {
        primary = isUuid(id)
          ? (localEncyclopediaById(id) as SupabaseEncyclopediaEntity | null) ?? await cachedEncyclopediaById(id)
          : (localEncyclopediaBySlug(id) as SupabaseEncyclopediaEntity | null)
            ?? (await cachedEncyclopediaBySlug(id))
            ?? (await cachedEncyclopediaById(id));
      }
      const followed = await followCanonical(primary);
      // Final guard — if the chosen row is empty but a richer same-name
      // sibling exists in the local store, transparently switch to it so
      // the player never sees a blank duplicate.
      const escalated = resolveCanonicalLocal(followed as any) as SupabaseEncyclopediaEntity | null;
      return escalated ?? followed;
    },
  });

  const entity = query.data ?? null;

  const relatedQuery = useQuery({
    queryKey: ["encyclopedia", "graph", entity?.id ?? ""],
    enabled: !!entity,
    staleTime: 60_000,
    queryFn: async () => (entity ? resolveRelatedEntities(entity) : []),
  });

  const groups = groupRelatedByReason(relatedQuery.data ?? []);
  const contextBlocks = entity
    ? buildContextBlocks(entity, relatedQuery.data ?? [])
    : [];

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
  const HeroIcon = iconForType(isScholar ? "scholar" : entity.entity_type);

  // Reuse metadata for hero quick-chip facts (no extra queries).
  const period = typeof meta.period === "string" ? (meta.period as string) : null;
  const era = typeof meta.era === "string" ? (meta.era as string) : null;
  const date = typeof meta.date === "string" ? (meta.date as string) : null;
  const location = typeof meta.location === "string" ? (meta.location as string) : null;
  const region = typeof meta.region === "string" ? (meta.region as string) : null;

  const chips: { icon: typeof Calendar; label: string }[] = [];
  if (period) chips.push({ icon: ScrollText, label: period });
  if (era)    chips.push({ icon: Sparkles,   label: eraLabel(era) });
  if (date)   chips.push({ icon: Calendar,   label: date });
  if (location) chips.push({ icon: MapPin,   label: location });
  if (region) chips.push({ icon: Tag,        label: region });

  const article = parseEncyclopediaArticle(entity.body, entity.metadata);

  return (
    <AppShell>
      <ReadingScale>
      {/* Atmospheric museum stage — one continuous warm scene */}
      <div className="relative min-h-screen overflow-hidden">

        {/* Background gradients (gold dawn over deep navy) */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,90,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(16,24,40,0.6),transparent_60%)]" />
        {/* Subtle arabesque overlay (CSS-only, no asset) */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(212,175,90,1) 1px, transparent 1.5px), radial-gradient(circle at 70% 60%, rgba(212,175,90,1) 1px, transparent 1.5px)",
            backgroundSize: "44px 44px, 64px 64px",
          }}
        />

        <div className="relative px-5 pt-6 pb-12">
          {/* Breadcrumb trail — collapses to (parent › current) on narrow
              screens, expands to the full hierarchy on ≥sm. */}
          {(() => {
            const parent = TYPE_PARENT[isScholar ? "scholar" : entity.entity_type];
            const trail = [
              { label: "الرئيسية", to: "/" as const },
              { label: "الموسوعة", to: "/encyclopedia" as const },
              ...(parent
                ? [{
                    label: parent.label,
                    to: "/encyclopedia/type/$type" as const,
                    params: { type: parent.typeSlug } as any,
                  }]
                : []),
              { label: entity.title },
            ];
            return <Breadcrumbs items={trail} />;
          })()}

          {/* ───────── Cinematic Hero ───────── */}
          <header className="mt-4 relative overflow-hidden rounded-[28px] border border-gold/25 bg-gradient-to-br from-[#1a1f2e] via-[#10131c] to-black p-6 shadow-[0_30px_80px_-40px_rgba(212,175,90,0.45)]">
            {/* Hero glow + ornament */}
            <div className="pointer-events-none absolute -top-32 left-1/2 size-80 -translate-x-1/2 rounded-full bg-gold/15 blur-[80px]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />

            <div className="relative flex flex-col items-center text-center">
              <span className="font-display text-[10px] tracking-[0.5em] text-gold/85">
                {typeLabel.toUpperCase()}
              </span>

              <span className="mt-4 relative grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-gold/25 to-gold/5 ring-1 ring-gold/35 text-gold shadow-[0_0_40px_rgba(212,175,90,0.25)]">
                <span className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5" />
                <HeroIcon className="size-9" strokeWidth={1.3} />
              </span>

              <h1 className="font-display mt-5 text-[26px] font-bold leading-tight text-foreground">
                {entity.title}
              </h1>
              {entity.subtitle && (
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                  {entity.subtitle}
                </p>
              )}

              {/* Quick-fact chips */}
              {chips.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                  {chips.map((c, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-black/40 px-3 py-1 text-[11px] text-foreground/90"
                    >
                      <c.icon className="size-3 text-gold/85" strokeWidth={1.6} />
                      {c.label}
                    </span>
                  ))}
                </div>
              )}

            </div>
          </header>

          {/* ───────── Story Introduction (museum plaque) ───────── */}
          {entity.summary && (
            <section className="mt-7">
              <article className="relative mx-auto max-w-[640px] rounded-3xl border border-gold/15 bg-gradient-to-b from-surface/70 to-black/30 px-6 py-7">
                <span className="absolute -top-3 right-6 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-background px-3 py-1 text-[10px] tracking-[0.32em] text-gold/85">
                  مقدمة الدوسيه
                </span>
                <p className="text-[15px] leading-[2.1] text-foreground/95">
                  {entity.summary}
                </p>
              </article>
            </section>
          )}

          {/* ───────── Article body (timeline · facts · sections · related) ───────── */}
          <EncyclopediaArticleBody article={article} />

          {/* ───────── Knowledge-graph context blocks ───────── */}
          {contextBlocks.length > 0 && (
            <>
              <Ornament label="السياق التاريخي" />
              <section className="space-y-7">
                {contextBlocks.map((b) => (
                  <div key={b.id}>
                    <div className="mb-3 flex items-center gap-2">
                      <h3 className="font-display text-[14px] font-bold text-foreground/95">
                        {b.title}
                      </h3>
                      <span className="rounded-full border border-gold/20 bg-black/30 px-2 py-0.5 text-[10px] text-gold/80">
                        {b.items.length}
                      </span>
                      <span className="ms-auto h-px flex-1 bg-gradient-to-l from-gold/25 to-transparent" />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {b.items.map((n) => (
                        <EncyclopediaCard key={n.entity.id} entity={n.entity} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}

          {/* ───────── Related rooms in the museum ───────── */}
          <Ornament label="غرف أخرى في المتحف" />
          <section>
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
              <p className="py-6 text-center text-[12px] text-muted-foreground">
                جارٍ بناء الشبكة…
              </p>
            ) : groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gold/20 bg-black/20 p-6 text-center">
                <p className="text-[12px] text-muted-foreground">
                  لا توجد روابط تاريخية موثقة بعد
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((g) => (
                  <div key={g.reason}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[10px] text-gold">
                        {g.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {g.items.length}
                      </span>
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

          {/* ───────── Discover more — cinematic recommendation rail ───────── */}
          {relatedQuery.data && relatedQuery.data.length > 0 && (
            <>
              <Ornament label="تابع رحلتك" />
              <section>
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-gold/10 ring-1 ring-gold/30 text-gold">
                    <Compass className="size-4.5" strokeWidth={1.5} />
                  </span>
                  <div>
                    <p className="text-[10px] tracking-[0.32em] text-gold/80">
                      رحلة المعرفة
                    </p>
                    <h2 className="font-display text-lg font-bold">
                      تابع رحلتك التاريخية
                    </h2>
                  </div>
                </div>

                <ol className="space-y-3">
                  {relatedQuery.data.slice(0, 3).map((n, i) => {
                    const NIcon = iconForType(n.entity.entity_type);
                    return (
                      <li key={n.entity.id}>
                        <Link
                          to="/encyclopedia/entity/$id"
                          params={{ id: n.entity.slug }}
                          className="group relative flex items-center gap-4 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-surface/80 via-surface/50 to-black/30 p-4 transition hover:border-gold/40 hover:shadow-[0_20px_50px_-30px_rgba(212,175,90,0.45)]"
                        >
                          <span className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-gold/10 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                          <span className="relative grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-gold/20 to-gold/5 ring-1 ring-gold/25 text-gold">
                            <NIcon className="size-5" strokeWidth={1.4} />
                          </span>
                          <div className="relative min-w-0 flex-1">
                            <p className="text-[10px] tracking-[0.3em] text-gold/80">
                              محطة {i + 1} ·{" "}
                              {TYPE_LABEL[n.entity.entity_type] ?? n.entity.entity_type}
                            </p>
                            <p className="font-display text-[14.5px] font-bold text-foreground/95">
                              {n.entity.title}
                            </p>
                            {n.entity.subtitle && (
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {n.entity.subtitle}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="relative size-4 text-gold/60 transition group-hover:text-gold group-hover:-translate-x-1 rtl:rotate-180" />
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </>
          )}

          <div className="h-10" />
        </div>
      </div>
      </ReadingScale>
    </AppShell>
  );
}

