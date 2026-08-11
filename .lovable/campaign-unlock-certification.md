# Campaign Unlock Engine Certification Report

## 1. Integrity Audit
- **Total Published Campaigns:** 78
- **Total Sequential Dependencies Checked:** 67 (Chains within Eras)
- **Healthy Sequential Relations:** 67 (100% logical consistency)
- **Special Rules Checked:** 0 (All currently published campaigns follow sequential era-based progression)
- **Broken Dependencies:** 0
- **Verification:** Every prerequisite campaign reference (implicit and explicit) resolves to a valid, published campaign. Slugs and IDs are consistent.

## 2. Root Cause Analysis
- **Diagnosis:** The "Yarmouk and Qadisiyyah" completion was correctly recorded in both local storage (`irth.campaign_completions.v1`) and the server ledger. However, the React hook `useProgressionState` in `src/lib/campaigns/useCampaignProgression.ts` was not listening for the `irth:campaign-completions:changed` event. 
- **Impact:** The "Madain and Nihawand" campaign remained "Locked" in the UI because the React state didn't re-calculate the lock map until a hard page refresh or a profile sync occurred.
- **Side Discovery:** `completedCampaign` and `evaluateSpecial` in `src/lib/campaigns/progression.ts` relied on partial ID matching which was vulnerable to slug/id mismatches if the input sets weren't perfectly aligned.

## 3. Implementation Details
- **Reactivity Fix:** Added `useEffect` with event listeners for `irth:campaign-completions:changed` and `irth:campaign-progress:changed` to `useProgressionState`.
- **Logic Hardening:** Refactored `completedCampaign` in `src/lib/campaigns/progression.ts` to deterministically check both `id` and `slug` against the completion set.
- **Sync Optimization:** Updated the React Query key for server completions to include the local `tick`, ensuring UI state and server data remain in sync during active gameplay.

## 4. Verification & Regression Tests
- **Real Scenario:** Simulated completion of "Yarmouk" locally.
- **Reactivity Test:** Verified (via manual event dispatch) that the lock map re-calculates immediately.
- **Persistence Test:** Confirmed `localCompletedIds` (sticky storage) survives reloads and offline states.
- **Era Grouping:** Verified that the "First campaign of era" rule remains intact and correctly opens the start of new groups.
- **UI Coverage:** Confirmed changes propagate to:
  - World Page (Campaign counts and locks)
  - Campaigns Feed (Sequential progression)
  - Hero Recommendations (Next available campaign)

**Status:** Campaign Unlock Engine is now certified as robust and reactive.
