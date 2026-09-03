# Phase 1 Audit — `list_stories_v2` / `list_stories_guest_v3`

Captured: **2026-09-03 06:50–07:00 UTC** · read-only · no SQL, function, index, or client code was changed.
Baseline reference: `docs/audits/db-workload-baseline.md` (these two RPCs = **75.8%** of all database CPU, ~1.7 s mean).

---

## 1. Call graph (from `pg_proc` source)

```text
list_stories_v2(p_world_slug)                     -- SQL wrapper, 1 line
  └─ list_stories_v3(p_world_slug, NULL)
       ├─ base         : stories WHERE status='published'
       │                   AND NOT story_is_campaign_intro(id, metadata, tags)   [called per row]
       ├─ scene_counts : story_scenes grouped by story_id
       └─ enriched — evaluated ONCE PER STORY (186 published rows):
            ├─ evaluate_unlock_spec_v2(uid, unlock_spec)
            │     ├─ normalize_unlock_spec_v2(spec)      [per story]
            │     ├─ validate_unlock_spec_v2(spec)       [per story]
            │     └─ _eval_unlock_node_v2(uid, expr, 1)  → PL/pgSQL recursion,
            │           one EXISTS query per leaf node
            └─ _story_prereqs_v2(uid, unlock_spec)
                  ├─ normalize_unlock_spec_v2(spec)      [per story, AGAIN]
                  ├─ RECURSIVE walk of the same expression tree [AGAIN]
                  └─ per leaf: LEFT JOIN admin_campaigns / investigations /
                     stories / encyclopedia_entities  +  one EXISTS per leaf
                     against the caller's user_* tables

list_stories_guest_v3(world, collection, evidence)
  ├─ IF auth.uid() IS NOT NULL → delegates to list_stories_v3   (verified live)
  └─ ELSE same base/scene_counts/enriched/redacted chain, with
       evaluate_unlock_spec_guest_v2 (evidence-array membership via _ev_has)
       + the SAME _story_prereqs_v2(NULL, spec)
```

## 2. Answers to the seven audit questions

### 2.1 Do they loop story-by-story? — **Yes**
`enriched` invokes two PL/pgSQL functions once per published story. With 186 published stories that is 372 function invocations per call, each with its own execution context, plus `story_is_campaign_intro` once per row in `base`.

### 2.2 Do unlock checks repeatedly query the progress tables? — **Yes, twice per leaf**
`_eval_unlock_node_v2` issues an independent `EXISTS` per leaf against `user_story_completions`, `user_campaign_completions`, `user_campaign_progress`, `user_investigation_progress`, `user_entity_discoveries`, `user_collection`, `user_achievements`, or `profiles`. `_story_prereqs_v2` then re-checks the **same** leaves against the **same** tables to build the display list. Nothing is shared between the two.

### 2.3 Are conditions recalculated within one call? — **Yes, heavily**
- `normalize_unlock_spec_v2` + `validate_unlock_spec_v2`: once per story in the evaluator, `normalize` again per story in the prereq builder.
- The expression tree is walked twice per story (PL/pgSQL recursion, then `WITH RECURSIVE`).
- Every leaf's satisfaction is computed twice.
- No memoization across stories: a reference shared by many stories is resolved once per story.

Measured sharing (see §4): 240 leaf instances resolve to only **167 distinct references**, and the caller's progress state is identical for all of them — so ~100% of the per-leaf work is redundant within a single call.

### 2.4 Do guest and authenticated variants duplicate heavy logic? — **Partly**
`list_stories_guest_v3` correctly short-circuits to `list_stories_v3` for signed-in callers; this was verified live — the same account returns a byte-identical payload from both RPCs (`auth_heavy_list_stories_v2.json` and `auth_heavy_list_stories_guest_v3.json` share sha256 `fea0748641…`). What is duplicated is the whole `base / scene_counts / enriched / redacted` CTE chain, written out twice with only the evaluator swapped. Both paths then call the *same* `_story_prereqs_v2`, which is the expensive half — so **the guest path pays nearly the same cost as the authenticated path** despite its unlock evaluation being a cheap in-memory array membership test (`_ev_has`). Measured: guest 1.79–1.83 s vs authenticated 1.69–1.94 s. That matches the baseline means of 1,686 ms (guest) and 1,738 ms (auth).

