# V18-01A — P1-07 Daily Quest Identity & Async Reward Fencing

Date: 2026-11-05. Branch: `v18-01a-outbox-recovery`.
Starting HEAD verified: `ee88eca3108ae0f22d857a15c561aa7560f0a712`; Git was clean.

## AUDIT → RISK

Reviewed Phase E/P1-07, DailyQuestCard, daily-quest-reward, daily-quest, identity owner/guard, gameplay-write, Outbox enqueue/flush identity boundaries and existing gameplay/identity tests.

Root cause: the reward helper derived an Alice-specific delta ID, awaited profile/network operations, then used the shared Supabase client without checking that its actual current session still belonged to Alice. Further reads, fallback enqueue and flush could start after identity changed. The card awaited grant and then called profile mutators/marked the current quest/celebrated without a captured owner/epoch/lifecycle/quest fence. The hydrator only had a cancellation Boolean, with no exact day/target check. A shared entity-ID single-flight guard was unconditionally cleared by every request's finally, including an obsolete Alice request after Bob started.

Consequences: stale account-owned stats or additive fallbacks, incorrectly marking a replacement quest, stale celebration, and unnecessary duplicate requests. A stable delta ID prevents duplicate application of that key under the server's existing contract; it does not establish correct client identity or cancel a request already in progress.

## MINIMUM FIX → IMPLEMENT

### Canonical grant and confirmation probe

`daily-quest-reward.ts` captures owner, identity epoch and requested user ID **before hashing/any await**. User/date/entity and amounts are destructured once, so they remain the operation's fixed inputs. The card additionally supplies an `isCurrent` predicate for its captured task and lifecycle.

The scope checks owner equality, `user:<requested ID>`, unchanged epoch and the caller predicate. Every sensitive request is created only after awaiting `supabase.auth.getSession()`, rechecking the scope, and verifying that the session user matches the requested user. No await separates that final check and request creation. After the request, the scope and actual session are checked again before exposing a result. Caller-level guards cover the additional continuation after awaiting the request wrapper.

Protected waits / boundaries:

1. Stable delta-ID derivation, before any RPC/probe/enqueue.
2. Pre-grant `get_my_profile` read, before apply_profile_delta.
3. Grant RPC (both success and transport error), before any rehydrate/fallback queue.
4. Post-grant stats read, before applied-delta probe.
5. Applied-delta lookup, before result publication.
6. Enqueue completion, before fire-and-forget flush and queued result.
7. Confirmation hydrator hash/probe, before its completion marker.

An identity-change subscription aborts the enqueue signal during owner changes; the existing Outbox implementation remains the storage authority. An already-committed row is not claimed removed by this signal. Scope subscriptions are released in finally. There is no new custom timeout or claim that a failed response proves lost storage.

A stale operation returns `stale_context` without usable stats. `rpcMayHaveApplied` records whether the grant RPC was started; `rpcStatus: unresolved` distinguishes a started request from `not_called` when its response cannot be used. These fields **do not** claim a server cancellation or authoritative failure. Ordinary queued attempts remain queued only after enqueue resolves; storage/read failure does not mark rewarded or become a confirmed success. Already-started work remains subject to its original owner/key's existing retry/reconciliation path.

### Card / quest markers / single-flight

Each effect captures owner/epoch and a lifecycle Boolean. A render-time userKey/readiness ref rejects old results even before effect cleanup; an owner-change subscription makes new epochs observable, including Alice→Bob→Alice. Cleanup invalidates callbacks and removes listeners/timers.

Every operation clones the QuestState/target it accepted. Its guard compares captured local date with the unchanged local-calendar function and current persisted date/kind/entity/goal/reward amounts. The original reward key remains user/date/entity. A different target, day, identity, loading/sync context, or unmount invalidates local publication and prevents subsequent requests through the helper's caller predicate.

Calls to applyServerStats, addPoints, addDinars, both reward markers and celebration are guarded individually. This includes the boundary between a profile callback and the following marker. Confirmation hydrator completion also requires the captured task and context to match. Celebration timers check their operation and are cleaned up; visible celebration is cleared for a new account/day/target.

`daily-quest.ts` marker functions accept an optional exact-task expectation. They revalidate date/entity and caller identity/lifecycle **after their own getTodayQuest read and before the write**, avoiding accidental marking of a newly selected task. Existing callers without this optional expectation keep their contract. Selection, local-day rules, reward arithmetic and amounts are unchanged.

The single-flight ref holds a unique request ticket with owner/epoch/user/day/kind/entity key. Duplicate events for the same active ticket are coalesced. Finally clears the ref **only if that same ticket still owns it**. Resetting scope for Bob no longer lets Alice's finally release Bob. Persisted rewarded status blocks stale repeated event details. Since completion events have no owner field, the card also requires the current owner's **persisted completion**; an old Alice event matching Bob's entity/day cannot initiate Bob's incomplete quest.

## TEST

New acceptance suite: `tests/offline/outbox-daily-quest-identity.test.tsx`, **33 tests**. It exercises the real card, real canonical helper/probe, real quest persistence/marker functions and real identity owner/epoch implementation. Only Supabase/auth/RPC, Outbox I/O, profile callbacks and nonessential UI/content leaves are mocked. Deferred promises and explicit request-start signals control races; hashing uses the same SHA-256 computation synchronously wrapped in a promise to avoid relying on CPU/thread timing. Tests make no network calls or actual profile writes.

Coverage includes:

