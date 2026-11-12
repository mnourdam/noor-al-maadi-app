# Investigation reward evidence: isolated actual-source repro

Status: **unexecuted PostgreSQL fixture**. Pure safety tests are not evidence that
the vulnerabilities have been reproduced on an engine. No migration, application
caller, published authority prototype, hosted service or real player is changed.

`fixture.py` pins complete migration bytes and extracts the latest
`complete_investigation_v2` function unchanged, plus original progress table/RLS/
grants and applied delta ledger SQL. It creates only synthetic dependency tables:
users, profiles, investigations and collection. This is a deliberately bounded
model of dependencies, not the complete production catalog. `auth.uid()` is an
explicitly forgeable SQL setting shim; no JWT/authentication proof is claimed.
The fixture requires a named empty PostgreSQL 17.6 database, strict loopback port,
fixed job-only credentials and a distinct marker. It must receive independent
review before execution or workflow publication.

## Reproductions and controls

1. Fresh completion grants exact content-selected amounts; replay doesn't grant
   again. This distinguishes functioning dependencies from an unrelated SQL error.
2. An authenticated owner inserts arbitrary `reward_snapshot` via actual own-row
   policy. Unchanged completion replay consumes its artifact as restoration
   evidence. No claim is made about catalog-level collectible foreign keys beyond
   the explicitly synthetic dependency; the client-writable snapshot itself is
   the core provenance defect.
3. An owner inserts a different payload with a chosen delta ID. Fresh completion
   records the content reward snapshot but reports `reward_granted=false` and
   leaves profile totals unchanged. The receipt does expose that false flag;
   this test does NOT claim it falsely returns `reward_granted=true`. It proves a
   stored completion/snapshot alone is not wallet-inclusion evidence.
4. Cross-owner insert must still be denied, showing the defect is a permissive
   own-row evidence producer, not a missing owner check.

Hash evidence and static check labels only are emitted. No raw database error or
connection data is logged. PASS_REPRODUCED means the expected defects were
observed in this fixture, never that the application is safe.

## Counterfactual producer design, not implemented

A prospective protected producer would revoke client INSERT/UPDATE/DELETE on
reward evidence, derive canonical entitlement identity server-side, and append
its immutable typed fact in the same transaction as any admitted economic
transition. A conflicting existing ledger identity/payload must abort all new
completion/snapshot/collectible writes, not merely skip balances. Exact replay
must match the stored immutable tuple. Tests must show direct-write denial,
collision rollback, same-identity concurrency, valid new completion, exact replay
and content-change history preservation.

These changes alone do not establish legitimate gameplay completion. Current
RPC accepts the caller's completion assertion and score without independently
verifying gameplay. A real eligibility source/policy is still needed. Existing
client-writable history cannot become trusted by revoking writes today. No legacy
baseline is imported, guessed, repaired or reconstructed from current content.
A bridge to authority also requires explicit once-only/version lineage policy,
proof of inclusion, and exclusion of all competing balance writers.
