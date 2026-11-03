# V18-01A — E-FIX-04/05 Stage 3B-2C

Inactive Writer Fence Core & Writer Coverage Audit. Date: 2026-11-03.
Branch `v18-01a-outbox-recovery`; base HEAD `9118d102dbb775e4e5fcaf6ba9777a1c55c084a4`. Verified branch/HEAD and clean Git before editing.

**Inactive in-memory protocol only. No real writer is paused, wrapped or registered. V18 HOLD; P1-04/P1-05 remain open. No import, staging or global exclusion proof.**

## AUDIT

Reviewed Stage 3B-1 and Stage 3B-2B reports plus the Stage 3B-2A architectural decision in the conversation. Followed profile state setters and persistence, direct economic API callers, campaign claim/progress/grant stores, review history, quests/streak, purchases, account/identity lifecycle, Outbox/flush/archive, avatar/public-stat synchronization and existing inactive settlement infrastructure. The following is source analysis, not execution against storage/services or proof of backend implementation.

### Writer inventory and future adapter coverage

Notation: LS = owner-partitioned localStorage unless explicitly stated; IDB = IndexedDB. **Other context: yes** means another same-origin tab/WebView can run this code, not that this core discovers it. Synchronous code still needs fencing against other contexts and writes deferred by React. "Storage ack" describes current observable guarantees for the named persistence unit, never the complete reward handoff by implication.

