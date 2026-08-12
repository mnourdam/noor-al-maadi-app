# Plan: Daily Challenges Hardening (Local-First)

Implement a systemic fix for the Daily Challenges delay by decoupling it from the network/auth boot chain and enabling local-first rendering via `OfflineSnapshot` with layout stability.

## User Review Required

> [!IMPORTANT]
> This plan modifies the data loading strategy for Daily Challenges to prioritize local storage while keeping background refreshes. Completion and reward logic remain untouched.

## Proposed Changes

### 1. Data Access Layer
#### `src/lib/games/store.ts`
- Implement `localListPublishedGames()`: Synchronously returns published games from `local-first-store.ts`.
- Returns `[]` if snapshot is missing/invalid.

### 2. Service Layer
#### `src/lib/games/dailyChallengeService.ts`
- **Identity Decoupling**: Replace `resolveUserKey()` with `getActiveOwner()` from `identity/owner.ts`.
- **Meaningful Comparison**: Implement a fingerprint/checksum check for the Game Catalogue. Only trigger persistence and re-render if the catalogue content (IDs + `updated_at`) actually changes.
- **Local-First Loading**:
    1. Synchronous Mount: Check `localListPublishedGames()`. If valid content exists, compute rotation and render immediately.
    2. Parallel Background Refresh: Start network fetch. Compare results with meaningful fingerprint. Update and persist only if changed.

### 3. UI Layer
#### `src/components/home/DailyChallengesSection.tsx`
- Remove `if (!state) return null;`.
- **Layout Stability**: Implement a stable Skeleton that matches the expected height of two challenge cards (approx. 320px-400px depending on breakpoint) to prevent layout shifts.
- Skeleton only appears on Fresh Install where no local snapshot exists yet.

### 4. Coordination
#### `src/lib/local-first-store.ts`
- Ensure `isLocalReady()` and the games collection are accessible for synchronous reads.

## Technical Details

- **Auth Source**: `getActiveOwner()` is used for synchronous partitioning. `irth:identity-changed` listener already handles state reset for User A -> User B transitions.
- **Starvation Fix**: Initialization is moved to the component mount, bypassing `scheduleIdle`.
- **Fingerprint**: `JSON.stringify(rows.map(r => [r.id, r.updated_at]))` or similar stable sorting to detect content drift beyond simple length checks.

## Constraints & Risk
- **Risk**: Snapshot loading race.
- **Mitigation**: `ensureLocalSnapshotLoaded()` is awaited only in the background refresh path; the initial render uses the synchronous `isLocalReady()` check.

