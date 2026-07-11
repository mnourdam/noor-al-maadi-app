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
  Map as MapIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { ReadingScale } from "@/components/ReadingScale";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import {
  fetchEncyclopediaByIdLocalFirst,
  fetchEncyclopediaBySlugLocalFirst,
  isDisplayableEntity,
  isUuid,
  type SupabaseEncyclopediaEntity,
} from "@/lib/encyclopedia-source";
import { parseEncyclopediaArticle } from "@/types/encyclopediaArticle";
import { EncyclopediaArticleBody } from "@/components/encyclopedia/EncyclopediaArticleBody";
import { EntityNotFound } from "@/components/encyclopedia/EntityNotFound";
import { FeedbackCTA } from "@/components/feedback/FeedbackCTA";
import {
  resolveRelatedEntities,
  groupRelatedByReason,
} from "@/lib/relationship-graph";
import { buildContextBlocks } from "@/lib/context-blocks";
import { iconForType } from "@/lib/encyclopedia-icons";
import { canonicalEraLabel, toCanonicalEra } from "@/lib/era-canonical";
import { localAtlasEntities } from "@/lib/local-first-store";
import { EncyclopediaHero } from "@/components/encyclopedia/EncyclopediaHero";


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
      <EntityNotFound />
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
    queryKey: ["encyclopedia", "entity", id, "v2"],
    staleTime: 60_000,
    queryFn: async (): Promise<SupabaseEncyclopediaEntity | null> => {
      const followCanonical = async (row: SupabaseEncyclopediaEntity | null) => {
        if (!row) return null;
        const meta = (row.metadata && typeof row.metadata === "object")
          ? (row.metadata as any) : {};
        const cid = typeof meta.canonical_id === "string" ? meta.canonical_id : null;
        if (cid && cid !== row.id) {
          const canon = await fetchEncyclopediaByIdLocalFirst(cid);
          if (canon && canon.enabled) return canon;
        }
        return row.enabled ? row : null;
      };

      let primary: SupabaseEncyclopediaEntity | null = null;
      if (isUuid(id)) {
        primary = await fetchEncyclopediaByIdLocalFirst(id);
      } else {
        primary = await fetchEncyclopediaBySlugLocalFirst(id);
      }
      const followed = await followCanonical(primary);
      // Quality gate: incomplete/orphan rows are treated as "not found".
      return followed && isDisplayableEntity(followed) ? followed : null;
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

  // Atlas deep-link — restricted to geographic/event types (state, region,
  // city, battle). Never shown for figure/landmark/artifact/event/etc.
  // Only surfaces when a linked, published + verified Atlas record exists.
  const ATLAS_LINKABLE_TYPES = new Set(["state", "region", "city", "battle"]);
  const atlasEligible = !!entity && ATLAS_LINKABLE_TYPES.has(entity.entity_type);
  const atlasLinkQuery = useQuery({
    queryKey: ["encyclopedia", "atlas-link", entity?.id ?? ""],
    enabled: atlasEligible && !!entity?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!entity?.id) return null;
      const data = localAtlasEntities().find((row: any) => row.encyclopedia_entity_id === entity.id) ?? null;
      if (!data || data.aps_x == null || data.aps_y == null) return null;
      return data as { id: string; aps_x: number; aps_y: number; kind: string };
    },
  });
  const atlasLink = atlasEligible ? atlasLinkQuery.data ?? null : null;
  // Type-aware zoom so regions/states stay wide while battles pull in tight.
  const atlasZoom = atlasLink
    ? atlasLink.kind === "battle"
      ? 4.5
      : atlasLink.kind === "region"
        ? 2.2
        : 3.5
    : 3.5;

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
        <EntityNotFound />
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
  if (era)    {
    const canon = toCanonicalEra(era);
    if (canon) chips.push({ icon: Sparkles, label: canonicalEraLabel(canon) });
  }
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

          {/* ───────── Cinematic Hero ─────────
              When a valid image is attached AND it successfully loads,
              the hero switches to an image-forward layout with a strong
              bottom gradient so text stays readable. If the image is
              missing, invalid, offline-uncached, or fails to decode, we
              silently fall back to the original no-image design — no
              placeholder, no broken icon, no reserved blank space. */}
          <EncyclopediaHero
            imageUrl={entity.image_url}
            imageCredit={entity.image_credit}
            imageSource={entity.image_source}
            eyebrow={typeLabel}
            Icon={HeroIcon}
            title={entity.title}
            subtitle={entity.subtitle}
            chips={chips}
            atlasLink={atlasLink}
            atlasZoom={atlasZoom}
            fallback={<EntityOrnamentHero
              entity={entity}
              typeLabel={typeLabel}
              HeroIcon={HeroIcon}
              chips={chips}
              atlasLink={atlasLink}
              atlasZoom={atlasZoom}
            />}
          />



          {/* ───────── Story Introduction (museum plaque) ───────── */}
          {entity.summary && (
            <section className="mt-7">
              <article className="relative mx-auto max-w-[640px] rounded-3xl border border-gold/15 bg-gradient-to-b from-surface/70 to-black/30 px-6 py-7">
                <span className="absolute -top-3 right-6 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-background px-3 py-1 text-[10px] tracking-[0.32em] text-gold/85">
                  المقدمة
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
                  لا توجد روابط تاريخية متاحة حاليًا.
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

          {entity && (
            <FeedbackCTA
              context={{
                encyclopedia_entity_id: entity.id,
                entity_id: entity.id,
                slug: entity.slug,
                title: entity.title,
              }}
            />
          )}

          <div className="h-10" />

        </div>
      </div>
      </ReadingScale>
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Hero card — image-forward when an image successfully loads,
// otherwise the original ornament-only card. The layout only
// switches AFTER the SafeHeroImage reports a successful decode.
// ─────────────────────────────────────────────────────────────
function HeroCard({
  entity, typeLabel, HeroIcon, chips, atlasLink, atlasZoom,
}: {
  entity: SupabaseEncyclopediaEntity;
  typeLabel: string;
  HeroIcon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  chips: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string }[];
  atlasLink: { id: string } | null;
  atlasZoom: number;
}) {
  const [imageReady, setImageReady] = useState(false);
  const imageUrl = entity.image_url ?? null;
  const showImage = Boolean(imageUrl) && imageReady;

  return (
    <header
      className={`mt-4 relative overflow-hidden rounded-[28px] border border-gold/25 shadow-[0_30px_80px_-40px_rgba(212,175,90,0.45)] ${
        showImage ? "min-h-[380px] p-6" : "bg-gradient-to-br from-[#1a1f2e] via-[#10131c] to-black p-6"
      }`}
    >
      {/* Background image layer (rendered only on successful load) */}
      {imageUrl && (
        <div className="absolute inset-0" aria-hidden="true">
          <SafeHeroImage
            src={imageUrl}
            alt=""
            onReady={setImageReady}
            className="absolute inset-0 size-full object-cover"
          />
          {showImage && (
            <>
              {/* Global dark overlay + strong bottom gradient for text */}
              <div className="absolute inset-0 bg-[#050812]/45" />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(5,8,18,0.20) 0%, rgba(5,8,18,0.45) 45%, rgba(5,8,18,0.90) 80%, rgba(5,8,18,0.98) 100%)",
                }}
              />
              {/* Subtle vignette + gold glow to stay on-brand */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,90,0.18),transparent_55%)]" />
            </>
          )}
        </div>
      )}

      {/* Ornament glow — hidden when the image takes over */}
      {!showImage && (
        <>
          <div className="pointer-events-none absolute -top-32 left-1/2 size-80 -translate-x-1/2 rounded-full bg-gold/15 blur-[80px]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
        </>
      )}

      {atlasLink && (
        <Link
          to="/map"
          search={{ focus: atlasLink.id, zoom: atlasZoom }}
          aria-label="عرض على الأطلس"
          className="group absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-gold/35 bg-black/55 px-3 py-1.5 text-[11px] font-medium text-gold/95 shadow-[0_6px_20px_-8px_rgba(212,175,90,0.5)] backdrop-blur-sm transition hover:border-gold/60 hover:bg-black/70 hover:text-gold active:scale-95"
        >
          <MapIcon className="size-3.5" strokeWidth={1.8} />
          على الأطلس
        </Link>
      )}

      <div
        className={`relative flex flex-col items-center text-center ${
          showImage ? "justify-end min-h-[340px] pt-24" : ""
        }`}
      >
        <span className="font-display text-[10px] tracking-[0.5em] text-gold/85">
          {typeLabel.toUpperCase()}
        </span>

        {/* Icon shrinks when the image is present so it doesn't compete. */}
        <span
          className={`relative grid place-items-center rounded-3xl bg-gradient-to-br from-gold/25 to-gold/5 ring-1 ring-gold/35 text-gold shadow-[0_0_40px_rgba(212,175,90,0.25)] ${
            showImage ? "mt-3 size-11" : "mt-4 size-20"
          }`}
        >
          <span className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5" />
          <HeroIcon
            className={showImage ? "size-5" : "size-9"}
            strokeWidth={1.3}
          />
        </span>

        <h1
          className={`font-display mt-5 font-bold leading-tight text-foreground ${
            showImage
              ? "text-[28px] drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]"
              : "text-[26px]"
          }`}
        >
          {entity.title}
        </h1>
        {entity.subtitle && (
          <p className={`mt-1.5 text-[12.5px] ${showImage ? "text-foreground/85 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" : "text-muted-foreground"}`}>
            {entity.subtitle}
          </p>
        )}

        {chips.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-1.5">
            {chips.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-black/55 px-3 py-1 text-[11px] text-foreground/90 backdrop-blur-sm"
              >
                <c.icon className="size-3 text-gold/85" strokeWidth={1.6} />
                {c.label}
              </span>
            ))}
          </div>
        )}

        {showImage && (entity.image_credit || entity.image_source) && (
          <p className="mt-3 text-[10px] text-foreground/60">
            {entity.image_credit}
            {entity.image_credit && entity.image_source ? " · " : ""}
            {entity.image_source}
          </p>
        )}
      </div>
    </header>
  );
}


