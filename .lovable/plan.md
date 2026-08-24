# Performance Fix Plan - Physical Android Sync Optimization

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

#### [src/lib/stories/summary.ts]
- Implement a module-level `inflightSummary` promise map keyed by `(userId ?? 'guest') + worldSlug`.
- Coalesce identical concurrent Story summary requests.

#### [src/lib/campaignRecommendationService.ts]
- Implement a deep-equality check for the `cloudCampaign` Map.
- Prevent publishing a new Map instance if the semantically identical data is received.
- Add a 100ms debounce to the `tick` and `progressTick` listeners to ignore high-frequency sync bursts.

### Identity & Auth Lifecycle

#### [src/lib/identity/reset.ts]
- Add an early-return check in `resetForIdentityChange`: if `previous === next`, bypass partition switching, cache clearing, and module resets.
- Ensure `setAuthReady(true)` is still called to signal readiness.

#### [src/lib/account.tsx]
- Coalesce `INITIAL_SESSION` and `SIGNED_IN` events if they occur for the same user within the same boot cycle.

### Diagnostics & Instrumentation

#### [src/lib/offline/flush.ts]
- Move the `OUTBOX_FLUSH_START` log statement inside the `if (!inflight)` block to ensure logs accurately represent actual executions.

#### [src/components/AccountDiagPanel.tsx]
- Update the title to "V13 Post-Optimization Forensic Trace".

## Technical Details

- **Single-Flight Pattern**:
  ```typescript
  const inflight = new Map<string, Promise<T>>();
  async function fetch(uid: string) {
    if (inflight.has(uid)) return inflight.get(uid);
    const p = (async () => { ... })();
    inflight.set(uid, p);
    try { return await p; } finally { inflight.delete(uid); }
  }
  ```
- **Map Equality**: We will compare Map size and keys/values to detect identity before `setMap(next)`.

## Verification Plan

### Automated Tests
- Run `vitest` on `progression.test.ts` and `identity.test.ts` to ensure no regressions in core logic.

### Manual Verification
- Check `/tmp/observability/build-errors.log` for compilation errors.
- The user will perform a final physical Android trace to verify the reduction in redundant logs/requests.
