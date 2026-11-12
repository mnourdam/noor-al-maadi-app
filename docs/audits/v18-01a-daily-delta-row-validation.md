# V18: validate the exact delta row before restoring daily completion

## Defect

The daily completion probe previously returned `exists: !!data`. Any truthy
response, including an empty object, array, string or a row for a different delta,
could restore completed/rewarded flags. A successful transport call is not a
matching row.

The response must be a non-array object with a string delta_id exactly equal to
the requested stable ID. Null means absent. Malformed/mismatched data is unresolved
rather than successful evidence, and the mounted hydrator must leave flags alone.
A valid matching row retains the existing UI behavior.

## Important limit

Exact row matching does **not** make this ledger authoritative. Checked-in SQL
still permits direct own-row insertion and UUID-only conflict handling, so a
matching row is not independently verified balance mutation or typed grant
inclusion. This change does not alter those permissions, invent a trusted baseline,
or enable economic cutover. V18 remains **HOLD**, production **NO-GO**.

## Test fixture corrections

Historical positive tests used placeholder delta IDs such as confirmed/same/old
rather than the ID sent by their mocked query. Those fixtures must return the
captured queried ID to remain legitimate positive responses under strict matching.
Their existing assertions are preserved. New malformed/mismatched tests must not
be automatically normalized by the mock, so the invalid evidence reaches the real
adapter and mounted UI unchanged.

Counterfactual, final results and independent review are recorded after verification.
No live backend or real player data is used.

Counterfactual old source: **12 failures / 63 passes** with the new suite.
Fixed source: **75/75 PASS**, independently rerun; source review **CLEAR**.
The added cases cover six invalid shapes/IDs at service and mounted UI boundaries,
plus null absence and exact-ID positive behavior. Invalid rows expose
invalid-delta-receipt with no exists:true; the probe rejects that marker and the
existing mounted catch leaves flags unchanged. Other backend-error behavior is
unchanged. The auxiliary post-grant ledger diagnostic is not promoted into
proof of economic inclusion.

Exact fixture corrections: query mock eq forwards the requested ID; three
pending old-context rows use the captured query argument; the racing hydrator's
same-row fixture and subsequent probe use captured/echoed query IDs; the current
positive fixture echoes its query argument. New malformed responses are not
rewritten by that mock. All historical assertions remain in place.

Final combined local package: **1,225/1,225 tests PASS** across 48 files; application/regression typecheck, offline client/SSR build and diff check **PASS**. Both source changes independently reviewed. Branch CI pending at publication; no deployment.
