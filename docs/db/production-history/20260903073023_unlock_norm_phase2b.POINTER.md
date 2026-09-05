# Production migration 20260903073023 — pointer record (no local copy)

- Version: `20260903073023`
- Length: 15476 chars, md5 `8aef05a765012bcd72410d42332b5591`
- First line: `-- Phase 2b: precompute unlock-spec normalization/validation/leaves at write time`
- Contents: write-time precomputation of unlock-spec normalization / validation /
  leaves (`story_unlock_norm_v2`, `_story_unlock_norm_sync_v2`,
  `_story_unlock_leaves_v2`, `_eval_unlock_prepared_*_v2`).

No local verbatim copy is stored, deliberately: a hand-copied 15 KB body could
introduce transcription drift, and the authoritative verbatim text lives in
production migration history. Retrieve it read-only with:

```sql
select statements[1]
  from supabase_migrations.schema_migrations
 where version = '20260903073023';
```

This migration is ALREADY APPLIED in production. Never execute it again.