| File / function(s) | Source and acceptance boundary | Actual persistence / storage ack today | Can continue after UI stop? / other context | Required future fence adapter |
| --- | --- | --- | --- | --- |
| `profile.tsx`: update, addPoints/addDinars and all reward reducers | Gameplay invokes updater; React may batch/execute it later | React state first, `hakaya.profile.v2` in later persistence effect; updater return is not a durable ack | Queued state/effect can outlive the initiating callback; yes | Admit before state mutation; track accepted version/effect footprint until exact durable version ack |
| `profile.tsx`: finishStory, markPuzzleSolved/markWhoSolved, completeInvestigation/Timeline/Decision/Mission/Campaign, findArtifact, unlockCharacter, unlockRegion, claimDaily | First-time/replay or affordability checks inside profile updater; some debit points/dinars | Same deferred profile effect; completion and economic fields share a profile object but not an entitlement transaction | Same React scheduling risk; yes | Cover every public mutation, including legacy routes and currently less-used methods, not only addPoints |
| `profile.tsx`: loseHeart/loseHeartOnce, recoverHeartFromActivity, spendDinarsForHeart | Answer penalty/activity/cooldown/purchase; dedup/reservations partly in memory | hearts/heartsAt/cooldowns/dinars via React then LS; returned number/Boolean is not persistence | Effect pending; yes | One accepted operation must cover complete tuple/cooldown/debit and its durable version; never infer save from reducer result |
| `profile.tsx`: spendDinars, trySpendDinars, buyHint | Help/game purchase; trySpendDinars reserves a local amount before queued update | Dinar/hints mutation later persisted; reservations do not cover other contexts or crashes | Queued updater/effect; yes | Admission before reservation/debit; durable ack after all accepted effects, failure stays unresolved |
| `profile.tsx`: persistence effect | Runs after hydrated/profile changes; owner-ref guard before write | Direct LS setItem; no per-command durable receipt/revision and no transactional grant key | Can run after initiating handler; other tab can write another snapshot | Final mutation boundary must validate owner/generation and map written version to the exact accepted commands; don't ACK every callback on any write |
| `profile.tsx`: hydrateFromStorage, mount/identity hydration | Bootstrap or identity event before normal interaction | Reads physical/legacy/session sources; can remove polluted guest profile; subsequent setProfile schedules persistence; error can fall back to initial | Effects/events independent of caller; yes | Gate before hydration/removal. No importer may call it as read-only or use initial fallback as recovered economy |
| `profile.tsx`: replaceProfile, mergeCloudSave, resetProfile | Account/server/import/reset API invocation | Whole replacement or max/union merge into React, then LS; no source revision CAS | Async caller may hold an older snapshot; yes | Admit before enqueue; stale source/generation cannot replace newer authority; pending accepted mutation must drain before closure ack |
| `profile.tsx`: applyServerStats, recordStreakActivity, hydrateClaimedStreakRewards | RPC/realtime/streak result after await | Totals/claim arrays/badges/titles/artifacts via profile effect. RPC ok is not profile durability; applyServerStats currently does not apply its hearts parameter | In-flight promises survive UI stop; some owner guards exist, not a fence; yes | Track whole accepted request/mirror lifetime; recheck actual write boundary; no delta replay merely because mirror is stale |
| `campaignLedger.ts`: claimActivityReward/claimChapterReward/claimCampaignReward, claim/write | Correct completion calls claim before actual profile reward | LS `irth_campaign_ledger_v1`; write reports Boolean for this ledger only | Sync body; later profile/collection effects independent; yes | Register before claim; aggregate claim/profile/collection receipts only after each declared footprint, never call claim success delivered |
| `campaignLedger.ts`: setActivePosition, clearActivePositionIf, enqueueChapterSync/enqueueCollectionSync | Gameplay/resume and queued sync creation | Ledger LS writes; several callers ignore write result | Sync body, subsequent flush background; yes | Include progress/queue mutation under the same participant; no silent untracked writes while closing |
| `campaignLedger.ts`: flushPending, hydrateLedgerFromCloud, bootstrapLedgerFlush/backfillLedgerFromLegacyProgress | Boot, online, visible, hydration or explicit drain | Awaits RPC/collection enqueue then rewrites ledger; epoch checks exist, but final write result can be ignored; backfill can synthesize claim keys without granting profile | Yes: bootstrap listeners and async functions have independent lifetime; yes | Admit boot listeners/drains; keep accepted work until its raw continuation and all storage results settle. synced/queued is not reward delivery |
| `campaignRewardsGranted.ts`: readAll migration, recordCampaignGrant/writeAll, resetCampaignGrants | Completion display/grant code, even a read can migrate v1 summary | Separate LS grant totals; errors can be swallowed; not atomic with profile | Sync helper; yes | Fence read-triggered migration and grant-summary/reset writes; strict ack before treating this persistence unit done |
| `importedCampaignProgress.ts`: recordActivity and completion helpers | Correct activity projected then persisted after accepted save | LS progress, sticky chapter/campaign facts/unlocks; completion transition also starts asynchronous completion recording | Fire-and-forget network can continue; yes | Track progress and child completion intents; preserve strict chapter ordering and existing reward rules |
| `importedCampaignProgress.ts`: hydrateLegacyProgressFromCloud/resetCampaignProgress; `campaignReconciliation.ts`: reconcileLegacyCampaignProgress/writeAll/writeLedger/writeSignatures | Boot/account repair or reset | Multiple LS progress/ledger/backup/signature/report writes after async reads; no single reward transaction; helper failures may be swallowed | Yes; yes | Fence repair/hydration/reset entry points before any read/repair; no repair may race a migration snapshot |
| `campaigns/guest-progress-buffer.ts`: bufferChapterProgress/promoteGuestProgress/clearGuestBuffer | No-session save, auth promotion and cleanup | LS buffer with boundUid; async record/upsert plus later buffer rewrite; some writes swallow failure | Promotion continues after initiating view; yes | Separate guest owner/epoch; register promotion/cleanup, no automatic ownership transfer by fence core |
| Campaign chapter route: onResolve, review completion | Correct answer accepted after guards; claim/grant and progression follow saveAccepted | Outbox/server outcome, progress LS, ledger, profile effect, grant summary and collection queue are separate | Resolve lock/active ref/epoch protect some calls, do not cancel every raw operation; yes | Register full declared lifecycle before first effect, not after saveAccepted. Drain existing accepted operations without changing caps/scaling/progression |
| `memory/rewards.ts`: grantReviewXp; `memory/history.ts`: markGranted/upsertEntry/bumpDaily/write; `memory/plan.ts`: savePlan/markReviewCompleted/clearPlan | Memory review invokes profile XP then grantedAttemptIds; planning records attempts | Profile effect separate from history/plan LS; history writes can swallow quota; rolling IDs are not a crash-safe delivery record | Sync writes plus profile effect/route work; yes | Register review/history/plan before effects, retain unknown write failures; no compensation or exactly-once claim from fence quiescence |
| `StoryPlayer.tsx`: goNext; `stories/progress.ts`: recordStoryProgress/completeStory; progress-mirror writers | End/scene save; guest marker or signed completion response, then profile grants | Outbox/RPC, guest completion LS, mirror LS and profile persistence are distinct; cache write may swallow failure | UI refs stop some updates; RPC/enqueue may finish after unmount; yes | Admit before saving; acknowledge declared persistence units independently; no RPC ack/profile-effect equivalence |
| `stories/guestCompletions.ts`: guestMarkCompleted/write; `games/guestCompletions.ts`: addGuestCompletion/writeRaw | Guest first-time completion | LS failure may be swallowed while helper still reports firstTime; P1-06 remains | Sync body plus later reward effect; yes | Guest-specific strict storage adapter needed before safe integration; core does not repair these helpers |
| Investigation route: grantRewards and LegacyInvestigationGame.onNext; `investigations/progress.ts`: recordInvestigationCompletion/migrateLegacyInvestigationCompletions | New signed RPC completion, legacy local completion, bootstrap backfill | RPC/Outbox, local completion/badge/hearts, streak/profile mirror, backfill ledger are separate | Yes: awaited call and inner async reconciliation; refs/epoch are partial guards; yes | Register before stableDeltaId awaits/first effect; include background children and durable local mirror, preserve controlled duplicate scheduling test in later integration |
| Game route: complete/penalty/time/help callbacks; `games/progress.ts`: recordCompletion | Completion returns saved/firstTime or user chooses paid help | Outbox game record, session Set, profile effect, daily-completion LS and collection sync | Background flush/streak continue; yes | Accept before any game record/debit; never treat session Set/pending record as durable reward ack |
| `ChapterQuiz.tsx` answer handling | Correct/incorrect quiz answer | completeMission/badges/artifact/character APIs or heart penalty → profile effect | Effect later; yes | Include quiz/legacy public API use, not just main campaign route |
| `DailyQuestCard.tsx`: grantReward; `daily-quest.ts`: writeState/markQuestRewarded and read/history updates | Completed target; guest reward or signed grant attempt | Guest profile updates then separate rewarded flag; signed RPC then totals/fallback delta and flag. P1-07 late-account risk remains | Yes: async grant/hydrators; yes | Admission before grant/flag path, owner/generation check after awaits, strict footprint receipt; leave unknown server outcome unresolved |
| `daily-quest-reward.ts`: grantDailyQuestReward | Stable delta request, authoritative before/after readback | Server RPC/profile_delta Outbox; does not prove later UI/profile LS | Yes; yes | Track raw RPC and enqueue outcome without replaying charge/grant blindly; local persistence remains another receipt |
| `streak-activity.ts`: recordStreakActivity; profile wrapper and flush streak branch | Qualifying activity captures original day then records/enqueues | Outbox receipt + server result; local totals/milestones mirrored separately | Yes; yes | Register accepted day/request and mirror footprint; preserve original day and idempotency, no calendar/economy changes |
| `useBuyHeart.ts`: buy; OutOfHeartsModal and direct profile purchase calls | Server purchase or local affordability check | Server purchase then replaceProfile from captured profile; guest local update. Neither callback end nor status proves profile LS | RPC survives view; yes | Register before purchase; uncertain RPC is not safely replayable merely on timeout. Protect source revision/owner and persistent tuple/debit |
| ActivityRenderer ordering pay / GameHelpDialog / CrosswordHelpDialog; `campaigns/ordering-help.ts`, `games/who-am-i-help.ts` save/recover functions | Help purchase/reservation, pin/reveal recovery | Dinar effect separate from intent/paidAt/pinned/reveal LS writes | UI can close before profile effect; yes | Register before pay and helper writes; recovery is also a writer. paidAt is not proof of profile commit; no price/rule changes here |
| `account.tsx`: account hydration, auth switch/reset, signOutFn and manual sync callback; `identity/reset.ts`: resetForIdentityChange | Session lifecycle or explicit sync/sign-out | Can remove profile, reset React/caches and epoch, merge cloud, trigger repairs, push profile and flush Outbox | Yes; cancellation/owner guards don't globally stop all continuations; yes | Lifecycle coordinator must fence ingress/egress/reset, drain accepted work before logout/reload and invalidate callbacks at actual mutation boundaries |
| `account.tsx`: debounce effect, online handler, cold-start/Realtime handlers | Profile change timer, reconnect, server event | pushSave/pushPublicStats or applyServerStats, then profile effect; four-second guard is temporal, not causal CAS | Timers/requests already started can finish after effect cleanup; yes | Register timer acceptance and raw request lifetime; cancel only unaccepted timers, queue/defer new ingress while closing |
| `cloud-save.ts`: pushSave, fetchCloudSave result consumers; `social.ts`: pushPublicStats/derivePublicStats | Account sync or caller invoking transport | Cloud Save snapshot and sync_my_public_stats backend writes; read ingress later mutates profile. Transport success does not acknowledge local store | Yes; yes, including another device outside this local protocol | Future integration must cover callers/ingress/egress; this phase changes or calls none of these services; no cross-device/global assertion |
| `emblems/avatar-persistence.ts`: persistAvatarSelection, pushAvatarDirect, write/clearPendingAvatar, reconcileAvatarOnHydrate; flush avatar_select | Selection/hydration/retry | Pending-avatar LS + Outbox or direct RPC carrying **full derived economy stats**, even though UI action is cosmetic | Yes; yes | Must register/recheck the totals publication and pending-marker cleanup; stale persisted profile cannot bypass economic fence |
| `offline/gameplay-write.ts`: saveGameplay; `offline/record.ts` record facades | Enqueue-before-RPC gameplay writes | IDB/fallback receipt, direct RPC, conditional remove/archive. Finite UI timeout can precede raw storage settlement; E-FIX-03 tracks it | Yes; yes | Track raw persistence/RPC lifetimes, not just UI result. queued acknowledges queue only; acknowledged acknowledges server only |
| `offline/outbox.ts`: enqueue/enqueueWithId/peekAll recovery/remove/bumpAttempt; `offline/flush.ts`: flushOutbox/handleItem | Save, stats/recovery read, boot/online/logout drain | IDB transactions and owner-scoped fallback/recovery/cleanup; RPC/upserts then snapshot-conditional dequeue/archive | Yes; cross-context transactions and independent instances | Raw transactions/recovery writes must join writer coverage. Preserve E-FIX CAS/cancellation/owner checks; no success from Promise.race timeout |
| `offline/dead-letter.ts`: recordDeadLetter/archiveRejected/migrateDeadLetters/clearDeadLetters | Permanent rejection, diagnostics migration/clear | LS archive-before-conditional-remove; strict write confirmation, lock/owner checks | Async archive/remove may continue; yes | Cover archive migration/clear as mutations and track conditional dequeue separately; archive success is not delivered reward |
| `achievements/v2/engine.ts`: doCycle, migrateGuestUnlocks, saveGuestUnlocks/saveNotified, silentlyRepairHistorical; claim.functions.ts server adapters | Eligibility cycle, guest/historical repair or signed claim | Guest unlock/notified LS or server RPC and mirror/presentation; not a profile persistence receipt | Yes: queued cycles/RPC and driver events; yes | Register evaluation-to-claim/local-cache mutation lifecycle; no new claim from historical ambiguity and no backend exactly-once guarantee asserted here |
| `entityDiscoveries.ts`: markEntityDiscovered/syncLocalDiscoveriesToServer; worlds-progress investigation mirrors | Reading/collection sync and profile/identity events | Local discovery/completion LS, Outbox/server repair; can influence achievement/quest eligibility | Yes; yes | Related-evidence writers need coverage too; avoid treating ancillary-looking keys as economic-independent without audit |
| `identity/install.ts`, partition installIdentityPartition/migrateLegacyKeys/purgeOwnerData; owner getDeviceId/setActiveOwnerInternal | Module import at router/android startup, identity initialization/change/delete | Can copy/delete globals, write partition marker/device/owner metadata or purge physical player data | Import/bootstrap independent of a gameplay view; yes | Future entry gate must precede side-effectful install. Namespace/epoch pinning alone is not writer exclusion; do not run old migration to prepare a snapshot |
| `resetProgress.ts`: clearLocalPlayerProgress and source-specific reset helpers | Explicit local reset/admin/debug paths | Removes profile/progress/heart/unlock/gate keys; no common reward transaction | Sync body but other callbacks may resurrect state; yes | Explicit reset lifecycle must invalidate/defer all prior generations, drain/cancel safely and preserve required recovery contract |
| Inactive `rewards/settlement.ts` and `transaction.ts` | Only explicitly invoked adapters/tests currently | IDB per-record or shared multi-store transaction oncomplete; no profile grant or delivered API | Async IDB; independent contexts | Future adapter may ACK its exact IDB unit after complete. It is not evidence that unintegrated production profile effects are durable |

