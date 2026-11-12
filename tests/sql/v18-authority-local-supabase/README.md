# Disposable local Auth/PostgREST adapter (draft)

This directory does not contain an application migration. The authority engine
SQL stays unchanged in `../v18-authority-prototype/prototype.sql`. Its PostgreSQL
engine proof does not prove this adapter works: real local-stack execution is
**pending**. Hosted staging, historical economic baseline validity, existing
legacy-writer exclusion and production activation remain outside this scope.

`adapter.py` builds SQL only; it does not connect or run commands. A future runner
must first verify the fresh CLI 2.122.1 project's temporary directory, generated
configuration, disabled migrations/seeds, absence of linked project references,
loopback endpoint ports and Docker project labels/container identities. It must
create the exact local-only marker in a fresh database and never use repository
Supabase configuration or credentials. Schema exposure must occur only after the
installation transaction commits. Captured CLI output must never be printed.

## Reviewed adaptations

The builder requires the approved engine SHA256 and exactly one occurrence of
each complete reviewed block. It transforms only:

1. The engine's custom database/marker guard into a guard for the independently
   verified fresh local Supabase `postgres` database and distinct local marker.
2. Its `CREATE EXTENSION pgcrypto` statement into a narrow private digest facade.
   Existing `extensions.digest(bytea,text)` must be a member of the pgcrypto
   extension, return bytea, and not be SECURITY DEFINER. The facade is owned by
   the isolated issuer, SECURITY INVOKER, with a fixed qualified target. Neither
   the extension nor its functions are dropped, relocated or replaced.

The same installation transaction replaces the **private** fixture subject
helper with `auth.uid()` and explicit NULL rejection. Supabase `auth.uid()` is
fingerprinted before/after and never overwritten. Existing Supabase object
creator defaults can survive owner transfer, so actual anon/authenticated/service
ACLs are explicitly removed from both prototype schemas and their objects before
only the two API functions are granted to actual authenticated. No membership in
fixture or trusted roles is granted. Dedicated issuer/executor future defaults
are globally restrictive; schema-scoped postgres revocations are not a claim
that future postgres-created objects are globally private. Such objects would
require the same explicit object revocation and effective privilege audit.

The artifact should contain source, transformed-engine, adapter and complete
transaction hashes, redacted catalog evidence and static test labels only.
Never upload tokens, passwords, CLI status, raw request/response bodies, database
URLs, SQL exception detail or container environments.

## Required real-stack proof (not yet executed)

- Users created through local Auth admin and password-grant JWT issuance; no SQL
  user creation or fabricated tokens used as successful identity proof. Deliberately
  tampered real-token signatures/subjects are negative controls only. Auth assertions must travel through real
  PostgREST with explicit Content-Profile/Accept-Profile headers.
- Successful own-account control before testing missing/invalid JWT, cross-owner,
  anon, service-role and owner-argument overload denials.
- Effective schema/function/table/column/default ACL and recursive membership
  checks supplement HTTP tests; inaccessible-schema 404 is not table ACL proof.
- Exact retry, changed request tuple rejection, new-request alias rejection,
  journal-corruption rejection/restoration, parallel HTTP CAS from distinct sealed
  sources, same-request concurrency and transaction-fault rollback. These HTTP
  submissions do not prove forced database lock overlap; the unchanged PostgreSQL
  engine fixture supplies that separate evidence.
- Negative revision rejection is exercised over HTTP. Numeric overflow/underflow,
  immutable bootstrap conflicts, facts-purpose rejection and distinct-fact alias
  forgery remain separate PostgreSQL engine checks, not claims of this HTTP lane.
- Every negative mutation case compares all protected state before/after. Fault
  controls remain admin-only and are removed/restored before final clean checks.
- Negative controls must demonstrate that weakening the intended boundary makes
  its assertion fail, not merely that a request errored for an unrelated reason.

Current local evidence: five builder safety tests pass; generated SQL parses as
86 DDL statements. Neither result is database execution or JWT acceptance.
