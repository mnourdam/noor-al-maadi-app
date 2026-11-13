# Museum achievement presentation: bounded display repair

Baseline: `75872a66`. A mounted synthetic test using the actual AchievementEngineBoot and shared useAchievementViews projection (the Profile achievement source) supplied ten confirmed user_collection rows, but `ach_artifact_10` remained `locked-visible:0`. Repository search found the only production pushCanonical caller never supplied museum; the engine initialized the domain empty. This proves a source-level omission, not the current state of a real player's account.

## Scope

A read-only, owner/epoch/session-bound collection reader supplies a separate presentation projection for the existing museum-category definitions. Canonical predicates and progress functions are reused without changing thresholds or rewards. Existing persisted unlocked/claimed views remain unchanged. Newly satisfied rows are projected as unlocked, not claimed, with `ownershipPresentationOnly` and an explicit Profile detail note that payment is unconfirmed.

The projection does NOT push input into the earning engine, call claims or historical repair, persist achievements, grant XP/dinars/titles, emit unlock notifications, or replay guest rewards. It is not a settlement or economic-authority repair. The mounted test asserts that the engine museum snapshot stays zero, the museum record is absent from persisted engine state, and no museum claim/repair is issued.

Only confirmed `user_collection` rows count. Duplicate type/id pairs and malformed rows are discarded. Guest/pending-outbox/profile counters are not inferred as confirmed ownership. Memory cache is owner+epoch scoped; identity retirement clears it immediately. Same-owner offline failures retain only the latest in-memory confirmed value. A cold offline restart has no new ownership cache: already persisted achievement mirrors keep their old behavior, but unpersisted ownership-based display needs a successful read. This limitation is not silently promoted to full offline acceptance.

## Validation

14 focused synthetic tests passed: actual boot/shared view; thresholds and duplicate/malformed rows; empty collection; delayed old owner and ABA; guest; mismatched session; remount/offline failure; multi-surface coalescing and refresh; deadline/late response; synchronous auth throw and retry; never-settling auth deadline; mutation supersession; existing claimed records remain unchanged and presentation does not invent receipt dates. Final combined run passed all 29 cases (14 museum plus 15 existing achievement-identity tests). Both TypeScript projects passed. Full integrated aggregate and branch CI remain the coordinator’s responsibility.

Tests mock service boundaries and do not contact a database. Actual full Profile route/browser/native UI and real hosted RLS remain untested. No production data or deployed settings changed. No publication performed in this worker.

## Narrow ingress inventory review

The new literal `user_collection` reader is explicitly inventoried at its normalized source SHA256 `53614be323264abb31b82edf462f8d9856f7f81215981fc6063351578280e825`. Its sole database operation is a SELECT of `item_id,item_type` filtered by the matching authenticated `user_id`; ownership/epoch fences constrain the in-memory presentation. It performs no writes or RPCs and does not feed the earning engine or claim/reconcile paths. Only this client candidate was added; all pre-existing client pins, migration pins and function candidates remain unchanged. The dependent semantic-review manifest digest alone was updated; no semantic SQL disposition or authority status changed. This records read-only source inspection, not hosted RLS acceptance, economic admission, reward payment or production readiness.

Integrated local validation: both TypeScript projects PASS and 1,894/1,894 tests across 97 files PASS with the reviewed chapter reread, encyclopedia source-readiness fix, English shell preview and existing chapter-image suites. Independent metadata review verified only the new SELECT client entry and dependent digest changed; seven integrity tests and source drift PASS. Remote CI and actual Profile/browser/native acceptance remain separate pending gates.
