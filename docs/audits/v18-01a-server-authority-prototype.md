# Isolated V18 server-authority ENGINE prototype

## Status and non-deployment boundary

This is a PostgreSQL fixture, not an application migration or production authority.
Its SQL is under `tests/sql/v18-authority-prototype/prototype.sql`, refuses any
other database name or missing disposable marker, and has no application callers.
No existing player profile, cloud save, applied-profile-delta row, or legacy total
is read as bootstrap evidence. Existing live grants/writers are not changed.

**The `request.jwt.claim.sub` subject is an explicitly forgeable SQL test setting.**
It stands in for an already authenticated principal only to exercise engine owner
binding. These tests cannot certify JWT verification, HTTP authentication, hosted
Supabase permissions, or production access. Real Auth/PostgREST acceptance is a
separate later requirement. PostgreSQL administrative override is outside the
application-role threat model and is used only for controlled negative tests.

## Trust boundary and fixed fixture terms

Two separate NOLOGIN, non-superuser roles own the prototype:

- `v18_proto_issuer`: protected catalog, sources, facts and seals. Its admin-only
  seed helpers create fixed typed synthetic facts, append chain entries and seal
  sources. Application roles cannot execute these helpers. The RPC executor has
  no source-table write rights.
- `v18_proto_executor`: mutable account balances/revisions, immutable operation
  receipts and consumption markers. Only two SECURITY DEFINER functions in
  `v18_proto_api` are executable by the synthetic authenticated role. Every
  function has fixed `search_path=pg_catalog` and qualified relation references.

The catalog deliberately contains only explicit test terms: `genesis-v1` issues
100 XP/50 dinars, `reward-v1` issues 10 XP/3 dinars, and `purchase-v1` consumes
7 dinars. These are synthetic fixture policy, not player opening balances, real
reward eligibility, actual pricing, or a proposed production economy. There is
no client delta, balance, arbitrary terms, issuer, or owner argument.

A fact's one-time entitlement identity is `(owner, issuer, kind, subject, term)`.
It is independent of the fact/event UUID, source UUID and request UUID. Protected
source uniqueness and a separate consumption primary key both enforce this
identity. Bootstrap and future operations use the same consumption namespace.
A new fact UUID cannot make an already included entitlement grantable again.
Canonical subject assignment and real-business entitlement uniqueness remain the
trusted issuer’s responsibility. The schema enforces exact typed lineage, not
semantic equivalence between differently named subjects or terms; it cannot
detect an issuer representing the same real-world reward under unrelated labels.

Only facts-purpose sources authorize `apply_fact`. Genesis-purpose journals are
reserved for bootstrap: even an unconsumed non-genesis reward from an alternative
genesis journal is rejected as `prototype:source-not-operation`. A closed journal
alone does not establish post-bootstrap operation authorization. The separate
consumption namespace still rejects baseline entitlement aliases reissued into a
facts-purpose source. This is isolated fixture policy, not a legacy cutover rule.

## Closed-source bootstrap contract

`v18_proto_api.bootstrap(seal_id uuid) -> jsonb` uses the SQL fixture subject.
Before replay it rejects foreign seals. It accepts only an issuer-sealed source
whose purpose is `genesis`, with exactly one genesis at sequence 1, contiguous
sequence 1..N, matching entry count/high-water/root, and no extra tail. Each event
is checked against the fixed catalog and its owner/issuer/source binding. Its
hash is computed server-side from a typed `jsonb_build_array(...)::text` encoded
as UTF-8, including protocol, identity, sequence, fact UUID, entitlement fields,
deltas and previous hash. No ambiguous delimiter concatenation or caller hash is
accepted by an application API.

Every bootstrap prefix must have nonnegative exact balances within signed-bigint
bounds. Numeric intermediates are checked before bigint casts. A negative prefix
cannot be legitimized by a later credit. The source advisory lock is shared by
issuance, sealing and verification operations; immutable triggers reject later
fact changes and any append to a sealed source.

Bootstrap atomically creates revision 0, stores its original receipt and records
consumption for every included source event. A simultaneous exact bootstrap is
idempotent. Another seal cannot replace the baseline. An existing baseline with
inconsistent inclusion markers is rejected, not repaired. Replaying bootstrap
after later operations returns its original receipt, not the current balances.

The seal proves consistency with an issuer-attested closed synthetic journal,
not that a real issuer recorded every historical event or that rewards were
legitimately earned. No production issuer or verifiable historical source is
registered. Unknown, absent, unsigned/unsealed, partial or tampered legacy data
cannot enter through this fixture contract. A digital signature would not solve
missing issuer provenance and is not fabricated here.

## Typed operation, CAS and immutable inclusion

`v18_proto_api.apply_fact(fact_id uuid, request_id uuid, expected_revision bigint)
-> jsonb` looks up and verifies a protected sealed fact; it never receives reward
amounts. Non-genesis fact sources can contain a debit as their first event because
an authorized purchase is applied against an existing admitted balance, not a
zero baseline. Every actual account result remains nonnegative and bounded.

