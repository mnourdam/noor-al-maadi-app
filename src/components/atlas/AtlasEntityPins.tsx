// Phase 3 — Atlas entity marker layer.
// Single source of every map pin: published+verified `atlas_entities`.
// Pin coordinates live in APS (= viewBox), eliminating any aspect-ratio
// drift between raster and markers. Pin color encodes kind for at-a-glance
// scanning; the panel/legend share this palette.
//
// V16 — visibility is no longer decided here. `src/lib/atlas/atlas-tiers.ts`
// is the single canonical contract (replacement-oriented tiers + hysteresis);
// this file only renders what that contract allows. Coincident markers are
// separated by the deterministic micro-offset from `atlas-coincidence.ts`.
import { memo, useMemo } from "react";
import type { AtlasEntityRow } from "@/lib/atlas-entities";
import { apsToViewBox, ATLAS_VIEWBOX, APS_UNIT_SCALE } from "@/lib/atlas/aps";
import { KIND_COLOR } from "@/lib/atlas/atlas-visual";
import {
  type AtlasTier,
  shouldShowAtlasPin,
  shouldShowAtlasLabel,
  pinOpacityForTier,
  pinScaleForTier,
} from "@/lib/atlas/atlas-tiers";
import {
  computeCoincidenceOffsets,
  applyCoincidenceOffset,
  type CoincidenceOffset,
} from "@/lib/atlas/atlas-coincidence";
import { AtlasGlyphDefs, AtlasKindGlyph } from "./AtlasGlyphs";

const VB_W = ATLAS_VIEWBOX.width;
const VB_H = ATLAS_VIEWBOX.height;
// Pin radii / strokes / text were tuned for a 100-wide viewBox. Scale up
// uniformly so they read at identical apparent size on the native APS grid.
const S = APS_UNIT_SCALE;

/** Inner SVG layer — rendered inside the AtlasStage transform group. */
export function AtlasEntityPinsLayer({
  entities,
  selectedId,
  inv,
  tier,
  onSelect,
  cullBounds,
  disableGlow,
}: {
  entities: AtlasEntityRow[];
  selectedId: string | null;
  inv: number;
  /** Canonical zoom tier from `tierForScale` (0 FAR / 1 MEDIUM / 2 CLOSE). */
  tier: AtlasTier;
  onSelect: (entity: AtlasEntityRow) => void;
  /** Visible world rect in viewBox units; pins outside are skipped. */
  cullBounds?: { minX: number; maxX: number; minY: number; maxY: number } | null;
  /** Drop golden glow halos (Android perf). */
  disableGlow?: boolean;
}) {
  // Deterministic micro-offsets — recomputed only when the marker set changes.
  const offsets = useMemo(
    () =>
      computeCoincidenceOffsets(
        entities
          .filter((e) => e.aps_x != null && e.aps_y != null)
          .map((e) => ({ id: e.id, x: e.aps_x as number, y: e.aps_y as number })),
      ),
    [entities],
  );

  // Label clutter cap: if too many pins are eligible for labels at this
  // tier, demote everything below place so the map stays readable.
  const labelCap = useMemo(() => {
    let labelEligible = 0;
    for (const e of entities) {
      if (e.aps_x == null || e.aps_y == null) continue;
      if (shouldShowAtlasLabel(e.kind, tier, false)) labelEligible++;
    }
    return labelEligible > 28;
  }, [entities, tier]);

  // ── Focus mode ──────────────────────────────────────────────
  // With a selection active, every other marker fades to ~20% so the
  // chosen city / region / battle — and its label — own the surface.
  // The selected marker is rendered last so it always sits on top.
  const focused = selectedId != null;
  const selected = focused ? entities.find((e) => e.id === selectedId) ?? null : null;
  const rest = useMemo(
    () => (selectedId != null ? entities.filter((e) => e.id !== selectedId) : entities),
    [entities, selectedId],
  );

  if (entities.length === 0) return null;

  const pin = (e: AtlasEntityRow, active: boolean) => (
    <AtlasPin
      key={e.id}
      entity={e}
      inv={inv}
      tier={tier}
      active={active}
      onSelect={onSelect}
      cullBounds={cullBounds}
      disableGlow={disableGlow}
      labelCap={labelCap}
      offsets={offsets}
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
  entity, inv, tier, active, onSelect, cullBounds, disableGlow, labelCap, offsets,
}: {
  entity: AtlasEntityRow;
  inv: number;
  tier: AtlasTier;
  active: boolean;
  onSelect: (entity: AtlasEntityRow) => void;
  cullBounds?: { minX: number; maxX: number; minY: number; maxY: number } | null;
  disableGlow?: boolean;
  labelCap?: boolean;
  offsets?: Map<string, CoincidenceOffset> | null;
}) {
  if (entity.aps_x == null || entity.aps_y == null) return null;
  const base = apsToViewBox({ x: entity.aps_x, y: entity.aps_y });
  const { x, y } = applyCoincidenceOffset(entity.id, base.x, base.y, offsets);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > VB_W || y < 0 || y > VB_H) return null;
  // Offscreen culling — keep the active pin even when out of view.
  if (!active && cullBounds) {
    if (x < cullBounds.minX || x > cullBounds.maxX || y < cullBounds.minY || y > cullBounds.maxY) {
      return null;
    }
  }
  if (!shouldShowAtlasPin(entity.kind, tier, active)) return null;

  const emphasis = pinScaleForTier(entity.kind, tier, active);
  const opacity = pinOpacityForTier(entity.kind, tier, active);
  // Glyph half-extent (in user units). Smaller, refined — atlas is the hero.
  const size = (active ? 1.15 : 0.85) * emphasis * inv * S;
  const color = KIND_COLOR[entity.kind] ?? "oklch(0.55 0.18 25)";
  // Darker shade of the fill for an engraved rim — never harsh black.
  const rim = color.replace(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/,
    (_m, l, c, h) => `oklch(${Math.max(0.18, Number(l) - 0.22).toFixed(2)} ${c} ${h})`,
  );
  const labelAllowedByCap = !labelCap || active || entity.kind === "place";
  const showLabel = shouldShowAtlasLabel(entity.kind, tier, active) && labelAllowedByCap;
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      opacity={opacity}
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
