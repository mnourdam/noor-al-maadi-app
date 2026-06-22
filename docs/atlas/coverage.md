# Atlas Coverage — Phase 2.5

Tracks the gap between the Encyclopedia corpus and atlas-visible `atlas_entities`.
Live numbers are read from the admin import page (`/admin/atlas-import`); this
file is updated by hand after each batch lands.

## Phase 2 baseline (pre-2.5)

| Kind          | Encyclopedia | Atlas Entities | Published | Review |
| ------------- | -----------: | -------------: | --------: | -----: |
| place (city)  |           93 |              6 |         6 |      0 |
| battle        |          111 |              7 |         7 |      0 |
| region        |           28 |             10 |        10 |      0 |
| artifact_site |            — |              0 |         0 |      0 |
| figure_marker |            — |              0 |         0 |      0 |
| event         |            — |              0 |         0 |      0 |
| route_point   |            — |              0 |         0 |      0 |

## Phase 2.5 — Batch targets

| Batch                    | Kind (atlas)              | Target rows | Notes                                       |
| ------------------------ | ------------------------- | ----------: | ------------------------------------------- |
| 01-cities-priority       | `place`                   |          30 | Capitals + intellectual + trade hubs        |
| 02-battles-priority      | `battle`                  |          25 | Decisive engagements only                   |
| 03-landmarks-priority    | `artifact_site` / `place` |          20 | Iconic monuments (Kaaba, Alhambra…)         |
| 04-states-completion     | `region`                  |          18 | Remaining dynasties anchored at capital pin |

All imported rows land as `status='review'`, `aps_verified=false`. They do
**not** become player-visible until a human verifies APS in
`/admin/atlas-entities` and publishes.

## Coverage report (after each batch)

After each import, copy the current snapshot from `/admin/atlas-import`:

```text
Kind            Total   Published   Review   Verified
place              ?         ?         ?        ?
battle             ?         ?         ?        ?
region             ?         ?         ?        ?
artifact_site      ?         ?         ?        ?
```

## Idempotency

Re-running any batch JSON is a no-op: existing slugs are reported as
`skipped`. The importer never demotes a `published` row back to review.
Per-run audit lives in `public.atlas_import_runs`.
