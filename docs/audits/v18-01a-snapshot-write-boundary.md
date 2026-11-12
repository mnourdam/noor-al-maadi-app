# V18 development snapshot-write boundary

Base remote: `1403d46d22dcc35875d9636f486202cb1382851f`.

## Existing risk and bounded repair

The development snapshot writer previously accepted unauthenticated requests in
any environment other than production and directly truncated/replaced its target.
No current source caller was found, but its stated contract is an administrative
local development helper, not a public write endpoint.

It now denies every environment except exact `NODE_ENV=development`, before the
existing authentication middleware. The handler also rechecks this boundary and
requires the existing `is_user_manager` RPC to return literal true. Missing auth,
invalid verified claims, false/null/nonboolean permission results and permission
errors cannot reach filesystem operations. No role is granted, no service-role
client is loaded, and the endpoint remains disabled in production. This is not
permission to expose a development server publicly.

Payloads must contain nonempty valid JSON, with a 50 MiB UTF-8 byte ceiling. No
undocumented content schema is imposed. Authorized development writes retain the
same fixed `public/offline-snapshot.json` target and response shape, with accurate
UTF-8 byte count. An exclusive same-directory UUID temporary file (mode 0600) is
written, synced, closed, then atomically renamed. Failed creation cannot delete a
foreign temporary file; later failure cleans only the file this request created.
An existing snapshot is not truncated on tested write/sync/close/rename failures.

## Evidence

- 33 dedicated tests PASS using the real middleware/builder with mocked request,
  authentication client, permission RPC and filesystem operations.
- Original-source counterfactual: 29 FAIL / 4 PASS, demonstrating the absent
  boundary rather than only testing a replacement mock API.
- Existing server-validator tests: 17 PASS, updated to require the new middleware
  ordering for this endpoint only.
- Full suite: 1,107 tests / 43 files PASS.
- Mocked scheduler: 41/41 PASS.
- Full application/outbox typecheck: PASS, exit 0.
- Offline client/SSR build: PASS, exit 0.
- Whitespace check: PASS.

Independent source review found no access-control/atomic-write blocker. A
simultaneous write and close error may report the close error; authorized-dev
filesystem failures remain diagnostic errors. Neither changes the tested target
preservation property.

## Boundaries

No live authentication/backend calls or actual filesystem writes were exercised
by these unit tests. Compiled HTTP dispatch and OS/crash durability remain
separate acceptance work. Atomic rename is not a claim of power-loss durability.
No production deployment, app data migration, economic gate activation, guest
transfer or paused cost change occurred. Hosted staging remains PENDING, V18
remains HOLD and P1-04/P1-05/P1-06 remain OPEN.
