# Plan: Persistent Transactional Help for Ordering Questions (Final)

Implement attempt-scoped, identity-partitioned, and fingerprint-validated persistence for "Arrange Events" (ordering) question help. This ensures that purchased hints (pinned items) are preserved across retries and exit/resume cycles, and that players are never charged twice for the same reveal, even in crash scenarios.

## User Review Required

> [!IMPORTANT]
> - **Crash-Safe Recovery:** Uses a "Select -> Persist Intent -> Debit -> Commit" flow. If a crash occurs after debit but before commit, the next mount will automatically complete the reveal of the *same* item without a second charge.
> - **Attempt Lifecycle:** Help state is tied to a `fingerprint` (activity content hash). It survives wrong answers and app restarts, clearing ONLY upon success or content change.
> - **UX Fairness:** Help button disables if no useful items remain, and at least one item is always left for the player to solve manually.

## Technical Details

### 1. Help Persistence & Recovery Layer
Create `src/lib/campaigns/ordering-help.ts`:
- **Logical Key:** `campaignId:chapterId:activityId`.
- **Personal Partitioned Storage:** `irth.campaign.ordering.help.v2`.
- **Fingerprint:** Hash of `activity.id` + `activity.correctOrder`.
- **Data Shape:**
  ```ts
  {
    pinnedIds: string[];
    pending?: { itemId: string; txId: string; at: string };
    fingerprint: string;
  }
  ```
- **Functions:**
  - `getOrderingState(key, fingerprint)`: Returns current state; validates fingerprint.
  - `purchaseOrderingHelp(key, fingerprint, currentOrder, payCallback)`:
    1. Filter eligible items (not pinned && not currently correct).
    2. Check if total reveals < Total - 1.
    3. Randomly select `itemId`.
    4. **Intent:** Save `{ pending: { itemId, txId: uuid, at: now } }` to storage.
    5. **Debit:** Call `payCallback(txId)`.
    6. **Commit:** Move `itemId` to `pinnedIds` and clear `pending`.
  - `recoverPendingOrderingHelp(key, fingerprint, checkPaidCallback, commitCallback)`:
    1. If `pending` exists, call `checkPaid(txId)`.
    2. If paid: move `itemId` to `pinnedIds` and call `commitCallback`.
    3. If not paid: clear `pending`.

### 2. Activity Renderer Refactor
Modify `src/components/imported-campaign/ActivityRenderer.tsx`:
- **State Initialization:** Load `pinnedIds` in `useState` initializer from `getOrderingState`.
- **Mount Effect:** Call `recoverPendingOrderingHelp` to handle any crashes.
- **Selection Logic (`useHint`):** Use `purchaseOrderingHelp` to manage the transaction.
- **Visuals:** Pinned items are non-draggable and fixed at `correctIndexOf(id)`.

### 3. Lifecycle Integration
- **Chapter Player:** Call `clearOrderingHelp` in `onResolve` (correct branch).
- **Economy:** Existing `useProfile().spendDinars(20)` returns true on success. For recovery, we'll need a way to check if a specific `txId` was already deducted (or use a simplified recovery if global economy doesn't track `txId` yet).

## Impact & Verification
- **Double Debit:** Prevented by stable `txId` / Intent check.
- **Useless Reveal:** Prevented by `currentlyCorrect` exclusion.
- **Crash Safety:** Intent-based recovery handles mid-purchase kills.
- **Content Integrity:** Fingerprint ensures pins match current activity version.
