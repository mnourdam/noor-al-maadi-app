# V18 startup outcomes and scheduler regression harness

Base remote tree: `995bd6c97a1f0bd9dd8deb94120259f56af148af`.

## Startup failure normalization

`withBoundedTimeout` accepts a promise or promise-producing function. Previously,
a synchronous throw from that function rejected the helper itself instead of
returning its documented `{ kind: failed | offline }` outcome. It now sends such
throws through the existing rejection classifier. Success/deadline/late-result
behavior and the classifier are unchanged.

The old startup test incorrectly expected ambiguous `Failed to fetch` to mean
confirmed offline, contradicting the existing explicit implementation comment.
That assertion now expects failed; explicit offline/terminal transport cases are
covered separately. Three new synchronous-throw cases fail on the original helper
and pass after repair. All 12 startup reconciliation tests pass and are now
included in the standard outbox test/typecheck configuration.

## Scheduler harness, not scheduler behavior

The existing npm script preloaded tsx while the test script registered its own
resolver/mocks. The preload bypassed the fake prefs/daily-state/identity modules:
33/39 passed and six suppression/identity assertions failed. Direct invocation
appeared to pass only because an unsupported tsx registration error was swallowed
and left incidental loader state. The harness now explicitly transpiles only the
two scheduler/catalog TypeScript modules with the existing TypeScript dependency,
and retains its fake module resolver. The npm script no longer preloads tsx.

No production notification scheduler change was needed. New sentinels verify
fake prefs/daily/identity consumption and zero network or permission-prompt calls.
The corrected command passes 41/41. Restoring the old tsx preload fails seven
assertions: the original six plus the new mock-consumption guard. Test plugins
remain fake; no real notifications or permission requests were made.

## Durable checks

New `.github/workflows/v18-runtime-regressions.yml` runs only on the V18 repair
branch: clean npm install, isolated tests, mocked scheduler, typecheck and offline
client/SSR build sequentially. It has read-only repository permissions, no saved
credentials, no project secrets and no deploy step. It does not substitute for
hosted Supabase/auth integration or Android acceptance. Workflow creation alone
is not a successful CI run; inspect its actual result separately.

## Boundaries

Economic guards, production, SQL proposals/migrations, guest handoff, V17 import,
and paused cost work are unchanged. Supabase integration remains PENDING,
P1-04/P1-05/P1-06 remain OPEN and V18 remains HOLD.

## Local final validation

- Outbox + startup: 1,048 tests / 40 files PASS.
- Scheduler: 41/41 PASS.
- Full application/outbox typecheck: PASS, exit 0.
- Offline client/SSR build: PASS, exit 0.
- `git diff --check`: PASS.
