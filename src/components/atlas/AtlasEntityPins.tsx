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

// Zoom-tier visibility (quantized in AtlasStage; passed as labelTier 0..3).
//
//  tier 0 (far)    → states / regions only
//  tier 1 (medium) → + major cities (place)
//  tier 2 (close)  → + battles and events
//  tier 3 (deep)   → + landmarks / artifacts / figures / route points
//
// Pins follow the same tier so the map stays scannable at low zoom; labels
// are stricter than pins (label requires same tier or higher than the pin).
// Major worlds/states are NEVER hidden at far zoom.
const PIN_TIER: Record<string, number> = {
  region:         0,
  place:          1,
  battle:         2,
  event:          2,
  figure_marker:  3,
  artifact_site:  3,
  route_point:    3,
};
const LABEL_TIER: Record<string, number> = {
  region:         0,
  place:          1,
  battle:         2,
  event:          2,
  figure_marker:  3,
  artifact_site:  3,
  route_point:    3,
};

function shouldShowPin(kind: string, tier: number, active: boolean): boolean {
  if (active) return true;
  return tier >= (PIN_TIER[kind] ?? 0);
}
function shouldShowLabel(kind: string, tier: number, active: boolean): boolean {
  if (active) return true;
  return tier >= (LABEL_TIER[kind] ?? 99);
}


/** Inner SVG layer — rendered inside the AtlasStage transform group. */
export function AtlasEntityPinsLayer({
  entities,
  selectedId,
  inv,
  labelTier,
  onSelect,
}: {
  entities: AtlasEntityRow[];
  selectedId: string | null;
  inv: number;
  labelTier: number;
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
          labelTier={labelTier}
          active={selectedId === e.id}
          onSelect={onSelect}
        />
      ))}
    </g>
  );
}

const AtlasPin = memo(function AtlasPin({
  entity, inv, labelTier, active, onSelect,
}: {
  entity: AtlasEntityRow;
  inv: number;
  labelTier: number;
  active: boolean;
  onSelect: (entity: AtlasEntityRow) => void;
}) {
  if (entity.aps_x == null || entity.aps_y == null) return null;
  const { x, y } = apsToViewBox({ x: entity.aps_x, y: entity.aps_y });

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > VB_W || y < 0 || y > VB_H) return null;
  const showPin = shouldShowPin(entity.kind, labelTier, active);
  if (!showPin) return null;
  const r = (active ? 0.78 : 0.58) * inv * S;
  const color = KIND_COLOR[entity.kind] ?? "oklch(0.55 0.18 25)";
  const showLabel = shouldShowLabel(entity.kind, labelTier, active);
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
