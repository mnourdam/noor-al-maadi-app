# V18-01A — P1-06A Guest Completion & Progress Storage Truth

Date: 2026-11-05. Branch `v18-01a-outbox-recovery`. Starting HEAD verified: `8ba7e02b4bbccfb9dbe545312ce3d56527252ec0`. Git was clean before editing.

**Limited storage-truth fix. P1-06 is NOT closed; P1-05 reward delivery after crash remains unresolved. V18 stays HOLD.** No actual player data or production service was used.

## AUDIT → RISK

Reviewed Phase E, historical R6 and its unchanged probes, both guest completion ledgers, guest campaign buffer, recordChapterProgress, StoryPlayer, game route, and every production caller found by reference search. Also reviewed Identity Partition, owner/epoch and the existing UI/save contracts.

Root causes:

- Missing key, invalid JSON/shape and access exceptions were all converted to trusted empty history.
- Completion writes swallowed quota/SecurityError, yet helpers returned firstTime and emitted events. Callers then credited authored rewards.
- Buffer writes were void/best effort. recordChapterProgress returned buffered_no_session without proof that the buffer was saved.
- Promotion ignored binding/cleanup write failures, and removed an entry without verifying that it was still the snapshot sent.
- The games comment described a device-global ledger, although Identity Partition already owner-partitions its logical key.

Risks: false first-time grants, overwriting valid history after failed reads, stale guest writes after login, losing a newer buffer snapshot, trusting an unsaved account binding, and pretending that localStorage read/modify/write is atomic across contexts. Saving a completion before saving profile rewards is a separate unresolved crash window.

## MINIMUM FIX → IMPLEMENT

### Shared storage contract

`src/lib/guest/storage.ts` provides only storage truth, not an economic authority:

- Capture owner and epoch before any await; guest completion/buffer writers require a guest owner.
- Require the existing Identity Partition adapter. Use its **same physical key** for the captured owner; never change partition policy, search another owner's partition, reinterpret global legacy data, or migrate/reset anything.
- Check owner/epoch at lock acquisition, reads, writes and publication. A queued guest write cannot follow a new logged-in owner.
- Require an exclusive named **Web Lock** for mutation. All updated writers cooperate on the same physical-key lock. With no locks, return coordination_unavailable instead of performing unsafe localStorage read/modify/write.
- Read and write synchronously inside the write lock. A successful setItem return is the observable storage boundary; no read-back is misrepresented as CAS or physical-device durability.
- Do not use an in-memory/session Set as persistent truth. Every attempt rereads durable history under its lock.

Completion APIs now return **Promise<GuestSaveResult>**:

| Result                                   | Meaning                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `{saved:true, firstTime:true}`           | Verified history did not contain the ID; the intended storage write returned successfully under the captured identity |
| `{saved:true, firstTime:false}`          | ID was already saved; replay is reward-silent                                                                         |
| `{saved:false, firstTime:false, reason}` | No authorization to grant or finalize completion; retry/error handling required                                       |

Reasons distinguish invalid input, not_guest, identity_changed, partition_unavailable, read_failed, corrupt, write_failed and coordination_unavailable. They are not proof of loss, server failure, or absence of a previously committed write. An identity change after a write can suppress its result even though the original owner's row exists.

Readers retain their Set/Boolean interfaces but **throw on unknown history**. Only a missing key is a trusted empty ledger. Empty strings, invalid JSON, non-arrays and invalid array members are corruption; they are preserved without coercion/filtering into an empty or partial trusted set. No completion event is sent after read/write failure. Notification failure alone does not undo an already successful write.

Web Locks provide cooperative serialization, **not localStorage CAS**, transactional coupling with profile, or global exclusion of old/noncooperating code. Same-ID and distinct-ID tests use independent operation scopes over one lock service. An old script that ignores the lock is outside that guarantee. Unsupported lock environments fail closed and must not use an unsafe fallback. No new database/schema was introduced.

### Story and game UI

- **StoryPlayer** awaits the explicit guest result, rechecks active mount/owner/epoch, and displays the existing retry UI on failure without XP/dinars, completion flag, reward overlay or completion success events. A saved replay goes directly to the journey ending with no grant, including when incoming alreadyCompleted props were stale.
- **Game route** awaits the guest ledger, checks active owner/epoch before rewards, and leaves stageDone/finalScore unfinalized on failure. Existing error toast allows retry with the existing stage controls. Authored rewards/caps are unchanged (including existing game caps 40 XP/20 dinars). A saved guest replay switches to the completed view without granting or displaying a new reward pipeline.
- Guest ledger read errors in the game loader produce an explicit unknown/error view with retry, not a playable state based on an empty completion set. Loader continuations are lifecycle/epoch guarded.
- **StoryCard** catches unknown reads and displays “تعذر التحقق من سجل الإكمال”; it does not label unknown history as new or completed.
- **guest-evidence** no longer wraps the story snapshot in an empty-Set fallback. Unknown evidence propagates to existing fail-closed unlock/load handling; no completion/economic record is rewritten.

