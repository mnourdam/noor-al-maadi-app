# Roadmap

## Database cost reduction (Large → smaller instance)

- [x] **Phase 0 — Baseline capture** (read-only). Saved to `docs/audits/db-workload-baseline.md` with the exact repeatable query set.
- [ ] **Plan revision** — re-rank phases: baseline shows `list_stories_v2` / `list_stories_guest_v3` are 75.8% of DB CPU, realtime WAL polling 14.6%; the originally-prioritized content reads are only ~6.5%.
- [ ] Phase 1 — low-risk indexes + projection views (not started; awaiting re-scope).
- [ ] Phase 2 — client list reads move off heavy JSONB.
- [ ] Phase 3 — content-update polling → version-only checks with cooldown.
- [ ] Phase 4 — background jobs & admin surfaces.
- [ ] Phase 5 — 14-day metrics gate, then step down Large → Medium → Small.
