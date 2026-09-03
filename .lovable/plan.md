# Revised Plan: Cut Database CPU → Safely Downgrade from Large

Phase 0 is complete (`docs/audits/db-workload-baseline.md`). Its numbers re-rank everything: the story-list unlock RPCs are **75.8%** of all database CPU, realtime WAL polling is **14.6%**, and the content reads originally prioritized are only **~6.5%**. The plan below follows that ranking.

Nothing here is implemented yet. Each phase ships alone and is measured with the Phase 0 query set before the next begins.

Non-negotiable invariants for every phase: story unlock semantics, campaign-linked story behavior, encyclopedia discovery requirements, guest behavior, authenticated behavior, offline/local-first behavior, and existing RPC names/signatures/return shapes all stay **exactly** as they are.

---

## Phase 1 — Audit `list_stories_v2` / `list_stories_guest_v3` (read-only, no changes)

Deliverable: `docs/audits/list-stories-rpc-audit.md` with `EXPLAIN (ANALYZE, BUFFERS)` evidence, a per-node call-count trace, and a proven-equivalent rewrite proposal. **No code or SQL is changed in this phase.**

### What the call graph already looks like

```text
list_stories_v2(p_world_slug)            -- 1-line wrapper
  └─ list_stories_v3(world, collection)
       ├─ base            : stories WHERE status='published' AND NOT story_is_campaign_intro(...)   [per row]
       ├─ scene_counts    : story_scenes grouped
       └─ enriched (PER STORY, ~186 rows):
            ├─ evaluate_unlock_spec_v2(uid, unlock_spec)
            │    ├─ normalize_unlock_spec_v2 + validate_unlock_spec_v2
            │    └─ _eval_unlock_node_v2  → PL/pgSQL recursion, one EXISTS query per leaf
            └─ _story_prereqs_v2(uid, unlock_spec)
                 └─ RECURSIVE walk + LEFT JOIN admin_campaigns / investigations /
                    stories / encyclopedia_entities  ON id::text = ref
                    + one EXISTS per leaf against user_* tables

list_stories_guest_v3(...) → delegates to list_stories_v3 when auth.uid() IS NOT NULL,
otherwise same shape with evaluate_unlock_spec_guest_v2 + _story_prereqs_v2(NULL, ...)
```

### The seven questions, with the working hypothesis to be confirmed

1. **Do they loop story-by-story?** Yes — `enriched` calls two `VOLATILE`/`STABLE` PL/pgSQL functions once per published story. Every call is a fresh function invocation with its own planning and execution.
2. **Do unlock checks repeatedly query `stories`, `investigations`, `user_story_completions`, `user_entity_discoveries`, campaign progress?** Yes. `_eval_unlock_node_v2` issues a separate `EXISTS` per leaf node (story_complete, campaign_complete, campaign_chapter_complete, investigation_complete, entity_discovered, entities_discovered, artifact_owned, atlas_location_visited, achievement_unlocked, player_level). `_story_prereqs_v2` then re-checks the **same** leaves a second time to build the display list.
3. **Are the same conditions recalculated within one call?** Yes, at least twice per leaf (unlock evaluation + prereq display), plus `normalize_unlock_spec_v2` / `validate_unlock_spec_v2` re-run per story in both paths. Nothing is memoized across stories, so a leaf shared by 30 stories is evaluated 30+ times.
4. **Do guest and authenticated variants duplicate heavy logic?** Partially. `list_stories_guest_v3` short-circuits to `list_stories_v3` for signed-in callers (good), but it duplicates the whole `base/scene_counts/enriched/redacted` CTE chain verbatim and shares `_story_prereqs_v2`. The duplication is maintenance risk more than CPU; the guest path is cheap for unlock (evidence-array membership via `_ev_has`) but still pays the full `_story_prereqs_v2` join cost.
5. **What causes the millions of sequential scans?** The prime suspect is the text-cast joins in `_story_prereqs_v2`: `investigations.id::text = ref`, `encyclopedia_entities.id::text = ref`, `user_entity_discoveries.entity_id::text = ref`, `user_investigation_progress.investigation_id::text = ref`. A cast on the indexed side makes the index unusable, forcing a **sequential scan per leaf per story per call**. That matches the baseline exactly: `encyclopedia_entities` 6.64M scans / 14.10B tuples, `investigations` 6.66M / 1.56B, `admin_campaigns` 10.40M / 0.81B — on tables with 78–186 rows. The audit will confirm with `EXPLAIN ANALYZE` on a single `_story_prereqs_v2` call and by watching `pg_stat_user_tables` deltas around one RPC invocation.
6. **Can results be computed set-wise?** Yes, and this is the fix. Both leaf evaluation and prereq resolution are pure set operations: flatten every story's unlock expression into one `(story_id, leaf_kind, ref)` relation, join it **once** against each `user_*` table and each title source, then re-fold the boolean results back up the expression tree. Per-call work drops from `O(stories × leaves × table_scans)` to a handful of set joins.
7. **Can unlock state be joined/precomputed while preserving behavior?** Yes, in two independent steps: (a) a single per-call CTE of the caller's completions/discoveries/progress instead of per-leaf `EXISTS`; (b) optionally a cached flattened leaf table per story, refreshed when `unlock_spec` changes. Step (a) alone is expected to carry most of the win and requires no new persisted state.

