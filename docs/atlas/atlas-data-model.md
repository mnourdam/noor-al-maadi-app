# Atlas Data Model — Phase 1 ✅ COMPLETE

_Status: **complete** — end-to-end workflow validated 2026-06-22._

## Status

Phase 1 is closed. Smoke test passed end-to-end: admin create → APS picker
on the frozen Atlas v1 raster → save → **تأكيد APS** → **نشر** → live `/map`
renders the pin at the exact visual point clicked in the picker → marker
click → encyclopedia link opens.

The live `/map` now renders the same frozen Atlas v1 raster
(`src/assets/atlas/atlas-v1-master.jpg.asset.json`) as the picker, so APS is
visually canonical end-to-end.

## Principles

- **APS is canonical** — every atlas entity stores integer `aps_x`, `aps_y` in the v1 raster's pixel space (14192 × 7088).
- **The atlas artwork is the source of truth.** `lon` / `lat` are optional metadata, never authoritative.
- **Verification is human-in-the-loop.** Pins seeded from `lon` / `lat` (or imported in bulk) stay `aps_verified=false` until a content admin confirms placement on the artwork.
- **Publication is gated.** A row may only be `published` once it is `aps_verified=true`.

## Schema

Single table `public.atlas_entities`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `slug` | text unique | `^[a-z0-9][a-z0-9-]{1,63}$` |
| `kind` | enum `atlas_entity_kind` | place, battle, event, figure_marker, artifact_site, region, route_point |
| `name_ar` / `name_en` | text | |
| `aps_x` / `aps_y` | int | bounds-checked against v1 raster |
| `aps_verified` (+by, +at) | bool / uuid / timestamptz | human confirmation |
| `lon` / `lat` / `geo_source` | optional metadata | |
| `atlas_version` | default `v1` | reserved for future raster |
| `era`, `year_start`, `year_end` | text/int | display only |
| `status` | enum `atlas_entity_status` | draft → review → published → retired |
| `published_at` | timestamptz | auto-stamped by trigger |
| `encyclopedia_entity_id` | uuid fk → `encyclopedia_entities.id` ON DELETE SET NULL | optional |
| `metadata` | jsonb | marker styling, notes |
| `created_by` / `updated_by` / `created_at` / `updated_at` | standard | |

Trigger `atlas_entities_enforce_state()`:
- Moving a pin (`aps_x`/`aps_y` change) auto-resets `aps_verified` and demotes published rows to `review`.
- Setting `status='published'` while `aps_verified=false` raises an exception.
- `published_at` is stamped on transition to published and cleared otherwise.

## RLS

| Role | Permission |
|---|---|
| anon / authenticated | SELECT WHERE `status='published' AND aps_verified=true` |
| content admin (`is_content_admin()`) | full SELECT + INSERT + UPDATE + DELETE (DELETE limited to `status='draft'`) |
| service_role | ALL |

## Workflow

1. Admin creates a draft (`POST` via `createAtlasEntity` — defaults `aps_verified=false`, `status='draft'`).
2. Admin measures APS in `/admin/atlas-calibration` and pastes the coords into the editor.
3. Admin clicks **تأكيد APS** → `aps_verified=true`, reviewer stamped.
4. Admin clicks **نشر** → `status='published'`, becomes visible on the live atlas at `/map`.
5. Any later APS change auto-resets verification (and demotes if published) — re-confirm + re-publish.
6. Retire a published row via **تقاعد** (`status='retired'`); never hard-delete published data.

## Code locations

- DB: migration `add_atlas_entities_phase1.sql`
- Client: `src/lib/atlas-entities.ts`
- Admin UI: `src/routes/admin.atlas-entities.tsx`
- Live marker layer: `src/components/atlas/AtlasEntityPins.tsx`
  (wired into `src/components/atlas/AtlasStage.tsx` + `AtlasShell.tsx`)

## Phase 1 limitations

- No `atlas_anchors` table — calibration data still lives in `src/data/atlas-anchors.ts`.
- No `atlas_entity_links` table — only direct FK to `encyclopedia_entities`.
- No bulk import — single-row admin create only.
- Single neutral pin visual; per-kind iconography deferred to Phase 2.
- No campaign / investigation / artifact / figure / Today-in-History links.
