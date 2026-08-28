/**
 * V16 audience guard — pure, dependency-free logic shared by the
 * `send-notification` edge function and its unit tests.
 *
 * INVARIANT (the whole point of this module):
 *   A request whose intended target is `segment` can NEVER be widened to
 *   a broadcast. Missing, dropped, empty, malformed or unresolved segment
 *   targets FAIL CLOSED — they never fall through to "all enabled tokens".
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export interface AudienceInput {
  target_type?: string | null;
  target_user_id?: string | null;
  target_user_ids?: unknown;
  target_segment_id?: unknown;
}

export type TokenScope =
  | { ok: true; scope: "user"; userIds: string[] }
  | { ok: true; scope: "list"; userIds: string[] }
  | { ok: true; scope: "broadcast" }
  | { ok: false; status: number; error: string };

/**
 * Decide how the push-token query must be scoped.
 *
 * - `user`      → tokens of exactly one user
 * - `list`      → tokens of exactly the resolved user ids (may be empty →
 *                 zero recipients, still NOT a broadcast)
 * - `broadcast` → all enabled tokens; only reachable for an explicitly
 *                 requested all-users target with no id list
 */
export function resolveTokenScope(notif: AudienceInput): TokenScope {
  const targetType = (notif.target_type ?? "all").toString();
  const rawIds = notif.target_user_ids;

  if (targetType === "user") {
    if (!isUuid(notif.target_user_id)) {
      return { ok: false, status: 400, error: "target_user_id required for target_type=user" };
    }
    return { ok: true, scope: "user", userIds: [notif.target_user_id] };
  }

  if (targetType === "segment") {
    // Segment identity must survive persistence — a lost/missing
    // target_segment_id means the audience is unverifiable.
    if (typeof notif.target_segment_id !== "string" || !notif.target_segment_id.trim()) {
      return { ok: false, status: 400, error: "segment_target_missing: target_segment_id is required for target_type=segment" };
    }
    if (!Array.isArray(rawIds)) {
      return { ok: false, status: 400, error: "segment_target_missing: target_user_ids must be an array for target_type=segment" };
    }
    if (!rawIds.every(isUuid)) {
      return { ok: false, status: 400, error: "segment_target_malformed: target_user_ids must contain uuids only" };
    }
    // Empty = a legitimate zero audience: send to nobody, never broadcast.
    return { ok: true, scope: "list", userIds: Array.from(new Set(rawIds as string[])) };
  }

  // Legacy/explicit list without a segment type.
  if (Array.isArray(rawIds) && rawIds.length > 0) {
    if (!rawIds.every(isUuid)) {
      return { ok: false, status: 400, error: "target_user_ids must contain uuids only" };
    }
    return { ok: true, scope: "list", userIds: Array.from(new Set(rawIds as string[])) };
  }

  return { ok: true, scope: "broadcast" };
}

/**
 * Last line of defence, evaluated immediately before the token query.
 * Throws if a segment-intent request somehow reached broadcast scope.
 */
export function assertNoSegmentWidening(notif: AudienceInput, scope: TokenScope): void {
  if ((notif.target_type ?? "all") !== "segment") return;
  if (!scope.ok || scope.scope !== "list") {
    throw new Error("segment_broadcast_guard: refusing to widen a segment send to a broadcast");
  }
}