The account row is locked before reading request history or checking revision.
An exact committed request replay is recognized before comparing the account's
current revision. Request identity binds owner, fact UUID, expected revision,
protocol 1 and the server-derived issuer/kind/subject/terms. Changing expected
revision or fact under the same committed request ID is a conflict. A stale fresh
operation leaves no mutation; its rejected request has not been committed.

A distinct request for a consumed entitlement is denied independently of CAS.
Accepted operations atomically update balance/revision, insert the immutable
original receipt and consume the lineage. Errors anywhere roll the transaction
back. No client fault-injection parameter exists; tests may install admin-only
throwing triggers to challenge rollback. Public bigint balance/revision/count
fields are canonical decimal strings, not precision-losing JSON numbers.

## Writer exclusion: exactly what is and is not excluded

Ordinary authenticated, anonymous and BYPASSRLS service fixture roles have no
private schema/table write authority or trusted-role membership. The authenticated
role can execute only bootstrap/apply; no owner-argument overload exists. Default
PUBLIC function execution is revoked, including issuer helpers. The executor has
only SELECT access to issuer tables and the verification function capability.

This excludes uncooperative application-role writers from the **new fixture
schema only**. It does not exclude deployed legacy RPCs, old clients, profile
setters, other databases or administrative owners. A legacy-table negative control
must remain writable while the new authority table is denied, demonstrating that
these boundaries are not a global cutover. The SQL subject shim itself is not an
authentication boundary.

## Validation plan and evidence

The independently authored harness uses a disposable PostgreSQL 17.6 service,
real SQL roles and concurrent connections. Concurrent different-source facts are
required so a shared source advisory lock cannot mask a missing account-row CAS.
It must challenge exact/changed-payload retries, distinct-request and aliased-fact
duplicate grants, bootstrap completeness/tampering, foreign ownership, permissions,
search-path shadowing, arithmetic bounds and transaction fault rollback. Static
harness checks and a DDL parse are not engine acceptance.

Local tooling: no PostgreSQL server, psql or Docker was available. `pglast` 8.7,
installed into a temporary non-project directory, parsed all 63 top-level SQL
statements. Its PL/pgSQL parser cannot resolve the custom schema types, so body
execution/privileges and concurrency were pending until the verified run below. No project
package or lockfile was changed for parsing. Runtime results must be recorded only
after the actual disposable engine run and independent review.

## Unresolved production policy decisions

1. Who can attest a complete real genesis/history and immutable earned facts?
   Existing profiles and client-writable legacy ledgers are not sufficient.
2. What production entitlement key/version rules prevent reissued rewards across
   sources, revised content, refunds, admin corrections and seasons?
3. Which real costs/caps, denial and spending/offline behavior govern unknown or
   stale state? This fixture's terms do not decide them.
4. How are every legacy writer, prior client and backend ingress excluded or
   reconciled before a new authority can be admitted? No migration is present.
5. What real JWT, RLS/ACL, API transport, Android restart and recovery evidence
   supports integration? Engine SQL proof alone cannot supply it.

V18 remains HOLD, production NO-GO. No activation or live migration is authorized
or implied by this prototype or a passing isolated engine run.

## Verified disposable-engine acceptance

Source `b93643d69a168b401fd7dea8d8cca02a9ae10ad7`, tree
`cda31f373dc1cb676320f6b05f811d694339cb40`, ran successfully in
[43204556601](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43204556601),
job `131136305943`, on 2026-11-12. Every step passed, including real PostgreSQL
17.6 transaction/privilege execution, four pure harness safety tests, evidence
upload and container teardown. The actual log reports **325 engine assertions
passed**. These are assertion records, not 325 distinct business scenarios.

Artifact `13936956230` contains only `acceptance.json`; its downloaded ZIP digest
was independently checked against GitHub metadata:
`ac15b6bb087510a774b88d166564e96fd749e11d813f10201f688dd7d5bd0e63`.
The parsed, sanitized evidence is preserved in
[evidence/v18-authority-prototype-43204556601.json](evidence/v18-authority-prototype-43204556601.json).

Evidence includes three observed-lock-overlap executions (different-source CAS,
exact concurrent retry and bootstrap), immutable replay after later revision,
independently relaxed issuance uniqueness with consumption still denying aliases,
all-seven-table snapshots after injected statement failures, missing/tampered
sealed facts, missing baseline inclusion, role/column/default-function ACLs and
arithmetic underflow/overflow rejection. Independent runtime review compared the
assertion checklist with the exact source and harness.

The unchanged older isolated gate workflow also passed at this source
(43204556463), as did npm runtime regressions (43204556440) and frozen Bun graph
verification (43204556389). Application source was not changed by the prototype.

This establishes the **synthetic engine contract only**. It does not test a crash
or database restart, real JWT/Auth/PostgREST, hosted or production schema, actual
player baseline provenance, external semantic entitlement aliases, arbitrary
existing privileged definer routines, or device behavior. Decimal-string receipt
encoding and overflow rejection are tested; successful high-bigint client
interoperability is not separately certified. V18 remains HOLD/production NO-GO.