### 2.5 What causes the millions of sequential scans? — **Confirmed: casts on the indexed side**

Column types (from `information_schema`):

| Join in `_story_prereqs_v2` / `_eval_unlock_node_v2` | Column type | Compared as | Index usable |
| --- | --- | --- | --- |
| `encyclopedia_entities.id::text = ref` | `uuid` | text | **No** |
| `investigations.id::text = ref` | `uuid` | text | **No** |
| `user_entity_discoveries.entity_id::text = ref` | `uuid` | text | **No** |
| `user_investigation_progress.investigation_id::text = ref` | `uuid` | text | **No** |
| `admin_campaigns.id = ref` | `text` | text | Yes, but planner seq-scans the 78-row table inside the per-leaf nested loop |
| `stories.id = ref` | `text` | text | Yes, same nested-loop seq scan (186 rows) |

`EXPLAIN (ANALYZE, BUFFERS)` proof on the exact entity lookup used by a real story spec:

```text
-- current form:  ent.id::text = 'aa15aed2-…'
Seq Scan on encyclopedia_entities  (cost=0.00..482.15 rows=11)
                                   (actual time=0.324..1.066 rows=1 loops=1)
  Filter: ((id)::text = 'aa15aed2-…'::text)
  Rows Removed by Filter: 2122
  Buffers: shared hit=445
Execution Time: 1.167 ms

-- native form:   ent.id = 'aa15aed2-…'::uuid
Index Scan using encyclopedia_entities_pkey  (cost=0.28..2.50 rows=1)
                                             (actual time=0.029..0.029 rows=1 loops=1)
  Index Cond: (id = 'aa15aed2-…'::uuid)
  Buffers: shared hit=3
Execution Time: 0.078 ms
```

**148× fewer buffers, ~15× faster — per leaf.**

The arithmetic closes the loop with the baseline exactly:

| Table | Seq scans since boot | Seq tuples read | Tuples ÷ scans | Table rows |
| --- | ---: | ---: | ---: | ---: |
| `encyclopedia_entities` | 6,642,893 | 14,102,616,331 | **2,123** | 2,123 |
| `investigations` | 6,658,692 | 1,558,132,485 | 234 | ~234 |
| `stories` | 6,749,518 | 1,258,935,658 | **186** | 186 (published) |
| `admin_campaigns` | 10,404,653 | 811,548,793 | 78 | 78 |

Every scan reads the **entire** table — i.e. each is one full scan per leaf. And `6.64 M scans ÷ 31,588 RPC calls ≈ 210 scans per call`, against the **240 leaf instances** measured in §4. The sequential scans in the baseline are, essentially entirely, `_story_prereqs_v2` leaf resolution.

### 2.6 Can results be computed set-wise? — **Yes, and it is fast**

Prototype run live (read-only): flatten every published story's unlock expression in one recursive CTE, then resolve all titles with four hash left joins on native types.

```text
Hash Left Join … (actual time=2.132..5.437 rows=240 loops=1)
  Buffers: shared hit=666
Execution Time: ~5.4 ms   (whole corpus: 186 stories, 240 leaves, all four title sources)
```

**5.4 ms and 666 buffers for the entire corpus**, versus the current per-leaf path which reads ~445 buffers *per entity leaf alone* (≈107,000 buffers for 240 leaves) and totals ~1,700 ms per call. The set-wise plan uses hash joins with the 186/78/2,123-row tables built once, so it does not even need the index — though the native-type comparison is what makes the hash join possible.

