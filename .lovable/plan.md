# Plan - V13 Guest Profile Isolation Fix

Physical diagnostics proved that after Logout, the `activeOwner` correctly switches to Guest, but `ProfileProvider` hydrates with Account A's data.

## Problem Analysis

1.  **Identity Switch Flow**: When Logout occurs, `resetForIdentityChange` is called. It updates the `activeOwner` via `setActiveOwnerInternal`.
2.  **Storage Partitioning**: The partition engine (`mapKey`) uses `getActiveOwner()` to resolve physical keys. Once `activeOwner` is Guest, all `localStorage.getItem` calls for personal keys should target the Guest partition.
3.  **The Leak**: The `migrateLegacyKeys` function in `partition.ts` runs during `installIdentityPartition`. It moves "legacy" (unpartitioned) keys into the partition of the *active owner at boot time*. If a user was logged in, their data was migrated from `hakaya.profile.v2` to `hakaya.profile.v2::owner=user:<A>`.
4.  **The Root Cause**: `Storage.getItem` was patched to wrap the key with the current owner. However, it *did not have a fallback mechanism*. If a key exists in the "global" (legacy) namespace but NOT in the current partition, `getItem` would return `null`.
5.  **Re-Pollution**: In `ProfileProvider`, when a logout happens:
    - `activeOwner` becomes `guest`.
    - `ProfileProvider` catches the event and calls `hydrateFromStorage`.
    - `localStorage.getItem("hakaya.profile.v2")` is called.
    - The partition engine resolves this to `hakaya.profile.v2::owner=guest:<device>`.
    - If this guest partition is empty (new device or fresh logout), it returns `null`.
    - `ProfileProvider` then (due to the `useEffect` logic) might still have stale state OR, more critically, the **migration logic or a legacy fallback** is incorrectly returning Account A's data to the Guest.

**Wait**, if the Guest is seeing Account A's data, it means either:
- The `guest` physical key is already polluted with A's data.
- OR the `getItem` call is failing to be partitioned and hitting the global key which still holds A's data (if migration failed to delete it).
- OR `migrateLegacyKeys` ran while Guest was active but A's data was in the global namespace.

Actually, looking at `partition.ts`, `migrateLegacyKeys` removes the legacy key after copying: `store.removeItem(k)`.

**Decision**: I will instrument `partition.ts` to log exactly which physical key is being hit and what the "raw" localStorage value is for both global and partitioned keys during the failing hydrate.

## Proposed Changes

### 1. Instrumentation (Diagnostic)
Add more granular logging to `mapKey` and `getItem` in `src/lib/identity/partition.ts` to see if the global key still exists and what's in the partitioned key.

### 2. Fix - Logical Isolation
- Ensure `migrateLegacyKeys` NEVER runs for a Guest owner if an authenticated session exists.
- Ensure `getItem` for personal keys NEVER falls back to the global/legacy key if the active owner is Guest and the global key looks like it belongs to a user (e.g. `loggedIn: true`).

## Technical Details

### `src/lib/identity/partition.ts`
- Enhance `mapKey` to log when a key is personal.
- In `getItem`, if the partitioned read returns `null`, check the global key. If the global key exists, LOG IT.
- If the global key exists and we are Guest, we must decide if it's safe to adopt. **Correction**: We should probably never adopt a global key into Guest if it has `loggedIn: true`.

### `src/lib/profile.tsx`
- Ensure `initial` state is truly clean (it is).
- Verify that `setProfile(initial)` in `onIdentityChange` is effectively clearing the UI before the new hydrate.

## Final Report Requirements
- **Exact physical key**: Will be identified via logs.
- **Root cause category**: Likely "Legacy Fallback" or "Polluted Guest Partition".
- **Functional account behavior**: Preserved.
- **Typecheck**: `npm run build:android:web`.
