/**
 * Deep-link destination registry for the notification composer.
 *
 * Each destination knows its label, group, route builder, and the params
 * it needs from the admin. The picker uses this to render dynamic inputs
 * instead of asking admins to type raw URLs.
 *
 * The `build()` output writes both `deep_link` (URL string) and a
 * structured `payload` so the existing notifications/deepLink.ts resolver
 * keeps working without changes.
 */

export type DeepLinkGroup =
  | "Campaigns"
  | "Encyclopedia"
  | "Atlas"
  | "Museum"
  | "Timeline"
  | "Community"
  | "Profile"
  | "Notifications"
  | "Admin";

export interface DeepLinkParam {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  /** Optional helper hint for the admin (e.g. "campaign slug"). */
  hint?: string;
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

export const DEEP_LINKS: DeepLinkDef[] = [
  // Campaigns
  { id: "campaigns.home", group: "Campaigns", label: "Campaigns Home",
    params: NO_PARAMS,
    build: () => ({ deep_link: "/campaigns", payload: {} }) },
  { id: "campaigns.continue", group: "Campaigns", label: "Continue Journey",
    description: "Opens the player's last in-progress campaign.",
    params: NO_PARAMS,
    build: () => ({ deep_link: "/campaigns", payload: { url: "/campaigns" } }) },
  { id: "campaigns.specific", group: "Campaigns", label: "Specific Campaign",
    params: [{ key: "slug", label: "Campaign slug", required: true, placeholder: "prophetic-mission", hint: "From /campaigns/imported/{slug}" }],
    build: (p) => ({
      deep_link: `/campaigns/imported/${p.slug}`,
      payload: { campaignSlug: p.slug },
    }) },

  // Encyclopedia
  { id: "encyclopedia.home", group: "Encyclopedia", label: "Encyclopedia Home",
    params: NO_PARAMS, build: () => ({ deep_link: "/encyclopedia", payload: {} }) },
  { id: "encyclopedia.entity", group: "Encyclopedia", label: "Entity (figure/city/battle…)",
    params: [{ key: "slug", label: "Entity slug", required: true, placeholder: "ibn-khaldun" }],
    build: (p) => ({
      deep_link: `/encyclopedia/entity/${p.slug}`,
      payload: { entitySlug: p.slug },
    }) },
  { id: "encyclopedia.type", group: "Encyclopedia", label: "Entity Type",
    params: [{ key: "type", label: "Type", required: true, placeholder: "figure", hint: "figure | city | battle | state | artifact | event" }],
    build: (p) => ({ deep_link: `/encyclopedia/type/${p.type}`, payload: {} }) },

  // Atlas
  { id: "atlas.home", group: "Atlas", label: "Atlas",
    params: NO_PARAMS, build: () => ({ deep_link: "/map", payload: {} }) },
  { id: "atlas.entity", group: "Atlas", label: "Atlas Entity",
    params: [{ key: "slug", label: "Atlas entity slug", required: true }],
    build: (p) => ({ deep_link: `/map?focus=${encodeURIComponent(p.slug)}`, payload: { entitySlug: p.slug } }) },

  // Museum
  { id: "museum.home", group: "Museum", label: "Museum Home",
    params: NO_PARAMS, build: () => ({ deep_link: "/collection", payload: {} }) },
  { id: "museum.artifact", group: "Museum", label: "Artifact",
    params: [{ key: "id", label: "Artifact ID", required: true, placeholder: "artifact:scroll-of-aleppo" }],
    build: (p) => ({ deep_link: `/collection?artifact=${encodeURIComponent(p.id)}`, payload: { artifactId: p.id } }) },
  { id: "museum.latest", group: "Museum", label: "Latest Discoveries",
    params: NO_PARAMS, build: () => ({ deep_link: "/collection?tab=latest", payload: {} }) },

  // Timeline
  { id: "timeline.great", group: "Timeline", label: "Great Timeline",
    params: NO_PARAMS, build: () => ({ deep_link: "/timeline", payload: {} }) },
  { id: "timeline.today", group: "Timeline", label: "Today in History",
    params: NO_PARAMS, build: () => ({ deep_link: "/#today-in-history", payload: {} }) },

  // Community
  { id: "community.friends", group: "Community", label: "Friends",
    params: NO_PARAMS, build: () => ({ deep_link: "/friends", payload: {} }) },
  { id: "community.leaderboard", group: "Community", label: "Leaderboard",
    params: NO_PARAMS, build: () => ({ deep_link: "/friends?tab=leaderboard", payload: {} }) },

  // Profile
  { id: "profile.account", group: "Profile", label: "Account",
    params: NO_PARAMS, build: () => ({ deep_link: "/profile", payload: {} }) },
  { id: "profile.achievements", group: "Profile", label: "Achievements",
    params: NO_PARAMS, build: () => ({ deep_link: "/profile?tab=achievements", payload: {} }) },
  { id: "profile.settings", group: "Profile", label: "Settings",
    params: NO_PARAMS, build: () => ({ deep_link: "/profile?tab=settings", payload: {} }) },

  // Notifications
  { id: "notifications.center", group: "Notifications", label: "Notification Center",
    params: NO_PARAMS, build: () => ({ deep_link: "/notifications", payload: {} }) },

  // Admin
  { id: "admin.home", group: "Admin", label: "Admin Dashboard",
    params: NO_PARAMS, build: () => ({ deep_link: "/admin", payload: {} }) },
];

export const DEEP_LINK_GROUPS: DeepLinkGroup[] = [
  "Campaigns", "Encyclopedia", "Atlas", "Museum", "Timeline",
  "Community", "Profile", "Notifications", "Admin",
];

export function findDeepLink(id: string): DeepLinkDef | undefined {
  return DEEP_LINKS.find((d) => d.id === id);
}

export function searchDeepLinks(query: string): DeepLinkDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEEP_LINKS;
  return DEEP_LINKS.filter(
    (d) => d.id.includes(q) || d.label.toLowerCase().includes(q) || d.group.toLowerCase().includes(q),
  );
}