### Audit outputs required before Phase 2 is written

- `EXPLAIN (ANALYZE, BUFFERS)` for `list_stories_v3(NULL, NULL)` as guest and as a signed-in user.
- Leaf-count histogram across all published `unlock_spec`s (how many leaves, how many distinct refs, how much sharing).
- Confirmation of which joins lose their index to a cast, with the exact column types.
- A behavior-equivalence corpus: current output JSON of both RPCs for guest + several real users, saved as golden fixtures.

Expected CPU reduction: 0 (read-only). Regression risk: **none**. APK: **no**. Rollback: n/a.

---

## Phase 2 — Set-wise rewrite of the unlock path (the decisive change)

Scope: `list_stories_v3`, `list_stories_guest_v3`, `_story_prereqs_v2`, `_eval_unlock_node_v2`, `_eval_unlock_node_guest_v2`, `evaluate_unlock_spec_v2`. Signatures, names, and JSON output stay identical, so `list_stories_v2` and every client call site are untouched.

Work, smallest-risk-first inside the phase:

1. **Remove the cast-induced scans.** Compare on the native type or add matching expression indexes (`(id::text)`, `(entity_id::text)`, `(investigation_id::text)`) so no plan change is needed elsewhere. This alone may remove most of the 14 B tuple reads.
2. **Single-pass caller state.** Materialize the caller's `user_story_completions`, `user_campaign_completions`, `user_campaign_progress`, `user_investigation_progress`, `user_entity_discoveries`, `user_collection`, `user_achievements`, and profile level into one CTE per call; every leaf reads from it instead of issuing its own `EXISTS`.
3. **Flatten leaves set-wise.** One recursive walk over all stories at once produces `(story_id, node_path, kind, ref)`; evaluate all leaves in one pass; fold booleans back per story. `_story_prereqs_v2` reuses the same flattened relation instead of walking a second time.
4. **Share the guest path.** Guest evaluation keeps `_ev_has` semantics against `p_evidence` but runs over the same flattened relation, so guest and authenticated results come from one code path with two evidence sources.
5. **Golden-fixture equivalence gate.** The rewritten RPCs must return byte-identical JSON to the Phase 1 fixtures for guest and for every sampled user, including locked/mystery/hidden redaction and prereq titles/ordering. Any diff blocks the phase.

Expected CPU reduction: **~70–75% of total database CPU** (the 54.5 M ms these two RPCs consume, from ~1.7 s mean toward a target under ~50 ms).
Regression risk: **High** — this is unlock logic. Mitigated by: no signature change, golden-fixture equivalence, the existing unlock/guest-parity test suites, and staged rollout (deploy the new implementation behind the same names, keep the previous definitions saved verbatim for instant restore).
Required tests: `tests/stories/unlock-source-of-truth.test.ts`, `tests/stories/guest-unlock-parity.test.ts`, `tests/stories/library-isolation.test.ts`, `tests/campaigns/*` progression and intro tests, `tests/offline/*`, plus manual passes on /stories as guest, as a fresh account, and as an account with deep progress.
APK required: **No** — server-side only, contracts unchanged; current Android builds benefit immediately.
Rollback: re-apply the saved previous function bodies in one migration. No data or client change to undo.

---

## Phase 3 — `realtime.list_changes` (14.6% of CPU)

Baseline: **1,604,537 calls / 10.47 M ms / 6.5 ms mean (max 13.8 s)**, with a WAL position of 422 GB.

Tables currently in the `supabase_realtime` publication: `notifications`, `notification_deliveries`, `profiles`, `feedback_issues`, `feedback_messages`.

Is this load expected? **Partly.** `list_changes` is Supabase Realtime's WAL poller — it runs on a fixed tick whether or not anyone is subscribed, so a baseline cost is normal. 1.6 M calls over 9.5 days is ~2 per second, which is the poller's own cadence, but the *per-call cost* scales with how much WAL it has to decode and how many subscriptions it must match. Two things inflate it here:

- **`profiles` in the publication.** Profiles are written on nearly every gameplay event (XP, dinars, streaks, activity). Every one of those writes becomes a WAL change the poller decodes and matches against subscribers, even where the UI only needs the local optimistic value. This is the largest suspected contributor and the 422 GB WAL churn supports it.
- **`notification_deliveries`.** A per-delivery fan-out table; a segment send writes hundreds of rows that no client subscribes to individually.

Planned work (audit first, then narrow):
1. Enumerate every `supabase.channel(...)` subscription in the client, which table/filter each uses, and whether a poll or an invalidation would serve the same UX.
2. Remove from the publication only tables with **no** client subscriber — expected candidates: `notification_deliveries`, and `profiles` if its updates are consumed locally rather than over realtime.
3. Narrow remaining subscriptions to row-level filters (`filter: user_id=eq.<uid>`) so matching is cheap, and confirm each channel is created inside `useEffect` with a `removeChannel` teardown (a channel created at component scope reconnects on every render and is a known cost multiplier).
4. Leave `notifications`, `feedback_issues`, and `feedback_messages` subscribed unless the audit proves a surface no longer uses them.

