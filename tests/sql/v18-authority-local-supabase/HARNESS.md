# Disposable authority Auth/PostgREST harness

This is branch-only verification infrastructure, not a migration, server rollout,
application integration, hosted acceptance, or permission to move legacy balances.
The engine remains byte-identical. The separately reviewed adapter builds one
transaction after the harness proves the local disposable target.

## Commands and ownership

- Pure checks: `python3 -m unittest discover -s tests/sql/v18-authority-local-supabase -p 'test_*.py' -v`
- Actual acceptance: `python3 tests/sql/v18-authority-local-supabase/harness.py run`
- Recovery cleanup: `python3 tests/sql/v18-authority-local-supabase/harness.py cleanup`

Actual operations refuse non-GitHub-Actions contexts and require a fresh
`RUNNER_TEMP/irth-v18-authority-<run>-<attempt>` project. CLI 2.122.1 is pinned.
API/database/shadow ports are 55531/55532/55530, distinct from the earlier local
compatibility-gate lane. The script ignores repository Supabase configuration,
migrations and seeds; linked project refs and unexpected SQL are forbidden.
Database commands pin user/database/address/port. Redirects and HTTP proxies are
disabled. Ambient Supabase/PG/remote Docker settings are removed; Docker uses the
local Unix socket. Names, project labels, image IDs, running states and mapped
ports are checked for the four real services. CLI/Docker subprocess output is
captured privately and never forwarded. Synthetic users use the reserved `.invalid`
domain and generated passwords; only real Auth admin creation/password grants
produce the JWTs used for owner assertions. Tokens/keys/passwords are never logged.

The admin must be a verified local superuser because the unchanged engine creates
a synthetic BYPASSRLS role. If unavailable, installation fails; the engine is not
silently rewritten. Auth users must be absent before adapter installation.
After atomic installation, local authenticator configuration exposes only the
API schema. Actual successful schema selection and rejected public-profile access
prove configuration precedence; a reload failure is a blocker, not acceptance.

## Coverage

- Effective actual anon/authenticated/service and synthetic-role table, column,
  function, schema and trusted-role-membership boundaries; safe RPC ownership and
  search paths; actual authenticated/service attributes.
- Future-object default ACL probes under dedicated issuer/executor owners, rolled
  back. Global postgres defaults are not changed. Future postgres-created fixture
  objects are **not** certified and would require explicit ACL cleanup/audit.
- Own bootstrap and identical replay; cross-owner rejection; concurrent bootstrap.
- Missing/anon/service credentials, malformed JWT, tampered signature and tampered
  subject rejected through real HTTP, not SQL claim settings.
- No caller-owner overload; actual fact receipts, request binding, exact replay,
  alias request rejection, stale/negative revisions and owner-isolated request IDs.
- Two parallel HTTP CAS requests from distinct sealed sources yield exactly one
  winner; concurrent exact purchase retries yield one effect and the same receipt.
  Parallel HTTP requests do not establish forced database lock overlap. The
  unchanged PostgreSQL engine fixture covers forced overlap separately.
- Deliberate journal corruption rejected, original state restored, guard enabled.
- A late consumption-write fault rolls back the earlier account/operation writes;
  the exact request succeeds after removing the fault.
- Negative controls demonstrate detection of a column-only privilege leak and a
  reachable owner-argument overload. Controls are removed, ACL/state rechecked,
  and a previously successful exact replay is tested again.

Every rejected engine request compares a deterministic snapshot of all seven
protected engine tables. SQL is used for fixture issuance, fault injection,
catalog inspection and state observation only; no SQL-set claim is presented as
JWT verification. Distinct-fact entitlement alias forgery, numeric overflow/underflow, immutable
bootstrap conflicts, facts-purpose rejection and the larger SQL engine matrix remain covered by the separate PG fixture, not newly claimed here.

## Evidence and limits

Only `acceptance.json` is uploaded: static case names, pinned hashes, image IDs,
public catalog metadata/default ACLs, a final state digest and sanitized stage
failure. Raw process logs, database files, Auth responses and JWTs are excluded.
Both normal and failure paths attempt exact-project cleanup without backups; an
always-run CI cleanup step retries. No global stop/prune/remove command is used.

Local unit/syntax validation is not actual stack acceptance. The first reviewed
CI execution must verify the precise committed adapter/harness before any local
Supabase PASS claim. Even that result leaves hosted integration, production,
application authority activation and device acceptance pending.