### Coverage conclusions

The central profile mutation/persistence route covers aliases and callers that do not directly contain addPoints/addDinars. Every setProfile site (initial hydrate, identity clear/reload, update, replace, merge, reset) is part of the audit. Profile methods, reward history, paid help, repairs/backfills, destructive resets, timers and remote-result mirrors all require adapters before any global migration assertion.

A React batch can combine several accepted commands. The future adapter must ACK a committed version that includes their exact effects, not release every outstanding ticket whenever any persistence effect runs. A thrown/swallowed quota, changed account, stale closure or no-op response cannot generate a fictitious receipt. Disabling a button or unmounting a component does not cancel accepted work. Existing public APIs do not provide this complete durability contract today.

## RISK → MINIMUM FIX

Implement only a dependency-injected in-memory core. It registers metadata before caller effects, tracks work through computation and explicit adapter durability ACK, denies admission while closing, maintains independently held close leases, and produces only **scoped local** quiescence results. No timers, listeners, transports, owner boot resolver or storage is installed automatically. A global exclusion result cannot be set true by this API.

A known participant's claim is a protocol ACK from a trusted future adapter, not cryptographic proof of its disk contents. Registered writers that ignore ticket registration/checks and unknown legacy contexts remain outside observation. No production change is needed to test this bounded contract.

