# Encyclopedia content-source cleanup — status

## Audit of runtime content sources

| Source                                       | Kind                | Used by today                                                                 | Status            |
| -------------------------------------------- | ------------------- | ----------------------------------------------------------------------------- | ----------------- |
| `encyclopedia_entities` (Supabase)           | Source of truth     | entity page hero/body, atlas detail panel link, admin list/audit              | **Canonical**     |
| `src/lib/packs/*` (rashidun, umayyad, …)     | Legacy static       | `/encyclopedia` hub, `/encyclopedia/type/:type`, `/encyclopedia/state/:id`, neighbour cards | **Still wired (Phase B)** |
| `src/lib/data.ts` (`CHARACTERS`, battles)    | Legacy static       | `/figure/:id`, `/battle/:id` legacy detail pages (linked from entity hero)    | Out of scope      |
| `src/lib/cities.ts`                          | Legacy static       | `/city/:id` legacy detail page                                                | Out of scope      |
| `mock` / demo content                        | —                   | None found in player encyclopedia routes                                      | n/a               |
| `public/data/atlas/imports/*.json`           | Admin-only seed     | Admin import workshop only                                                    | OK (admin)        |

## Changes this pass (Phase A — safe)

1. **Atlas → encyclopedia UUID links now resolve.**
   - `useEncyclopediaSupabaseEntityById` added.
   - `/encyclopedia/entity/:id` detects UUIDs and reads `encyclopedia_entities` by `id`, bypassing slug normalization. Atlas markers (Cairo, Jerusalem, …) now open the canonical Supabase article instead of falling through to "not found" when the legacy slug differs (e.g. Fes/Fas).
2. **Supabase already wins the hero/body** on the entity page when present (existing canonical resolver picks the richest row across `entity_type`s by slug + `metadata.aliases` + `metadata.legacy_id`). No change needed for Salah al-Din / al-Zahir Baybars — both render from Supabase today.
3. **Encyclopedia is unlocked.** Verified: no `requireUnlock` / collection-gate / progress-gate logic on `/encyclopedia/*` routes. The Museum/Collection lock logic remains scoped to `/collection` and `CollectibleRevealDialog`.
4. **Admin canonicalization audit** at `/admin/encyclopedia-audit`:
   - Duplicate `slug` groups, duplicate Arabic `title` groups, duplicate `metadata.legacy_id` groups, weak/empty rows (richness < 2 and short summary).
   - Per row: richness score, canonical badge (highest-richness in the group), one-click **toggle `enabled`** (soft-disable). **No hard delete. No bulk action.**
   - Linked from the admin hub.

## Initial duplicate snapshot (run 2026-06-23)

| Class                    | Count |
| ------------------------ | ----: |
| Total enabled rows       | 1 423 |
| Duplicate-slug groups    |   ~20 (e.g. `bukhara` ×3; `baghdad`, `samarkand`, `siffin`, `yarmouk`, `jerusalem`, `constantinople`, `granada`, … ×2) |
| Weak/empty rows          | surfaced live in the audit page |

Use `/admin/encyclopedia-audit` to pick canonical rows. Recommended canonical-selection order (already encoded in `entityRichness` + `pickCanonicalEntity`):
1. `enabled = true`
2. has `summary`
3. has `body.overview` / `body.sections`
4. richer related/timeline/facts/sources
5. correct `entity_type`
6. most recent `updated_at` (tiebreaker via admin judgement)

## Phase B (requires sign-off — not done this pass)

The hub (`/encyclopedia`), type listings (`/encyclopedia/type/:type`), and state pages (`/encyclopedia/state/:id`) still read from `src/lib/packs/*` for the listing grids, counts, and neighbour cards. Switching them to Supabase-only requires:

- Replacing `entitiesForSection`, `sectionCounts`, `searchAll`, `neighboursGrouped`, `stateEntityForEra` with Supabase queries (likely a single `useEncyclopediaSupabaseList` call per page, plus a `metadata.era` filter for state pages).
- Re-deriving section glyphs / era buckets purely from `metadata` (today `bridges.era` lives on the pack entity).
- Removing `getPackEntity` from the entity route and accepting the Supabase fallback "minimal view" as the primary render.

This is a substantial refactor and will hide any entity that is *only* in packs, so it should run **after** an audit-driven backfill confirms full Supabase coverage. The audit page is the tool for that.

## Hard guarantees still upheld

- No Supabase row was deleted.
- No table was dropped.
- Soft-disable only (`enabled = false`).
- Atlas linkage flows through `atlas_entities.encyclopedia_entity_id` (UUID FK), so canonical re-pointing means simply updating that column — no string-slug remapping needed.
