// ============================================================
// Canonical Arabic entity-type dictionary
// ------------------------------------------------------------
// SINGLE source of truth for turning an internal entity-type
// slug ("event", "figure", "artifact", …) into the Arabic label
// a player is allowed to see.
//
// Rule: no English slug may ever reach the UI. When a type is
// unknown we return the neutral Arabic fallback ("مقتنى" /
// "عنصر") instead of echoing the raw slug.
// ============================================================

export const ENTITY_TYPE_LABEL_AR: Record<string, string> = {
  // Encyclopedia / museum canonical types
  event: "حدث",
  figure: "شخصية",
  character: "شخصية",
  person: "شخصية",
  scholar: "شخصية",
  city: "مدينة",
  landmark: "معلم",
  state: "دولة",
  battle: "معركة",
  artifact: "أثر",
  document: "وثيقة",
  manuscript: "مخطوطة",
  region: "إقليم",
  route_point: "محطة",
  artifact_site: "معلم",
  figure_marker: "شخصية",
  collection: "مجموعة",
  story: "قصة",
  campaign: "حملة",
  investigation: "تحقيق",
};

/** Neutral fallback — never leaks a slug to the player. */
export const ENTITY_TYPE_FALLBACK_AR = "مقتنى";

/**
 * Arabic label for an entity type slug.
 * Unknown / empty types resolve to `fallback` (default "مقتنى"),
 * never to the raw slug.
 */
export function entityTypeLabelAr(
  type: string | null | undefined,
  fallback: string = ENTITY_TYPE_FALLBACK_AR,
): string {
  const key = String(type ?? "").trim().toLowerCase();
  if (!key) return fallback;
  return ENTITY_TYPE_LABEL_AR[key] ?? fallback;
}