## IMPLEMENT — states and API

New module: `src/lib/rewards/writer-fence.ts`. No runtime imports.

`createWriterFence({instanceId, identity, readIdentity, schedule})` captures owner/epoch as primitives. Identity reads must be pure/already initialized; instanceId must be unique per boot/context. schedule is an injected cancellable timeout mechanism, not a persistence deadline. Unit tests use a manual scheduler only.

| State | Admission and transition contract |
| --- | --- |
| open | Registered current-generation adapter can accept an operation before effects |
| closing | requestClose stops admission; already accepted work may drain, known participants must ACK the current challenge |
| quiescent | All registered operations have both computation-finished and adapter durability ACK, and all known participants are connected/ACKed. This is **not** device/global exclusion |
| failed | Storage/receipt/scheduler failure is explicit; tickets and histories retained, no automatic release/reopen. Later truthful ACK may update a ticket but does not silently repair the failed round |
| invalidated | Identity changed/unavailable or explicit invalidation; generation advances, old callbacks cannot continue, tickets retained for recovery analysis |

Successful path: open → closing → quiescent → open only after the last valid lease release. A known participant roster/disconnection/reconnect change revokes a quiescent result and returns to closing with a new revision. Failed/invalidated rounds have no automatic recovery-to-open API in this phase.

