import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Clock, ExternalLink, Database } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import {
  SECTION_LABELS, SECTION_GLYPHS, neighboursGrouped, getPackEntity,
  type EncyclopediaSection,
} from "@/lib/encyclopedia";
import { ERAS } from "@/lib/data";
import { CHARACTERS, getBattleProfile } from "@/lib/data";
import { getCity } from "@/lib/cities";
import { RelatedHistory } from "@/components/RelatedHistory";
import type { EntityRef } from "@/lib/knowledge-graph";
import {
  useEncyclopediaSupabaseEntity,
  useEncyclopediaSupabaseEntityBySlug,
  isSupabaseEnabled,
} from "@/lib/encyclopedia-source";

const SECTION_ORDER: EncyclopediaSection[] = [
  "state", "figure", "scholar", "city", "battle", "event", "landmark", "artifact",
];

const TYPE_LABEL: Record<string, string> = {
  state: "دولة", figure: "شخصية", city: "مدينة", battle: "معركة",
  event: "حدث", landmark: "معلم", artifact: "أثر", achievement: "إنجاز",
};

export const Route = createFileRoute("/encyclopedia/entity/$id")({
  head: ({ params }) => {
    const e = getPackEntity(params.id);
    if (!e) return { meta: [{ title: "عنصر — الموسوعة" }] };
    return {
      meta: [
        { title: `${e.title} — الموسوعة التاريخية` },
        { name: "description", content: e.description.slice(0, 200) },
        { property: "og:title", content: `${e.title} — إرث` },
        { property: "og:description", content: e.description.slice(0, 200) },
      ],
    };
  },
  // No beforeLoad notFound — Supabase-only artifacts (not in legacy packs)
  // must still resolve. Missing-in-both is handled inside the component.
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

function legacyEntityRef(b: NonNullable<ReturnType<typeof getPackEntity>>["bridges"]): EntityRef | null {
  if (!b) return null;
  if (b.characterId) return { kind: "character", id: b.characterId };
  if (b.battleId)    return { kind: "battle",    id: b.battleId };
  if (b.cityId)      return { kind: "city",      id: b.cityId };
  if (b.regionId)    return { kind: "region",    id: b.regionId };
  if (b.artifactId)  return { kind: "artifact",  id: b.artifactId };
  if (b.storyId)     return { kind: "story",     id: b.storyId };
  return null;
}

function EntityPage() {
  const { id } = Route.useParams() as { id: string };
  const pack = getPackEntity(id);

  // Phase 1: Supabase is primary for artifacts only. We probe Supabase when
  // either (a) the pack lookup failed entirely, or (b) the pack entity is
  // an artifact — in which case Supabase values override pack values.
  const probeType = pack?.type ?? "artifact";
  const supaQuery = useEncyclopediaSupabaseEntity(probeType, id, {
    enabled: isSupabaseEnabled(probeType),
  });
  const supa = supaQuery.data ?? null;

  // Supabase-only artifact (not in legacy packs) — render minimal view.
  if (!pack) {
    if (supaQuery.isLoading) {
      return (
        <AppShell>
          <div className="px-5 pt-10 text-center text-muted-foreground text-sm">جارٍ التحميل…</div>
        </AppShell>
      );
    }
    if (supa) {
      // Supabase-only entity (no legacy pack) — render minimal generic view.
      return <SupabaseOnlyEntity entity={supa} />;
    }
    return (
      <AppShell>
        <div className="px-5 pt-10 text-center">
          <h1 className="font-display text-xl">العنصر غير موجود</h1>
          <Link to="/encyclopedia" className="mt-4 inline-block text-gold underline">عُد إلى الموسوعة</Link>
        </div>
      </AppShell>
    );
  }

  const e = pack;
  const era = e.bridges?.era ? ERAS.find((x) => x.id === e.bridges?.era) : undefined;
  const groups = neighboursGrouped(id);
  const isScholar = e.type === "figure" && (e.meta as { kind?: string } | undefined)?.kind === "scholar";
  const typeLabel = isScholar ? "عالم" : (TYPE_LABEL[e.type] ?? e.type);
  const legacyRef = legacyEntityRef(e.bridges);
  const legacyExists =
    legacyRef?.kind === "city"      ? !!getCity(legacyRef.id) :
    legacyRef?.kind === "battle"    ? !!getBattleProfile(legacyRef.id) :
    legacyRef?.kind === "character" ? CHARACTERS.some(c => c.id === legacyRef.id) :
    !!legacyRef;

  // Supabase-primary override for all enabled types: prefer DB title/description.
  const fromSupabase = !!supa && isSupabaseEnabled(e.type);
  const displayTitle = fromSupabase ? (supa!.title || e.title) : e.title;
  const displayDescription = fromSupabase
    ? (supa!.summary || supa!.subtitle || e.description)
    : e.description;


  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Link to="/encyclopedia" className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold">
          <ChevronRight className="size-3.5" /> الموسوعة
        </Link>

        {/* Hero */}
        <div className="mt-3 rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/10 via-transparent to-transparent p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-black/40 text-3xl ring-1 ring-white/10">
              {e.image.glyph}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] tracking-[0.3em] text-gold/80">{typeLabel}</p>
              <h1 className="font-display text-2xl font-bold">{displayTitle}</h1>
              {e.latin && <p className="mt-0.5 text-[11px] text-muted-foreground">{e.latin}</p>}
              <p className="mt-0.5 text-[11px] text-gold/70">{e.period.label}</p>
              {fromSupabase && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-300">
                  <Database className="size-2.5" /> من قاعدة البيانات
                </span>
              )}
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-7 text-foreground/90">{displayDescription}</p>


          {/* Context chips */}
          <div className="mt-4 flex flex-wrap gap-1.5 text-[10px]">
            {era && (
              <Link
                to="/encyclopedia/state/$id" params={{ id: era.id }}
                className="rounded-full border border-gold/30 bg-black/30 px-2 py-0.5 text-gold/85 hover:bg-gold/10"
              >
                {era.name}
              </Link>
            )}
            <Link
              to="/timeline"
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-white/80 hover:border-gold/40 hover:text-gold"
            >
              <Clock className="size-3" /> {e.timelinePosition} م · الخط الزمني
            </Link>
            {legacyRef && legacyExists && legacyRef.kind === "city" && (
              <Link to="/city/$id" params={{ id: legacyRef.id }}
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-white/80 hover:border-gold/40 hover:text-gold">
                <ExternalLink className="size-3" /> صفحة المدينة الكاملة
              </Link>
            )}
            {legacyRef && legacyExists && legacyRef.kind === "battle" && (
              <Link to="/battle/$id" params={{ id: legacyRef.id }}
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-white/80 hover:border-gold/40 hover:text-gold">
                <ExternalLink className="size-3" /> صفحة المعركة الكاملة
              </Link>
            )}
            {legacyRef && legacyExists && legacyRef.kind === "character" && (
              <Link to="/figure/$id" params={{ id: legacyRef.id }}
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-white/80 hover:border-gold/40 hover:text-gold">
                <ExternalLink className="size-3" /> صفحة الشخصية الكاملة
              </Link>
            )}
          </div>
        </div>

        {/* Unlockables */}
        {e.unlockables.length > 0 && (
          <section className="mt-6">
            <h2 className="font-display mb-2 text-sm font-bold">يفتح</h2>
            <div className="flex flex-wrap gap-1.5">
              {e.unlockables.map((u, i) => (
                <span key={i} className="rounded-full border border-gold/25 bg-black/30 px-2.5 py-0.5 text-[10px] text-gold/85">
                  {u.label}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Related — grouped */}
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

        {/* Legacy knowledge graph when this entity bridges to in-app data */}
        {legacyRef && legacyExists && (
          <RelatedHistory entity={legacyRef} title="شبكة التاريخ المرتبط" />
        )}

        <div className="h-10" />
      </div>
    </AppShell>
  );
}

const SUPA_GLYPH: Record<string, string> = {
  artifact: "🗝️", figure: "🪶", city: "🏙️", battle: "⚔️",
  state: "🏛️", landmark: "🕌", event: "📜",
};

function SupabaseOnlyEntity({ entity }: { entity: import("@/lib/encyclopedia-source").SupabaseEncyclopediaEntity }) {
  const glyph = SUPA_GLYPH[entity.entity_type] ?? "📜";
  const label = TYPE_LABEL[entity.entity_type] ?? entity.entity_type;
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
              <p className="text-[11px] tracking-[0.3em] text-gold/80">{label}</p>
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
        <div className="h-10" />
      </div>
    </AppShell>
  );
}
