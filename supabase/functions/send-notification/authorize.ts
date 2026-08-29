/**
 * V16 — send-notification AUTHORSHIP authorization.
 *
 * The audience guard (`audience-guard.ts`) prevents an audience from being
 * widened. It is NOT an authorization boundary: it never asks *who* is
 * allowed to author a notification. This module is that boundary.
 *
 * Authorization rule (server-side only, client flags are never trusted):
 *   1. service-role / system / cron caller  -> full access (unchanged)
 *   2. authenticated IRTH admin (user_roles owner|admin, or bootstrap owner
 *      email) -> full access
 *   3. any other authenticated user -> ONLY the narrow peer envelope that
 *      the app itself has always produced (friend request / friend accepted /
 *      own achievement), single-user target, never a list, segment,
 *      broadcast or stored-row re-send
 *   4. anon / no bearer -> rejected
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** Notification types an ordinary authenticated user may author. */
export const USER_AUTHORABLE_TYPES = [
  "friend_request",
  "friend_accepted",
  "achievement",
] as const;

export type UserAuthorableType = (typeof USER_AUTHORABLE_TYPES)[number];

export type CallerKind = "service" | "admin" | "user";

export type AuthzDecision =
  | { ok: true; kind: "service" | "admin" }
  | { ok: true; kind: "user"; userId: string; type: UserAuthorableType; targetUserId: string; requiresFriendship: boolean }
  | { ok: false; status: number; error: string };

/** Decode a JWT payload without verification (identity hints only). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(pad)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Extract the raw bearer token from an Authorization header value. */
export function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

/**
 * Is this bearer the platform service role (cron / system producers)?
 * Matches either the literal service-role secret or a JWT whose role claim
 * is `service_role`.
 */
export function isServiceRoleBearer(token: string | null, serviceKey: string | undefined): boolean {
  if (!token) return false;
  if (serviceKey && token === serviceKey) return true;
  const payload = decodeJwtPayload(token);
  return payload?.role === "service_role";
}

/**
 * Pure envelope check for an ordinary authenticated (non-admin) caller.
 * Anything outside the app's own peer notifications is refused.
 */
export function authorizeUserEnvelope(
  userId: string,
  body: Record<string, unknown>,
): AuthzDecision {
  if (body.notification_id !== undefined && body.notification_id !== null) {
    return { ok: false, status: 403, error: "forbidden: only admins may send stored notifications" };
  }
  const type = typeof body.type === "string" ? body.type : "";
  if (!(USER_AUTHORABLE_TYPES as readonly string[]).includes(type)) {
    return { ok: false, status: 403, error: "forbidden: admin role required to author this notification" };
  }
  if ((body.target_type ?? "user") !== "user") {
    return { ok: false, status: 403, error: "forbidden: admin role required for non user-targeted notifications" };
  }
  if (body.target_user_ids !== undefined && body.target_user_ids !== null) {
    return { ok: false, status: 403, error: "forbidden: admin role required for multi-user audiences" };
  }
  if (body.target_segment_id !== undefined && body.target_segment_id !== null) {
    return { ok: false, status: 403, error: "forbidden: admin role required for segment audiences" };
  }
  if (body.dedupe_key !== undefined && body.dedupe_key !== null) {
    return { ok: false, status: 403, error: "forbidden: admin role required to set dedupe_key" };
  }
  const target = body.target_user_id;
  if (!isUuid(target)) {
    return { ok: false, status: 400, error: "target_user_id required for target_type=user" };
  }
  if (type === "achievement" && target !== userId) {
    return { ok: false, status: 403, error: "forbidden: achievement notifications may only target yourself" };
  }
  if (type !== "achievement" && target === userId) {
    return { ok: false, status: 403, error: "forbidden: invalid peer notification target" };
  }
  return {
    ok: true,
    kind: "user",
    userId,
    type: type as UserAuthorableType,
    targetUserId: target,
    requiresFriendship: type !== "achievement",
  };
}

/** True when the resolved DB roles grant notification authorship. */
export function rolesGrantAdmin(roles: readonly string[]): boolean {
  return roles.some((r) => r === "owner" || r === "admin");
}
