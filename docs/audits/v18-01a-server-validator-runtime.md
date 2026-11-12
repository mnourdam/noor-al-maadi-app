# V18 server-builder API and npm reproducibility repair

Base: `25d2919ec0e53ca6c74f3217d930c281d9e7ca7c`.

## Defects and bounded changes

The committed package-lock described an older manifest: 66 direct dependencies
versus the current 76, missing test/runtime packages and differing TanStack and
Lovable versions. `npm ci` refused to install. Regenerated only package-lock.json
against the unchanged package.json. A separate empty directory then successfully
completed `npm ci --ignore-scripts --no-audit --no-fund` (695 packages).

The actual installed TanStack server-function builder exposes `.validator`, not
`.inputValidator`. Fifteen calls in seven source files used the latter. The
counterfactual original modules fail at import with `inputValidator is not a
function`; this is a runtime construction failure as well as a TypeScript error.
Only those method names changed. Schemas, auth middleware and handler bodies are
unchanged. No validator was removed or loosened and no handler was executed.

## Acceptance evidence

`outbox-server-function-validators.test.ts` observes the real builder, not a fake
replacement API. It covers all fifteen validators with valid/invalid inputs,
normalization/defaults and original middleware identity, plus unchanged GET/API
behavior. All 17 tests PASS on clean npm dependencies. The old-source
counterfactual fails during module construction. Supabase/backend entry points
are trapped; no reward claim, account deletion, imports or privileged operation
is performed. These tests are not compiled server-dispatch integration evidence.

Full outbox suite on clean dependencies: 1,036 tests / 39 files PASS. After one
normalization assertion was strengthened, the focused 17 tests passed again.

Resolved npm versions include React Start 1.169.5, React Router 1.170.46,
start-client-core 1.170.39, Vite 8.1.0, Vitest 4.1.12 and Lovable config 2.26.0.
No dependency range or manifest changes are included. This is npm lock evidence;
legacy bun.lock was not rewritten and Bun package installation is not certified.

Final sequential typecheck/build results are recorded below. An earlier parallel
attempt exceeded workspace memory (exit 137); that infrastructure termination is
not reported as a successful check.

## Release boundary

No production deployment, Supabase migration or live backend access. No economic
settlement, authority admission, V17 import or guest handoff activation. Existing
P1-05B-03 engine PASS remains separate from hosted Supabase integration PENDING.
P1-04/P1-05/P1-06 remain OPEN and V18 remains HOLD.

## Final sequential checks

- `NODE_OPTIONS=--max-old-space-size=2048 npm run typecheck:outbox`: PASS, exit 0
  (application and outbox test TypeScript projects).
- `NODE_OPTIONS=--max-old-space-size=2048 npm run build`: PASS, exit 0
  (offline snapshot plus client/SSR build; no deploy).
- `git diff --check`: PASS.
