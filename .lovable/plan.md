# Performance Fix Plan - Physical Android Sync Optimization (Corrected)

This plan addresses severe synchronization performance issues identified in physical Android diagnostics (V13). It focuses on eliminating redundant network requests and coalescing burst events without changing data semantics or account isolation.

## User Review Required

> [!IMPORTANT]
> This fix optimizes *timing* and *concurrency*. It does not change how Hearts, XP, or Unlocks work. Account isolation remains strictly enforced.

- **Soft Timeout**: The 5-second safety timer is preserved.
- **Local-First**: Home will continue to render immediately from local state while cloud sync happens in the background.

## Proposed Changes

### Core Synchronization & Request Coalescing

#### [src/lib/campaigns/completions.ts]
- Implement a module-level `inflightFetch` promise map keyed by `userId`.
- Multiple concurrent calls for the same user will share the same fetch promise.
- Results are validated against the current `userId` before being returned.
- Use `finally` to remove the promise from the map.

#### [src/lib/stories/summary.ts]
- Implement a module-level `inflightSummary` promise map keyed by `(userId ?? 'guest') + (worldSlug ?? '')`.
- Coalesce identical concurrent Story summary requests.
- Use `finally` to remove the promise from the map.
- Ensure stale results from a previous owner are never committed if identity changes while pending.

#### [src/lib/campaignRecommendationService.ts]
- Implement semantic equality suppression at the state source (`useCloudCampaignProgressLocal`).
- Before calling `setMap`, check if the next Map has identical size, keys, and values. Return the current reference if identical.
- Add a 100ms debounce to the `tick` and `progressTick` listeners to ignore high-frequency sync bursts.

### Identity & Auth Lifecycle

#### [src/lib/identity/reset.ts]
- Correct same-user deduplication in `resetForIdentityChange`.
- Only suppress the event if: same logical owner AND the same identity generation is already being initialized or has just finished AND the partition is already switched AND local hydration has started/completed.
- Ensure first authenticated initialization after cold boot, Guest <-> User, and User A <-> User B transitions always perform full work.

#### [src/lib/account.tsx]
- Coalesce `INITIAL_SESSION` and `SIGNED_IN` events if they occur for the same user during the same boot cycle.
- Ensure late cloud responses after soft-timeout converge data without triggering redundant fetch/recommendation storms.

### Diagnostics & Outbox

#### [src/lib/offline/flush.ts]
- Move the `OUTBOX_FLUSH_START` log statement inside the `if (!inflight)` block to ensure logs accurately represent actual executions.
- Preserve existing outbox single-flight and payload semantics.

## Technical Details

- **Semantic Map Equality**:
  ```typescript
  function mapsAreEqual(a: Map<string, Set<string>>, b: Map<string, Set<string>>) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      const bv = b.get(k);
      if (!bv || bv.size !== v.size) return false;
      for (const item of v) if (!bv.has(item)) return false;
    }
    return true;
  }
  ```

## Verification Plan

### Automated Tests
- Run `vitest` on `progression.test.ts` and `identity.test.ts` to ensure no regressions in core logic.

### Manual Verification
- Check `/tmp/observability/build-errors.log` for compilation errors.
- The user will perform a final physical Android trace to verify the reduction in redundant logs/requests.
