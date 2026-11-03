# V18-01A — E-FIX-04/05 Stage 3B-1

V17 Legacy Data Inventory & Strict Read-Only Import Candidates. Date: 2026-11-03.
Branch: `v18-01a-outbox-recovery`. Base HEAD: `a5fefd2567c8b18049e611098c5a3b6c72453ea4`; branch/HEAD/clean Git verified before editing.

**Inactive analysis module only. No V17 import, economic baseline, migration-ready record, appliedGrant or delivered mutation. V18 HOLD; P1-04/P1-05 remain open.**

## AUDIT → RISK → MINIMUM FIX

Reviewed Foundation/Stage 3A reports, database/transaction/settlement, ProfileState/hydration/persistence, identity owner/partition and campaignLedger; followed their legacy economic, completion, reward-summary, help and museum adapters. Only source files and synthetic fixtures were inspected. No player storage was sampled.

`installIdentityPartition()` is **not** read-only: it resolves boot identity, patches Storage methods and invokes `migrateLegacyKeys(window.localStorage, owner)`. The migration copies global personal keys when the target is absent and removes the global source; it can remove a source even when a target already exists. Wrapped getItem on audited keys also schedules diagnostic work. `getActiveOwner()` can lazily resolve a guest/device identity and write a device identifier. Existing profile hydration can remove guest-polluted records; campaign reward-summary reads can migrate v1 to v2. Existing read helpers also frequently turn corruption/unreadability into empty/initial values. None is used by the new reader. These old mechanisms are unchanged.

Minimum safe subset: a standalone synchronous function consuming explicitly injected physical read-only storage and a pure already-resolved identity snapshot. No ambient storage/owner resolver, partition installation, old read helper, schema opener, transaction adapter, RPC, React or diagnostic import. Unsupported historical schemas remain ambiguous; this is safer than interpreting parseable JSON as admitted financial evidence.

## Verified legacy inventory

Unless stated otherwise, the following adapters read/write localStorage logical keys. Once partition is installed, personal roots map to `<logical>::owner=<owner>` in both localStorage/sessionStorage via Storage.prototype; the old automatic migration itself operates on localStorage only. A key's presence in a namespace is evidence of where it is stored, **not proof of its original owner before historical migrations**.