### Accepted operations and durability

`registerWriter(id)` returns a generation/registration-bound adapter:

- accept(operationId) records a frozen OperationTicket before any caller effect; duplicate writer/id is rejected for this core lifetime;
- canContinueAccepted(ticket) checks current identity, generation, registration and unsettled work;
- computationFinished(ticket) acknowledges execution completion only;
- acknowledgeDurable(ticket, receipt) is the **adapter's explicit assertion** about its declared persistence unit;
- storageFailed(ticket, reason) records failure without deleting the accepted operation.

A durable ACK may arrive before computation finishes or afterward; both are required before the ticket is settled. Matching duplicate receipts are harmless; conflicting receipts fail closed. A late storage-failure callback cannot turn a settled operation into a new accepted job. No reward/deduplication guarantee across boots is inferred from operationId.

The core does not run callbacks or inspect a database to verify receipts. A future adapter must define the complete accepted footprint, including child work, and only ACK after proven persistence. For existing profile APIs that contract is missing, so registering them by name alone would provide no real protection. Checks must be repeated at actual mutation boundaries; the core cannot undo an in-flight RPC or stop code that ignores it.

### Stop leases, waiting, cancellation and timeout

requestClose returns an independent frozen lease; concurrent calls share the same pause/round but each lease must be explicitly released. New registration/admission is denied during closing/quiescent. Repeated wait on one pending lease shares one promise/timeout.

