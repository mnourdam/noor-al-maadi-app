// Unified detail panel for atlas_entities (Phase 1 imports).
// Shares the same Irth-identity shell as the legacy hub EntityPanel so the
// /map experience feels consistent regardless of data source.
import { MapPin, Building2, Swords, User, Landmark, Gem, Calendar, Crown, Compass } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { UnifiedDetailShell } from "./EntityPanel";
import { KIND_LABEL_AR, type AtlasEntityRow } from "@/lib/atlas-entities";

const KIND_ICON: Record<string, LucideIcon> = {
  place: Building2,
  battle: Swords,
  figure: User,
  artifact: Gem,
  event: Calendar,
  region: Crown,
  route_point: Compass,
  landmark: Landmark,
};

export function AtlasEntityDetailPanel({
  entity,
  onClose,
  onLocate,
}: {
  entity: AtlasEntityRow;
  onClose: () => void;
  /** Pan the atlas to this entity (uses its APS coords). */
  onLocate?: () => void;
}) {
  const Icon = KIND_ICON[entity.kind] ?? MapPin;
  const era = entity.era || (entity.year_start != null ? `${entity.year_start}م` : null);
  const summary =
    (entity.metadata && typeof (entity.metadata as Record<string, unknown>).note === "string"
      ? ((entity.metadata as Record<string, unknown>).note as string)
      : null) ?? null;

  return (
    <UnifiedDetailShell
      Icon={Icon}
      kindLabel={KIND_LABEL_AR[entity.kind] ?? entity.kind}
      title={entity.name_ar}
      subtitle={entity.name_en ?? null}
      regionName={null}
      eraText={era}
      encyclopediaSlug={entity.encyclopedia_entity_id ?? null}
      encyclopediaLabel="اقرأ في الموسوعة"
      onClose={onClose}
      onLocate={onLocate}
      summary={summary}
    >
      {!summary && !entity.encyclopedia_entity_id && (
        <div className="rounded-xl border border-dashed border-amber-400/25 bg-slate-900/40 p-4 text-center text-[12px] text-amber-100/70">
          هذا الكيان مُسجَّل على الأطلس، ولم يُربط بعد بمحتوى موسوعي أو وصف تفصيلي.
        </div>
      )}
    </UnifiedDetailShell>
  );
}
