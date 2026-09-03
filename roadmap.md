# Roadmap

## Database cost reduction (Large → Medium)

Target instance is **Medium**. Small was tested previously and constrained the app — excluded permanently.

- [x] **Phase 0 — Baseline capture** (read-only) → `docs/audits/db-workload-baseline.md`, includes the repeatable query set.
- [x] **Plan revision** — re-ranked: unlock RPCs 75.8% of DB CPU, realtime 14.6%, content reads ~6.5%.
- [x] **Phase 1 — Audit `list_stories_v2` / `list_stories_guest_v3`** (read-only) → `docs/audits/list-stories-rpc-audit.md` + golden fixtures in `docs/audits/fixtures/` (10 states).
- [x] **Phase 2 — Set-wise unlock rewrite** → `docs/audits/phase2-setwise-rewrite-results.md`. Mean 1,737 ms → 340 ms; seq scans on the four content tables cut by 2–3 orders of magnitude; 10/10 fixtures byte-identical. Rollback SQL in `docs/audits/rollback/`.
- [x] **Phase 2b — Write-time unlock normalization** → `docs/audits/phase2b-unlock-precompute-results.md`. Mean 229 ms → 45–57 ms (≈30–38× vs baseline); 10/10 fixtures byte-identical; no new test failures; no reintroduced seq scans. Rollback SQL in `docs/audits/rollback/phase2b-pre-rewrite-functions.sql`.
- [ ] **Phase 3 — Realtime publication/subscription narrowing** (next; not started — now the largest remaining CPU consumer).
- [ ] Phase 4 — Content indexes + projection views + client list reads.
- [ ] Phase 5 — Polling & background jobs (near-zero idle cost).
- [ ] Phase 6 — 14-day metrics gate, then Large → Medium.

### Deferred
- Ten unlock leaf kinds have no production data — add synthetic unit coverage before any further unlock changes.

- `story_is_campaign_intro()` left untouched for its other callers; only the list RPCs inline its predicate.