| Verified key or format | Reader/writer in source | Economic meaning / reader treatment |
| --- | --- | --- |
| `hakaya.profile.v2` | `profile.tsx`: readPersistedProfileState, hydrateFromStorage, persistence effect | Stored points/dinars, hearts/heartsAt, cooldowns, purchased hints, daily claims, badges/titles/collection and completion arrays; strict potential baseline projection |
| `irth_campaign_ledger_v1` | `campaignLedger.ts`: read/write/claim/flush/backfill; `campaignReconciliation.ts`: readLedger/writeLedger | Claims, active position, pending chapter/collection operations; strict admitted claim evidence only, always legacy_unknown |
| `irth_campaign_grants_v1`, `irth_campaign_grants_v2` | `campaignRewardsGranted.ts`: readAll/writeAll/recordCampaignGrant/resetCampaignGrants | Reported campaign/chapter totals and unlocks, separate from profile persistence; never delivery proof; no v1-to-v2 reader migration |
| `irth_campaign_progress` | `importedCampaignProgress.ts`: readAll/writeAll/recordActivity; `campaignReconciliation.ts`; `importedUnlocks.ts` reads | Sticky local completion, activity IDs, raw XP/coins/heartsLost totals, unlockedRegistryIds; strict progress evidence, not spendable balance or grant instruction |
| `irth_campaign_progress.backup_v1` | `importedCampaignProgress.ts`: hydrateLegacyProgressFromCloud | Historical backup; preserve as distinct source, never select by age |
| `irth.campaign_completions.v1` | `campaigns/completions.ts`: readLocalSticky/writeLocalSticky | Sticky completion map; catalogued but schema not admitted for import in this phase |
| `irth.guest.storyCompletions.v1` | `stories/guestCompletions.ts`: read/write/guestMarkCompleted | Guest completion IDs; strict string-array evidence only, never inferred XP/dinars |
| `irth.game-completions.guest.v1` | `games/guestCompletions.ts`: readRaw/writeRaw/addGuestCompletion | Guest all-time game IDs; actual partition behavior overrides comments describing a device-global logical key; no account promotion |
| `irth.story_progress_mirror.v1.<uid>` | `stories/progress-mirror.ts`: readMirror/writeMirror | uid-stamped server-observed cache, no reward delivery proof; catalogued/unadmitted; mismatched UID rejected before reading |
| `irth.inv.backfilled.v1:<uid>` | `investigations/progress.ts`: backfill ledger helpers | Queued legacy backfill bookkeeping; not proof of reward; catalogued/unadmitted |
| `irth.investigations.<uid-or-guest>.v1` | `worlds-progress.ts`: readInvestigationsMirror/writeInvestigationsMirror | Local investigation completion mirror; catalogued/unadmitted, logical account checked |
| `irth.daily-quest.<userKey>.v2` | `daily-quest.ts`: stateKey/readState/writeState | Quest completion/rewarded flags and authored amounts; not atomic delivery evidence; unadmitted |
| `irth.daily-quest.history.<userKey>.v1`, `irth.daily-quest.reads.<userKey>.v1` | `daily-quest.ts`: history/reads helpers | Reward eligibility/history/telemetry; unadmitted |
| `irth.daily-challenges.<userKey>.<date>`, `irth.daily-challenges.done.<userKey>.<date>` | `games/dailyChallengeService.ts`: picksKey/doneKey/readIds/writeIds | Frozen picks and completion flags, not all-time reward proof; unadmitted |
| `irth.memory.history.v1` | `memory/history.ts`: read/write/markGranted; `memory/rewards.ts`: grantReviewXp | Daily count, item history and rolling grantedAttemptIds; strict structural validation, local-history evidence only; mark and profile update were separate |
| `irth.memory.plan.<planKey>` | `memory/plan.ts`: loadPlan/savePlan; owner-aware hash from planKeyFor | Pending/review progress and reward-relevant attempts; preserve, check embedded ownerKey, schema unadmitted |
| `irth.games.whoami.help.v1` | `games/who-am-i-help.ts`: getHelpStore/saveHelpStore | Paid reveal state; unadmitted, no debit reconstruction |
| `<owner>:irth.campaign.ordering.help.v3` | `campaigns/ordering-help.ts`: getHelpStore/saveHelpStore | **Explicit owner prefix**, not normal partition suffix: prefix starts user:/guest:, outside APP_ROOTS. Includes paidAt/txId/pinned state separate from profile debit. Recognized as owner_prefix evidence, schema unadmitted |
| `irth.campaign_progress_buffer.v1` | `campaigns/guest-progress-buffer.ts`: read/write/clear | boundUid and queued legacy chapter metadata; unadmitted, no implicit promotion; foreign boundUid redacted |
| `irth.achievements.v2.guest_unlocks`, `irth.achievements.v2.notified` | `achievements/v2/engine.ts`: load/save guest unlocks/notified | Guest reward-related unlock records versus presentation IDs. Guest unlock schema unadmitted; notified string-array is not a grant |
| `irth.entityDiscoveries.<userKey>.v1` | `entityDiscoveries.ts`: scopeKey and local read/write | Discovery eligibility/ownership evidence, not balance; catalogued/unadmitted |
| `irth.stories.unlock.v1:<uid>` | `stories/unlock-cache.ts`: cache read/write | Signed access cache, not economic balance. Catalogued/unadmitted; UID checked. Secret keys are **not read** |
| `irth.outbox.fallback.v1` | `offline/outbox.ts`: explicit owner-scoped fallback access | Pending operations, not balance/delivery; catalogued/unadmitted; recovery helpers are never invoked |
| `irth.outbox.dead-letter.v1`, `irth.outbox.dead-letter.v1:entry:<identity>` | `offline/dead-letter.ts`: archive/read/migration helpers | Rejected operations and full snapshots; catalogued/unadmitted, no archive migration/cleanup invoked |

Additional verified context, deliberately outside candidate decoding:

- `hakaya.profile.userId` (`account.tsx`) is account-switch bookkeeping, not sufficient proof to attribute a separate global profile.
- `irth.identity.activeOwner.v1`, `irth.identity.partitionMigrated.v1`, `irth.device.id.v1` are plumbing/history, not proof that arbitrary global balances belong to the current user. The reader does not read them or auth-session keys.
- `irth_campaign_reconciliation.report.v1` / `.signatures.v1` (`campaignReconciliation.ts`) are repair bookkeeping; that helper can mutate progress/claims, so it must not be run as inventory.
- `irth.orphanUnlocks.migrated.v1` (`orphanUnlocksMigration.ts`) is a migration flag, not reward proof; do not invoke its migration.
- `irth.levelup.seen` (`LevelUpWatcher.tsx`) controls presentation, not a grant; levels remain derived from points. `irth.memory.runtime.enabled`, `.bank.v1`, `.telemetry.drops.v1` are runtime/content/diagnostic context, not an imported balance.
- `irth.tutorial.irth-first-time.completed-version.v1` (`tutorial/persistence.ts`) stores version/completedAt/userId. Tutorial is excluded from economic decoding; partition explicitly treats tutorial roots as shared. Do not infer rewards or owner from this global gate.
- `irth.profile.avatar.pending.v1` (`emblems/avatar-persistence.ts`) is uid-scoped selection metadata; its sync can send profile-derived totals, but the marker is not a balance and is not imported.
- `campaign-unlocks` appears in partition roots/reset lists; this audit did **not** establish an active serialized read/write schema. It is not invented as a balance source or admitted into the candidate catalog.
- Public offline content snapshots (`offline-storage.ts`), admin campaign/content stores and story content identity are content, not balances. Reflections record answers/progress, not authoritative reward amounts.