wait(lease, timeout) returns local_quiescent, timed_out, cancelled, failed or invalidated. **Timeout and cancelWait never settle/delete an operation, release its lease or reopen admission.** A cancelled/timed-out caller can wait again after accepted work drains. An explicit invalidate abandons trust in the round, retaining all ticket metadata and keeping the gate closed.

release requires a valid lease plus a currently issued, authentic in-memory local proof. Early, copied/forged, other-core or revoked proofs cannot release. Releasing one of two leases cannot reopen admission. Final release increments generation, invalidates old writer adapters/callbacks and requires a new adapter registration for new work. Completed operation metadata is retained; no erase/eviction API exists.

### Identity and generation

Closing alone does **not** rotate generation: accepted old work must still be able to finish. Generation changes on final safe release or explicit/identity invalidation. Identity is checked on each relevant API and timeout guard, not by an automatically installed listener. Immediate future identity notification must call invalidation before effects can write; that integration is not installed here.

Alice→Bob and Alice→Bob→Alice with another epoch never reactivate the old core. If persistence committed just before a switch, it remains the original adapter/storage owner's responsibility; this core rejects obsolete callbacks rather than compensating/removing committed data. It never redirects a ticket to the new owner.

### Known participant acknowledgements and proof scope

registerParticipant(id, incarnation) and disconnectParticipant are explicit coordinator inputs, not discovery. ACK includes core instanceId, owner/epoch, writer generation, round and roster revision, incarnation, unresolved=0 and durable=true. Wrong/stale/unknown/disconnected ACKs are refused. Reconnect uses a fresh incarnation; every roster change clears ACKs and invalidates previously issued proofs. A silent/disconnected participant is not removed by timeout.

Snapshot separates localWork drained/unresolved, per-participant ACK status and the phase. Scoped proof is labelled `scope: registered_participants`. It is only valid while isProofCurrent still holds; an earlier resolved wait result is not irrevocable permission to import.

Always present:

- globalWriterExclusion = unproven;
- importDecision = HOLD;
- continuity = in_memory_only;
- unknown blockers include global_writer_exclusion_unproven and prior_context_work_not_reconciled.

noteUnknownWriter adds an explicit blocker; there is no API to erase the global/legacy uncertainty or claim global exclusion after registered ACKs. BroadcastChannel/Web Locks are not invoked and cannot be treated as evidence against nonparticipants.

### Restart and retained uncertainty

Within the live core, timeout/cancellation/failure/invalidation do not erase accepted work. Across a real context crash, this **in-memory** core cannot recover ticket payloads or prove that previous work drained. A new instance starts a new local scope, not a successful global recovery; its continuity blocker and HOLD remain even when its current local queue is empty. Old leases/proofs are not accepted by the new core. Durable intent recovery belongs to a separately approved integration, not to a fabricated empty-queue success.

## TEST

New suite `tests/offline/outbox-writer-fence.test.ts`: injected identity and deterministic scheduler, synthetic operations and adapter receipts only. Ambient localStorage/sessionStorage/IndexedDB access and network throw. No ProfileProvider or actual persistence adapter is mounted.

