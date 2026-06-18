import { Link } from "@tanstack/react-router";
import type { PackEntity } from "@/lib/packs/types";
import type { ReactNode } from "react";
import { getCity } from "@/lib/cities";
import { CHARACTERS, getBattleProfile } from "@/lib/data";

const CARD_CLASS =
  "group block rounded-2xl border border-white/10 bg-surface p-3 text-right transition hover:border-gold/40 hover:bg-surface-2";

/**
 * Resolve the best in-app URL for a pack entity.
 * Reuses the same routing rules as <EntityLink/> so the timeline, atlas, and
 * encyclopedia all agree on where a card should go.
 */
export function entityHref(entity: PackEntity): string {
  const b = entity.bridges;
  if (entity.type === "city" && b?.cityId && getCity(b.cityId))
    return `/city/${b.cityId}`;
  if (entity.type === "battle" && b?.battleId && getBattleProfile(b.battleId))
    return `/battle/${b.battleId}`;
  if (entity.type === "figure" && b?.characterId && CHARACTERS.some(c => c.id === b.characterId))
    return `/figure/${b.characterId}`;
  if (entity.type === "state" && b?.era)
    return `/encyclopedia/state/${b.era}`;
  return `/encyclopedia/entity/${entity.id}`;
}

/** Pick the right in-app target for a pack entity and render a typed <Link>. */
function EntityLink({ entity, children }: { entity: PackEntity; children: ReactNode }) {
  const b = entity.bridges;
  if (entity.type === "city" && b?.cityId && getCity(b.cityId))
    return <Link to="/city/$id" params={{ id: b.cityId }} className={CARD_CLASS}>{children}</Link>;
  if (entity.type === "battle" && b?.battleId && getBattleProfile(b.battleId))
    return <Link to="/battle/$id" params={{ id: b.battleId }} className={CARD_CLASS}>{children}</Link>;
  if (entity.type === "figure" && b?.characterId && CHARACTERS.some(c => c.id === b.characterId))
    return <Link to="/figure/$id" params={{ id: b.characterId }} className={CARD_CLASS}>{children}</Link>;
  if (entity.type === "state" && b?.era)
    return <Link to="/encyclopedia/state/$id" params={{ id: b.era }} className={CARD_CLASS}>{children}</Link>;
  return <Link to="/encyclopedia/entity/$id" params={{ id: entity.id }} className={CARD_CLASS}>{children}</Link>;
}

const TYPE_LABELS: Record<string, string> = {
  state: "دولة", figure: "شخصية", city: "مدينة", battle: "معركة",
  event: "حدث", landmark: "معلم", artifact: "أثر", achievement: "إنجاز",
};

export function EncyclopediaCard({ entity }: { entity: PackEntity }) {
  const isScholar = entity.type === "figure"
    && (entity.meta as { kind?: string } | undefined)?.kind === "scholar";
  const typeLabel = isScholar ? "عالم" : (TYPE_LABELS[entity.type] ?? entity.type);

  return (
    <EntityLink entity={entity}>
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-black/35 text-xl ring-1 ring-white/5">
          {entity.image.glyph}
        </span>
        <span className="rounded-full bg-black/30 px-2 py-0.5 text-[9px] text-gold/80">
          {typeLabel}
        </span>
      </div>
      <p className="font-display mt-2 text-[12px] font-bold line-clamp-1">{entity.title}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
        {entity.description}
      </p>
      <p className="mt-1 text-[9px] text-gold/60">{entity.period.label}</p>
    </EntityLink>
  );
}