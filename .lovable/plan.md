# Plan - Implement Symmetric Friend Comparison (V12 BUG 2)

Implement a minimal safe fix to ensure friend comparisons are symmetric by anchoring both "Me" and "Friend" stats to the server's public profile authoritative source, following a strict synchronization sequence.

## Proposed Changes

### 1. Unified Data Fetching (`src/routes/compare.$id.tsx`)
- Update `ComparePage` to manage a new `meProfile` state (public projection) alongside the `other` profile state.
- Implement a `useEffect` that follows this strict sequence:
  1. **Sync First**: `await syncNow()` from `AccountProvider` if authenticated to flush latest local stats to the cloud.
  2. **Fetch authoritative snapshots**: ONLY after `syncNow` finishes, `await Promise.all([fetchGatedProfileById(currentUserId), fetchGatedProfileById(friendId)])`.
- Completely remove the derivation of "Me" stats from the local `useProfile()` hook within the comparison logic.
- Ensure all comparison statistics are rendered exclusively from these server-side snapshots.

### 2. Loading and Offline Resilience
- Add a unified loading state covering the sync and subsequent fetches.
- If `syncNow` or the fetches fail (offline/server unavailable), show a symmetric "Comparison Unavailable" view with a retry option.
- Explicitly avoid falling back to asymmetric local/server data on failure.

### 3. Loop Prevention
- Ensure `syncNow` is called exactly once per mount or user change using a ref or stable dependency.
- Prevent redundant network requests on rerenders.

## Technical Details
- **Sequence**: `syncNow()` -> `fetchGatedProfileById` (self & friend).
- **Data Source**: Authoritative server-side public projection for both sides.
- **Constraints**: No changes to RPC, RLS, database schema, campaign progression, or XP/Level formulas.

## Verification Plan

### 1. Automated Checks
- `bun run typecheck`
- `npm run build:android:web` (Crucial for Android parity verification)

### 2. Runtime/Preview Verification
- Verify the `syncNow` await sequence via logs/tracing.
- Confirm both sides use the same RPC source.
- Verify that local mutations don't appear in comparison until sync completes.
- Test offline/error states to ensure symmetry is maintained.

### 3. Manual Verification Checklist
- [ ] syncNow awaited before profile fetch (YES)
- [ ] Self/friend fetch parallel AFTER sync (YES)
- [ ] Local profile removed from comparison calculation (YES)
- [ ] A→B / B→A symmetry (PASS)
- [ ] Offline/error state (PASS)
- [ ] Duplicate sync loop (NONE)
- [ ] Typecheck (PASS)
- [ ] npm run build:android:web (PASS)