### Distinct storage domains

1. **Physical localStorage:** suffix namespace or explicitly owner-prefixed ordering help; only matching-owner values are retrieved.
2. **Global legacy keys:** recognized by name during enumeration only; values are not retrieved because ownership is unproven. Report ambiguous without reassignment.
3. **sessionStorage:** inspected separately via its own injected raw adapter. `profile.tsx` has a real session fallback; other catalogued session entries are reported as observed duplicates/legacy evidence, not claimed current writers. Local wins/session wins is never assumed.
4. **Outbox IDB:** `irth-offline-outbox`, version 1, store `items`, per-row userId (`offline/outbox.ts`). Not opened/read by this module; opening through recovery APIs can write. Its fallback/archive are catalogued separately and never treated as delivery.
5. **Settlement IDB:** `irth-reward-settlement-v1`, version 2, stores entitlements/economy/appliedGrants/migrationState. Not opened/read/written by this module. Existing foundation facts do not turn old completion into delivered.
6. **Server authority:** profiles, game_progress, user_campaign_progress/completions, story progress/completions, investigation progress, user_collection, achievements, applied_profile_deltas and Cloud Save are outside local import. No query or RPC is executed.

## IMPLEMENT — candidate contract

New standalone module `src/lib/rewards/legacy-inventory.ts`; no production entry point imports it. `inspectLegacyCandidates(owner, inputs)` receives explicit local/session factories and a pure identity getter. Adapters expose only length/key/getItem; no writes or database handles.

The caller must provide **physical, non-migrating, non-diagnostic raw reads**, not ordinary patched getItem, hydrateFromStorage or an owner getter that still performs boot initialization. Factories can throw for unavailable storage. This dependency contract avoids pretending partition installation is safe; no browser adapter is installed by this phase.

Each ImportCandidate includes exact storage domain, logical/physical key, ownership evidence, state/reason and, only for readable attributed sources, exact raw text. The strict profile projection preserves known economic values and present reward/completion arrays without defaults, rounding, clamping or summing. Optional fields remain absent. Required points/dinars/hearts/heartsAt are not invented when absent. Finite safe nonnegative legacy totals may retain fractions; hearts require integral 0..5 and heartsAt an integral nonnegative timestamp. Cooldowns and purchased-hint maps are validated without rewriting. Extra legacy fields remain in raw.

| State | Meaning |
| --- | --- |
| missing | Enumerated physical source absent; no zero/initial substitute |
| valid | Admitted schema and source attribution, not approval to import |
| corrupt | Invalid JSON or invalid admitted field shape; owned raw retained for a later reviewed snapshot |
| unreadable | Storage/identity access, enumeration or value read failed; never treated as absence |
| owner_mismatch | Captured identity changed or key/embedded identity conflicts; no foreign raw/projection returned |
| ambiguous | Global owner unproven, multiple profile sources or historical schema not admitted |
| changed_during_read | Key set/raw/state changed between scans, disappeared during a read or enumeration became inconsistent; tentative report discarded |

`baseline` is only a potential source reference, never a write or readiness decision. It is returned only for exactly one admitted profile with no unresolved catalog candidate. Two profiles are ambiguous even when their bytes match. A global profile next to a valid physical profile blocks selection. There is no Math.max, timestamp preference, React value or summation of campaign totals.

Claims produce only `{key, state: legacy_unknown}` and `claim_only` evidence. Grant summaries are `reported_grant`, not proven profile delivery; completion arrays remain completion evidence. Memory granted IDs do not prove profile atomicity. `provenDeliveries` is explicitly empty: no local format audited here can prove the complete old claim/profile handoff. No inferred missing reward, compensation, confirmed completion or delivered/appliedGrant is produced.

For other catalogued formats, parse failure is corrupt; parseable but unadmitted schema is ambiguous and its raw value is withheld, not a false valid financial candidate. Such opaque containers may have nested foreign data; a later reviewed decoder must establish ownership before exporting a raw snapshot. Known nested Outbox source/letter/userId conflicts are explicitly redacted as owner_mismatch. These blockers are visible and must be resolved or explicitly excluded under a later approved source policy.

### Identity and read consistency

Owner and epoch are copied as primitive values before the first storage access, so a mutable getter result cannot change the captured epoch. Checks surround storage access, length/key enumeration and each value read, then precede final output. Switching away and back still changes epoch and discards the report.

