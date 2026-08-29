# V16 — Emergency read-only audit: Story locks, unlock popups, content-update loop

Scope: READ-ONLY. No code, backend, DB, migration, main or deploy change was made.
Line audited: current V16 working line (HEAD `bf3fce50`, "Added V16 announcement system").

## Production data used (read-only queries)

- `stories` published: **186** — 80 anon-open (`unlock_spec.expr.type = always`), **106 locked+visible**, 0 hidden, 0 mystery, 0 `on_demand`, 70 campaign intros.
- `get_content_manifest()`: `stories` 186 / last_updated **2026-08-29 07:41+**, `story_scenes` 1686, `story_media` 1797, `admin_campaigns` 78 / 2026-08-28 23:10.
- Bundled `public/baseline-content.json` (version 1787955079191, generated 2026-08-28T22:11:19Z): stories 186, scenes 1679, media 1797, collections 12, games 703. All rows carry `unlock_spec`, all media `verified=true` with checksum/path/bucket, 0 orphans.
- Bundled `public/offline-snapshot.json.gz` (generated 2026-08-28T22:11:48Z) carries only encyclopedia/campaigns/investigations/today/facts/atlas/registry — **no story keys**.
- `stories.updated_at`: 22 rows in the last 24h, **5 in the last hour**, max = minutes ago; the changed column on those rows is `reaction_count` (player reactions), not content.

## Bug A — Stories appear locked after the offline work

Root cause: **the manifest RPC redacts locked stories, and a sync overwrites the full baseline rows with those redacted rows.**

1. `stories`, `story_scenes`, `story_media`, `story_collections` are fetched from `public.stories_snapshot_manifest_v2()` (`src/lib/offline-snapshot.ts:117-121`, `fetchCollection` short-circuit at :197).
2. That RPC evaluates unlocks **as anon** (`evaluate_unlock_spec_v2(NULL, …)`). For the 106 locked+visible stories it emits a redacted row **without `unlock_spec`**, with `is_locked: true`, and it emits **no scenes and no media** for them.
3. All four story keys are in `NO_UPDATED_AT` (:133-141), so a sync always takes the `merged = await fetchCollection(def)` branch (:640) — a **full replace**, not a merge. The complete baseline rows (with `unlock_spec`, 1679 scenes, 1797 media) are replaced by the anon-visible subset.
4. Every offline/local reader is correctly fail-closed on a missing spec: `isAlwaysUnlockSpec(undefined) === false` (`src/lib/stories/unlock/local.ts:31`), so `buildLocalStorySummaries` (`src/lib/stories/summary.ts:116-135`) and `fetchStoryAccess`'s offline path (`src/lib/stories/progress.ts:118-133`) mark them **locked**, and their scenes/media are gone (missing images/covers).

So Bug A is triggered by the *first* content sync after install, not by the packaging itself. Entitled players are only saved by the signed unlock cache, which is empty on a clean install.

Smallest safe fix (client-only, no backend):
- Treat the story keys as **additive merge** against the packaged baseline instead of full replace: never let a redacted/anon-visible fetch shrink `stories`/`story_scenes`/`story_media` below the packaged pack, and never overwrite a baseline row that has `unlock_spec` with a row that lacks it (`is_locked: true` / `is_redacted: true` rows are metadata, not content).
- Add a snapshot guard: reject a candidate whose story rows lose `unlock_spec` or whose scene/media counts drop below the bundled pack.

## Bug B — Repeated "story unlocked" popups

Root cause: `StoryUnlockCelebration.detectTransitions` (`src/components/stories/StoryUnlockCelebration.tsx:64-83`) diffs **every** `stories-summary` query result, including the V16 local-first fallback rows.

`listStoriesSummary` now returns local rows first (`summary.ts:181-200`, 2500 ms RPC race). For a signed-in player with an empty/pruned unlock cache these local rows are `unlocked: false`; when the server RPC answers, the same ids flip to `unlocked: true`. `detectTransitions` records `false` then sees `true` → a genuine-looking `locked → unlocked` transition for **every** entitled story, queued as popups. It repeats whenever the cache is empty again (reinstall, sign-out/in, cache prune, or Bug A wiping specs).

Smallest safe fix (presentation only):
- Only feed **server-authoritative** rows into the detector: tag summaries produced locally (e.g. `source: "local"`) and have `detectTransitions` skip them for both reads and writes of the persisted lock map.
- Additionally cap: if more than N transitions appear in one scan, treat it as a state resync — persist the new state, show nothing.

## Bug C — Content-update false positives / loop

Two independent causes, both real:

1. **Player reactions bump `stories.updated_at`.** `get_content_manifest()` reports `stories.last_updated` = a few minutes ago at all times. `diffAgainstManifest` (`src/lib/offline-content-update.ts:82-97`) compares that against the local snapshot's `generated_at`, so the banner returns continuously even though no content changed.
2. **Baseline-owned keys are compared at all.** `seedBaselineToPersistentStore` writes `content_counts.stories / story_scenes / story_media` into the same snapshot (`src/lib/offline-baseline-resolver.ts:118-128`) while deliberately keeping the encyclopedia `generated_at`. Those keys therefore enter the diff with a timestamp that belongs to a different pipeline — permanently "behind".

And the loop closes with Bug A: tapping تحديث runs `refreshSnapshotIncremental`, which full-replaces the story collections (see above), so the update "succeeds" while degrading Stories — the user retries.

Smallest safe fix (client-only):
- Exclude baseline/pack-owned collections (`stories`, `story_scenes`, `story_media`, `story_collections`, `games`) from `diffAgainstManifest`/`checkManifestUpdates`; they ship with the build and are not updatable at runtime.
- Compare against a content-meaningful signal rather than `updated_at` for stories (e.g. count + `max(content_version)`/`published_at`) so a reaction never looks like new content.

## Correlation

All three regressions trace to the same V16 change set: stories became a build-time pack **and** a syncable snapshot collection at the same time, while the runtime fetch path for those collections is a visibility-redacted anon RPC. Nothing in the guest/authenticated unlock evaluators is wrong — they are correctly fail-closed on data that the sync removed.

## Production data safety

No player-owned data is implicated: progress, completions, streaks, outbox, rewards and roles live in separate tables and none of the paths above write them. The damage is confined to the on-device content snapshot and to local presentation state (`irth.stories.lockstate.v1`, `irth.stories.unlock-celebrated.v1`, `irth.stories.unlock.v1:*`).

## Confirmation

Zero changes were made to code, database, RPCs, migrations, `main`, or deployments during this audit. This report is the only file written.
