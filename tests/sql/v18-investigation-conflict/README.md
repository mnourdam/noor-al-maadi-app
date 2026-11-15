# Isolated investigation reward conflict candidate

Base: `2d797db5316dd7c112d004d745a3959c64faa82f`. This directory is a proposal, NOT a deployable migration or approval to apply one.

`candidate.sql` changes only fresh completion: conflicting delta insertion raises PIV01; a missing wallet update raises PIV02. The function's exception subtransaction rolls back tentative completion, ledger, wallet and collection changes before returning failure. No new delta ID is invented and no historical balance is reconstructed.

`acceptance.json` records 28 successful local PostgreSQL 17.6 checks, including reproduction of the original false-success bug, full row-state snapshots, replay, conflicts across owners, missing profile, caps, late trigger failure and two positively observed blocking concurrency tests. `harness.py` requires the exact disposable loopback cluster/data-directory and an absent fixture database. Do not point it at any other database. The test cluster is stopped after the recorded run.

The harness loads hash-pinned repository SQL through the provenance fixture. It uses a forgeable local auth.uid shim and creates the function as local postgres superuser. It does NOT reproduce deployed owner/BYPASSRLS, ACL, RLS, triggers or schema. Live use requires read-only comparison of the exact deployed function and those metadata, further review, and separate apply authorization. Successful fixture tests are not live database acceptance.

Only new grants are repaired. Existing malformed progress rows are NOT compensated; the inherited replay artifact self-heal from writable reward snapshots is unchanged and not endorsed by this proposal.

Client behavior: explicit conflict is permanently rejected from automatic delivery only after the existing durable dead-letter archive succeeds. Failure to archive retains the original pending intent. The route displays an unresolved reward conflict, grants nothing and disables retry controls for that mounted attempt. Reopening can retry the SAME stable identity, never rotate identity or silently manufacture payment.

Node route tests mock transport and selected UI dependencies. The singleflight test exercises real fake-indexeddb outbox/dead-letter storage, not a live backend. They do not establish Android acceptance.

## Read-only deployed metadata comparison

`live-metadata-comparison.json` records comparison of the catalog response supplied by the parent. The live function body equals the original migration body exactly after trimming outer whitespace. The live owner is postgres, nonsuperuser but BYPASSRLS, with authenticated/service_role execute ACL; all five tables have RLS enabled, not forced. Seven triggers are present, notably an AFTER progress trigger updating the profile completion counter, then profile triggers. The local fixture does not faithfully reproduce these triggers or transitive dependencies/column constraints. This narrows uncertainty but does NOT grant live acceptance.

Client checks: 97 tests across pending-route, singleflight, dead-letter and partition suites passed; `npm run typecheck` exited 0. UI tests use the existing transport mocks; the newly added archive test uses real fake-indexeddb/outbox/archive. No Android or build claim is made by this repair.

## Limited trigger supplement

`trigger-check.py` and `trigger-acceptance.json` add nine passing checks with five exact catalog triggers on the written profile/progress tables. They observe completion-counter updates before wallet updates, heart-anchor timestamps, replay without side effects, and rollback of nested trigger effects after delta conflict or a late wallet failure. The two investigation-table write triggers cannot fire in this completion read path. This supplements, rather than replaces, the baseline limitations above: the local owner is still superuser, levels remain zero, and the uncollected level-five reward dependency is a fail-closed stub. No live acceptance, historical repair, or Android acceptance is asserted.
