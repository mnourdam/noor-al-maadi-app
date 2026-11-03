# V18-01A — E-FIX-04/05 Stage 3B-2B

Legacy Import Eligibility Planner. Date: 2026-11-03.
Branch `v18-01a-outbox-recovery`; base HEAD `79bf49fb08b045b0eb4e2b5d7894b2fd29796df6`. Branch, HEAD and clean Git verified before implementation.

**Inactive pure planning only. V18 HOLD. P1-04/P1-05 remain open. No Writer Fence, staging, import, schema upgrade or economic activation.**

## AUDIT

Reviewed Stage 3B-1 inventory/report, schema v2/database/transaction infrastructure and the Stage 3B-2A decision delivered in the preceding chat. Current inventory correctly preserves source states but suppresses its baseline whenever any catalog source is unresolved. This phase adds a separate consumer of those facts; it does not relax the reader or its tests.

The approved design distinguishes a numerical/profile candidate from historical reward/deduplication evidence and from safe-to-quarantine ancillary data. Neither exact raw equality nor a physical owner suffix proves pre-migration historical ownership. Existing raw Web Storage has no snapshot transaction, and old clients do not observe a future Writer Fence automatically.

## RISK → MINIMUM FIX

- Reclassifying a reader failure as success would hide lost evidence. Global/aborted reads and identity conflicts must stop planning.
- Broad "cache", "notification" or "progress" exceptions are unsafe: completion/history/paid-help state influences reward or debit decisions.
- Matching totals alone cannot establish profile equivalence; hints/cooldowns and other raw fields matter.
- Queued/archived Outbox payloads can carry monetary operations. Their opaque format cannot be waived as generic history.
- No source here establishes that a historical claim and profile update committed together. Candidate eligibility covers the reader catalog only: Outbox IDB, server state and other non-inventoried storage domains are not implicitly declared empty or reconciled; later staging/readiness requires their approved assessment.

Add only a standalone pure planner with explicit reasoned decisions, a fixed source policy and domain barriers. Consume in-memory inventory plus an explicitly supplied expected owner/epoch. Do not re-read or mutate any source, or import a runtime storage/identity module.

## IMPLEMENT — API

`planLegacyImport(inventory, { owner, epoch })` in `src/lib/rewards/legacy-eligibility.ts`.

Input is the existing `LegacyInventory`; the only inventory import is type-only. The expected identity is a caller-supplied snapshot, not a live lookup. The function has no storage handles, network, React, RPC, schema opener, write callbacks or activation options.

Output:

- `baselineEligibility`: eligible_candidate / blocked / insufficient_evidence, with reasons and optional profile-group source references;
- `stagingEligibility`: requires_writer_fence / blocked; never staging approval;
- `settlementReadinessByDomain`: blocked / insufficient_evidence for all eight requested domains;
- `migrationReadiness`: always blocked in this phase;
- `authorityActivationEligibility`: always blocked in this phase;
- `blockers`: scoped explanation codes and source references;
- `sourceAssessments`: original reader state plus A/B/C/D category, dependency basis and affected domains;
- `quarantinedSources`: unresolved evidence not consumed as a wallet or delivery fact.

No output contains a new balance, raw profile body, grant instruction, applied key or delivered record. Returned source references are copied; modifying an explanation cannot modify input facts or the policy's shared domain lists. No caller-provided ready/fence flag is consumed.

### Reader facts and structural guardrails

The planner never changes ambiguous/corrupt/unreadable/missing states. Expected owner/epoch mismatch, report-level abort reason, owner_mismatch, changed_during_read, incomplete empty reports, inconsistent completeness/summary, duplicate source addresses and malformed/foreign physical source addresses block baseline and domains. No tentative candidate can rescue an aborted report.

A stable, per-source unreadable result can be evaluated according to that source's proven classification. A general inaccessible storage/enumeration result cannot be reinterpreted as an ancillary failure.

Current `inventory.baseline` is derived by the old global policy, so the new planner evaluates the supplied candidates directly and leaves that old derived result unchanged. Likewise `complete=false` due to visible B/C source issues does not establish a global enumeration failure; candidate states and report-level failure evidence are examined separately.

## Final source policy

