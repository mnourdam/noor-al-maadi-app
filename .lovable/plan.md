# Campaign Unlock Engine Audit & Fix

The user reported that completing "Yarmouk and Qadisiyyah" shows it as completed, but the next campaign "Madain and Nihawand" remains locked. The audit reveals that while the logical chain is correct, the React hooks responsible for calculating the lock map do not listen for the `irth:campaign-completions:changed` event. This causes the UI to remain stale until a manual refresh or a hard profile sync happens.

## Analysis
- `useProgressionState` correctly unions local, profile, and server completions.
- `recordCampaignCompletion` correctly dispatches `irth:campaign-completions:changed`.
- However, `useProgressionState` has no event listener for this signal, so it doesn't re-run its `useMemo` when local progress changes.
- Additionally, I discovered that the `record_campaign_progress_v2` RPC dispatches `irth:campaign-progress:changed`, which is also not listened to by the progression hooks.

## Proposed Changes

### 1. Hardening React Hooks
- Update `src/lib/campaigns/useCampaignProgression.ts` to include a `useEffect` that listens for both `irth:campaign-completions:changed` and `irth:campaign-progress:changed`.
- Use a local `tick` state to trigger re-renders when these events fire.

### 2. ID/Slug Consistency (Integrity Pass)
- Audit `src/lib/campaigns/progression.ts` to ensure `completedCampaign` and `evaluateSpecial` consistently check both `id` and `slug` against the completion set.

### 3. Cleanup & Optimization
- Ensure `useQuery` for server completions has a short `staleTime` and is invalidated on completion events.

## Technical Details
- The sequential lock logic in `computeSectionLockMap` depends on `completedCampaign(state, previousRegular)`.
- If `state.completedCampaignIds` is stale, the `locked` status remains `true`.
- Listening to custom events ensures the "World" and "Campaigns" pages update immediately after the chapter player records the completion.

## Verification Plan
- [ ] Verify `useProgressionState` re-renders when `window.dispatchEvent` is called manually in the console.
- [ ] Verify that `recordChapterProgress` (which dispatches the event) triggers a refresh of the lock map.
- [ ] Confirm no regression in era-based grouping logic.