Foreign physical suffixes/explicit owner prefixes are filtered before getItem. Recognized embedded logical UID formats are checked before value retrieval. Conflicting embedded owner/ownerKey/uid/userId/boundUid or authenticated profile in a guest namespace is redacted: no foreign raw or economic projection is returned. Global keys are not inspected for a name/loggedIn/UID heuristic; their values might belong to someone else.

Two complete captures compare exact raw strings, candidate states and relevant physical key sets. Private in-memory observations retain opaque values only for this comparison; they are not part of the returned report and are never logged or persisted. Identity/enumeration instability returns no tentative candidates or baseline. A stable access failure remains unreadable; corruption and ambiguity leave complete=false. complete describes this finite catalog scan only, not exhaustive knowledge of all historical installations or import readiness.

**Limit:** Web Storage has no multi-key snapshot transaction. Two equal scans detect observed changes, not an ABA write that restores identical bytes or a mutation after return. A candidate must be revalidated under a reviewed writer fence at Stage 3B-2; this module never authorizes a commit.

## TEST

New suite `tests/offline/outbox-legacy-inventory.test.ts`: synthetic V17 objects in isolated Map-backed raw Storage fixtures, no real partition installation or player data. Ambient local/session access is forbidden, mutation methods throw, IndexedDB open/delete and network are observed. Fixture mutation occurs only in explicitly controlled change/account-race tests.

Coverage includes exact financial/heart/cooldown/hint projections; missing versus unreadable; invalid JSON/shapes/numbers; Alice/Bob physical isolation and raw-value filtering; unattributed global keys; local/session conflicts including identical copies; identity changes at enumeration/value/final validation and mutable-identity epoch fencing; key-set and raw changes; synced claims staying legacy_unknown; completion without grant; reported grants without delivery proof; guest ownership; logical UID and embedded identity conflict redaction; owner-prefixed paid-help storage; unsupported schemas; no seed fallback; and complete fixture preservation with zero ambient writes/IDB opens/network calls.

All prior Foundation, Schema v2, A/B/C/D and E-FIX tests remain unchanged and are included in the full check.

Validation:

| Check | Result |
| --- | --- |
| `npm run test:outbox` | **321/321 passed**, 12 files: 285 existing + 36 new inventory cases |
| `npm run typecheck:outbox` | Passed: application and Outbox TypeScript projects |
| `npm run build` | Passed: local web build; existing bundling/deprecation warnings |
| `git diff --check` | Passed |
| Prettier check for both new TypeScript files | Passed |

Final tests include opaque-value change detection without export and nested foreign Outbox redaction. No existing assertions, fixtures, suite configuration or application implementation were changed.

## Stage 3B-2 proposal — not implemented

1. Approve the raw adapter/identity-read integration and writer-fencing strategy. Do not call partition installation or its migration to prepare a snapshot.
2. Admit required remaining schemas with separate tests; define which ancillary ambiguities block baseline import and how legacy ownership can be established without guessing.
3. Specify an immutable raw-snapshot record containing domain/physical key/exact text/owner evidence and a schema version; do not overwrite/delete original sources. A digest may aid comparison but cannot replace exact bytes/evidence. No store or schema upgrade is added for this proposal now.
4. Re-read/fence all selected values before copying. Persist raw snapshot and staged migration metadata atomically in an approved future schema; leave authority inactive until every validation passes. Web Storage and IDB cannot share a transaction, so no claim of cross-store atomic import is possible without fencing.
5. Import an agreed current balance as baseline only; do not reconstruct it from claims/progress or compensate legacy_unknown. Preserve ambiguous records and provide a review/retry route rather than resetting them.
6. Handle mixed-version tabs, failure/restart, read-only retention and data-preserving rollback before activating any new reader/writer. Actual ProfileProvider adoption and grant delivery remain later stages.

Required approval risks: old migration may already have moved unattributed values; physical namespace is not historical provenance; global values cannot be safely attributed by current login; unsupported historical schemas require policy; duplicate sources cannot be chosen by age/max; session lifetime differs from localStorage; quota/corruption must not generate baseline defaults; keeping raw snapshots later has privacy/retention implications and must never entail automatic logging/upload. Old writer activity and Web Storage ABA remain unresolved at this read-only stage.

## CLOSE

Files added only: the independent reader, its acceptance suite and this report. No existing storage/migration/profile/gameplay/reward code was changed. No schema version change, actual V17 import, economy/migrationState write, appliedGrant/delivered creation, SQL/RPC/Cloud Save operation, Production connection, deployment or merge. No blocker for this inactive strict reader; ambiguity is an explicit analysis result, not permission to proceed to import.

Authorized delivery after green checks: one commit/push to the V18 work branch. Stop before Stage 3B-2. **V18 HOLD; P1-04/P1-05 open.**
