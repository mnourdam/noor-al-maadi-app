import { Link } from "@tanstack/react-router";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { iconForType } from "@/lib/encyclopedia-icons";
import { HighlightedText } from "@/components/HighlightedText";
import { findHighlightRanges } from "@/lib/encyclopedia-highlight";
import { useStashCurrentAsOrigin } from "@/lib/navigation";


const CARD_CLASS =
  "group block rounded-2xl border border-white/10 bg-surface p-3 text-right transition hover:border-gold/40 hover:bg-surface-2";

const TYPE_LABELS: Record<string, string> = {
  state: "دولة",
  figure: "شخصية",
  scholar: "عالم",
  city: "مدينة",
  battle: "معركة",
  event: "حدث",
  landmark: "معلم",
  artifact: "أثر",
};

function metaRecord(entity: SupabaseEncyclopediaEntity): Record<string, unknown> {
  const m = entity.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

export function entityHref(
  entity:
    | SupabaseEncyclopediaEntity
    | { id?: string; slug?: string; type?: string; entity_type?: string },
): string {
  const type =
    (entity as { entity_type?: string }).entity_type ??
    (entity as { type?: string }).type ??
    "";
  const slug =
    (entity as { slug?: string }).slug ??
    (entity as { id?: string }).id ??
    "";
  if (type === "state") return `/encyclopedia/state/${slug}`;
  return `/encyclopedia/entity/${slug}`;
}

export function EncyclopediaCard({
  entity,
  highlight,
  interactive = true,
}: {
  entity: SupabaseEncyclopediaEntity;
  highlight?: string;
  interactive?: boolean;
}) {
  const meta = metaRecord(entity);
  const kind = typeof meta.kind === "string" ? (meta.kind as string) : undefined;
  const isScholar = entity.entity_type === "figure" && kind === "scholar";
  const typeKey = isScholar ? "scholar" : entity.entity_type;
  const typeLabel = TYPE_LABELS[typeKey] ?? entity.entity_type;
  const Icon = iconForType(typeKey);

  const period =
    (typeof meta.period === "string" && (meta.period as string)) ||
    (meta.period && typeof meta.period === "object"
      ? ((meta.period as { label?: string }).label ?? "")
      : "");

  const summary = entity.summary || entity.subtitle || "";

  // When the highlight query matches an alias (but not the title or summary),
  // surface that alias underneath the title so the user sees why this hit.
  let aliasHit: string | null = null;
  if (highlight) {
    const colAliases: string[] = Array.isArray(entity.aliases)
      ? (entity.aliases.filter((a) => typeof a === "string") as string[])
      : [];
    const metaAliases: string[] = Array.isArray((meta as { aliases?: unknown }).aliases)
      ? ((meta as { aliases: unknown[] }).aliases.filter((a) => typeof a === "string") as string[])
      : [];
    const allAliases = Array.from(new Set([...colAliases, ...metaAliases]));
    if (allAliases.length > 0) {
      const titleHits = findHighlightRanges(entity.title ?? "", highlight).length;
      const sumHits = summary ? findHighlightRanges(summary, highlight).length : 0;
      if (titleHits === 0 && sumHits === 0) {
        aliasHit = allAliases.find(
          (a) => findHighlightRanges(a, highlight).length > 0,
        ) ?? null;
      }
    }
  }

  const Inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-black/35 ring-1 ring-white/5 text-gold/80">
          <Icon className="size-5" strokeWidth={1.5} />
        </span>
        <span className="rounded-full bg-black/30 px-2 py-0.5 text-[9px] text-gold/80">
          {typeLabel}
        </span>
      </div>
      <p className="font-display mt-2 text-[12px] font-bold line-clamp-1">
        <HighlightedText text={entity.title} query={highlight} />
      </p>
      {aliasHit && (
        <p className="mt-0.5 text-[10px] text-gold/70 line-clamp-1">
          المعروف بـ <HighlightedText text={aliasHit} query={highlight} />
        </p>
      )}
      {summary && (
        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
          <HighlightedText text={summary} query={highlight} />
        </p>
      )}
      {period && <p className="mt-1 text-[9px] text-gold/60">{period}</p>}
    </>
  );

  if (!interactive) {
    const staticClass =
      "block rounded-2xl border border-white/10 bg-surface p-3 text-right";
    return <div className={staticClass}>{Inner}</div>;
  }

  if (entity.entity_type === "state") {
    return (
      <Link to="/encyclopedia/state/$id" params={{ id: entity.slug }} className={CARD_CLASS}>
        {Inner}
      </Link>
    );
  }
  return (
    <Link to="/encyclopedia/entity/$id" params={{ id: entity.slug }} className={CARD_CLASS}>
      {Inner}
    </Link>
  );
}
