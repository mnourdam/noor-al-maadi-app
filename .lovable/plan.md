# Plan - Implement Symmetric Friend Comparison (V12 BUG 2)

Implement a minimal safe fix to ensure friend comparisons are symmetric by anchoring both "Me" and "Friend" stats to the server's public profile authoritative source.

## Proposed Changes

### 1. Unified Data Fetching (`src/routes/compare.$id.tsx`)
- Update `ComparePage` to manage a new `meProfile` state (public projection).
- Implement a `useEffect` that:
  - Calls `syncNow()` from `AccountProvider` if authenticated to flush latest local stats to the cloud.
  - Fetches both the current user's profile and the friend's profile using `fetchGatedProfileById`.
  - Parallelizes these fetches for efficiency.
- Remove the derivation of "Me" stats from the local `useProfile()` hook.
- Ensure the `Side` component and internal memos consume the fetched `meProfile` instead of local state.

### 2. Loading and Offline Resilience
- Add a unified loading state that covers the initial sync and both profile fetches.
- Implement a symmetric "Comparison Unavailable" view if the user is offline or the server fetch fails, preventing the fallback to asymmetric local data.

### 3. Loop Prevention
- Ensure `syncNow` is called only once per route mount or user change.
- Stabilize the fetch triggers to prevent redundant network requests.

## Technical Details
- **Data Source**: `fetchGatedProfileById(id)` from `src/lib/social.ts`.
- **Sync Trigger**: `syncNow()` from `AccountProvider` context.
- **State Partitioning**: Maintain a clear separation between the "UI-local" profile (used for gameplay) and the "Comparison-public" profile (fetched from the server).
- **No Schema Changes**: Purely a frontend orchestration fix; RLS and RPCs remain untouched.

## Verification Plan

### 1. Automated Checks
- `bun run typecheck`
- `npm run build` (Production build verification)

### 2. Runtime/Preview Verification
- Create a Playwright script to simulate the comparison flow.
- Verify that `fetchGatedProfileById` is called for both IDs.
- Verify that local profile changes (mocked) do not appear in comparison until a sync occurs.
- Verify offline behavior by intercepting network requests.

### 3. Manual Verification Checklist
- [ ] Self source: `fetchGatedProfileById` (YES)
- [ ] Friend source: `fetchGatedProfileById` (YES)
- [ ] Local/Server mixing removed (YES)
- [ ] `syncNow` runs once safely (YES)
- [ ] Symmetry A→B / B→A (PASS)
- [ ] Offline/Unavailable behavior (PASS)
- [ ] No sync loops (PASS)
