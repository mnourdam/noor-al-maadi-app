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

## Coverage report — post-Phase-2.5 import

Snapshot taken immediately after the four batches landed:

| Kind            | Total | Published | Review | Verified |
| --------------- | ----: | --------: | -----: | -------: |
| place           |    33 |         6 |     27 |        6 |
| battle          |    32 |         7 |     25 |        7 |
| artifact_site   |    19 |         0 |     19 |        0 |
| region          |    28 |        10 |     18 |       10 |
| **Total**       | **112** | **23**  | **89** |   **23** |

Player-visible (`status='published'` AND `aps_verified=true`): **23** —
unchanged from the pre-2.5 baseline, confirming no review rows leak to `/map`.

### Per-batch results

| Batch                  | Target | Inserted | Skipped | Failed |
| ---------------------- | -----: | -------: | ------: | -----: |
| 01-cities-priority     |     30 |       26 |       4 |      0 |
| 02-battles-priority    |     25 |       25 |       0 |      0 |
| 03-landmarks-priority  |     20 |       20 |       0 |      0 |
| 04-states-completion   |     18 |       18 |       0 |      0 |
| **Total**              | **93** |   **89** |   **4** |  **0** |

Skips in batch 1 = slugs already present from the Phase 2 backfill
(damascus, baghdad, cairo, cordoba). Idempotency confirmed: re-running any
batch produces 0 inserts.


## Idempotency

Re-running any batch JSON is a no-op: existing slugs are reported as
`skipped`. The importer never demotes a `published` row back to review.
Per-run audit lives in `public.atlas_import_runs`.
