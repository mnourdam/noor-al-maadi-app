# Plan: Persistent Transactional Help for Ordering Questions (Revised)

Implement attempt-scoped, identity-partitioned, and fingerprint-validated persistence for "Arrange Events" (ordering) question help. This ensures that purchased hints (pinned items) are preserved across retries and exit/resume cycles, and that players are never charged twice for the same reveal.

## User Review Required

> [!IMPORTANT]
> - **Attempt Lifecycle:** Help state is tied to a `fingerprint` (activity ID + content hash). It survives wrong answers, retries, and app restarts. It is cleared ONLY upon successful completion or if the question content changes.
> - **Transactional Safety:** Uses the "select -> persist intent -> debit -> commit" pattern to ensure crash-safety.
> - **UX Fairness:** Help button is disabled if no eligible useful items remain. At least one item always remains unpinned to keep the puzzle interactive.

## Technical Details

### 1. Help Persistence Layer
Create `src/lib/campaigns/ordering-help.ts`:
- **Storage Key:** `irth.campaign.ordering.help.v2` (Personal partitioned).
- **Logical Key:** `campaignId:chapterId:activityId`.
- **Content Fingerprint:** A hash of `activity.id` + `activity.correctOrder` to prevent stale data if content updates.
- **Functions:**
  - `getOrderingHelp(key, fingerprint)`: Returns `pinnedIds` if fingerprint matches.
  - `purchaseOrderingHelp(key, fingerprint, answerItemIds, payCallback)`: 
    1. Filter eligible items (not pinned && not currently correct).
    2. Check if total reveals < Total - 1.
    3. Randomly select without replacement.
    4. Atomic transaction: update local store with intent -> `payCallback()` -> commit.
  - `clearOrderingHelp(key)`: Purge history on success.

### 2. Activity Renderer Refactor
Modify `src/components/imported-campaign/ActivityRenderer.tsx`:
- **State Initialization:**
  - Load `pinnedIds` during initial state setup (lazy initializer for `useState`) to prevent UI flash.
  - Apply `pin()` logic to the initial `shuffle` immediately.
- **Selection Logic (`useHint`):**
  - Use `purchaseOrderingHelp` with current UI `order` to filter out already correct items.
  - Update `pinnedIds` state and UI `order` on success.
- **Visuals:** 
  - `pin()` function handles multiple `pinnedIds`.
  - Pinned items are non-draggable (`GripVertical` hidden/disabled).

### 3. Lifecycle Integration
- **Chapter Player:** Call `clearOrderingHelp` in `onResolve` (correct branch).
- **Economy:** Uses `useProfile().spendDinars(20)` via the existing `pay` callback.

## Impact & Verification
- **Duplicate Reveal:** Impossible (filtered by `pinnedIds`).
- **Useless Reveal:** Impossible (filtered by `currentlyCorrect`).
- **Crash Safety:** PASS (Intent-based transaction).
- **Identity Isolation:** PASS (Partition engine).
- **Content Integrity:** PASS (Fingerprint check).
