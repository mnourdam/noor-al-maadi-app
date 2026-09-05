# V17 production migration baseline

**Status: informational. This document is not executable and authorises no
database change.**

Written during V17-06B (repository bookkeeping / safety phase). No migration
was executed, no migration-history row was altered, no production data or
database object was changed, nothing was deployed.

## 1. Production migration history is the only authority

`supabase_migrations.schema_migrations` (269 rows) is the single source of
truth for what production runs. `supabase/migrations/` (274 files) is a
**record**, not an input: the migration tool executes SQL first and writes the
file afterwards. There is no `supabase db push`, no CI migration job, and no
package script that applies migrations. Consequently the repository can never
replay itself, and a repo/production divergence is a documentation problem, not
a deployment risk.

## 2. Current V17 baseline

- Branch: `v17-development`, created from production commit `ce7353571`.
- Reconciliation performed 2026-09-05 against the live database.
- Latest relevant production versions: `20260903081052` (profiles replica
  identity) and `20260905130745` (V17-04B streak authority).

## 3. Reconciliation outcome

- 9 production-only migrations recorded under `docs/db/production-history/`
  (7 verbatim, 2 pointer records with version/md5/length/retrieval query).
- 17 repository-only files documented in
  `docs/db/production-history/REPO-ONLY-MIGRATIONS.md` as audit-only.
- 130 timestamp-skewed files explained as clock artifacts, not divergence.

## 4. Contracts that must not be regressed

1. **Streak authority (V17-04B).** `public.user_streak_days` is the authority;
   `profiles.streak` is a mirror. The live `sync_my_public_stats` deliberately
   ignores any client-supplied `streak`. **A future migration must never
   restore client-supplied streak writing**, and the older bodies in
   `20260901103353`, `20260901103506` and the two genesis files are historical
   predecessors only.
2. **`toggle_reaction_v2`.** The live body accepts `anchor_type = 'comment'`
   and emits a `story_reaction_on_comment` personal notification. Any change
   must extend, never replace, this contract — read the live definition with
   `pg_get_functiondef` before editing.
3. **`profiles` REPLICA IDENTITY DEFAULT** (`20260903081052`) is current and
   supersedes the earlier `FULL` setting.
4. **Data repair is not schema migration.** The V17-04B mirror repairs were
   one-off data corrections; they define no schema contract and must not be
   re-applied.
5. **Compute size is infrastructure.** The Large→Medium downgrade is not part
   of migration history and never belongs in a migration.

## 5. Rules for authoring new V17 migrations

- Always author through the migration tool; never hand-write into
  `supabase/migrations/`.
- Before altering any function, read its **live** definition
  (`pg_get_functiondef`) — never reconstruct SQL from a repository file or from
  memory; repo copies may be superseded.
- Prefer additive changes (new columns/tables/functions) over rewrites of
  functions that carry frozen contracts.
- Every new `public` table needs GRANTs in the same migration, then RLS, then
  policies.
- Never move, rename, delete or re-run existing repository migration files.

## 6. Comment system baseline (for V17-07, not yet implemented)

- `public.social_comments` columns: `id, anchor_type, anchor_id, author_id,
  body_text, status, moderation_reason, moderated_by, moderated_at,
  helpful_count, editors_note, editors_note_rank, edit_deadline_at, edited_at,
  created_at, updated_at`. **There is no parent/reply column.**
- `add_story_comment_v2(p_anchor_type social_anchor_type, p_anchor_id text,
  p_body text)` accepts only `story` and `entity`, and raises
  `unsupported_anchor` for `comment`. It **cannot create replies today**.
  Called from `src/lib/social/comments.ts` (`addComment`).
- Hearts on comments are already reachable through `toggle_reaction_v2`.

## 7. Remaining prerequisites before V17-07

1. Approval of a schema addition for replies (a nullable self-referencing
   parent column on `social_comments`, plus index and depth limit).
2. Approval of an extension to `add_story_comment_v2` (or a sibling function)
   that accepts a parent comment.
3. Read/RLS decisions for nested replies and their moderation behaviour.
4. A separate, explicitly requested design for heart/reply notifications —
   **deliberately not designed in V17-06B; it remains a hard V17-07
   requirement.**