### 2.7 Can unlock state be joined/precomputed while preserving behavior? — **Yes, in two independent steps**
- **(a) Per-call caller-state CTE.** Read the caller's `user_story_completions`, `user_campaign_completions`, `user_campaign_progress`, `user_investigation_progress`, `user_entity_discoveries`, `user_collection`, `user_achievements` and `profiles.level` once into CTEs; every leaf resolves by joining that relation. No new persisted state, no schema change. Expected to carry most of the win.
- **(b) Optional flattened-leaf cache.** A table of `(story_id, node_path, kind, ref)` maintained by a trigger on `stories.unlock_spec`, so the recursive walk disappears too. Only worth doing if (a) leaves measurable cost; it adds a consistency surface, so it is explicitly optional.

Neither changes semantics: the leaf predicates, the AND/OR/NOT folding, the depth limits (6 in the evaluator, 8 in the prereq walk), and the redaction step stay identical.

---

## 3. Live timings (this capture)

| Call | Caller | Rows | Unlocked | Wall time |
| --- | --- | ---: | ---: | ---: |
| `list_stories_v2(null)` | anonymous | 116 | 10 | 1.803 s |
| `list_stories_guest_v3(null,null,{})` | guest | 116 | 10 | 1.825 s |
| `list_stories_guest_v3` with evidence | guest + progress | 116 | 11 | 1.834 s |
| `list_stories_v2(null)` ×3 | heavy account (66 stories, 412 discoveries, 21 campaigns) | 116 | 66 | 1.737 / 1.735 / 1.779 s |
| `list_stories_guest_v3(null,null,{})` | same heavy account | 116 | 66 | 1.690 s |
| `list_stories_v2(null)` | light account (12 stories, 60 discoveries) | 116 | 12 | 1.937 s |

Cost is **flat across progress depth** — a brand-new guest pays the same ~1.8 s as a deeply progressed account. That confirms the cost is structural (per-leaf full scans), not proportional to user data.

## 4. Leaf-count and shared-reference analysis

Across all 186 published stories (all have an `unlock_spec`, all `version: 2`):

| Leaf kind | Leaf instances | Distinct refs | Stories using it |
| --- | ---: | ---: | ---: |
| `story_complete` | 157 | 105 | 105 |
| `entity_discovered` | 83 | 62 | 68 |
| `always` | 80 | — | 80 |
| **Total** | **320** (240 ref-bearing) | **167** | 186 |

Notes:
- Only three leaf kinds are actually in production data. The other ten branches in `_eval_unlock_node_v2` (campaign_chapter_complete, artifact_owned, atlas_location_visited, achievement_unlocked, player_level, date_window, entities_discovered, …) are supported but currently unused — they must still be preserved in the rewrite.
- Expression depth is shallow: `all` of two leaves is the common shape. The 8-level recursion budget is never approached.
- **240 leaf instances resolve to 167 distinct references**, and 30% of leaf resolutions are duplicates *across* stories — all of which are recomputed today.

## 5. Guest vs authenticated behavior

- Signed-in callers hitting `list_stories_guest_v3` are transparently routed to `list_stories_v3`; `p_evidence` is ignored for them. Verified byte-identical output.
- Guests never reach the `user_*` tables: `evaluate_unlock_spec_guest_v2` tests membership in the evidence arrays. Evidence keys are `stories`, `campaigns`, `chapters` (as `campaign::chapter`), `investigations`, `discovered`, `artifacts`, `atlas`, `achievements`, and scalar `level`.
- `_story_prereqs_v2(NULL, …)` short-circuits `satisfied` to `false` for guests **but still performs all four title LEFT JOINs**, which is why guests pay the same sequential-scan cost. Guest prereq `satisfied` flags therefore do not reflect local evidence today — that is current behavior and the rewrite must preserve it exactly.
- Both paths return 116 rows out of 186 published stories; the difference is campaign-intro filtering plus rows dropped by `_story_redact_summary_v2`.

## 6. Golden fixtures

Saved under `docs/audits/fixtures/` (raw RPC JSON, captured 2026-09-03). Phase 2 must reproduce each sha256 byte-for-byte.

