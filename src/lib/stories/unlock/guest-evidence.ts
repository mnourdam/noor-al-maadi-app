// ============================================================
// Stories — GUEST unlock evidence (device is the authority)
// ------------------------------------------------------------
// Policy (approved): a signed-out player must get the *same*
// progression experience as a signed-in one. Only the storage
// location differs.
//
//   Guest         → local device state is the unlock authority.
//   Authenticated → server state is the unlock authority.
//
// This module collects the device's local progression into a
// single serialisable "evidence" object. It is used in two places:
//
//   1. Online: passed to `list_stories_guest_v3` /
//      `get_story_bundle_guest_v2`, which are anon-only mirrors of
//      the authoritative RPCs — the server renders content but the
//      unlock decision comes from this evidence.
//   2. Offline: fed straight into the local `evaluateStoryUnlock`.
//
// Nothing here grants rewards. Guest rewards remain guest-local,
// and on sign-in `syncLocalDiscoveriesToServer` promotes the local
// discoveries into `user_entity_discoveries` idempotently, after
// which the server becomes the authority again.
// ============================================================

import { getLocalDiscoveries } from "@/lib/entityDiscoveries";
import { guestCompletionsSnapshot } from "@/lib/stories/guestCompletions";
import { localCompletedIds } from "@/lib/campaigns/completions";
import type { PlayerUnlockState } from "./local";

export interface GuestUnlockEvidence {
  discovered: string[];
  atlas: string[];
  stories: string[];
  campaigns: string[];
  investigations: string[];
  achievements: string[];
  artifacts: string[];
  level: number;
}

function safeSet(fn: () => Set<string>): Set<string> {
  try { return fn(); } catch { return new Set(); }
}

/** Snapshot of everything the device knows about the guest's progress. */
export function buildGuestEvidence(): GuestUnlockEvidence {
  const discovered: string[] = [];
  const atlas: string[] = [];
  try {
    for (const d of Object.values(getLocalDiscoveries("guest"))) {
      if (!d?.id) continue;
      discovered.push(d.id);
      if (d.type === "atlas_location") atlas.push(d.id);
    }
  } catch { /* storage unavailable */ }

  return {
    discovered,
    atlas,
    stories: [...safeSet(guestCompletionsSnapshot)],
    campaigns: [...safeSet(localCompletedIds)],
    investigations: [],
    achievements: [],
    artifacts: [],
    level: 0,
  };
}

/** Same evidence, shaped for the local (offline) evaluator. */
export function guestUnlockState(
  evidence: GuestUnlockEvidence = buildGuestEvidence(),
): PlayerUnlockState {
  return {
    discovered_entity_ids: new Set(evidence.discovered),
    visited_atlas_location_ids: new Set([...evidence.atlas, ...evidence.discovered]),
    owned_artifact_ids: new Set([...evidence.artifacts, ...evidence.discovered]),
    completed_story_ids: new Set(evidence.stories),
    completed_campaign_ids: new Set(evidence.campaigns),
    completed_investigation_ids: new Set(evidence.investigations),
    unlocked_achievement_ids: new Set(evidence.achievements),
    player_level: evidence.level,
  };
}
