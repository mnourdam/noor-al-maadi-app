# V18 disposable authority Auth/PostgREST acceptance

## Accepted scope and evidence identity

**PASS for the reviewed disposable local Supabase stack only. V18 remains HOLD;
production and hosted staging are not accepted.**

Successful run: [43212544324](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43212544324),
job `131163545156`, source `b24cb784d6f64661c6e26d4456fe53cbca3a6ac0`.
The job completed **66 runtime assertion records** and **34 pure harness/adapter
tests**. These are assertion counts, not 66 independent end-to-end scenarios.
Cleanup reported `unique project stopped without backups`.

Sanitized evidence: [acceptance record](evidence/v18-authority-local-supabase-43212544324.json).
The coordinating task downloaded artifact `13942566409` and recorded ZIP SHA-256
`5ccb5a16e96fb4fb324f79f233ea4f8f9090f15a84e13a231e56d3419d90359b`.
This review inspected that saved record and independently rebuilt the adapter
from the current engine bytes: all four source/transformation/adapter/transaction
hash fields matched the runtime artifact exactly. This review did not independently
redownload the ZIP.

The engine SHA-256 remains
`236b2f313ecf1861d54ae07ad18dd4c297a27b853b32f70637d536e1f2fd19f8`.
The only pinned engine-text transformations are the disposable-database guard and
the existing-pgcrypto facade. The separate adapter binds the private subject helper
to real `auth.uid()`; the shared function definition remained unchanged.

## Actual stack and authentication boundary

CLI `2.122.1` created a fresh run-specific local project. Recorded images include
Supabase PostgreSQL `17.11.0.006`, GoTrue `v2.197.0`, PostgREST `v16.5`, and Kong
`2.8.1`; exact image IDs/digests are in the artifact. This is **not** the earlier
standalone PostgreSQL **17.6** engine run, and its counts must not be combined as
one run or one database version.

The loopback `postgres` account was not a superuser. The successful harness used
the existing `supabase_admin` LOGIN/SUPERUSER only inside the identity- and
image-pinned disposable database container, over verified `/var/run/postgresql`.
The artifact records the exact role/session/database and socket checks. No
postgres elevation, hosted admin access, or engine privilege rewrite was used.

Synthetic Alice and Bob accounts were created through local Auth administration;
real password grants issued their JWTs. Successful own-account bootstrap preceded
the denial checks. HTTP requests, not manually set SQL claims, exercised owner
binding. Tampered signatures, changed subjects without a new signature, missing
bearer, anon, service-role and malformed JWT requests were rejected, with complete
protected-table state comparisons.

Schema readiness succeeded on its first recorded attempt:

- API-profile bootstrap for an unknown seal returned **HTTP 400 / P0001**, classified
  as the known engine `prototype:unknown-seal` response. This proves API routing
  reached the intended function rather than treating arbitrary failure as readiness.
- The same RPC request under the public profile returned **HTTP 406 / PGRST106**,
  proving that schema was excluded.
- The database-specific authenticator setting was exact; the global setting was
  not relied upon. No database/global pre-configuration hook was recorded.

## Runtime conclusions

The 66 recorded assertions support:

- Effective schema/table/column/function and trusted-role membership boundaries
  for actual Supabase roles, plus dedicated issuer/executor future-object defaults.
- Own bootstrap, exact replay, cross-owner bootstrap/apply rejection, and distinct
  owner request-ID scopes. Client-supplied owner overloads are absent.
- Real HTTP fact application, immutable request binding, unchanged retry receipts,
  new-request duplicate-consumption rejection, stale/negative revision rejection.
- Parallel CAS requests from **two distinct sealed sources** produced exactly one
  winner and one committed delta. Parallel exact purchase retries produced one
  effect and identical receipts. Submission was parallel; forced lock overlap was
  **not** observed or claimed in this HTTP lane.
- Deliberately corrupted journal data was rejected, then restored byte-for-byte
  with its mutation trigger enabled.
- A late consumption-write fault rolled back account/operation/consumption changes;
  the same request succeeded after fault removal.
- Negative controls detected a deliberately granted column-only privilege and a
  reachable owner-argument overload. Both controls were removed; effective ACLs,
  protected state and a final original replay were rechecked successfully.

The evidence contains static labels, image/adapter hashes, public catalog/default
ACL information and a final state hash. It contains no passwords, JWTs, raw Auth
responses, connection URLs or raw error details.

## Earlier safe failures and corrected contracts

The initial local-stack attempt stopped at the admin preflight: the available
`postgres` role had `superuser=false`, despite `create_role=true`. Four isolation
checks had passed; cleanup succeeded. Its sanitized artifact was identified by
the coordinating task as `13941155577`. This was not engine/Auth acceptance.

Run `43211424659` then proved the pinned-container admin path, adapter installation,
ACL probes and both real Auth user/password-grant flows, but failed schema
readiness after 11 recorded checks. Cleanup succeeded. Inspection found a definite
predicate bug: the generic rejection helper excluded HTTP 406, making a valid
PGRST106 schema-exclusion response impossible to accept. That failed run did not
record the HTTP response classification, so this is not claimed to be its sole
observed cause. The correction added a dedicated exact 406/PGRST106 predicate,
matched RPC-path probing, database-specific configuration and sanitized readiness
diagnostics. The successful run above supplies the missing actual observations.

## What remains unproved

This local proof does not certify hosted Supabase, production permissions or
configuration, application authority integration, migration/cutover, or any
legitimate historical player opening balance. Issued facts are synthetic; exact
subject/term lineage does not prove real-world entitlement identity or provenance.

HTTP numeric evidence covers negative revision rejection. Overflow/underflow,
forced database lock contention, alternate-genesis/facts-purpose restrictions and
distinct-fact lineage aliases belong to the separately recorded PostgreSQL engine
matrix, not new HTTP assertions here. No crash/restart durability, browser/device
behavior, offline protocol, or universal exclusion of existing legacy writers is
established. Future objects created by postgres/supabase_admin require explicit
ACL cleanup and audits; only dedicated issuer/executor future defaults were tested.