| Source/key/fields | Class | Decision |
| --- | --- | --- |
| `hakaya.profile.v2` financial tuple, cooldowns, purchased hints | A | Strict admitted raw profile and matching reader projection required. Corrupt mixed profile is not salvaged by parsing its wallet numbers alone |
| Same valid profile's completion, badge/title/collection, daily-claim and milestone arrays | B within admitted A | Nonempty history adds domain barriers; never creates historical delivery proof. Corruption of the mixed source still blocks the whole profile |
| `irth.campaign.ordering.help.v3` (explicit owner-prefix), `irth.games.whoami.help.v1` | A | Paid intent/reveal data accompanies separate profile debits. Current opaque/nonmissing data blocks baseline and spending; no missing debit is inferred |
| `irth.outbox.*` fallback/archive/entry sources | A conservatively | May contain profile_delta or rejected monetary operations. Current reader has no admitted operation-level financial split; every nonmissing opaque container remains an economic blocker |
| `irth_campaign_ledger_v1`, campaign grant v1/v2 summaries, campaign progress/backup, campaign completions, guest campaign buffer | B | Entire mixed source remains campaign reward evidence. Claims, active pointers and chapter/collection pending operations are not split into a cosmetic exemption. They do not replace stored wallet balances |
| Guest story completions and authenticated story progress mirror | B | Story reward barrier, no completion-to-grant inference |
| Investigation backfill ledger and investigation mirror | B | Investigation reward barrier |
| Guest game completions and daily-challenge picks/done | B | Game reward barrier, including selection/completion inputs |
| Memory history and plan | B | Memory reward barrier: grantedAttemptIds/review attempts can gate XP |
| Daily Quest state/history/reads | B | Daily Quest reward barrier, including target/read eligibility |
| Guest achievement unlocks, achievement notified, entity discoveries | B conservatively | Cross-domain reward/eligibility dependencies are not proven independent; block all affected domains rather than guess C |
| `irth.stories.unlock.v1:<uid>` | **C, one narrow explicit rule** | `stories/unlock-cache.ts` stores signed access cache, not balance, debit, claim or delivery. An ambiguous/corrupt/unreadable owned cache can be quarantined without suppressing the wallet candidate. Quarantine never authorizes access/unlocks |
| Any unproven global key | D overlay | No ownership upgrade. A global wallet/paid-intent/opaque economic source blocks baseline. A global B-origin source remains unassigned and blocks its reward domain, without supplying a balance |
| Any other unclassified nonmissing source | D | No broad ancillary exemption; block baseline and domains |

Facts supporting the policy are recorded in the classification's `basis` strings. No current reader candidate outside the access-cache rule is guessed C. Pure presentation keys such as levelup seen are not emitted by the current inventory catalog and are not fabricated as planner inputs or waived by an extensible allowlist. Future catalog expansion needs its own dependency audit and tests.

A source with state missing contributes no fabricated zero or historical delivery fact. Correctly isolated foreign namespaces were already excluded by the reader and do not invalidate the active owner's report. A conflicting identity inside the active namespace is a fatal report/source conflict.

## Baseline candidate contract

1. Reader/expected owner and epoch agree, with no aborted/global/identity/snapshot failure.
2. At least one owned, admitted profile with raw text and a reader economic projection exists.
3. Required protected fields are present: points, dinars, hearts, heartsAt, activityCooldowns and hintsPurchased. Missing optional-in-reader but required-for-import fields produce insufficient_evidence, not defaults.
4. Financial values satisfy finite/safe nonnegative constraints; hearts are integral 0..5, heartsAt integral, cooldown map numeric and purchased hints integral. No rounding, regeneration, max, timestamp selection or currency adjustment occurs.
5. Required projection values agree with the admitted raw source. The planner never treats a corrupt profile as valid merely because some numbers are parseable.
6. No unresolved A source, global potential wallet, unsafe classification or economic profile conflict exists.
7. B and the one proven independent C source may remain unresolved, with explicit barriers/quarantine.

`eligible_candidate` describes a proposed snapshot group only. It carries `historicalOwnership: not_proven` and a namespace-not-historical-proof reason. Historical owner attribution review and Writer Fence remain mandatory before staging. It is not a declaration that the old migration assigned data correctly.

### Exact local/session group

One owned profile is evaluated directly. Two profiles are accepted conditionally only when they are separate local/session sources with **identical complete raw strings**, and each was admitted by the reader before its multiple-source ambiguity marker. Both source identities remain in `profileGroup.sources`; neither is preferred.

An ambiguous profile is considered for this narrow comparison only with the reader's `multiple_profile_sources` reason and its existing raw/economic evidence. Its state remains ambiguous. Different balances, changed hints/cooldowns, any other raw difference, reordered JSON bytes or an additional unsafe source cannot be resolved by a semantic/max/time heuristic. No general equivalence contract is introduced.

## Domain barriers

Domains: campaign_rewards, story_rewards, investigation_rewards, game_rewards, memory_rewards, daily_quest_rewards, economy_spending, hearts_and_cooldowns.

