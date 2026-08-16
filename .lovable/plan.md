# Plan: Persistent Transactional Help for Ordering Questions

Implement attempt-scoped, identity-partitioned persistence for "Arrange Events" (ordering) question help. This ensures that purchased hints (pinned items) are preserved across retries and exit/resume cycles within the same attempt, and that players are never charged twice for the same reveal.

## User Review Required

> [!IMPORTANT]
> - **Attempt Lifecycle:** The help history is tied to an `attemptId` which is currently derived from `wrongAttempts` (resetting on successful completion or chapter re-entry). If you want history to survive across *separate* entry-and-exit sessions for a chapter that is not yet completed, we will use the `campaignId:chapterId:activityId` as the logical key, but add a `nonce` check if the question itself changes structure.
> - **Retry Logic:** Clicking "Retry" in the current UI re-mounts the activity with a new key. The new persistent layer will automatically re-apply previously purchased pins based on the activity ID.

## Technical Details

### 1. Help Persistence Layer
Create `src/lib/campaigns/ordering-help.ts` following the pattern in `who-am-i-help.ts`:
- **Storage Key:** `irth.campaign.ordering.help.v1` (partitioned automatically).
- **Data Shape:**
  ```ts
  Record<string, { pinnedIds: string[] }> // Keyed by activity logical key
  ```
- **Logical Key:** `activityKey(campaignId, chapterId, activityId)`.
- **Functions:**
  - `getOrderingHelp(key)`: Returns previously pinned IDs.
  - `purchaseOrderingHelp(key, itemId, payCallback)`: Atomic "pay then persist" transaction.
  - `clearOrderingHelp(key)`: Removes history upon activity success.

### 2. Activity Renderer Refactor
Modify `src/components/imported-campaign/ActivityRenderer.tsx`:
- **State Migration:** Change `pinnedId: string | null` to `pinnedIds: string[]`.
- **Initialization:** Use `useEffect` or `useMemo` to load `pinnedIds` from `getOrderingHelp` on mount.
- **Selection Logic (`useHint`):**
  - **Eligible Items:** `all items` MINUS `pinnedIds` MINUS `currently correctly placed items`.
  - **Selection:** Random pick from eligible items.
  - **Safety:** Stop if 0 eligible items or if only 1 item remains unpinned/incorrect.
  - **Transaction:** Call `purchaseOrderingHelp` before applying the visual pin.
- **Visuals:** Ensure `pin()` function handles multiple IDs to keep them locked at their correct indices.

### 3. Cleanup
- In `ImportedChapterPlayer` (onResolve correct branch): call `clearOrderingHelp` to purge the history for that activity once it's solved.

## Impact
- **Duplicate Reveal:** Impossible (filtered out).
- **History Survival:** PASS (Durable storage).
- **Identity Isolation:** PASS (Partition engine).
- **Economy Safety:** PASS (Atomic transaction).
