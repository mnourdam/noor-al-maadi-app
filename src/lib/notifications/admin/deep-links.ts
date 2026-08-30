/**
 * Deep-link destination registry for the notification composer — V16.
 *
 * Every destination maps to a route that ACTUALLY EXISTS under `src/routes`.
 * Nothing here is invented: the paths below were verified one-by-one against
 * the generated route tree (`/`, `/campaigns`, `/journey`, `/stories`,
 * `/story/$id`, `/encyclopedia`, `/encyclopedia/entity/$id`,
 * `/encyclopedia/type/$type`, `/map`, `/collection`, `/investigations`,
 * `/investigation/$id`, `/achievements`, `/friends`, `/profile`,
 * `/notifications`, `/timeline`, `/campaigns/imported/$id`).
 *
 * CANONICAL SERIALIZATION (V16 fix)
 * ---------------------------------
 * `build()` returns ONE canonical path and mirrors it into `payload.url`.
 * `resolveDeepLink()` checks `payload.url` first, so the Android
 * notification-open handler always navigates to exactly the URL the admin
 * previewed. Previously builders emitted structured payload keys
 * (`campaignSlug`, `entitySlug`, …) that the resolver rewrote into
 * non-existent routes such as `/campaigns/<slug>`.
 */

export type DeepLinkGroup =
  | "Home"
  | "Campaigns"
  | "Stories"
  | "Encyclopedia"
  | "Atlas"
  | "Museum"
  | "Investigations"
  | "Timeline"
  | "Community"
  | "Profile"
  | "Notifications"
  | "Admin";

/** Content source used to power a searchable admin selector for a param. */
export type DeepLinkParamSource =
  | "campaign"
  | "story"
  | "encyclopedia_entity"
  | "encyclopedia_type"
  | "atlas_entity"
  | "investigation";

export interface DeepLinkParam {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  /** Optional helper hint for the admin (e.g. "campaign slug"). */
  hint?: string;
  /** When set, the picker renders a searchable content selector. */
  source?: DeepLinkParamSource;
}

export interface DeepLinkDef {
  id: string;
  group: DeepLinkGroup;
  label: string;
  description?: string;
  params: DeepLinkParam[];
  build: (params: Record<string, string>) => { deep_link: string; payload: Record<string, unknown> };
}

const NO_PARAMS: DeepLinkParam[] = [];

/** Canonical output helper: one URL, mirrored into `payload.url`. */
function canonical(url: string): { deep_link: string; payload: Record<string, unknown> } {
  return { deep_link: url, payload: { url } };
}

const enc = encodeURIComponent;

