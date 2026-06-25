// Phase 3 — Atlas entity marker layer.
// Single source of every map pin: published+verified `atlas_entities`.
// Pin coordinates live in APS (= viewBox), eliminating any aspect-ratio
// drift between raster and markers. Pin color encodes kind for at-a-glance
// scanning; the panel/legend share this palette.
import { memo } from "react";
import type { AtlasEntityRow } from "@/lib/atlas-entities";
import { apsToViewBox, ATLAS_VIEWBOX, APS_UNIT_SCALE } from "@/lib/atlas/aps";
import { KIND_COLOR } from "@/lib/atlas/atlas-visual";

const VB_W = ATLAS_VIEWBOX.width;
const VB_H = ATLAS_VIEWBOX.height;
// Pin radii / strokes / text were tuned for a 100-wide viewBox. Scale up
// uniformly so they read at identical apparent size on the native APS grid.
const S = APS_UNIT_SCALE;

// Label decluttering tiers (by current view scale).
//  scale < 1.6 → labels only for very major kinds (region) + active pin
//  scale < 3.0 → add place/battle (major cities, key battles)
//  scale ≥ 3.0 → show all labels
const MAJOR_KINDS = new Set(["region"]);
const SECONDARY_KINDS = new Set(["region", "place", "battle"]);

function shouldShowLabel(kind: string, scale: number, active: boolean): boolean {
  if (active) return true;
  if (scale >= 3.0) return true;
  if (scale >= 1.6) return SECONDARY_KINDS.has(kind);
  return MAJOR_KINDS.has(kind);
}

/** Inner SVG layer — rendered inside the AtlasStage transform group. */
export function AtlasEntityPinsLayer({
  entities,
  selectedId,
  inv,
  scale,
  onSelect,
}: {
  entities: AtlasEntityRow[];
  selectedId: string | null;
  inv: number;
  scale: number;
  onSelect: (entity: AtlasEntityRow) => void;
}) {
  if (entities.length === 0) return null;
  return (
    <g className="layer-atlas-entities">
      {entities.map((e) => (
        <AtlasPin
          key={e.id}
          entity={e}
          inv={inv}
          scale={scale}
          active={selectedId === e.id}
          onSelect={onSelect}
        />
      ))}
    </g>
  );
}

const AtlasPin = memo(function AtlasPin({
  entity, inv, scale, active, onSelect,
}: {
  entity: AtlasEntityRow;
  inv: number;
  scale: number;
  active: boolean;
  onSelect: (entity: AtlasEntityRow) => void;
}) {
  const { x, y } = apsToViewBox({ x: entity.aps_x, y: entity.aps_y });
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > VB_W || y < 0 || y > VB_H) return null;
  const r = (active ? 0.78 : 0.58) * inv * S;
  const color = KIND_COLOR[entity.kind] ?? "oklch(0.55 0.18 25)";
  const showLabel = shouldShowLabel(entity.kind, scale, active);
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(entity);
      }}
    >
      <circle r={r + 0.22 * inv * S} fill="oklch(0.13 0.05 255)" opacity={0.55} />
      <circle
        r={r}
        fill={active ? "oklch(0.82 0.18 75)" : color}
        stroke="oklch(0.97 0.06 82)"
        strokeWidth={(active ? 0.22 : 0.14) * inv * S}
      />
      <circle r={r * 0.35} fill="oklch(0.97 0.06 82)" />
      {showLabel && (
        <text
          y={-r - 0.5 * inv * S}
          textAnchor="middle"
          fontSize={1.4 * inv * S}
          fontWeight={800}
          fill="oklch(0.97 0.08 82)"
          stroke="oklch(0.13 0.05 255)"
          strokeWidth={0.18 * inv * S}
          paintOrder="stroke"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {entity.name_ar}
        </text>
      )}
    </g>
  );
});
