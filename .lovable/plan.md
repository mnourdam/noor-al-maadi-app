# Plan: Daily Challenges Hardening (Local-First)

Implement a systemic fix for the Daily Challenges delay by decoupling it from the network/auth boot chain and enabling local-first rendering via `OfflineSnapshot`.

## User Review Required

> [!IMPORTANT]
> This plan modifies the data loading strategy for Daily Challenges to prioritize local storage while keeping background refreshes. Completion and reward logic remain untouched.

## Proposed Changes

### 1. Data Access Layer
#### `src/lib/games/store.ts`
- Add `localListPublishedGames()` to read from `OfflineSnapshot` via `local-first-store.ts`.
- Ensure it returns an empty array if the snapshot is not yet loaded, allowing the system to fall back to the network.

### 2. Service Layer
#### `src/lib/games/dailyChallengeService.ts`
- **Identity Decoupling**: Replace `resolveUserKey()` (which calls `supabase.auth.getUser()`) with `getActiveOwner()` from `identity/owner.ts`.
- **Race/Starvation Prevention**: Refactor `loadDailyChallengeState` to accept an optional `games` array.
- **Local-First Loading**: Implement a two-stage load in the hook:
    1. Synchronous check: If `isLocalReady()` and data exists, render immediately.
    2. Background Refresh: Start a network fetch and update state only if different.

### 3. UI Layer
#### `src/components/home/DailyChallengesSection.tsx`
- Remove `if (!state) return null;`.
- Implement a lightweight skeleton/loading state when neither local nor network data is ready (Fresh Install case).
- Ensure the section renders immediately to prevent layout shifts.

### 4. Coordination
#### `src/lib/games/local-first-store.ts` (if needed)
- Export a helper to specifically access the `games` collection if not already clean.

## Technical Details

- **Auth Source**: `getActiveOwner()` returns `guest:<id>` or `user:<id>` synchronously by reading localStorage/session-cache at boot.
- **Starvation Fix**: Moving initialization out of `scheduleIdle` and removing the async `getUser()` dependency ensures the challenge block starts as soon as the Home component mounts.
- **Sync Strategy**: 
    - Render with Cache.
    - Fetch from Server.
    - If Server data > Cache (new games added), update and persist.
    - If Offline, stay with Cache.

## Constraints & Risk
- **Risk**: Slight layout shift if the local snapshot is empty but network returns data quickly.
- **Mitigation**: A stable skeleton with the same height as the title/subtitle block.
- **Identity Safety**: `getActiveOwner()` is already used for partitioned storage, ensuring guest/user isolation is preserved.
