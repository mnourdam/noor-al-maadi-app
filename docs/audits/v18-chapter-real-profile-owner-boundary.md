# Chapter route with real profile ownership boundary

Test-only follow-up to the transient owner/epoch repair. No production source changes.

## Evidence

The actual chapter route is mounted within the actual ProfileProvider, using its actual identity-bound writer and real owner/epoch implementation. The real storage partition, activity progress, reward claim ledger and grant totals are retained. Two deterministic controls cover A→B and A→B→A while the original accepted save is pending.

The retired save result causes no profile write, completed activity, reward claim or pending Next acknowledgment. A fresh action in the current identity awards exactly 5 XP and 2 coins, persists the same profile amounts, records exactly the activity claim and grant totals, and exposes Next. The other identity retains its original profile, no completed progress or grants, and no reward claim. The fixture intentionally leaves a second activity unfinished, avoiding unrelated chapter/campaign reward and streak settlement.

The final storage assertion waits for the writer’s passive-effect persistence and verifies its current-owner written outcome separately from the rendered balance. An independent run exposed the earlier fixture reading storage too soon; exact expected totals are retained, not relaxed.

## Boundary and limitations

The save adapter supplies a synthetic acknowledged SaveOutcome after a controlled promise. This is not a test of server acceptance, actual Supabase writes, outbox durability, or atomic reward settlement. No fabricated synchronous owner-switch callback is injected into profile reward methods. The real addPoints/addDinars APIs do not expose a synchronous event analogous to heart-loss notification; inspection did not establish a shipped synchronous reentry defect in these APIs.

Router and query adapters supply parameters/content without a real browser router or query cache. ActivityRenderer is an interaction button/input stub; memory planning/refresh, audio, surrounding shell, images, reward overlays, and SDK session access are isolated. The route, provider, writer and storage partition are not mocked. Identity switching uses the real internal owner setter plus the provider's identity-changed event, not the entire authentication/reset flow.

This closes a combined integration-evidence gap without expanding reward policy. Existing void profile APIs are not durable economic receipts. Already-dispatched backend effects are not canceled by this test.

## Integrated verification
At `56e4022296e70a4c1f617799a8d6044c944ae8c7`, both the npm-installed graph and the unchanged frozen Bun-installed graph passed **2,058 tests across 117 files**, plus both TypeScript projects. Independent review passed the two focused real-provider cases after correcting the premature passive-effect persistence assertion. Drift/diff checks pass. The Bun graph runs under Node, not the Bun JavaScript runtime. Dependency hashes and clean checkout were verified. Application/configuration source is byte-identical to `51132402`, whose direct synthetic Android SPA compile passed; no new browser, native or hosted acceptance is implied.