- Valid legacy claim/history is still not proof of atomic delivery. Relevant B evidence blocks its domains even when the wallet candidate is eligible.
- Mixed/unadmitted B blobs retain their domain barrier; no active pointer/history subset is silently discarded.
- Critical profile/spending/ownership failure prevents baseline and blocks all settlement domains through the baseline dependency.
- Nonempty admitted profile history adds barriers for related reward domains; broadly shared badge/title/artifact/milestone history is treated conservatively across domains.
- Domains without a specific blocker remain **insufficient_evidence**, never ready. No integrated delivery contract, imported state, proven Writer Fence or durable activation is present.

This phase intentionally does not solve legacy_unknown, missing historical grant evidence, server reward readback or old spending crash windows.

## Candidate ≠ staging ≠ migration ready ≠ active

For an eligible candidate, staging returns requires_writer_fence, plus no-staged-import and historical-attribution-review reasons. For a blocked/insufficient candidate staging is blocked. migrationReadiness is always blocked. Authority activation is always blocked because legacy writers remain unprotected and no ready import exists.

The planner cannot perform or attest any Writer Fence. Extra input flags claiming ready/active/fence do not enable a path. It creates no economy baseline, migration ready, snapshot, appliedGrant or delivered value and is not mounted at app startup.

## TEST

New suite `tests/offline/outbox-legacy-eligibility.test.ts`. Most cases start with `inspectLegacyCandidates` itself over synthetic isolated raw Storage adapters. Fixtures are never player data. Targeted inconsistent/forged report cases additionally exercise defensive rejection; they are not the only source of test inputs.

Acceptance covers a single wallet; independent ambiguous/corrupt/unreadable C cache; corrupt B campaign ledger; ambiguous mixed campaign buffer; unattributed B-origin ledger; different balances; byte-identical local/session group; matching totals with different protected data; raw-key order difference; global wallet; corrupt/unreadable A; absent protected fields; corrupt mixed profile; unresolved paid-help spending; opaque monetary Outbox; owner/epoch mismatch; real reader changed_during_read; general enumeration failure; Alice/Bob conflict/isolation; synced claim without delivery; V17 without revision; per-domain B sources; profile completion history; immutable reader input; output-reference isolation; no rereads, ambient storage, network, raw-data export, baseline writes or readiness activation.

Ambient localStorage/sessionStorage/IndexedDB reads throw during tests, fetch throws if called, and adapters are made unreadable after inventory to prove the planner does not re-read them. Deep-frozen real reports verify no fact rewriting. Prior suites/assertions are unchanged.

Validation:

| Check | Result |
| --- | --- |
| `npm run test:outbox` | **358/358 passed**, 13 files: all 321 existing + 37 new planner cases |
| `npm run typecheck:outbox` | Passed: application and Outbox TypeScript projects |
| `npm run build` | Passed: local web build, existing bundling/deprecation warnings |
| `git diff --check` | Passed |

The final full run includes defensive summary/address checks as well as integration with the unchanged real inventory reader. No existing assertion, suite or fixture was changed.

## Next phase — Writer Fence proposal only

Before actual staging: define pure raw browser adapters and owner initialization; place the migration gate before side-effectful identity/install; audit and protect every economic writer; stop new commands, drain accepted React/effect/async work with durable acknowledgements, invalidate obsolete callback generations, and coordinate all compatible contexts. Then revalidate raw values under the exclusive fence before any staged commit.

BroadcastChannel ACKs and Web Locks cannot exclude an old noncooperating client. Unknown/mixed-version writers, unavailable quiescence proof and unstable owner/source observations keep the result HOLD. No automatic reload, forced closure, legacy migration or data deletion is proposed as a shortcut. Raw Web Storage ABA and post-read changes remain limitations of this planner; candidate eligibility is not a write authorization token.

Further approvals required: attribution of historical namespace data, admission/operation-level splitting of remaining A/B schemas, exact staging payload/retention policy, writer barrier including pending accepted operations, mixed-version exclusion criterion, and subsequent atomic delivery/profile integration. Schema remains v2; Stage 3B-2A's staged-in-v2 design is not implemented here.

## CLOSE

Only three files added: planner, its acceptance suite and this report. No existing inventory, database/transaction code, ProfileProvider, partition/migration, campaignLedger, gameplay/reward economy, Cloud Save, SQL/RPC or level/streak/help/progression logic changed. No real storage sampled, schema upgraded, fence executed, snapshot staged, data imported or economic authority activated.

Authorized delivery after green checks is one commit and push to the work branch. No Production, deployment or merge. Stop before Writer Fence or import. **V18 HOLD; P1-04/P1-05 open.**
