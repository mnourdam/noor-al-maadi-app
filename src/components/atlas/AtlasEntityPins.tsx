// Phase 3 — Atlas entity marker layer.
// Single source of every map pin: published+verified `atlas_entities`.
// Pin coordinates live in APS (= viewBox), eliminating any aspect-ratio
// drift between raster and markers. Pin color encodes kind for at-a-glance
// scanning; the panel/legend share this palette.
import { memo } from "react";
import type { AtlasEntityRow } from "@/lib/atlas-entities";
import { apsToViewBox, ATLAS_VIEWBOX, APS_UNIT_SCALE } from "@/lib/atlas/aps";
import { KIND_COLOR } from "@/lib/atlas/atlas-visual";
import { AtlasGlyphDefs, AtlasKindGlyph } from "./AtlasGlyphs";

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
  cullBounds,
  disableGlow,
}: {
  entities: AtlasEntityRow[];
  selectedId: string | null;
  inv: number;
  labelTier: number;
  onSelect: (entity: AtlasEntityRow) => void;
  /** Visible world rect in viewBox units; pins outside are skipped. */
  cullBounds?: { minX: number; maxX: number; minY: number; maxY: number } | null;
  /** Drop golden glow halos (Android perf). */
  disableGlow?: boolean;
}) {
  if (entities.length === 0) return null;
  // Label clutter cap: if too many pins are eligible for labels at this
  // tier, demote everything below region/place so the map stays readable.
  let labelEligible = 0;
  for (const e of entities) {
    if (e.aps_x == null || e.aps_y == null) continue;
    if (labelTier >= (LABEL_TIER[e.kind] ?? 99)) labelEligible++;
  }
  const labelCap = labelEligible > 28;
  // ── Focus mode ──────────────────────────────────────────────
  // With a selection active, every other marker fades to ~20% so the
  // chosen city / region / battle — and its label — own the surface.
  // The selected marker is rendered last so it always sits on top.
  const focused = selectedId != null;
  const selected = focused ? entities.find((e) => e.id === selectedId) ?? null : null;
  const rest = focused ? entities.filter((e) => e.id !== selectedId) : entities;
  const pin = (e: AtlasEntityRow, active: boolean) => (
    <AtlasPin
      key={e.id}
      entity={e}
      inv={inv}
      labelTier={labelTier}
      active={active}
      onSelect={onSelect}
      cullBounds={cullBounds}
      disableGlow={disableGlow}
      labelCap={labelCap}
    />
  );
  return (
    <g className="layer-atlas-entities">
      <AtlasGlyphDefs />
      <g
        opacity={focused ? 0.2 : 1}
        style={{ transition: "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {rest.map((e) => pin(e, false))}
      </g>
      {selected && <g className="layer-atlas-focus">{pin(selected, true)}</g>}
    </g>
  );
}



const AtlasPin = memo(function AtlasPin({
  entity, inv, labelTier, active, onSelect, cullBounds, disableGlow, labelCap,
}: {
  entity: AtlasEntityRow;
  inv: number;
  labelTier: number;
  active: boolean;
  onSelect: (entity: AtlasEntityRow) => void;
  cullBounds?: { minX: number; maxX: number; minY: number; maxY: number } | null;
  disableGlow?: boolean;
  labelCap?: boolean;
}) {
  if (entity.aps_x == null || entity.aps_y == null) return null;
  const { x, y } = apsToViewBox({ x: entity.aps_x, y: entity.aps_y });

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > VB_W || y < 0 || y > VB_H) return null;
  // Offscreen culling — keep the active pin even when out of view.
  if (!active && cullBounds) {
    if (x < cullBounds.minX || x > cullBounds.maxX || y < cullBounds.minY || y > cullBounds.maxY) {
      return null;
    }
  }
  const showPin = shouldShowPin(entity.kind, labelTier, active);
  if (!showPin) return null;

  // Glyph half-extent (in user units). Smaller, refined — atlas is the hero.
  const size = (active ? 1.15 : 0.85) * inv * S;
  const color = KIND_COLOR[entity.kind] ?? "oklch(0.55 0.18 25)";
  // Darker shade of the fill for an engraved rim — never harsh black.
  const rim = color.replace(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/,
    (_m, l, c, h) => `oklch(${Math.max(0.18, Number(l) - 0.22).toFixed(2)} ${c} ${h})`,
  );
  const labelAllowedByCap = !labelCap || active || entity.kind === "region" || entity.kind === "place";
  const showLabel = shouldShowLabel(entity.kind, labelTier, active) && labelAllowedByCap;
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onClick={(e) => {
        // Drag-vs-tap: AtlasStage cancels this click via capture phase when
        // the pointer moved more than the tap threshold.
        e.stopPropagation();
        onSelect(entity);
      }}
      style={{
        transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {/* Soft golden glow — decorative, must not block map drag. */}
      {active && !disableGlow && (
        <g style={{ pointerEvents: "none" }}>
          <circle r={size * 2.4} fill="oklch(0.86 0.16 82)" opacity={0.14} />
          <circle r={size * 1.55} fill="oklch(0.92 0.14 82)" opacity={0.22} />
        </g>
      )}
      {/* Engraved shadow pass — decorative only. */}
      {!disableGlow && (
        <g transform={`translate(0 ${size * 0.18})`} opacity={0.22} style={{ pointerEvents: "none" }}>
          <AtlasKindGlyph kind={entity.kind} size={size} fill={rim} stroke={rim} />
        </g>
      )}

      <AtlasKindGlyph kind={entity.kind} size={size} fill={color} stroke={rim} />
      {showLabel && (
        <text
          y={-size * 1.6}
          textAnchor="middle"
          fontSize={1.3 * inv * S}
          fontWeight={700}
          fill="oklch(0.94 0.06 78)"
          stroke="oklch(0.18 0.04 60)"
          strokeWidth={0.2 * inv * S}
          paintOrder="stroke"
          style={{ fontFamily: "var(--font-display)", pointerEvents: "none" }}
        >
          {entity.name_ar}
        </text>
      )}
    </g>
  );
});
