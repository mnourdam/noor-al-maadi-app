// ============================================================
// Taxonomy Labels — SINGLE SOURCE OF TRUTH for player-facing
// Arabic labels of the three independent historical taxonomies:
//
//   1. الحقبة التاريخية (Era)   — chronological period
//   2. العالم (World)            — exploration hub / historical universe
//   3. الدولة (State)            — canonical political entity
//
// Each map is INDEPENDENT. Never fall back across taxonomies:
// a slug that is a valid era is not automatically a valid world
// or state, and vice versa.
//
// Legacy / unapproved slugs (e.g. `buyid`, `byzantine`, `taifa`,
// `crusades`, `modern`) intentionally do NOT appear in the
// player-facing approved maps. Admin/debug helpers keep them
// visible by prefixing "غير معتمد" so curators can remap them.
// ============================================================

export const TAXONOMY_HEADINGS = {
  era: "الحقبة التاريخية",
  world: "العالم",
  state: "الدولة",
} as const;

export const UNAPPROVED_LABEL = "غير معتمد";
export const UNKNOWN_LABEL = "غير محدد";

// ------------------------------------------------------------
// 1. Era — 14 approved chronological periods
// ------------------------------------------------------------
export const APPROVED_ERA_SLUGS = [
  "prophetic",
  "rashidun",
  "umayyad",
  "abbasid",
  "fatimid",
  "andalus",
  "seljuk",
  "zengid",
  "ayyubid",
  "mamluk",
  "mongols",
  "timurid",
  "ottoman",
  "safavid",
] as const;

export type ApprovedEra = (typeof APPROVED_ERA_SLUGS)[number];

export const ERA_LABELS_AR: Record<ApprovedEra, string> = {
  prophetic: "عصر النبوة",
  rashidun: "الخلافة الراشدة",
  umayyad: "الدولة الأموية",
  abbasid: "الدولة العباسية",
  fatimid: "الدولة الفاطمية",
  andalus: "الأندلس",
  seljuk: "السلاجقة",
  zengid: "الزنكيون",
  ayyubid: "الدولة الأيوبية",
  mamluk: "دولة المماليك",
  mongols: "المغول",
  timurid: "التيموريون",
  ottoman: "الدولة العثمانية",
  safavid: "الدولة الصفوية",
};

// Raw / legacy era slugs → canonical approved era.
const ERA_ALIAS: Record<string, ApprovedEra> = {
  seerah: "prophetic",
  "prophetic-era": "prophetic",
  "prophetic-makkah": "prophetic",
  "prophetic-madinah": "prophetic",
  "rashidun-era": "rashidun",
  "rashidun-caliphate": "rashidun",
  "umayyad-era": "umayyad",
  "umayyad-caliphate": "umayyad",
  umawi: "umayyad",
  "umayyad-damascus": "umayyad",
  "abbasid-era": "abbasid",
  "abbasid-caliphate": "abbasid",
  abbasi: "abbasid",
  baghdad: "abbasid",
  "fatimid-era": "fatimid",
  fatimi: "fatimid",
  "al-andalus": "andalus",
  andalusia: "andalus",
  andalusi: "andalus",
  "andalus-umayyad": "andalus",
  "andalus-caliphate": "andalus",
  cordoba: "andalus",
  "cordoba-caliphate": "andalus",
  murabitun: "andalus",
  almoravid: "andalus",
  almoravids: "andalus",
  muwahhidun: "andalus",
  almohad: "andalus",
  almohads: "andalus",
  granada: "andalus",
  nasrid: "andalus",
  "post-granada": "andalus",
  reconquista: "andalus",
  seljuks: "seljuk",
  saljuq: "seljuk",
  saljuk: "seljuk",
  zangid: "zengid",
  zengi: "zengid",
  zankid: "zengid",
  "zengid-era": "zengid",
  ayyubi: "ayyubid",
  "ayyubid-era": "ayyubid",
  mongol: "mongols",
  ilkhanid: "mongols",
  "mongol-invasion": "mongols",
  mamluks: "mamluk",
  mamluki: "mamluk",
  "mamluk-era": "mamluk",
  "mamluk-sultanate": "mamluk",

  timurids: "timurid",
  "timurid-era": "timurid",
  timur: "timurid",
  tamerlane: "timurid",
  ottomans: "ottoman",
  "ottoman-era": "ottoman",
  "late-ottoman": "ottoman",
  uthmani: "ottoman",
  safavids: "safavid",
  "safavid-empire": "safavid",
  "safavid-state": "safavid",
};

// ------------------------------------------------------------
// 2. World — 14 approved exploration hubs
// ------------------------------------------------------------
export const APPROVED_WORLD_SLUGS = [
  "prophetic",
  "rashidun",
  "umayyad",
  "abbasid",
  "seljuk",
  "zengid",
  "ayyubid-state",
  "mamluk-sultanate",
  "andalus",
  "ottoman",
  "mongols",
  "timurid",
  "fatimid",
  "safavid",
] as const;

