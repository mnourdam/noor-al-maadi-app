# Production Hotfix Plan — Two Surgical Fixes

## Problem 1: Locked Story Return
Navigating from a locked story to a required encyclopedia entry loses the story context on "Back", returning the user to the generic encyclopedia list instead of the story.

## Problem 2: Home Hero Reload Regression
Navigating away from Home and back causes the Hero to show "جاري تحميل..." for up to 15s, even when trusted local progress exists, due to React Query re-validation and reconciliation state resets during remount.

---

## Proposed Changes

### Fix 1: Locked Story Navigation Origin
1.  **`src/routes/story.$id.tsx`**: Add `useStashCurrentAsOrigin` to the `StoryRoute` component.
2.  **`src/components/stories/LockedStoryDialog.tsx`**:
    *   Inject the `stash` helper from `useStashCurrentAsOrigin`.
    *   Update `go(to)` to call `stash(to)` before navigating, establishing the current story as the origin for the encyclopedia destination.
3.  **`src/routes/encyclopedia.entity.$id.tsx`**: Ensure the back action uses the navigation engine's `useBack()` (which prioritizes origins) instead of a blind parent link.

### Fix 2: Home Hero Fast Path
1.  **`src/lib/campaignRecommendationService.ts`**:
    *   Update `useCampaignRecommendation` to track the identity epoch (`getIdentityEpoch`).
    *   Introduce a `isFastPathReady` state that becomes true once reconciliation is terminal for the *current* identity epoch.
    *   Allow `ready: true` if `isFastPathReady` is true AND `campaigns` are already available (even if `isSuccess` is false due to a background refetch).
    *   Reset `isFastPathReady` immediately if the identity epoch changes.

---

## Technical Details

### Navigation Engine Integration
*   Use `useStashCurrentAsOrigin` to capture `{ route: "/story/$id", params: { id } }`.
*   The `useBack()` hook in the engine already handles `Priority 3 — navigation origin` for player routes.

### Identity Epoch Guard
*   The `IdentityEpoch` (from `src/lib/identity/owner.ts`) is a monotonic counter bumped by `setActiveOwnerInternal`.
*   By keying the "fast path" to this epoch, we guarantee that cached data from a previous user never leaks into a new session.

## Verification Plan

### Automated Tests
*   `npm run typecheck`
*   `npm run build:android:web`

### Manual Verification Scenarios
1.  **Locked Story → Entity → Back**: Should land back in the Story Player/Dialog.
2.  **Encyclopedia List → Entity → Back**: Should return to Encyclopedia List (normal behavior).
3.  **Home (Ready) → Encyclopedia → Home**: Hero should show content immediately (no "Loading..." flash).
4.  **Sign Out → Sign In (User B) → Home**: Should show "Loading..." until User B's reconciliation finishes (isolation check).
5.  **Offline Home Return**: Should show cached content immediately if owner matches.
