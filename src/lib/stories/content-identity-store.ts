/**
 * V16 — persisted Story editorial identity + Stage 2 scheduling policy.
 *
 * Everything here is pure or localStorage-only; no network, no Supabase.
 */

export const STORY_IDENTITY_KEY = "irth.story_content_identity.v1";

/** Stage 2 runs at most once per this window (C: ~10–15 minutes). */
export const STAGE2_MIN_INTERVAL_MS = 12 * 60 * 1000;

/** How many benign (reaction-only) timestamps we remember. */
export const BENIGN_HISTORY_LIMIT = 8;

export interface StoryContentIdentity {
  v: 1;
  /** Canonical SHA-256 editorial fingerprint of the applied content. */
  fingerprint: string | null;
  /** Applied manifest counts, per local collection key. */
  counts: Record<string, number>;
  /** Applied editorial timestamps for scenes / media / collections. */
  editorial: Record<string, string | null>;
  /** The `stories.last_updated` value observed when identity was recorded. */
  observed_stories_updated_at: string | null;
  /** `stories.last_updated` values proven to carry no editorial change. */
  benign_stories_updated_at: string[];
  /** Epoch ms of the last Stage 2 verification attempt. */
  last_verified_at: number | null;
  /** Epoch ms of the last successful content apply. */
  applied_at: number | null;
}

export function emptyStoryIdentity(): StoryContentIdentity {
  return {
    v: 1,
    fingerprint: null,
    counts: {},
    editorial: {},
    observed_stories_updated_at: null,
    benign_stories_updated_at: [],
    last_verified_at: null,
    applied_at: null,
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStoryIdentity(): StoryContentIdentity {
  const s = storage();
  if (!s) return emptyStoryIdentity();
  try {
    const raw = s.getItem(STORY_IDENTITY_KEY);
    if (!raw) return emptyStoryIdentity();
    const parsed = JSON.parse(raw) as Partial<StoryContentIdentity>;
    if (!parsed || parsed.v !== 1) return emptyStoryIdentity();
    return { ...emptyStoryIdentity(), ...parsed };
  } catch {
    return emptyStoryIdentity();
  }
}

export function writeStoryIdentity(next: StoryContentIdentity): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORY_IDENTITY_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — identity is an optimisation, never required */
  }
}

/** Remember a `stories.last_updated` that verifiably carried no edit. */
export function withBenignTimestamp(
  identity: StoryContentIdentity,
  ts: string | null,
): StoryContentIdentity {
  if (!ts) return identity;
  const list = [ts, ...identity.benign_stories_updated_at.filter((x) => x !== ts)];
  return { ...identity, benign_stories_updated_at: list.slice(0, BENIGN_HISTORY_LIMIT) };
}

export function isKnownBenign(
  identity: StoryContentIdentity,
  ts: string | null,
): boolean {
  if (!ts) return true;
  return (
    identity.observed_stories_updated_at === ts ||
    identity.benign_stories_updated_at.includes(ts)
  );
}

/**
 * Stage 2 gate (D + C): a stories-only candidate may be verified when it is a
 * NEW timestamp, we are online, and the throttle window has elapsed.
 */
export function shouldRunStage2(args: {
  identity: StoryContentIdentity;
  candidateTimestamp: string | null;
  nowMs: number;
  online: boolean;
}): boolean {
  const { identity, candidateTimestamp, nowMs, online } = args;
  if (!online) return false;
  if (!candidateTimestamp) return false;
  if (isKnownBenign(identity, candidateTimestamp)) return false;
  const last = identity.last_verified_at;
  if (typeof last === "number" && nowMs - last < STAGE2_MIN_INTERVAL_MS) return false;
  return true;
}

/** Record a full applied identity after a successful content update (D). */
export function recordAppliedIdentity(args: {
  fingerprint: string | null;
  counts: Record<string, number>;
  editorial: Record<string, string | null>;
  observedStoriesUpdatedAt: string | null;
  nowMs: number;
}): StoryContentIdentity {
  const next: StoryContentIdentity = {
    v: 1,
    fingerprint: args.fingerprint,
    counts: { ...args.counts },
    editorial: { ...args.editorial },
    observed_stories_updated_at: args.observedStoriesUpdatedAt,
    benign_stories_updated_at: args.observedStoriesUpdatedAt
      ? [args.observedStoriesUpdatedAt]
      : [],
    last_verified_at: args.nowMs,
    applied_at: args.nowMs,
  };
  writeStoryIdentity(next);
  return next;
}
