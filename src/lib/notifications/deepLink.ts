/**
 * Deep-link resolver for notifications.
 *
 * Notifications can carry either a raw `deep_link` URL or a structured
 * `payload` (campaignId, entitySlug, artifactId, achievementId, …). This
 * module turns both into a single TanStack-router-friendly path.
 *
 * Keep the mapping permissive — when in doubt fall back to a sensible
 * section page rather than throwing or sending the user to "/".
 */

import type { NotificationCategoryKey } from "./categories";

export interface NotificationPayload {
  // Structured navigation hints — preferred over raw URLs.
  campaignId?: string;
  campaignSlug?: string;
  entitySlug?: string;
  entityType?: string;
  artifactId?: string;
  achievementId?: string;
  investigationId?: string;
  todayEventId?: string;
  url?: string;
  [key: string]: unknown;
}

export interface NotificationLike {
  type?: string | null;
  category?: string | null;
  deep_link?: string | null;
  payload?: NotificationPayload | Record<string, unknown> | null;
}

/**
 * Reminder / informational notification types. Tapping these should open
 * the Notification Center only — they have no real destination page.
 *
 * Includes: "معلومة من إرث" (daily_fact), come-back reminders, hearts
 * restored, streak reminders, daily challenge reminders, and generic
 * daily reminders. If the backend later attaches a real `payload.url`
 * or structured target, that still wins via the explicit checks below.
 */
const INFORMATIONAL_TYPES = new Set<string>([
  "daily_fact",
  "daily_information",
  "daily_reminder",
  "reengagement",
  "comeback_24h",
  "comeback",
  "hearts_full",
  "hearts_restored",
  "streak_reminder",
  "streak_protection",
  "daily_challenge",
  "system_update",
]);

export function isInformationalNotification(n: NotificationLike): boolean {
  const t = (n.type ?? "").toLowerCase();
  const c = (n.category ?? "").toLowerCase();
  return INFORMATIONAL_TYPES.has(t) || INFORMATIONAL_TYPES.has(c);
}

/**
 * Resolve a notification into a navigable path within the Irth router.
 * Returns `/notifications` when nothing more specific can be inferred so
 * the user is at least taken somewhere meaningful.
 */
export function resolveDeepLink(n: NotificationLike): string {
  const payload = (n.payload ?? {}) as NotificationPayload;
  const cat0 = (n.category ?? n.type ?? "").toLowerCase();

  // Reminder / informational notifications never open a content page —
  // they're standalone messages that live in the Notification Center.
  // Real targets (campaign, achievement, friend, etc.) still resolve
  // below via their explicit payload keys / raw deep_link.
  if (
    isInformationalNotification(n)
    && !payload.campaignId && !payload.campaignSlug
    && !payload.entitySlug && !payload.artifactId
    && !payload.achievementId && !payload.investigationId
    && !(typeof payload.url === "string" && payload.url.startsWith("/"))
    && !(n.deep_link && n.deep_link.startsWith("/"))
  ) {
    return "/notifications";
  }

  // Today-in-history entries are reminder-only — always send to Home's section,
  // never to a (possibly missing) entity/story page. If the raw deep_link
  // already carries a todayHistoryId (or the payload does), preserve it so
  // the Home carousel opens on the exact tapped event.
  if (cat0 === "today_in_history" || payload.todayEventId) {
    if (n.deep_link && n.deep_link.startsWith("/") && n.deep_link.includes("todayHistoryId=")) {
      return n.deep_link;
    }
    if (payload.todayEventId) {
      return `/?todayHistoryId=${encodeURIComponent(String(payload.todayEventId))}#today-in-history`;
    }
    return "/#today-in-history";
  }


  // 1. Explicit URL in payload wins over raw deep_link string.
  if (typeof payload.url === "string" && payload.url.startsWith("/")) {
    return payload.url;
  }

  // 2. Structured payload.
  if (payload.campaignSlug) return `/campaigns/${payload.campaignSlug}`;
  if (payload.campaignId)   return `/campaigns/${payload.campaignId}`;
  if (payload.entitySlug)   return `/encyclopedia/${payload.entitySlug}`;
  if (payload.artifactId)   return `/collection?artifact=${payload.artifactId}`;
  if (payload.achievementId) return `/profile?tab=achievements&achievement=${payload.achievementId}`;
  if (payload.investigationId) return `/investigations/${payload.investigationId}`;
  if (payload.todayEventId) return `/#today-in-history`;

  // 3. Raw deep_link from the legacy schema.
  if (n.deep_link && n.deep_link.startsWith("/")) return n.deep_link;

  // 4. Category-level fallbacks.
  const cat = (n.category ?? n.type ?? "").toLowerCase() as NotificationCategoryKey;
  switch (cat) {
    case "campaign":         return "/campaigns";
    case "encyclopedia":     return "/encyclopedia";
    case "investigation":    return "/investigations";
    case "achievement":      return "/profile?tab=achievements";
    case "reward":           return "/profile";
    case "museum":           return "/collection";
    case "today_in_history": return "/#today-in-history";
    case "daily_reminder":   return "/";
    case "friend":           return "/friends";
    default:                 return "/notifications";
  }
}