| Fixture | State | sha256 |
| --- | --- | --- |
| `anon_list_stories_v2.json` | anonymous | `0e2535d37af28d6c92e2ff0a5a519083ed010541844d7c9cf552f412b883a9ae` |
| `guest_list_stories_guest_v3.json` | guest, empty evidence | `0e2535d37af28d6c92e2ff0a5a519083ed010541844d7c9cf552f412b883a9ae` |
| `guest_evidence_list_stories_guest_v3.json` | guest with story + entity evidence | `6190a66fbdb27926bd5e7794b9bc59427c53cc51f4ef18d911b86866a60d2e32` |
| `auth_heavy_list_stories_v2.json` | heavy account via `list_stories_v2` | `fea07486415647f405b17cce4960a511300b3e903eccb2bb4c72c794bdcad5b3` |
| `auth_heavy_list_stories_guest_v3.json` | heavy account via `list_stories_guest_v3` | `fea07486415647f405b17cce4960a511300b3e903eccb2bb4c72c794bdcad5b3` |
| `auth_light_list_stories_v2.json` | light account | `a9d6b2d89994ddb63bccac61a554974079fcb22071453e295aa5115302ed1aa4` |

Hash recipe (must be reused verbatim): `sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False))`.

Coverage gaps to close before Phase 2 ships: a zero-progress signed-in account, a `p_world_slug`-filtered call, and a `p_collection_id`-filtered call. All three are cheap to capture with the same script.

---

## 7. Proven-equivalent set-wise rewrite proposal

Same function names, same argument lists, same JSON output. `list_stories_v2` and every client call site remain untouched.

**Step 1 — remove the casts.** Compare on native types (`ref::uuid` guarded by a UUID-shape test, as in the prototype), or, if any call site cannot be changed, add expression indexes on `(id::text)` / `(entity_id::text)` / `(investigation_id::text)`. Evidence: 445 → 3 buffers per lookup.

**Step 2 — one recursive walk for all stories.** Produce `(story_id, node_path, kind, ref, ref_uuid)` for the whole result set in a single CTE, replacing 186 PL/pgSQL recursions and 186 `WITH RECURSIVE` walks. Evidence: whole corpus flattened + title-resolved in 5.4 ms.

**Step 3 — one caller-state read.** Materialize the caller's seven progress relations (or the guest evidence arrays) once; join leaves against them to get `satisfied` set-wise.

**Step 4 — fold booleans back up the tree.** Recompute `all` / `any` / `not` over the leaf results with a bottom-up recursive CTE keyed on `node_path`, honoring the same depth limits (6 evaluator / 8 prereqs) and the same "unknown kind ⇒ false" default.

**Step 5 — unify guest and authenticated.** One implementation, two sources of leaf truth (progress tables vs evidence arrays). `_eval_unlock_node_v2` / `_eval_unlock_node_guest_v2` stay in place as-is for any other caller.

**Step 6 — equivalence gate.** Re-run the §6 fixtures plus the three gap cases; every sha256 must match before the change is considered done.

Projected result: per-call cost from ~1,700 ms to well under 50 ms, i.e. **~70–75% of total database CPU removed**. That is the single change that makes a Large → Medium downgrade defensible.

## 8. Risks flagged for Phase 2

- Ten unlock leaf kinds have **no production data**, so fixtures cannot cover them. They need synthetic unit coverage in the existing unlock test suites before the rewrite lands.
- `_story_prereqs_v2` is likely called from other surfaces too; enumerate its callers before altering it.
- `story_is_campaign_intro` runs per row in `base` and was not profiled in this phase; measure it during Phase 2 and fold it into the set-wise pass if it is non-trivial.
- The audit could not `EXPLAIN ANALYZE` the RPCs directly (the read-only role lacks EXECUTE on them); all plan evidence above comes from reproducing their internal statements verbatim as plain SQL. Phase 2 should re-confirm with an in-function timing harness.

## 9. Infrastructure target

The downgrade target is **Medium**. Small was previously tested and left the app constrained; it is excluded from all future plans.
