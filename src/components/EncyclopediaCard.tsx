import { Link } from "@tanstack/react-router";
import type { PackEntity } from "@/lib/packs/types";

/** Resolve the right in-app link for a pack entity:
 *  - cities/battles/figures with legacy bridges → existing routes
 *  - states → encyclopedia state page
 *  - everything else → generic encyclopedia entity page  */
export function entityHref(e: PackEntity):
  | { to: "/city/$id"; params: { id: string } }
  | { to: "/battle/$id"; params: { id: string } }
  | { to: "/figure/$id"; params: { id: string } }
  | { to: "/encyclopedia/state/$id"; params: { id: string } }
  | { to: "/encyclopedia/entity/$id"; params: { id: string } } {
  const b = e.bridges;
  if (e.type === "city"    && b?.cityId)      return { to: "/city/$id",    params: { id: b.cityId } };
  if (e.type === "battle"  && b?.battleId)    return { to: "/battle/$id",  params: { id: b.battleId } };
  if (e.type === "figure"  && b?.characterId) return { to: "/figure/$id",  params: { id: b.characterId } };
  if (e.type === "state"   && b?.era)         return { to: "/encyclopedia/state/$id", params: { id: b.era } };
  return { to: "/encyclopedia/entity/$id", params: { id: e.id } };
}

const TYPE_LABELS: Record<string, string> = {
  state: "دولة", figure: "شخصية", city: "مدينة", battle: "معركة",
  event: "حدث", landmark: "معلم", artifact: "أثر", achievement: "إنجاز",
};

export function EncyclopediaCard({ entity }: { entity: PackEntity }) {
  const href = entityHref(entity);
  const isScholar = entity.type === "figure"
    && (entity.meta as { kind?: string } | undefined)?.kind === "scholar";
  const typeLabel = isScholar ? "عالم" : (TYPE_LABELS[entity.type] ?? entity.type);

  return (
    <Link
      {...href}
      className="group block rounded-2xl border border-white/10 bg-surface p-3 text-right transition hover:border-gold/40 hover:bg-surface-2"
    >
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
    </Link>
  );
}