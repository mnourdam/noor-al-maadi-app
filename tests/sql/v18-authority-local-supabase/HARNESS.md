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
a synthetic BYPASSRLS role. A bounded existing-role socket path is described below.
If no verified admin route is available, installation fails; the engine is not
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

## Verified disposable admin route (overall acceptance still pending)

The first real run `43209894855` reached the local database but stopped before
engine installation: local `postgres` had CREATEROLE, not SUPERUSER. Cleanup
succeeded. This is a harness compatibility blocker, not a passing Auth result.

The replacement path never elevates `postgres` or changes a real role's attributes.
Read-only catalog checks require existing `supabase_admin` to have LOGIN and
SUPERUSER. `SHOW unix_socket_directories` must identify exactly `/tmp` or
`/var/run/postgresql`. Before each admin command the harness re-inspects the pinned
container ID, name, project label, running state, image and mapped database port.
The image must match the observed official `17.11.0.006` reference, image ID and
repository digest constants. A different image requires review, not fallback.

Only then does `docker exec -i <pinned-id> /bin/sh -c <fixed-script>` run `psql`
with an explicit approved socket, database `postgres`, user `supabase_admin`,
port 5432, `-X`, `-w` and `ON_ERROR_STOP`. The script uses the existing container's
`POSTGRES_PASSWORD` via `PGPASSWORD`; its value never appears in command arguments,
host environment, output or artifacts. No password fallback or role alternative is
attempted. Each connection executes a guard **before** supplied SQL requiring
exact current/session user, superuser/login attributes, database, configured port
and null network addresses (a Unix socket). The first connection additionally
returns a non-secret identity record that must match exactly before enabling the
route. An unavailable password/socket/role remains a failure.

Supporting upstream source inspected for this conditional route:
- Official CLI `v2.122.1`, `apps/cli-go/internal/db/start/start.go`: local
  `POSTGRES_PASSWORD` is supplied from the fresh project's database configuration.
- Official CLI same tag, `apps/cli-go/internal/utils/templates/globals.sql`:
  `supabase_admin` is an existing LOGIN SUPERUSER role.
- Official postgres `nix/packages/cli-config/{postgresql.conf,pg_hba.conf}.template`
  as inspected: Unix sockets may use `/tmp` and require SCRAM authentication.
  The harness therefore does not assume peer/trust authentication or a fixed
  unverified socket path.

Run `43211424659` subsequently verified this pinned-container admin route,
installed the adapter, passed effective/default ACL checks and created both real
Auth users with password-grant JWTs. Its 11 completed checks do not establish
overall acceptance: the run stopped at the HTTP schema-readiness check and cleanup
succeeded. The remaining acceptance probes must still run successfully. Dedicated-owner default ACL tests remain authoritative; future
objects created by either postgres or supabase_admin are not certified without
explicit cleanup and effective ACL inspection.


## Schema-readiness correction

The failed readiness check had an impossible-success predicate: it used the
ordinary RPC rejection helper, which accepts HTTP 400/401/403/404, to recognize
`PGRST106`. The official PostgREST errors reference specifies **HTTP 406** for
`PGRST106` (requested schema not exposed). The old predicate therefore rejected
that valid boundary result. The failed run did not record response codes, so this
is a proven harness contract defect, not proof that it was the only runtime cause.

Readiness now uses an exact **406 AND PGRST106** predicate. Wrong status or code
still fails; the generic denial helper is unchanged. The negative probe uses the
same POST `/rpc/bootstrap` endpoint and payload under explicit `public` profile,
not the OpenAPI root. The positive API-profile request must independently reach
the real engine and return its exact unknown-seal error before readiness passes;
actual successful own bootstrap remains required afterward.

The schema restriction is still only `v18_proto_api`, now set using
`ALTER ROLE authenticator IN DATABASE postgres SET ...`. Official PostgREST
configuration documentation says database-specific role configuration overrides
global role configuration. No schema or privilege is broadened. Catalog evidence
contains only booleans for exact schema configuration and pre-config presence.
Each readiness attempt records only HTTP status, an allowlisted error code, and a
known static error-class label. Raw message/detail/hint/body, credentials and JWTs
are never copied to evidence. Pure tests cover successful 406 recognition,
wrong-code/wrong-status refusal, mandatory positive control and diagnostic
redaction. Actual completion remains for the next reviewed isolated CI run.

References: `https://docs.postgrest.org/en/v14/references/errors.html#pgrst106`
and `https://docs.postgrest.org/en/v14/references/configuration.html#in-database-configuration`.
