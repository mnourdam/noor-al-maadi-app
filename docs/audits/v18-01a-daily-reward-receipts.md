# V18: daily reward acknowledgment boundary and writer map

## Concrete defect and repair scope

The daily reward adapter previously cast an unknown error-free RPC response and
used truthiness of `applied`. Null, empty objects, negative responses other than
unauthenticated, or nonboolean applied values could be reported as granted or
already_granted. With a readable profile snapshot, DailyQuestCard could mark the
quest rewarded despite lacking a valid acknowledgment. A readable total is not
proof that this operation was included.

This slice validates the response before publishing a successful outcome. It is
not a new reward rule, authority cutover, grant, compensation, or baseline import.
The existing valid acknowledgment shapes and identity fencing must remain intact.
Uncertain responses retain the stable operation ID, explicitly remain unresolved,
and disclose that the started RPC may have applied. They publish no usable stats
and do not automatically enqueue a second request.

## Actual writer and baseline inventory

These observations describe checked-in source and migrations, **not a verified
hosted catalog**. No production query or migration was performed.

| Writer | Boundary still missing |
| --- | --- |
| `profile.tsx`: completion methods, addPoints/addDinars, heart spending and buyHint | Local economic changes do not carry universal operation inclusion. |
| `profile-writer.ts`: useProfileWriter persistence | Whole hakaya.profile.v2 snapshot; per-provider identity fencing is not cross-tab CAS. |
| `profile.tsx`: replaceProfile, mergeCloudSave, applyServerStats | Balance-bearing replacement without authoritative inclusion revision. |
| `cloud-save.ts`: pushSave | User-keyed whole-blob upsert, client timestamp rather than server CAS. |
| `account.tsx`: debounce/reconnect/manual sync | Cloud save and public stats calls are separate, not an atomic commit. |
| `social.ts`: pushPublicStats | Client balance snapshot sent to sync_my_public_stats. |
| `daily-quest-reward.ts`, `offline/flush.ts` | Generic apply_profile_delta accepts client amounts and UUID. |
| Achievement, investigation, streak, referral/admin SQL | Additional writers remain outside any single-client admission fence. |

`20260905143448_69d67dc7-08a1-40ec-a877-e59fc988f19e.sql` defines the repository's
latest sync_my_public_stats snapshot update. Row locking serializes writes but
does not reject stale economic snapshots.

`20260711073913_7b89dce5-3fe2-4a7a-b135-4ad9b7855c64.sql` defines apply_profile_delta.
Its UUID conflict returns already_applied without comparing owner or payload.
It also grants authenticated users direct insertion into their own delta rows.
Thus delta-row existence alone does not prove the matching profile mutation
occurred. This repair does not claim that an acknowledgment fixes those backend
permissions or converts the ledger into cryptographically verified evidence.

The repository also regrants authenticated profile INSERT/UPDATE/DELETE in the
20260624233722 migration after an earlier revocation. Comments in client code
cannot establish actual permissions. No grant/revocation is performed here.

## What a future typed inclusion contract must establish

Bind authenticated owner, stable operation identity, immutable payload/reward
contract, authoritative resulting revision and inclusion evidence. Enforce it at
every economic write boundary, including legacy clients and server routines.
A duplicate must match the original contract, not merely a colliding UUID.

None of local profile, client-authored cloud save, currently writable server
profile, or insertable delta ledger independently supplies a trustworthy legacy
opening baseline. Dormant settlement storage is intentionally not an admitted
baseline. Timestamps, equal totals, an empty outbox or a ledger row cannot replace
that proof. V18 remains **HOLD**, with production **NO-GO**.

## Acceptance

Implemented response classification requires literal `ok === true` and a literal
boolean `applied`. First application accepts no contradictory reason. Duplicate
acknowledgment accepts `already_applied` or the historically supported omitted
reason. The exact unauthenticated response remains recognized. Unknown, malformed,
negative and contradictory replies are unresolved, with `rpcMayHaveApplied: true`,
no stats publication, no post-response profile/ledger probe and no automatic queue.

The actual adapter and mounted card were exercised with twelve malformed cases:
null, empty object, array, string, missing fields, nonboolean applied values,
denial and contradictory combinations. **Before the fix: 24 failures**. After the
fix and added valid-shape/retry cases: **62/62 focused tests PASS**. Existing
assertions and fixtures were not changed. A remount retry proves the stable delta
ID is reused and a later valid duplicate can complete without additive fallback
or celebration. Independent adversarial review found no scoped blocker.

The separate row-existence hydrator and outbox's ok-only acknowledgment are
unchanged. Their existing weaker evidence does not become stronger because this
adapter was fixed. No end-to-end inclusion, new hosted authority or delivery
guarantee is claimed. Full regression and CI evidence are recorded below.

Final local validation: **1,153/1,153 tests PASS** across 44 files; application
and regression typecheck **PASS**; offline client/SSR build **PASS**;
`git diff --check` **PASS**. Remote branch CI later **PASSED**: [43179521106](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43179521106), tested commit `187180ddbf7aee31501fa04ae710859903527c86`.
