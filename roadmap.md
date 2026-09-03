# Roadmap

## Database cost reduction (Large → Medium)

Target instance is **Medium**. Small was tested previously and constrained the app — excluded permanently.

- [x] **Phase 0 — Baseline capture** (read-only) → `docs/audits/db-workload-baseline.md`, includes the repeatable query set.
- [x] **Plan revision** — re-ranked: unlock RPCs 75.8% of DB CPU, realtime 14.6%, content reads ~6.5%.
- [x] **Phase 1 — Audit `list_stories_v2` / `list_stories_guest_v3`** (read-only) → `docs/audits/list-stories-rpc-audit.md` + golden fixtures in `docs/audits/fixtures/`.
- [ ] **Phase 2 — Set-wise unlock rewrite** (awaiting approval; do not start automatically).
- [ ] Phase 3 — Realtime publication/subscription narrowing.
- [ ] Phase 4 — Content indexes + projection views + client list reads.
- [ ] Phase 5 — Polling & background jobs (near-zero idle cost).
- [ ] Phase 6 — 14-day metrics gate, then Large → Medium.

### Open follow-ups for Phase 2
- Capture three missing fixtures: zero-progress signed-in account, `p_world_slug` filter, `p_collection_id` filter.
- Add synthetic unit coverage for the ten unlock leaf kinds with no production data.
- Enumerate all callers of `_story_prereqs_v2` before changing it.
- Profile `story_is_campaign_intro` (runs per row).
