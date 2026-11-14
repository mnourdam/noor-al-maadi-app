# Pending private-image identity regression

Base: local `1552a3d` (parent-verified current public `774b` tree), full repository checkout. Test-only change; no feature enabling, production code, dependency, SQL, remote calls or cleanup-worker changes.

## Coverage gap and measured result

Existing actual-client tests exercised retirement during reservation, but not a held upload or already-dispatched finalization. Added eleven deferred-transport cases against actual `sendFeedbackImages`, `makeImageDraft` and identity owner/epoch implementation. Only the Supabase transport is mocked. The tiny JPEG-signature blob is not a decoded image or server-validation proof.

For both pending upload and pending finalization, controls cover A→B, A→guest, A→B→A, A→guest→A and conversation invalidation without an identity change. Each promise is explicitly settled. A successful PUT after retirement must not mark the draft uploaded or dispatch finalization. An already-dispatched finalization may succeed remotely, but the retired caller must reject rather than acknowledge success. Retrying the stale draft is rejected without another transport call. These are client result fences, not cancellation or deletion of remote bytes/messages.

A separate concurrency control completes a fresh B draft while A's upload is held. B gets its own immutable image/message IDs and owner-prefixed path; only B finalizes. Late A completion is rejected and cannot mark A's draft uploaded. Existing immutable conflict and uncertain-finalization retry tests remain unchanged.

The new cases pass on unchanged production code: this closes a regression-coverage gap, not evidence of a newly fixed production defect. No React callback/DOM, full authentication transition, deployed RLS, real Storage, server decoder, late-write cleanup, retention, or native acceptance is inferred. Private-image activation remains blocked by the existing server-validation and lifecycle requirements.

## Verification

Author terminal verification: all 41 cases across the four feedback-image suites PASS, including 25 actual-client cases (eleven new). `tsc --noEmit -p tsconfig.outbox.json` exits 0. `git diff --check` passes. Package manifest and both lockfile SHA256 values remain unchanged. Independent reviewer rerun is reported separately. No browser or emulator used. No checkpoint decoder/promotion draft was reconstructed or substituted for real client code.
