# P1-05B-04 — verified disposable Supabase integration

**LOCAL STACK PASS. Hosted staging remains PENDING. Production NO-GO / V18 HOLD.**

Actual run: https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43172826846

- Tested commit: `01113a95bb206f294222fd44403dd859c78c4f22`.
- Job: `131029918194`, `local-supabase-only`, SUCCESS.
- 13 pure safety tests and 55 actual local-stack acceptance checks passed.
- Setup, real-stack probes, project-specific cleanup and evidence upload each
  completed successfully. No real project, user account or secret was supplied.
- Artifact `13922897715`, SHA-256
  `a0a61e1d930de9bf7a3bddee2ed51c38a7603110abd235087f87e24ba3528e8b`.
  The verified, redacted JSON content is preserved as
  [acceptance evidence](evidence/v18-local-supabase-43172826846.json), since the
  original Actions artifact expires after seven days.

## What this execution proves

This is a real isolated Supabase stack, not the earlier synthetic PostgreSQL
role/auth.uid fixture. Real local Auth created four synthetic users and issued
JWTs; PostgREST resolved the actual Supabase auth.uid and enforced RLS/ACLs.

The inert gate returned exact false-authority DTOs for candidate, incomplete,
unenrolled V17-like and new accounts. Users saw only their own diagnostic rows.
Authenticated and service-role writes were denied; anonymous/service-role direct
reads and RPC execution were denied. Invalid JWTs and destination UID arguments
were rejected. Three controlled negative cases detected relaxed UPDATE ACL,
cross-owner RLS exposure and a UID-accepting overload; each was restored and
positive/negative checks revalidated.

Actual catalog evidence includes inherited roles/default ACLs, enabled/forced
RLS, table owner and table/function ACLs, single no-argument STABLE SECURITY INVOKER
RPC with `search_path=pg_catalog`, effective privilege boundaries and unchanged
auth.uid definition. A full-row synthetic sentinel remained byte-equivalent.
It is not a snapshot or validation of the application's real economy tables.

## Exact observed stack

CLI 2.122.1; official setup action pinned to
`689adcfb80d947100a1eab127289b97d1fb07b13`.

Observed images: Supabase Postgres 17.11.0.006, GoTrue v2.197.0,
PostgREST v16.5 and Kong 2.8.1. Pulled image IDs/digests are recorded in the JSON.
The CLI selected these images; the workflow does not claim immutable image pins.

Proposal SHA-256:
`cc54b79a32b4e9d8c407c76989cf9872988b23438803643e2e01662b1c0218b2`.
The proposal file was not changed or moved into production migrations.

## What remains unproven

This does not establish hosted staging's deployed versions, existing schema,
migrations, default grants, account provenance or application authorization.
It does not enable economic authority, legacy balances, guest transfer or reward
settlement, certify Android force-stop behavior, or authorize deployment.
P1-04/P1-05/P1-06 remain OPEN. The earlier isolated PostgreSQL engine PASS remains
separate; this adds local-stack Auth/PostgREST evidence only.