Expected CPU reduction: **up to ~10–14% of total**, plus a meaningful drop in WAL volume.
Regression risk: **Medium** — a removed publication entry silently stops live updates on a surface. Mitigated by auditing subscribers before removing anything, and by removing one table at a time.
Required tests: notification/announcement suites, feedback workshop tests, manual check that the bell, feedback thread, and profile HUD still update live.
APK required: **No** for publication changes; **yes** only if client subscription code changes ship to Android.
Rollback: `ALTER PUBLICATION supabase_realtime ADD TABLE ...` restores a table instantly.

---

## Phase 4 — Content reads: indexes + projections (the original Phase 1, now correctly ranked)

Combined baseline: campaigns 1.74 M ms, encyclopedia 1.91 M ms, games 1.15 M ms ≈ **6.5% of CPU**.

**4a. Indexes** (additive `CREATE INDEX`, zero client impact): `admin_campaigns(status, updated_at DESC)`; `encyclopedia_entities(status, updated_at DESC)` and `(kind, status)`; `games(status, published_at DESC)`; partial pending index on `friendships`; `device_tokens(user_id) WHERE enabled`.

**4b. Projection views** (additive, nothing dropped): `campaigns_index_public` (no `data` JSONB), `encyclopedia_index_public` (no `body`), `games_index_public` (no `stages`), each with `GRANT SELECT` mirroring the current tables' access.

**4c. Client list reads move to the projections** — `src/lib/cloudSync.ts`, `src/lib/encyclopedia/index-store.ts`, `src/lib/games/store.ts`. Detail reads keep fetching full rows unchanged. The offline snapshot generator (`scripts/generate-offline-snapshot.mjs`, `scripts/lib/offline-snapshot-build.mjs`) is **not** touched, so bundled Android content is identical.

Expected reduction: 60–85% of that 6.5%, i.e. ~4–5% of total.
Regression risk: **Low** for 4a/4b, **Medium** for 4c (a field missing from a projection renders as an empty label).
Tests: encyclopedia index-gating and count parity, campaign divider/progression, games rotation and export, stories offline/local-first; manual hub → category → detail on all three.
APK required: **No** for 4a/4b; **yes eventually** for 4c (web/admin immediately, Android next release; old clients keep working since the tables remain).
Rollback: `DROP INDEX` / `DROP VIEW`, or revert the call sites.

---

## Phase 5 — Polling and background jobs

- `src/lib/offline-content-update.ts`: 5-minute poll → cold start + `online` + visibility-return with a persisted **6-hour cooldown**, and a version/etag-only check so an unchanged version costs no content read. Banner and manual refresh unchanged.
- `FriendNotificationsPoller.tsx` / `PersonalInboxBell.tsx`: 60 s → 5 min with visibility gating.
- Batch and index the `irth-comeback-24h-hourly` and `friend-request-reminders-hourly` queries; schedules and behavior unchanged.
- Admin diagnostics pages pause refresh when hidden.

Expected reduction: small in absolute CPU today, but this is what produces the **near-zero idle cost** property.
Regression risk: **Medium** (a client notices new content later than before, bounded by cold-start and online checks). Tests: `tests/offline/*`, quota recovery, notification suites. APK: **yes** for the Android idle savings. Rollback: single-constant revert per file.

---

## Phase 6 — Prove it, then downgrade

Gate, over **14 consecutive days** after Phase 2 and 3 are live: no statement above ~50 ms mean, no single statement above ~5% of total CPU, hot-table sequential tuple reads down by an order of magnitude, cache hit ≥99%, connection peak well under the target instance's `max_connections`. Then Large → Medium, observe 7 days, then evaluate Small. Rollback is a resize up — minutes, no data loss.

---

## Ranking summary

| Phase | Expected CPU reduction | Regression risk | APK required | Rollback |
| --- | --- | --- | --- | --- |
| 1 · RPC audit | 0 (read-only) | None | No | n/a |
| 2 · Set-wise unlock rewrite | **~70–75%** | High (gated by golden fixtures) | No | Re-apply saved function bodies |
| 3 · Realtime narrowing | ~10–14% + WAL drop | Medium | No (unless client subs change) | Re-add table to publication |
| 4 · Content indexes/projections | ~4–5% | Low (4a/4b) / Medium (4c) | No / yes for 4c | Drop index/view or revert call sites |
| 5 · Polling & jobs | Small now; kills idle cost | Medium | Yes | Revert interval constants |
| 6 · Downgrade | Billing, not CPU | Low | No | Resize back up |

## Technical notes

- All database objects added are additive (indexes, views, replaced function bodies under the same signature). No table, RPC signature, RLS policy, or column is dropped or altered destructively.
- Phase 2 is the only phase that touches unlock semantics, and it ships alone behind a byte-equality gate against captured production output.
- The Android offline snapshot pipeline and bundled artifacts are untouched in every phase; savings come from live reads, not from what ships in the APK.
