// ============================================================
// Stories — IDENTITY-SCOPED summary query keys (V16)
// ------------------------------------------------------------
// `listStoriesSummary()` returns per-player data (unlocked,
// completed, progress). Caching it under a global
// `["stories-summary", worldSlug]` key let a guest answer — the
// one produced while the Android WebView was still restoring the
// persisted session — survive as the authenticated player's state,
// which is exactly how a fully-read library rendered as "جديدة".
//
// Contract
//   * every summary query key carries an identity segment;
//   * guest / pending / user A / user B never share a cache entry;
//   * the `stories-summary` prefix is preserved so the existing
//     invalidation bridge and the celebration observer keep working.
// ============================================================

import { useAccount } from "@/lib/account";

/** `pending` while auth is restoring, `guest` when signed out, else the uid. */
export type StoryIdentityKey = string;

export const STORY_SUMMARY_PREFIX = "stories-summary" as const;

export function storyIdentityKey(
  user: { id?: string | null } | null | undefined,
  loadingSession: boolean,
): StoryIdentityKey {
  if (loadingSession) return "pending";
  const id = user?.id ? String(user.id) : "";
  return id ? id : "guest";
}

/**
 * Build an identity-scoped summary key.
 * Shape: ["stories-summary", identity, worldSlug, ...variant]
 */
export function storySummaryQueryKey(
  identity: StoryIdentityKey,
  worldSlug?: string | null,
  ...variant: string[]
): (string | null)[] {
  return [STORY_SUMMARY_PREFIX, identity, worldSlug ?? null, ...variant];
}

/** React hook — the identity segment for the current auth state. */
export function useStoryIdentityKey(): StoryIdentityKey {
  const { user, loadingSession } = useAccount();
  return storyIdentityKey(user, loadingSession);
}
