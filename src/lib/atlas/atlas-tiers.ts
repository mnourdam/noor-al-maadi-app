// V16 — Atlas zoom tier contract (pure, shared, deterministic).
//
// ONE canonical visibility model for the Atlas marker system. AtlasStage
// computes the tier, AtlasEntityPins consumes it; no other module may
// re-derive tier logic from `scale`.
//
// The pre-V16 model was ADDITIVE: every zoom step added a new kind on top of
// the previous ones, so at close zoom the map showed regions + places +
// battles simultaneously (223 markers, 130 of them with a neighbour inside
// 80 APS px). V16 replaces this with a REPLACEMENT-oriented model:
//
//   TIER 0 — FAR     regions only
//   TIER 1 — MEDIUM  places (primary) + regions as de-emphasized context
//   TIER 2 — CLOSE   places + battles; regions drop out entirely
//
// The selected/focused entity is ALWAYS an exception: it renders, labels and
// stays tappable at every tier, whatever its kind.

export type AtlasTier = 0 | 1 | 2;

export const ATLAS_TIER_FAR: AtlasTier = 0;
export const ATLAS_TIER_MEDIUM: AtlasTier = 1;
export const ATLAS_TIER_CLOSE: AtlasTier = 2;

/**
 * Asymmetric hysteresis (dead-band) thresholds.
 *
 * Zooming IN uses the ENTER thresholds, zooming OUT uses the (lower) EXIT
 * thresholds. Between the two the previous tier is kept, so jitter such as
 * 2.99 → 3.01 → 2.99 around a boundary can never flip a large marker set.
 *
 *   FAR    → MEDIUM  at scale >= 1.60
 *   MEDIUM → FAR     at scale <  1.45
 *   MEDIUM → CLOSE   at scale >= 3.40
 *   CLOSE  → MEDIUM  at scale <  3.05
 */
export const ATLAS_TIER_THRESHOLDS = {
  farToMediumEnter: 1.6,
  mediumToFarExit: 1.45,
  mediumToCloseEnter: 3.4,
  closeToMediumExit: 3.05,
} as const;

/**
 * Stateful-but-pure tier resolution: same (scale, previousTier) always yields
 * the same tier. `previousTier` may be null on first evaluation, in which case
 * the stateless ENTER thresholds decide.
 */
export function tierForScale(scale: number, previousTier: AtlasTier | null = null): AtlasTier {
  const s = Number.isFinite(scale) ? scale : 1;
  const t = ATLAS_TIER_THRESHOLDS;

  if (previousTier == null) {
    if (s >= t.mediumToCloseEnter) return ATLAS_TIER_CLOSE;
    if (s >= t.farToMediumEnter) return ATLAS_TIER_MEDIUM;
    return ATLAS_TIER_FAR;
  }

  if (previousTier === ATLAS_TIER_FAR) {
    if (s >= t.mediumToCloseEnter) return ATLAS_TIER_CLOSE;
    if (s >= t.farToMediumEnter) return ATLAS_TIER_MEDIUM;
    return ATLAS_TIER_FAR;
  }

  if (previousTier === ATLAS_TIER_MEDIUM) {
    if (s >= t.mediumToCloseEnter) return ATLAS_TIER_CLOSE;
    if (s < t.mediumToFarExit) return ATLAS_TIER_FAR;
    return ATLAS_TIER_MEDIUM;
  }

  // previousTier === CLOSE
  if (s < t.mediumToFarExit) return ATLAS_TIER_FAR;
  if (s < t.closeToMediumExit) return ATLAS_TIER_MEDIUM;
  return ATLAS_TIER_CLOSE;
}

/** Kinds rendered at normal weight for a tier (excludes context-only kinds). */
export function visibleKindsForTier(tier: AtlasTier): readonly string[] {
  switch (tier) {
    case ATLAS_TIER_FAR:
      return ["region"];
    case ATLAS_TIER_MEDIUM:
      // `region` is present as de-emphasized context, see contextKindsForTier.
      return ["place"];
    default:
      return ["place", "battle"];
  }
}

/** Kinds rendered, but visually de-emphasized (context parents). */
export function contextKindsForTier(tier: AtlasTier): readonly string[] {
  return tier === ATLAS_TIER_MEDIUM ? ["region"] : [];
}

/** Canonical pin visibility. Selected entity is always an exception. */
export function shouldShowAtlasPin(kind: string, tier: AtlasTier, isActive: boolean): boolean {
  if (isActive) return true;
  return (
    visibleKindsForTier(tier).includes(kind) || contextKindsForTier(tier).includes(kind)
  );
}

/** True when the pin should be drawn de-emphasized (context only). */
export function isContextPin(kind: string, tier: AtlasTier, isActive: boolean): boolean {
  if (isActive) return false;
  return contextKindsForTier(tier).includes(kind);
}

/**
 * Canonical label visibility. Labels are stricter than pins: context pins
 * (regions at MEDIUM) never carry a label, so cities own the surface.
 * The selected entity's label always wins.
 */
export function shouldShowAtlasLabel(kind: string, tier: AtlasTier, isActive: boolean): boolean {
  if (isActive) return true;
  return visibleKindsForTier(tier).includes(kind);
}

/** Opacity multiplier for a pin at a tier (1 = normal, <1 = context). */
export function pinOpacityForTier(kind: string, tier: AtlasTier, isActive: boolean): number {
  return isContextPin(kind, tier, isActive) ? 0.45 : 1;
}

/** Size multiplier for a pin at a tier — context pins read smaller. */
export function pinScaleForTier(kind: string, tier: AtlasTier, isActive: boolean): number {
  return isContextPin(kind, tier, isActive) ? 0.72 : 1;
}
