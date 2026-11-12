# V18 player-safety checkpoint: verified branch-only repairs

V18 remains **HOLD / production NO-GO**. This records completed bounded repairs,
not an economic migration, hosted-staging acceptance, or a release decision.

## Exact latest verified source

Remote commit `0155bb9bc82499cd667d6ef292184a309d83bdff`, tree
`88f536b3355a3473c2d734f45d3fb04c2afcef75` on
`v18-01a-outbox-recovery`. The equivalent local commit is `747b62fd`.
GitHub connector publication preserved the exact reviewed local tree; local and
remote commit identities differ because publication uses the remote parent.

On 2026-11-12, actual job logs and every job step were checked:

| Lane | Run | Job | Result |
| --- | --- | --- | --- |
| Frozen npm graph | [43201689616](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43201689616) | 131126440868 | SUCCESS: 1,573 tests / 63 files, 41 scheduler tests, both TypeScript projects, client/SSR build |
| Frozen Bun-installed graph under Node | [43201689199](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43201689199) | 131126440472 | SUCCESS: same 1,573 tests / 63 files, scheduler 41, types/build, unchanged lockfiles |
| Android compilation only | [43201689217](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43201689217) | 131126440800 | SUCCESS: actual Gradle compilation and JVM test tasks; 151 actionable tasks executed |

Bun installs the existing frozen dependency graph; Node runs the scripts. This is
not Bun-runtime certification. Android uses Node 24/JDK 21, synthetic build
configuration and committed offline assets. The graph guard runs before compile;
post-build forbidden-artifact checks pass. The JVM test is the existing template
test, not gameplay/device coverage. No APK/AAB packaging, signing, installation,
original APK workflow dispatch, production configuration or deployment occurred.

## Repairs in this continuation

- `6f2c252e`: original APK workflow Node 24/JDK 21 and locked install; removed
  duplicate web build. Its main/master/manual trigger scope and debug artifact
  behavior remain unchanged. Configuration reviewed/static-tested only; this
  original workflow was not executed.
- `3cdf82db`: reject persisted entitlement histories with a confirmation before
  the final attempt. Actual storage/API tests preserve legitimate supersession,
  terminal delivered compatibility and atomic rollback. No new delivery API.
- `308ab52f`: revoke obsolete hardware Back callbacks synchronously across
  cleanup/route replacement and late registration. Nine actual mounted-provider
  cases pass; native bridge/router are mocked. Exploratory StrictMode mock
  isolation was unresolved and is explicitly not acceptance evidence.
- `de9b3859`: a heart loss after idle regeneration reaches full starts a fresh
  interval, per the pre-existing documented contract. Below-full fractional
  regeneration, costs, caps, deduplication and cloud merge policy are unchanged.
- `6b718fff`: every requested profile write needs exact readback/current scope
  before reporting written. No-op, mismatch or unavailable readback is unresolved;
  actual write errors keep their existing behavior. No rollback/retry is implied.
  Existing trySpendDinars now refuses that unresolved evidence.
- `7b1507e5`: failed cloud saves do not prematurely clear the existing realtime
  guard in debounce, reconnect or manual sync. The guard still expires at 4 s.
- `0155bb9b`: public-stat synchronization reports only current, error-free void
  RPC acknowledgment; three sync paths also require it before clearing the
  realtime guard. Cloud timestamps/manual return meaning remain cloud-only.
  Four historical successful-stat mock returns changed from undefined to true
  for the explicit API contract; their assertions were not changed.

Each slice has its own audit with baseline failures, positive controls and
independent review. Historical player reports motivated investigation; these
source reproductions do not prove the cause of every reported device symptom.

## Additional remote checkpoints

- `6f2c252e`: safe Android compilation 43197380855 and frozen Bun 43197380956 SUCCESS.
- `308ab52f`: native settlement 43198290486, Android 43198290503,
  frozen Bun 43198290612, npm 43198290542 SUCCESS.
- `6b718fff`: npm 43199425158, frozen Bun 43199425139, Android 43199424959 SUCCESS.
- `7b1507e5`: npm 43200676466, frozen Bun 43200676482, Android 43200676447 SUCCESS.

## Unresolved acceptance boundaries

No verified hosted non-production project is known. Earlier disposable
PostgreSQL and local Supabase acceptance remain distinct from hosted staging.
Existing profiles/delta records cannot be assumed to provide trusted economic
opening state. Whole-profile cross-tab/cross-device writers, legacy SECURITY
DEFINER paths and immutable grant inclusion still require a coherent authority
cutover. Exact readback and a four-second guard do not establish that authority.
No real Android Back/force-stop/WebView/guest-transfer acceptance is claimed.

The next work is an explicitly isolated server-owned ledger/CAS prototype with
synthetic issuer-owned evidence and adversarial real-engine tests. It is not a
production migration and must not infer actual player balances from local/cloud
snapshots, maximum values, timestamps, empty queues or a boolean verified flag.
