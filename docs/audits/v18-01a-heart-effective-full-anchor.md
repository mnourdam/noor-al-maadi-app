# V18 heart regeneration: effective-full anchor

## Existing contract and concrete defect

`commitHearts` documents that full hearts have no active regeneration timer and a change from a previously-full state starts the anchor at now. This contract and helper were introduced together in commit `aa62c38b` (2026-06-22). Previously the implementation recognized only a stored full value, not a stored lower value that had regenerated to full while idle.

Example: four hearts at t0, then a loss at t0 + 30 minutes - 1 ms. Effective hearts were already five. The old helper committed four hearts with an anchor at t0 + 15 minutes, causing the lost heart to return 1 ms later. Long idle periods could produce the same short interval. This reproducible defect is not proof that it caused the user's historical report.

## Minimal correction and compatibility

After deriving elapsed regeneration ticks, the helper now recognizes `base + gained >= HEART_MAX` as previously full and anchors the resulting below-full tuple at now. Existing stored-full and new-full shortcuts remain unchanged. When still below full, the prior rolling anchor and fractional progress remain unchanged. The 15-minute interval, heart cap, costs, gain/loss amounts and clamping rules are unchanged.

Actual consumers: `loseHeart` and `loseHeartOnce` can spend from effective full and benefit directly. Activity recovery and local heart purchase refuse an already-full state, so their below-full behavior is preserved. The authenticated purchase receipt applies a tuple through the same helper, retaining its previously documented semantics. Cloud merge intentionally does not call this helper; its reconciliation policy is untouched. No backend, authority, grant, cloud merge, identity or deduplication change was made.

## Evidence

New suite `tests/offline/outbox-heart-full-anchor.test.tsx` exercises actual helper math and actual StrictMode ProfileProvider with frozen Date. Before change: **4 failed / 5 passed**. After change: **9/9 pass**. Combined with unchanged heart-purchase and historical provider capability tests: **99/99 pass**.

Controls include stored-full loss, submax loss and gain retaining fractions, gain to full, exact full-recovery boundary and long idle. Provider cases exercise both loss methods, persisted tuple bytes, remount and the exact one-interval recovery boundary. Repeated `loseHeartOnce` with the same attempt key remains a no-op; no duplicate loss is introduced.

The temporary preliminary helper-only investigation also produced 2 failed / 5 passed without changing repository source. `git diff --check` passes. Independent review cleared the exact source and reran the nine focused cases. Combined local validation with the separate persistence-evidence repair passed 1,526/1,526 offline tests across 60 files, both TypeScript projects and client/SSR build, plus 41/41 scheduler checks. Remote CI is pending publication. No claim is made about release/device acceptance or resolving every historical heart/progression symptom.
