# V18 content update: retire pending snapshot writes

## Bounded repair

An update that timed out could resume after a successful retry and overwrite the retry's durable snapshot. Activation epoch checks alone did not protect storage. The controller now supplies a per-attempt AbortSignal to snapshot persistence, retires it with the attempt on failure, and checks its epoch after download/import/save/readback boundaries. Editorial identity metadata checks the same current-attempt predicate after its awaited dependencies and before writing. Deferred warming is admitted only while the attempt remains current.

`saveSnapshot(snapshot, signal?)` preserves the old no-signal API. Intentional retirement rejects with AbortError, closes a database that finishes opening late, aborts an active transaction, and prevents quota recovery continuations, write retries and localStorage fallback. Abort listeners are removed on settlement and cancellation is checked after listener installation. A spontaneous IndexedDB AbortError with a live or absent signal still follows legacy recovery/fallback behavior; error-name matching alone does not classify retirement.

Cancellation cannot undo an already committed transaction. The regression aborts in the native request-success event before transaction completion and proves rollback there. The controller may have persisted/activated content before a later metadata timeout; this repair does not turn those stages into one atomic transaction. It does prevent retired metadata continuations from overwriting a later attempt's identity.

## Evidence

Two new suites use actual storage/controller sources with isolated fake-indexeddb databases and synthetic content. Original-source isolated counterfactual: **7 failed / 2 passed**. Corrected source: **9/9 passed**. The original source is loaded via a temporary Vite override, without swapping shared checkout files.

Cases cover pre-aborted writes, cancellation after a real IndexedDB put-success event, delayed database open after a successor commit, deferred quota reclamation after successor commit, localStorage byte preservation, actual controller timeout/retry/late-download durable ordering, retired editorial fingerprint publication, and legacy no-signal/spontaneous-AbortError compatibility. Controlled gates establish the write interleavings; the controller late-download test additionally observes final stored version and last activation.

The unchanged lifecycle, historical release-pipeline and quota suites plus these new tests pass **55/55** under the normal regression configuration. Optional content dependencies are mocked; no live service or player data is used.

## Limits

This is not network cancellation: outstanding refresh requests may still finish, but retired results cannot begin or continue this snapshot write. Per-collection refresh failures retaining old rows with a fresh timestamp remain a separate honest-completion concern. No universal cross-tab writer exclusion, production activation, economic authority or historical Android-connectivity causality is claimed. Real browser/Android interrupted large-download acceptance remains separate from fake-indexeddb evidence.
