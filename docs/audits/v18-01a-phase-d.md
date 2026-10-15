# V18-01A Phase D — gameplay callers and safe acknowledgements

Base: `6ba611a5d0b6ef0af076500dbc15fdec6733447f` on
`v18-01a-outbox-recovery`. This phase does not establish release readiness.

## Caller contract

`offline/gameplay-write.ts` is a small shared adapter for the existing live
RPC paths. It does not change RPC names, arguments, SQL, Cloud Save or reward
arithmetic. It captures the JSON payload, retains the actual enqueue receipt,
limits waits to eight seconds, deduplicates identical concurrent requests and
fences account changes using session identity and the identity epoch.

- `acknowledged` means this snapshot was confirmed by the server.
- `queued` means a local receipt was obtained and dequeue has not been confirmed.
  It does not prove that a permanently rejected action completed successfully.
- `dequeued` records successful conditional removal. A false/failed remove never
  deletes a replacement revision; a server acknowledgement remains valid only
  for the original snapshot.
- A storage failure may fall back to a live RPC. If neither confirms persistence,
  the result is unacknowledged, not queued, with a storage failure reason.
- Permanent refusals, including `investigation_not_found` and the legacy
  `invalid_campaign_id`, go through `archiveRejected` with the original receipt.
  Archival failure retains pending work and never authorizes a reward.
- An unknown/timed-out session must not be treated as a guest completion.
  A late operation can still persist after a UI timeout; it is conservatively
  reported as unconfirmed and remains available for a stable-id retry.

## Production caller inventory

- Stories (scene and completion), tutorial completion, Streak, investigation
  completion, chapter progress and the explicitly enabled legacy campaign
  completion path use the adapter. No id-only Outbox acknowledgements remain.
- Tutorial hydration and investigation backfill catch enqueue failures and do
  not claim a successful handoff or advance a backfill ledger on failure.
- Collection/game/profile-delta/encyclopedia/intro recorders report queue errors;
  background flush rejections are handled. Collection batches only release the
  old campaign queue after durable handoff of every entry.
- The legacy campaign queue retains entries appended during an awaited handoff
  and refuses to overwrite another account's queue after an identity change.
- Mini-game first-time rewards require durable progress; pending games and
  repeated calls cannot create another first-time reward in the current session.
- Daily-quest enqueue failure returns `storage_error`, not `queued`.
- Reflection save no longer equates a completed flush with server acknowledgement.
  Its existing direct upsert remains the acknowledgement source.
- The profile Streak wrapper fences late responses by owner/epoch and does not
  project an authenticated activity if neither local storage nor server proved it.
- Avatar enqueue already catches failures and keeps an explicit queued flag;
  it has no obsolete remove call. Profile hydration and Cloud Save are untouched.

## UI boundaries

StoryPlayer waits before showing rewards, permits retry on failure, serializes
completion clicks and suppresses late rewards after exit/account change.
Investigation completion waits before closing or marking progress/restoring
hearts, and leaves final-step controls available on failure. Post-completion
reconciliation cannot apply stats after exit/account change.

The campaign player projects chapter progress without modifying storage, proves
the Outbox/server write first, then commits the existing progress/reward path.
Failure preserves the old progress and reward ledger. Reward claims refuse an
unreadable/unwritable ledger; caps and amounts are unchanged. The mini-game player
also keeps its completion panel hidden until a save is proved.

The tutorial engine awaits completion proof, prevents duplicate finish calls,
retains controls on failure and suppresses callbacks after unmount. Local V17
completion records stay readable, cannot be downgraded on retry, and are not
overwritten after an unreadable record.

## Verification and remaining scope

`npm run test` aliases `test:outbox`: the A/B/C suites, existing Streak suite,
and the new gameplay recorder and React UI suites. This is the V18 Outbox scope,
not the entire repository's unrelated test collection.
`npm run typecheck` checks application TypeScript plus these tests and route
augmentations. `git diff --check` is also required.

Tests use fake IndexedDB/localStorage and server/auth mocks only, including real
StoryPlayer, campaign/investigation route components and TutorialProvider.

Phase E remains required: full regression review, browser/device validation and
release assessment. Legacy local optimistic reward projections are still not a
cross-store atomic transaction with the profile; this phase prevents false
storage acknowledgements and repeated UI grants, but does not redesign that
system. No real Supabase, production, SQL, deployment or merge was used.

Current scoped verification: **162 tests passed**, comprising the 93 pre-D
tests and 69 new gameplay/UI cases. The pre-existing Streak fixture adds the
session method needed for owner fencing; its assertions remain in place.

## Changed files

- `docs/audits/v18-01a-phase-d.md`
- `package.json`
- `src/components/stories/player/StoryPlayer.tsx`
- `src/lib/campaignLedger.ts`
- `src/lib/campaigns/completions.ts`
- `src/lib/daily-quest-reward.ts`
- `src/lib/games/progress.ts`
- `src/lib/importedCampaignProgress.ts`
- `src/lib/investigations/progress.ts`
- `src/lib/offline/gameplay-write.ts`
- `src/lib/offline/record.ts`
- `src/lib/profile.tsx`
- `src/lib/progressSync.ts`
- `src/lib/reflections.ts`
- `src/lib/stories/progress.ts`
- `src/lib/streak-activity.ts`
- `src/lib/tutorial/engine.tsx`
- `src/lib/tutorial/persistence.ts`
- `src/routes/campaigns.imported.$id.chapter.$chapter.tsx`
- `src/routes/games.$mode.$slug.tsx`
- `src/routes/investigation.$id.tsx`
- `tests/offline/outbox-gameplay-ui.test.tsx`
- `tests/offline/outbox-gameplay.test.ts`
- `tests/streak/durable-outbox.test.ts`
- `tsconfig.outbox.json`
- `vitest.outbox.config.ts`