All production completion-write callers were updated to await the new API: StoryPlayer and the game route. Buffer write caller recordChapterProgress is also awaited. Read callers were reviewed: StoryCard handles unknown visibly; homeSummary already catches snapshot exceptions into its error state; dailyChallengeService stops its load on a guest-ledger exception rather than selecting against an empty set; guest unlock evidence now propagates uncertainty. Root startup/auth promotion callers already await/catch their wrapper. No signed-in reward calculation or ProfileProvider method was changed.

### Guest campaign buffer / promotion

bufferChapterProgress returns an explicit asynchronous `{saved:true}` or `{saved:false,reason}`. It validates input, strictly reads the existing BufferFile/entries, preserves unrelated valid entries, merges completion monotonically, refuses a bound guest buffer, and writes under the same owner-specific lock. Corrupt or unreadable buffers are never empty defaults. `clearGuestBuffer` is now an explicit asynchronous operation that refuses corrupt/unreadable data; it is not invoked by this fix.

recordChapterProgress captures owner/epoch before resolving auth. For the guest path it rechecks after session resolution, dynamic import, and buffer save. **buffered_no_session is returned only after saved:true**. False/unknown results never become buffered success. The signed-in RPC and reward contract are unchanged.

Promotion uses a separate owner-specific promotion lock to serialize promoters, plus the write lock for each local mutation:

1. Require the active owner to match user:<uid>. Do not silently transfer ownership by following a new identity.
2. Strictly read the current partition's file; refuse another boundUid. Persist boundUid before sending anything. A failed bind prevents send.
3. Release the write lock while awaiting the existing verified send path; retain the promotion lock. Check epoch before/after every send.
4. After acknowledgment, reacquire the write lock, reread and verify boundUid and the **exact entry snapshot**. A changed entry is retained, not deleted as an old acknowledgment.
5. Write the new list before incrementing promoted. Cleanup failure leaves the durably bound entry for retry; no false “removed” result is reported.

`PromotionResult.promoted` means acknowledged **and removal saved**, not a count of server commits. remaining=null means unknown, never zero by inference. If a server acknowledgment happened before cleanup failed, an entry may be sent again later through the existing stable/idempotent canonical recorder; this module neither compensates nor claims exactly-once delivery. Identity change prevents subsequent cleanup/send; it does not revoke an in-flight server operation.

**Partition boundary retained:** existing root promotion reads the active owner's namespace. It does not discover a different guest partition after login. This fix deliberately does not build that transfer/rebinding/migration protocol, change Identity Partition, or move guest rewards to a signed account. “empty” means the inspected current partition only; a guest partition may still retain its own pending data. Correctly selecting and transferring that source would require a separately reviewed ownership/recovery contract; no expansion into that architecture was performed here.

## TEST

**48 new acceptance cases:** 41 storage/recorder/promotion cases and 7 real React UI cases. All use synthetic data, real owner/partition and real modified storage helpers. Network/profile reward methods and irrelevant UI leaves are mocked; no real RPC/server is used. Deferred lock/send/session gates control races.

Coverage:

- Story/game quota and SecurityError writes: no firstTime, no completion events, retry after recovery.
- SecurityError reads and existing history; malformed JSON, invalid shapes/members, empty string: preserved unknown state, no overwrite.
- Missing key versus corrupt data; first save, replay, re-read after adapter reopening, all valid old IDs retained.
- Independent concurrent same-ID and different-ID mutation scopes; no locks fails closed, no CAS claim.
- Guest→user while waiting for lock/session; isolated guest/user partitions; user cannot use guest writer.
- Existing campaign buffer plus quota update; sticky completion; corrupt buffer rejection.
- Recorder buffered success only after saved:true; stale auth continuation never buffers under a new user.
- Failed boundUid save prevents send; conflicting binding never rebinds; failed read is unknown.
- Server ack plus failed cleanup retains the bound entry; later retry can clean it.
- Changed entry or corruption appearing during send is retained rather than overwritten/deleted.
- Account switch during promotion prevents cleanup/new sends and leaves old owner evidence.
- No implicit import of a guest partition when a user signs in.
- Real StoryPlayer quota/retry, silent replay, identity switch while save waits.
- Real game route quota/retry with unchanged reward caps, unknown-ledger recovery, and account switch during session wait.
- Real StoryCard unknown history cannot display a new/completed badge.

### Historical R6 (Assertions unchanged)