export type ApprovedWorld = (typeof APPROVED_WORLD_SLUGS)[number];

export const WORLD_LABELS_AR: Record<ApprovedWorld, string> = {
  prophetic: "النبوة",
  rashidun: "الراشدون",
  umayyad: "الأمويون",
  abbasid: "العباسيون",
  seljuk: "السلاجقة",
  zengid: "الزنكيون",
  "ayyubid-state": "الأيوبيون",
  "mamluk-sultanate": "المماليك",
  andalus: "الأندلس",
  ottoman: "العثمانيون",
  mongols: "المغول",
  timurid: "التيموريون",
  fatimid: "الفاطميون",
  safavid: "الصفويون",
};

// ------------------------------------------------------------
// 3. State — 13 approved canonical political entities
// ------------------------------------------------------------
export const APPROVED_STATE_SLUGS = [
  "rashidun",
  "umayyad",
  "abbasid",
  "seljuk",
  "zengid",
  "ayyubid",
  "mamluk",
  "ottoman",
  "andalus",
  "mongols",
  "timurid",
  "fatimid",
  "safavid",
] as const;

export type ApprovedState = (typeof APPROVED_STATE_SLUGS)[number];

export const STATE_LABELS_AR: Record<ApprovedState, string> = {
  rashidun: "الدولة الراشدة",
  umayyad: "الدولة الأموية",
  abbasid: "الدولة العباسية",
  seljuk: "الدولة السلجوقية",
  zengid: "الدولة الزنكية",
  ayyubid: "الدولة الأيوبية",
  mamluk: "دولة المماليك",
  ottoman: "الدولة العثمانية",
  andalus: "الأندلس",
  mongols: "الدولة المغولية",
  timurid: "الدولة التيمورية",
  fatimid: "الدولة الفاطمية",
  safavid: "الدولة الصفوية",
};

// ============================================================
// Helpers
// ============================================================

function normalize(slug: string): string {
  return slug.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

const ERA_SET = new Set<string>(APPROVED_ERA_SLUGS);
const WORLD_SET = new Set<string>(APPROVED_WORLD_SLUGS);
const STATE_SET = new Set<string>(APPROVED_STATE_SLUGS);

/** Canonical approved era slug, or null when not approved. */
export function canonicalEraSlug(slug: string | null | undefined): ApprovedEra | null {
  if (!slug) return null;
  const k = normalize(slug);
  if (ERA_SET.has(k)) return k as ApprovedEra;
  return ERA_ALIAS[k] ?? null;
}

/** Player-facing Arabic label. Returns "غير محدد" for unknown / unapproved. */
export function eraLabelAr(slug: string | null | undefined): string {
  const c = canonicalEraSlug(slug);
  return c ? ERA_LABELS_AR[c] : UNKNOWN_LABEL;
}

export function worldLabelAr(slug: string | null | undefined): string {
  if (!slug) return UNKNOWN_LABEL;
  const k = normalize(slug);
  return WORLD_SET.has(k) ? WORLD_LABELS_AR[k as ApprovedWorld] : UNKNOWN_LABEL;
}

export function stateLabelAr(slug: string | null | undefined): string {
  if (!slug) return UNKNOWN_LABEL;
  const k = normalize(slug);
  return STATE_SET.has(k) ? STATE_LABELS_AR[k as ApprovedState] : UNKNOWN_LABEL;
}

/**
 * Admin/debug variant. Approved → normal Arabic label.
 * Unapproved → "غير معتمد: <slug>" so curators can remap it.
 */
export function eraLabelAdmin(slug: string | null | undefined): string {
  if (!slug) return UNKNOWN_LABEL;
  const c = canonicalEraSlug(slug);
  if (c) return ERA_LABELS_AR[c];
  return `${UNAPPROVED_LABEL}: ${slug}`;
}

export function worldLabelAdmin(slug: string | null | undefined): string {
  if (!slug) return UNKNOWN_LABEL;
  const k = normalize(slug);
  if (WORLD_SET.has(k)) return WORLD_LABELS_AR[k as ApprovedWorld];
  return `${UNAPPROVED_LABEL}: ${slug}`;
}

export function stateLabelAdmin(slug: string | null | undefined): string {
  if (!slug) return UNKNOWN_LABEL;
  const k = normalize(slug);
  if (STATE_SET.has(k)) return STATE_LABELS_AR[k as ApprovedState];
  return `${UNAPPROVED_LABEL}: ${slug}`;
}

export function isApprovedEra(slug: string | null | undefined): boolean {
  return canonicalEraSlug(slug) !== null;
}
export function isApprovedWorld(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return WORLD_SET.has(normalize(slug));
}
export function isApprovedState(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return STATE_SET.has(normalize(slug));
}
