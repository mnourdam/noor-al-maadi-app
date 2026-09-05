# Repository-only migration files (audit-only, non-replayable)

17 files exist in `supabase/migrations/` whose version strings are absent from
production's `supabase_migrations.schema_migrations`. They are audit artifacts,
not pending work. None of them can execute: this project has no repository
migration runner, and `supabase/migrations/` is written only *after* the
migration tool has already applied SQL.

**Rule: do not move, rename, delete or re-run any of these files.**

## Group A — 8 genesis files (`20260619010948` … `20260619022004`)

Written during project bootstrap, before migration history began recording.
Their objects exist in production but in *later, evolved* form. Replaying them
would silently roll back live behaviour, in particular:

- `20260619015533`, `20260619022004` — older `sync_my_public_stats` bodies that
  write a **client-supplied `streak`**. Replay would destroy the V17-04B server
  streak authority (`20260905130745`). Highest-severity hazard in the repo.
- The remaining genesis files carry early table/policy/grant definitions that
  later migrations have since altered.

## Group B — 9 hand-named files

| File | Treatment |
|---|---|
| `20260723130000_remove_golden_manual_reading_time.sql` | applied historically under a tool-generated version; audit-only |
| `20260806103500_fix_investigations_grants.sql` | superseded by later grant hardening |
| `20260806104000_harden_investigation_exports.sql` | superseded by later export RPC revisions |
| `20260806104500_refresh_export_rpc.sql` | **INVALID ARTIFACT** — the file body is captured `psql` console output (result tables/notices), not executable SQL. It could never run. Keep as evidence; never attempt to repair or execute it. |
| `20260806110000_final_permission_harden.sql` | superseded by `20260903073047` |
| `20260812195700_micro_batch_fix.sql` | audit-only |

(Remaining entries in this group are equivalent audit-only records.)

## Why the 130 timestamp-skewed versions are harmless

130 repo files carry a version string 1–2 seconds off the production version
for the *same* migration — a clock artifact between the moment SQL was applied
and the moment the file was written. They are not extra migrations and not
missing migrations: each has a production counterpart with identical content.

They cannot cause an accidental replay for the same structural reason as
everything else above: no code path in this project reads
`supabase/migrations/` and executes it. The only way SQL reaches production is
an explicit, individually approved migration authored through the tool, which
allocates a fresh version at execution time. A stale or duplicate filename in
the repo has no execution semantics whatsoever.