Command: `vitest run --config docs/audits/repros/v18-01a-phase-e/vitest.config.mjs -t '\[R6\]'`.

The archived probe/Assertions were **not modified**. It intentionally asserts the old unsafe observations: synchronous story true twice and game firstTime=true twice under quota. An isolated export of starting-HEAD sources/probe/config, run from its own temporary root with the same installed dependencies, reproduced **1/1 passing R6** (7 unrelated probes filtered), confirming that historical behavior.

On this fix, the unchanged historical probe **fails** at the first synchronous `toBe(true)`: the helper now returns a Promise. This is explicitly an API-contract mismatch, **not a passing modern regression test** and not, by itself, proof of quota safety. The new awaited acceptance cases inject the same quota faults under an actual guest/partition and verify saved:false/firstTime:false, unchanged storage and no completion events. The old probe remains historical evidence, not silently rewritten to green. The initial temporary baseline invocation needed its own working directory for Vite module resolution; the successful baseline run used that directory.

### Bun identity suite

Re-ran the original root command, bounded to 20 seconds:

`timeout 20s /workspace/.onboarding-tools/node_modules/.bin/bun test tests/identity/isolation.test.ts`

It again emitted the first six passing cases and then stalled, ending **exit 124**. This is not a passing original run. No identity source, identity test or Bun harness was changed. The prior isolated 10/10 result from P1-07 does not establish root-suite success; no such claim is made. The current real owner/partition acceptance tests run under the configured Outbox Vitest runner.

### Required verification

- `npm run test:outbox`: **PASS, 534 tests / 19 files** = original 486 + 48 new acceptance cases. All P1-07 and prior Outbox/foundation assertions remain unchanged.
- `npm run typecheck:outbox`: **PASS**, application and isolated Outbox projects. A missing Screen title and a test-only mocked Route type were corrected before the passing final run.
- `npm run build`: **PASS**, local client/server build only; existing chunk/plugin/deprecation warnings were non-fatal.
- `git diff --check`: **PASS**, including staged diff before commit.
- Focused new suites: storage/recorder/promotion **41/41** in the final full run, real React UI **7/7** (also passed separately).
- Historical R6: old-HEAD reproduction **1/1**, unchanged current historical probe **expected API-contract failure**, explicitly distinguished from the passing new awaited regression tests above.
- Original Bun identity root suite: **timeout/exit 124**, not counted as a pass. No isolated run is substituted for it.

No existing test file/assertion was edited. The async write API is intentional: consumers must await the returned save result. The historical synchronous R6 contract is not retained as a reward-authorizing compatibility shim.

## CLOSE / remaining work

P1-06A addresses false guest completion/buffer success caused by failed or unknown local storage within the updated cooperating paths. **P1-06 remains open**: completion can be saved and the application can stop before ProfileProvider persists XP/dinars, or an accepted write can finish after the UI goes away. Replaying a saved completion is deliberately silent. No automatic regrant, pretend delivered state, durable reward-intent migration or exactly-once claim was added.

Other limits: no physical-device durability proof, no proof against writers that ignore Web Locks, no native WebView capability test in this phase, unsupported coordination fails closed, and cross-owner guest-progress promotion/source selection requires a separate contract. Existing signed-in economy, campaign progression conditions, P1-04/P1-05 settlement work and P1-07 behavior remain outside this fix. These limits are documented rather than “solved” by a storage reset or broad architectural change.

## Files changed

- `src/lib/guest/storage.ts`: strict owner-scoped read/write outcomes and cooperative lock primitive.
- `src/lib/stories/guestCompletions.ts`, `src/lib/games/guestCompletions.ts`: explicit async completion contracts; truthful reads; corrected games isolation comment.
- `src/lib/campaigns/guest-progress-buffer.ts`: strict buffer results, binding/cleanup checks, scoped promotion.
- `src/lib/offline/record.ts`: verified guest-buffer outcome and epoch fencing.
- `src/components/stories/player/StoryPlayer.tsx`, `src/routes/games.$mode.$slug.tsx`: await saves, gate guest rewards/final UI, allow retry.
- `src/components/stories/StoryCard.tsx`, `src/lib/stories/unlock/guest-evidence.ts`: preserve unknown read status.
- `tests/offline/outbox-guest-storage.test.ts`, `tests/offline/outbox-guest-storage-ui.test.tsx`: 48 acceptance cases.
- `docs/audits/v18-01a-p1-06a-guest-storage.md`: this report.

No ProfileProvider, economy source, settlement, Writer Fence, Schema v2, V17 migration, signed-in reward numbers, Cloud Save, SQL/RPC definitions, prices/levels or campaign requirements were changed. No production connection, deployment, Android release or merge.

Stop after the single commit/push on the approved working branch. **V18 HOLD.**