Coverage: empty close; accepted running work; finished computation without storage ACK; storage ACK before computation end; multiple accepted operations; admission closed; generation revocation with unresolved metadata retained; Alice/Bob and return-to-Alice epoch changes; identity change during scheduled wait; explicit storage failure; late truthful receipt without automatic failed-round repair; timeout; wait cancellation; concurrent close leases; repeated wait single-flight; delayed/invalid known ACKs; reconnect/roster challenge revocation; silent participant timeout without eviction; explicit legacy writer HOLD; new-context continuity unknown; early/forged/cross-core release; final-release generation change; duplicate admission/registration; duplicate/conflicting receipts; identity/scheduler failures; immutable snapshots and no IO. A source-tree import scan asserts no production source imports writer-fence.

These tests prove bookkeeping and scoped protocol invariants, not physical disk durability, actual React drain, RPC cancellation, native WebView behavior, exhaustive tab enumeration or crash-safe reward delivery. Prior investigation timing sensitivity remains separate; its unchanged suite passed ten repeated runs in the earlier audit, which did not prove the flake impossible. No investigation assertion is changed here.

Validation:

| Check | Result |
| --- | --- |
| `npm run test:outbox` | **388/388 passed**, 14 files: all 358 previous + 30 new core/coverage cases |
| `npm run typecheck:outbox` | Passed: application and Outbox TypeScript projects |
| `npm run build` | Passed: local web build; existing bundling/deprecation warnings |
| `git diff --check` | Passed |
| Prettier check for both new TypeScript files | Passed |

The new tests include a static no-production-import check. No old test/assertion, fixture, suite configuration or existing source implementation was changed.

## Integration plan — not executed

1. Approve persistence-unit/receipt contracts and accepted-operation boundaries for each table row. Introduce durable version acknowledgements before claiming profile drain; preserve accepted unsaved effects rather than dropping queued React work.
2. Test adapters around synthetic profile/effect batches, child tasks, repair writes and raw Outbox lifetimes. Keep the core unmounted from app startup until coverage is demonstrated.
3. Gate side-effectful identity/install before migration; coordinate reset/auth callbacks and avoid an owner resolver that writes while purportedly reading identity. This needs separate scope approval for router/android/provider changes.
4. Integrate local writer classes gradually, with generation/epoch checks at actual writes and no economics/caps/progression changes. Ensure failed/quota/unknown server outcomes never ACK success.
5. Design registered-context transport/ACK handling and a trustworthy exclusion criterion for mixed versions. A registered roster is not a census: a suspended tab, old WebView or independent process may ignore the protocol. Unknown/noncooperating writer ⇒ HOLD. Never force reload/close an unproven writer with accepted unsaved data as a shortcut.
6. Only after reviewed writer coverage, recovery and global exclusion evidence may eligibility/staging be reconsidered. No local proof from this phase authorizes the existing planner to stage or activate anything.

Import blockers remain: any unresolved accepted operation; failed/invalidated round; unACKed/disconnected known participant; revoked local proof; owner/epoch change; unknown legacy writer; missing all-writer coverage; unverified restart continuity; no approved historical attribution/staging policy; no real atomic profile/reward delivery integration. No amount of elapsed time or registered ACKs closes these by itself.

## CLOSE

Files added only:

- `src/lib/rewards/writer-fence.ts`
- `tests/offline/outbox-writer-fence.test.ts`
- `docs/audits/v18-01a-e-fix-04-05-stage-3b2c.md`

No existing writer, root/router/android entry point, identity/install/partition migration, ProfileProvider, campaignLedger, Cloud Save, RPC/SQL, level/streak/economy/help/progression code changed. No schema upgrade, storage sampling, real writer pause, staging/import, economy baseline, appliedGrant or delivered record. No Production, Android release/web deployment or merge.

No blocker for this bounded inactive core; real integration/global exclusion and durable recovery remain **unproven prerequisites**, not completed features. Authorized delivery after green checks: one commit/push to the work branch. Stop before boot integration or data import. **V18 HOLD; P1-04/P1-05 open.**
