// Phase 2 — Atlas entity marker layer.
// Renders the published+verified `atlas_entities` over the atlas raster.
// Single source of every map marker — no legacy hubs.
import { memo } from "react";
import type { AtlasEntityRow } from "@/lib/atlas-entities";
import { apsToViewBox } from "@/lib/atlas/aps";

const VB_W = 100;
const VB_H = 60;

/** Inner SVG layer — rendered inside the AtlasStage transform group. */
export function AtlasEntityPinsLayer({
  entities,
  selectedId,
  inv,
  onSelect,
}: {
  entities: AtlasEntityRow[];
  selectedId: string | null;
  inv: number;
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
          active={selectedId === e.id}
          onSelect={onSelect}
        />
      ))}
    </g>
  );
}

const AtlasPin = memo(function AtlasPin({
  entity, inv, active, onSelect,
}: {
  entity: AtlasEntityRow;
  inv: number;
  active: boolean;
  onSelect: (entity: AtlasEntityRow) => void;
}) {
  const { x, y } = apsToViewBox({ x: entity.aps_x, y: entity.aps_y });
  if (x < 0 || x > VB_W || y < 0 || y > VB_H) return null;
  const r = (active ? 0.78 : 0.58) * inv;
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
      <circle r={r + 0.22 * inv} fill="oklch(0.16 0.05 255)" opacity={0.55} />
      <circle
        r={r}
        fill={active ? "oklch(0.78 0.18 75)" : "oklch(0.55 0.18 25)"}
        stroke="oklch(0.97 0.06 82)"
        strokeWidth={(active ? 0.22 : 0.14) * inv}
      />
      <circle r={r * 0.35} fill="oklch(0.97 0.06 82)" />
      <text
        y={-r - 0.5 * inv}
        textAnchor="middle"
        fontSize={1.4 * inv}
        fontWeight={800}
        fill="oklch(0.97 0.08 82)"
        stroke="oklch(0.16 0.05 255)"
        strokeWidth={0.18 * inv}
        paintOrder="stroke"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {entity.name_ar}
      </text>
    </g>
  );
});
