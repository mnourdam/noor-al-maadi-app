// ============================================================
// Campaign Intros — local state (Stage 3)
// ------------------------------------------------------------
// SHOW-ONCE CONTRACT (frozen):
//   An intro is shown at most once per (identity × campaign × version).
//   The decision is made from a synchronous local read — never from the
//   network — so a reload, a back navigation from a chapter, or a cold
//   start can never replay it. The only way back is the explicit
//   `resetCampaignIntro()` replay hatch (admin / "watch again").
//
// The storage key starts with `irth.` and is NOT in the shared prefix
// list, so the identity partition layer physically scopes it per owner
// (`guest:<device>`, `user:<A>`, `user:<B>`) automatically.
// ============================================================

import type {
  CampaignIntroRef,
  CampaignIntroState,
  CampaignIntroStatus,
} from "./types";
import { introStateKey, strongerIntroStatus } from "./types";

const STORE_KEY = "irth.campaign.intro.state.v1";

type Store = Record<string, CampaignIntroState>;

function canUseStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function readStore(): Store {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode — the gate degrades to "show", never to a crash */
  }
}

/** Synchronous read of the record for one (campaign, version). */
export function readCampaignIntroState(
  ref: CampaignIntroRef,
): CampaignIntroState | null {
  return readStore()[introStateKey(ref.campaignId, ref.version)] ?? null;
}

/** All locally known records for a campaign, any version. */
export function readCampaignIntroHistory(
  campaignId: string,
): CampaignIntroState[] {
  return Object.values(readStore()).filter((r) => r?.campaignId === campaignId);
}

/**
 * THE decision function.
 * `true` only when this exact version has never been resolved
 * (completed / skipped) by the active identity.
 */
export function shouldShowCampaignIntro(ref: CampaignIntroRef | null): boolean {
  if (!ref) return false;
  const record = readCampaignIntroState(ref);
  if (!record) return true;
  return record.status === "started";
}

/**
 * Idempotent, synchronous write. Never downgrades an existing status
 * (completed > skipped > started) and never rewinds `lastSceneIndex`.
 */
export function writeCampaignIntroState(
  ref: CampaignIntroRef,
  patch: { status: CampaignIntroStatus; lastSceneIndex?: number },
): CampaignIntroState {
  const store = readStore();
  const key = introStateKey(ref.campaignId, ref.version);
  const now = new Date().toISOString();
  const prev = store[key];

  const status = prev
    ? strongerIntroStatus(prev.status, patch.status)
    : patch.status;

  const next: CampaignIntroState = {
    campaignId: ref.campaignId,
    storyId: ref.storyId,
    version: ref.version,
    status,
    lastSceneIndex: Math.max(
      prev?.lastSceneIndex ?? 0,
      Math.max(0, Math.trunc(patch.lastSceneIndex ?? 0)),
    ),
    firstStartedAt: prev?.firstStartedAt ?? now,
    resolvedAt:
      status === "started" ? (prev?.resolvedAt ?? null) : (prev?.resolvedAt ?? now),
  };

  store[key] = next;
  writeStore(store);
  return next;
}

export function markCampaignIntroStarted(ref: CampaignIntroRef) {
  return writeCampaignIntroState(ref, { status: "started" });
}

export function markCampaignIntroCompleted(
  ref: CampaignIntroRef,
  lastSceneIndex = 0,
) {
  return writeCampaignIntroState(ref, { status: "completed", lastSceneIndex });
}

export function markCampaignIntroSkipped(
  ref: CampaignIntroRef,
  lastSceneIndex = 0,
) {
  return writeCampaignIntroState(ref, { status: "skipped", lastSceneIndex });
}

/** Scene bookmark. Local + synchronous; server sync is debounced in stage 4. */
export function recordCampaignIntroScene(
  ref: CampaignIntroRef,
  sceneIndex: number,
) {
  return writeCampaignIntroState(ref, { status: "started", lastSceneIndex: sceneIndex });
}

/**
 * Merge a SERVER record into the local store (Stage 4 restore path).
 * Strictly strengthening: it can raise the status, advance the scene
 * bookmark, or back-date `firstStartedAt` — never the reverse, and it
 * never influences the (purely local) display decision beyond that.
 * Returns `true` when the local record actually changed.
 */
export function mergeCampaignIntroRecord(remote: {
  campaignId: string;
  storyId: string;
  version: number;
  status: CampaignIntroStatus;
  lastSceneIndex?: number;
  firstStartedAt?: string;
  resolvedAt?: string | null;
}): boolean {
  if (!remote?.campaignId) return false;
  const store = readStore();
  const key = introStateKey(remote.campaignId, remote.version);
  const prev = store[key];

  const status = prev ? strongerIntroStatus(prev.status, remote.status) : remote.status;
  const lastSceneIndex = Math.max(
    prev?.lastSceneIndex ?? 0,
    Math.max(0, Math.trunc(remote.lastSceneIndex ?? 0)),
  );
  const firstStartedAt = (() => {
    const candidates = [prev?.firstStartedAt, remote.firstStartedAt].filter(
      (v): v is string => typeof v === "string" && !!v,
    );
    if (!candidates.length) return new Date().toISOString();
    return candidates.sort()[0];
  })();
  const resolvedAt =
    status === "started"
      ? (prev?.resolvedAt ?? null)
      : (prev?.resolvedAt ?? remote.resolvedAt ?? new Date().toISOString());

  const next: CampaignIntroState = {
    campaignId: remote.campaignId,
    storyId: prev?.storyId || remote.storyId || "",
    version: remote.version,
    status,
    lastSceneIndex,
    firstStartedAt,
    resolvedAt,
  };

  if (
    prev &&
    prev.status === next.status &&
    prev.lastSceneIndex === next.lastSceneIndex &&
    prev.firstStartedAt === next.firstStartedAt &&
    (prev.resolvedAt ?? null) === (next.resolvedAt ?? null) &&
    prev.storyId === next.storyId
  ) {
    return false;
  }

  store[key] = next;
  writeStore(store);
  return true;
}

/**
 * EXPLICIT replay hatch — the ONLY way an already-resolved intro can be
 * shown again. Nothing in the runtime calls this implicitly.
 */
export function resetCampaignIntro(ref: CampaignIntroRef): void {
  const store = readStore();
  delete store[introStateKey(ref.campaignId, ref.version)];
  writeStore(store);
}

/** Test / diagnostics helper. */
export function __clearCampaignIntroStates(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

export const CAMPAIGN_INTRO_STORE_KEY = STORE_KEY;