- Switch before hash completion; Alice→Bob→Alice with a changed epoch.
- Switch after profile read, during session wait, actual-session mismatch without a matching owner change.
- Switch during grant success/error, after RPC before stats, during stats and delta-row lookup.
- No subsequent stale RPC/enqueue/flush, no old stats publication; an in-flight grant remains explicitly uncertain.
- Owner change during pending enqueue aborts its signal and blocks old flush.
- Unmount with authoritative stats or additive-fallback path pending.
- Alice result after Bob mounts; Alice finally after Bob starts; duplicate Bob events do not release/reenter his guard.
- Concurrent completion/update events and stale repeated completion details; old Alice detail cannot complete Bob's identical but incomplete target.
- Day/target changes during grant; day/target/unmount during hydrator; identity switch during hydrator.
- Identity change between stats callback and marker; exact-task/identity checks inside both marker functions.
- Card Alice→Bob→Alice: only fresh reconciliation publishes, using the same stable delta ID.
- Valid same-account fallback still adds the existing 10/3 Daily Reading amounts once; valid hydrator restores flags without granting.
- A confirmation hydrator racing ahead of the grant response does not suppress current authoritative stats, repeat additive fallback, or celebrate a reconciled reward.
- Queued keeps rewarded=false; online retry uses identical delta/payload and already_granted reconciliation is silent.
- Remount with rewarded=true does not grant or celebrate.

The SHA-256 UUID-shape derivation and reward-key source were also compared against the starting HEAD: **unchanged**. No RPC definition/idempotency contract or reward/cap/local-date calculation changed.

### Results

- `npm run test`: **PASS, 486 tests / 17 files** = all previous 453 cases + 33 acceptance cases. No previous assertion was changed.
- Focused acceptance suite: **PASS, 33/33**.
- `npm run typecheck`: **PASS**, application and isolated Outbox projects, exit 0.
- `npm run build`: **PASS**, local client/server build only. Existing bundler chunk/plugin/deprecation warnings are non-fatal. No deployment.
- `git diff --check`: **PASS**, including staged diff before commit.

The existing `outbox-gameplay.test.ts` owner mock required two fixture-only corrections: return `user:<id>` (the real owner format) and expose `onOwnerChange` for the new subscription. The original storage-error assertion and every other existing assertion are unchanged. Production identity matching was not weakened to accept the previous malformed mock.

### Existing Bun identity-run instability (not hidden or fixed)

Correct runner: `/workspace/.onboarding-tools/node_modules/.bin/bun test tests/identity/isolation.test.ts` (Bun 1.3.11; this suite imports bun:test, not Vitest).

From the repository root, two runs stalled after the first six passing cases and were terminated. A bounded root run with `--no-env-file` exhibited the same stall. The late-response case passed alone, but other individually bounded cases also stalled. No assertion failure was emitted in these stalls, and this is not reported as a passing full root run.

For comparison, the **unmodified starting-HEAD** identity test plus owner/guard/partition sources were exported read-only into `/tmp/p107-identity-baseline`, with original tsconfig/package/bunfig and the same installed dependency directory. There was no checkout, reset or worktree. Both baseline runs completed **10/10, 149 assertions**, including with matching package/config/dependencies. Those identity source/test files have no working-tree edits and do not import the modified Daily Quest paths. This establishes a path/environment-sensitive runner observation, not its root cause or proof of an introduced regression. It remains documented for separate investigation; no old assertions were weakened or unrelated identity code changed. The modified-path suite also exercises the real owner/epoch primitives under Vitest.

## CLOSE / limits and residual risks

**P1-07 is addressed within its requested Daily Quest async identity/lifecycle boundary.** P1-04, P1-05 and P1-06 remain open. V18 stays **HOLD**.

An RPC started before a switch may reach/commit on the server. This fix cannot atomically bind/cancel Supabase's internal request dispatch, revoke an already-sent request, roll it back, or infer authoritative failure from a discarded response. It suppresses obsolete local publication and prevents initiating subsequent work after the guard detects staleness. On return to the owner, the original stable key and existing server confirmation/retry path remain the reconciliation authority; no new compensation/reward is invented.

ProfileProvider and its persistence/React updater behavior are unchanged. Guarding calls at the Daily Quest boundary is not a durable local reward-delivery protocol, crash-atomic profile update, global writer fence, or a solution to guest storage failure. General Outbox/flush internals, settlement/schema v2 and Cloud Save are unchanged. A hung request still depends on existing retry/lifecycle behavior; this task adds no storage-loss inference or arbitrary cancellation timeout. The legacy Bun root-run instability is a separate validation caveat above.

No production service, SQL, RPC migration, real account, Cloud Save, Android/Web deployment, merge, V17 import or economy configuration was used/changed.

## Files

- `src/components/home/DailyQuestCard.tsx`: lifecycle/task/identity fencing, per-request single-flight ownership, protected presentation.
- `src/lib/daily-quest-reward.ts`: actual-session/owner/epoch checks through every asynchronous stage; stale/uncertain result semantics.
- `src/lib/daily-quest.ts`: optional exact-task guard at the two marker writes.
- `tests/offline/outbox-daily-quest-identity.test.tsx`: 33 controlled acceptance tests.
- `tests/offline/outbox-gameplay.test.ts`: owner-mock fixture correction only.
- `docs/audits/v18-01a-p1-07-daily-quest.md`: this report.

Stop after the single commit/push to the working branch; no P1-06 or E-FIX-04/05 integration follows.