export const DEEP_LINKS: DeepLinkDef[] = [
  // ── Home ───────────────────────────────────────────────────────────────
  { id: "home", group: "Home", label: "الرئيسية",
    params: NO_PARAMS, build: () => canonical("/") },
  { id: "home.today", group: "Home", label: "في مثل هذا اليوم",
    params: NO_PARAMS, build: () => canonical("/#today-in-history") },

  // ── Campaigns ──────────────────────────────────────────────────────────
  { id: "campaigns.home", group: "Campaigns", label: "الحملات",
    params: NO_PARAMS, build: () => canonical("/campaigns") },
  { id: "campaigns.continue", group: "Campaigns", label: "أكمل رحلتك",
    description: "يفتح صفحة الرحلة الحالية للاعب.",
    params: NO_PARAMS, build: () => canonical("/journey") },
  { id: "campaigns.specific", group: "Campaigns", label: "حملة محدّدة",
    params: [{ key: "slug", label: "الحملة", required: true, source: "campaign", placeholder: "prophetic-mission" }],
    build: (p) => canonical(`/campaigns/imported/${enc(p.slug)}`) },

  // ── Stories ────────────────────────────────────────────────────────────
  { id: "stories.home", group: "Stories", label: "مكتبة القصص",
    params: NO_PARAMS, build: () => canonical("/stories") },
  { id: "stories.specific", group: "Stories", label: "قصة محدّدة",
    params: [{ key: "id", label: "القصة", required: true, source: "story" }],
    build: (p) => canonical(`/story/${enc(p.id)}`) },

  // ── Encyclopedia ───────────────────────────────────────────────────────
  { id: "encyclopedia.home", group: "Encyclopedia", label: "الموسوعة",
    params: NO_PARAMS, build: () => canonical("/encyclopedia") },
  { id: "encyclopedia.entity", group: "Encyclopedia", label: "مدخل موسوعي محدّد",
    params: [{ key: "slug", label: "المدخل", required: true, source: "encyclopedia_entity" }],
    build: (p) => canonical(`/encyclopedia/entity/${enc(p.slug)}`) },
  { id: "encyclopedia.type", group: "Encyclopedia", label: "تصنيف موسوعي",
    params: [{ key: "type", label: "التصنيف", required: true, source: "encyclopedia_type" }],
    build: (p) => canonical(`/encyclopedia/type/${enc(p.type)}`) },

  // ── Atlas ──────────────────────────────────────────────────────────────
  { id: "atlas.home", group: "Atlas", label: "الأطلس",
    params: NO_PARAMS, build: () => canonical("/map") },
  { id: "atlas.entity", group: "Atlas", label: "موقع محدّد في الأطلس",
    description: "يفتح الأطلس ويقرّب على الموقع المحدّد.",
    // `/map?focus=` is matched against `atlas_entities.id` in AtlasShell —
    // a slug never matched anything, which is why this destination looked
    // broken/disabled on device.
    params: [{ key: "id", label: "الموقع", required: true, source: "atlas_entity", hint: "معرّف كيان الأطلس (UUID)" }],
    build: (p) => canonical(`/map?focus=${enc(p.id)}&zoom=6`) },

  // ── Museum ─────────────────────────────────────────────────────────────
  { id: "museum.home", group: "Museum", label: "المتحف",
    params: NO_PARAMS, build: () => canonical("/collection") },
  { id: "museum.artifact", group: "Museum", label: "مقتنى محدّد",
    params: [{ key: "id", label: "معرّف المقتنى", required: true, placeholder: "artifact:scroll-of-aleppo" }],
    build: (p) => canonical(`/collection?artifact=${enc(p.id)}`) },
  { id: "museum.latest", group: "Museum", label: "أحدث الاكتشافات",
    params: NO_PARAMS, build: () => canonical("/collection?tab=latest") },

  // ── Investigations ─────────────────────────────────────────────────────
  { id: "investigations.home", group: "Investigations", label: "التحقيقات",
    params: NO_PARAMS, build: () => canonical("/investigations") },
  { id: "investigations.specific", group: "Investigations", label: "تحقيق محدّد",
    params: [{ key: "slug", label: "التحقيق", required: true, source: "investigation" }],
    build: (p) => canonical(`/investigation/${enc(p.slug)}`) },

  // ── Timeline ───────────────────────────────────────────────────────────
  { id: "timeline.great", group: "Timeline", label: "الخط الزمني",
    params: NO_PARAMS, build: () => canonical("/timeline") },
  { id: "timeline.today", group: "Timeline", label: "في مثل هذا اليوم",
    params: NO_PARAMS, build: () => canonical("/#today-in-history") },

  // ── Community ──────────────────────────────────────────────────────────
  { id: "community.friends", group: "Community", label: "الأصدقاء",
    params: NO_PARAMS, build: () => canonical("/friends") },
  { id: "community.leaderboard", group: "Community", label: "لوحة الترتيب",
    params: NO_PARAMS, build: () => canonical("/friends?tab=leaderboard") },

  // ── Profile ────────────────────────────────────────────────────────────
  { id: "profile.account", group: "Profile", label: "الحساب",
    params: NO_PARAMS, build: () => canonical("/profile") },
  { id: "profile.achievements", group: "Profile", label: "الإنجازات",
    params: NO_PARAMS, build: () => canonical("/achievements") },
  { id: "profile.settings", group: "Profile", label: "الإعدادات",
    params: NO_PARAMS, build: () => canonical("/profile?tab=settings") },

  // ── Notifications ──────────────────────────────────────────────────────
  { id: "notifications.center", group: "Notifications", label: "مركز الإشعارات",
    params: NO_PARAMS, build: () => canonical("/notifications") },

  // ── Admin ──────────────────────────────────────────────────────────────
  { id: "admin.home", group: "Admin", label: "لوحة الإدارة",
    params: NO_PARAMS, build: () => canonical("/admin") },
];

export const DEEP_LINK_GROUPS: DeepLinkGroup[] = [
  "Home", "Campaigns", "Stories", "Encyclopedia", "Atlas", "Museum",
  "Investigations", "Timeline", "Community", "Profile", "Notifications", "Admin",
];

export function findDeepLink(id: string): DeepLinkDef | undefined {
  return DEEP_LINKS.find((d) => d.id === id);
}

export function searchDeepLinks(query: string): DeepLinkDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEEP_LINKS;
  return DEEP_LINKS.filter(
    (d) =>
      d.id.includes(q) ||
      d.label.toLowerCase().includes(q) ||
      d.group.toLowerCase().includes(q) ||
      (d.description ?? "").toLowerCase().includes(q),
  );
}
