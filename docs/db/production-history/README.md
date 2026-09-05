# Production migration history — reconciliation records (V17-06B)

Read-only bookkeeping. **Nothing in this directory is deployable and nothing
here may be executed.** Every statement recorded here is already applied in
production.

## Why these files are not in `supabase/migrations/`

`supabase/migrations/` is platform-managed and write-protected: files there can
only be created by the migration tool, which **executes the SQL first and then
writes the file as a byproduct**. There is no repository-driven migration
runner in this project (no `supabase db push`, no CI migration step, no
`db.migrations` script). Adding a historical file to that directory is
therefore both impossible and unnecessary.

## Production-only migrations reconciled here

| Version | Record | Notes |
|---|---|---|
| 20260723052041 | verbatim | story-media admin RPCs + storage RLS |
| 20260901103353 | verbatim | `admin_balance_grants` ledger (contains a **historical** `sync_my_public_stats`) |
| 20260901103506 | verbatim | grant-hold `sync_my_public_stats` (**historical**, superseded by 20260905130745) |
| 20260901114549 | verbatim | `admin_content_comment_rankings_v1` |
| 20260903070617 | pointer | Phase 2 unlock-path rewrite (15 KB; verbatim source = production history) |
| 20260903070640 | verbatim | `_uuid_or_null_v2` search_path hardening |
| 20260903073023 | pointer | Phase 2b write-time unlock normalization (15 KB; verbatim source = production history) |
| 20260903073047 | verbatim | unlock helper REVOKE/GRANT hardening |
| 20260903081052 | verbatim | `ALTER TABLE public.profiles REPLICA IDENTITY DEFAULT` — **current state** |

Checksums (`md5` of the recorded statement) are written into each file header
so any copy can be re-verified against production history.

## Superseded predecessors (do not treat as desired state)

`sync_my_public_stats` — chronological chain, oldest first:

1. `supabase/migrations/20260619015533_*.sql` (genesis, repo-only)
2. `supabase/migrations/20260619022004_*.sql` (genesis, repo-only)
3. `supabase/migrations/20260620112906_*.sql`
4. `supabase/migrations/20260627173218_*.sql`
5. `docs/db/production-history/20260901103353_admin_balance_grants.sql`
6. `docs/db/production-history/20260901103506_sync_my_public_stats_grant_hold.sql`
7. **`supabase/migrations/20260905130745_*.sql` — CURRENT AUTHORITY (V17-04B).
   Client-supplied `streak` is ignored; `public.user_streak_days` is the only
   streak authority.**

`toggle_reaction_v2` — chronological chain, oldest first:
`20260723064132`, `20260723065709`, `20260723072538`, `20260723073456`,
`20260723121021` (repo file names). The **live** contract additionally accepts
`anchor_type = 'comment'` and emits a `story_reaction_on_comment` personal
notification to the comment author; verify the live body before treating any
repository copy as the baseline.

`profiles` replica identity: `supabase/migrations/20260627035645_*.sql` set
`FULL`; production migration `20260903081052` set `DEFAULT`, which is current.
