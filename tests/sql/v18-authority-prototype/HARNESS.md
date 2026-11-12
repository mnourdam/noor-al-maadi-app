# Independent real-PostgreSQL acceptance harness

This harness executes the sibling `prototype.sql` contract in a fresh disposable PostgreSQL 17.6 database. It never reads repository environment files, Supabase configuration or application migrations. The only accepted endpoint is 127.0.0.1:55432, database `v18_authority_fixture`, with the fixed synthetic job credentials. Unexpected libpq override variables, database/version mismatch, existing user schemas or public tables fail closed. A private fixture marker is established and verified before subsequent connections/actions. Docker service listeners may bind the runner host; only client destinations are claimed to be loopback.

The workflow runs only on the repair branch, uses read-only contents permission and no persisted checkout credentials, and installs pinned `psycopg[binary]==3.2.9`. The PostgreSQL image tag is `postgres:17.6-bookworm`; this is a version pin, not an immutable image digest claim. No project secrets, hosted database, app deployment, signing or publication are configured.

## Actual engine checks

- Exact bootstrap replay, missing/foreign/alternate genesis refusal and simultaneous bootstrap.
- Exact request retry after later revisions; immutable expected revision/fact binding; independent request-ID scope across owners.
- Two distinct sources competing for the same account revision. The first mutation remains uncommitted while the second backend is explicitly observed waiting on its lock using `pg_stat_activity` and `pg_blocking_pids`. Only then does the holder commit. Absence of observed overlap fails the test. Same-request retry and bootstrap use the same forced-overlap mechanism.
- Exact final balances/revision and decimal-string bigint receipt fields.
- Issuance uniqueness and independently tested consumption uniqueness across bootstrap and later grants. The fixture administrator temporarily drops issuance lineage uniqueness in a rollback-only transaction, creates an alias fact, and still requires the runtime consumption check to reject it.
- Direct client/service-role writes, role membership, evidence-minting privileges, trusted executor evidence write privileges, function default ACLs and caller temporary-schema shadowing.
- Fixture-admin-only failure triggers after account, operation and consumption mutations. Every rejection compares complete snapshots of source journal, seals, catalog, accounts, operations and consumption. No fault parameter is added to a callable authority API.
- Hash/sequence/owner/issuer/seal tampering, correctly hashed extra tail, absent explicit genesis, negative intermediate balance despite positive final balance, bigint overflow, spend underflow and revision overflow.

Tamper and weakened-constraint probes occur only as the fixture superuser inside rollback-only transactions. They test fail-closed behavior against inconsistent trusted inputs; they do not claim superusers can be excluded from controlling their own database. A separate synthetic legacy table remains writable to demonstrate that this new schema does **not** establish exclusion of existing player-economy writers.

## Authentication and evidence limits

The prototype's request subject comes from `set_config('request.jwt.claim.sub', ...)`. It is deliberately forgeable SQL test data, **not** verification of a JWT, Supabase Auth, PostgREST routing, or production authorization. Trusted source events and seals are synthetic fixtures, not proof that actual player balances have complete legitimate histories. Only facts-purpose sources may supply new operations. A dedicated control refuses an otherwise valid reward from an alternate genesis journal, as well as refusing replacement of the admitted baseline. Facts-purpose clones of baseline evidence are independently rejected by consumption uniqueness after issuance uniqueness is deliberately relaxed. This fail-closed fixture contract is not a production migration policy.

A new connection is not a database restart or crash-durability test. Transaction commit/rollback and overlapping clients are the only durability/concurrency claims. No universal cross-device economic authority or migration eligibility is inferred.

`harness.py` must execute through `main`, complete a nonempty minimum acceptance set and emit PASS only at the end. Exceptions exit nonzero and produce an explicit FAIL record containing only sanitized phase/type/SQLSTATE and completed check names. The artifact allowlist contains only `acceptance.json`, not SQL connection parameters, raw database contents or credentials. An old acceptance file is removed before each run.

Local validation without a server: Python compilation and `python -m unittest discover -s tests/sql/v18-authority-prototype -p 'test_*.py' -v`. These pure endpoint tests are **not** engine acceptance. Actual CI execution remains required.
