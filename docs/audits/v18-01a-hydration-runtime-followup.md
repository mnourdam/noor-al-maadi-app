# V18 hydration and runtime follow-up

Base: `c1c3816ab4228f1588fbc89d093971746fc5d33e`, branch `v18-01a-outbox-recovery`.

## Bounded player-facing repair

`CinematicOpening` previously rendered nothing on the server but created a portal
on the first client render, based on browser storage. React hydration could fail.
It now uses an identical empty initial render on both sides and resolves the
opening decision in a layout effect. The gate is installed before the next client
paint. Existing permission, preload, playback, replay and skip behavior remains.
The already-completed path emits completion once under StrictMode replay.

Five regressions use real `renderToString` with no window/document followed by
`hydrateRoot` in jsdom/StrictMode: first launch, returning user, replay-for-all,
permission-pending, and confirmed skip with persisted completion. They assert no
hydration recovery/error. A temporary counterfactual using the original component
failed all five, including duplicate completion in the returning-user case.
This is React/jsdom evidence, not Android/WebView acceptance.

Recovery boundary error props are widened from `Error` to `unknown`, matching
TanStack Router's contract and the existing diagnostics functions. Original thrown
values are retained; there is no coercion, new behavior, or weakened error check.

## Executed validation

- Baseline outbox: 1,014 tests PASS.
- Updated outbox: 1,019 tests / 38 files PASS.
- Focused hydration regressions: 5 PASS; old-source counterfactual: 5 FAIL.
- Original `tests/identity/isolation.test.ts`, unmodified, run with Bun 1.4.4:
  10 PASS, 0 FAIL, 149 assertions. This resolves the prior unexecuted Bun runner
  evidence for this suite only, not all identity or guest-handoff acceptance.
- `npm run build`: PASS, offline snapshot inflation and Vite/Nitro build only;
  no deployment or live-content generation.
- `git diff --check`: PASS.

## Dependency and typecheck limitation

`npm ci` fails because the existing package manifest and lock are inconsistent
(missing Capacitor/font packages and differing TanStack/Lovable versions among
others). Dependencies were installed locally with `npm install
--package-lock=false --ignore-scripts --no-audit --no-fund`. No manifest or lock
changes are included. Current resolution includes Vite 8.3.8 and Vitest 4.1.12.

Typechecking is **not PASS** under this fresh resolution: existing server-function
`.inputValidator` API/type errors and resulting implicit-any errors remain.
Boundary props were made compatible, not the server-function contracts. The
next repair must reconcile/pin dependencies and validate server-function APIs,
not change reward/auth behavior simply to silence compiler errors.

## Unchanged release boundaries

P1-05B-03 isolated PostgreSQL engine acceptance remains PASS. Real hosted
Supabase integration remains PENDING: the only identified project is production,
not a staging target. No Supabase project was connected, migrated or changed.
P1-04/P1-05/P1-06 remain OPEN; economic authority remains disabled and V18 HOLD.
Android/WebView force-stop, server baseline/writer admission, campaign delivery,
and guest handoff remain unproven. No production publish, wallet/profile migration,
settlement activation, protected P1-06B edit, or paused cost work occurred.
