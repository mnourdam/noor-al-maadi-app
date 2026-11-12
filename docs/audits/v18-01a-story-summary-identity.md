# V18 story summary identity retirement

## Reproduction

An actual `listStoriesSummary` request captured Alice's session, then waited on its RPC. Identity changed Alice → Bob → Alice. The new Alice session's actual progress mirror recorded a completed story. Resolving the old request with `completed:false` overwrote that persisted completion. The baseline regression failed on real mirror bytes/state; only network and unrelated unlock-cache work were mocked. UID equality alone did not identify the retired session.

## Repair boundary

Capture owner and identity epoch before authentication. Fence continuation after authentication and the RPC; key in-flight work by owner, epoch, UID and world, and only clear the exact current promise slot. Fence response-derived pruning/mirror imports and unlock-cache reads. Local fallback may complete its existing read work but returns no rows after retirement. Before writing the signed unlock blob, an optional current predicate is checked again after asynchronous signing. Callers omitting this predicate retain previous behavior.

No server mutation, completion eligibility, unlock criteria, reward amount, baseline authority or production gate changes. Already completed writes are not rolled back. This is lifecycle retirement, not universal cross-tab ordering or same-session request revision arbitration. Local fallback's internal content loading is not canceled. A signed unlock cache remains a local cache, not evidence of server authorization.

## Tests

Ten new cases cover actual mirror ABA corruption, non-ABA identity change, delayed authentication before RPC, separate epoch flights with old-finally cleanup, positive mirror hydration, delayed real mirror-module acquisition, retirement during actual unlock signing continuation, legacy unguarded persistence and pre-retired calls, and synchronous RPC failure fallback followed by a fresh successful request. Focused ten PASS. The separate historical local-first suite remains unchanged: all four cases also fail on an isolated exact committed baseline under the same temporary Vitest config. Diagnostic-only instrumentation in that disposable copy traced the baseline failure to its incomplete identity mock; supplying owner/epoch exposes missing guest storage partition setup. No assertions or guest storage behavior were weakened, and this suite is not claimed passing. Aggregate/type/build and independent review remain coordinator-owned.

## Explicit authentication-mismatch behavior

If the active owner is authenticated but session lookup returns null, throws, or identifies a different user, the summary now returns an empty array before issuing an RPC or entering guest/local fallback. This is deliberate fail-closed identity handling, including offline mode: it can temporarily show no stories where the old code attempted guest-derived fallback. It does not establish that the authenticated player's offline library is available during broken/session-unavailable authentication. A matching healthy guest still receives its guest-RPC rows; the positive regression supplies synthetic guest evidence and does not claim to validate guest eligibility/storage. Five final controls cover null, error, different-user and offline mismatch plus healthy guest. Source semantics were not changed for these coverage additions.

Final bounded review: independent review and all 15 focused cases PASS. Coordinator ran both TypeScript projects and the normal offline aggregate: 1,668 tests across 75 files PASS. The source-drift checker also passes. These checks do not convert the separately failing historical four-case suite into acceptance, nor establish native device or production acceptance.
