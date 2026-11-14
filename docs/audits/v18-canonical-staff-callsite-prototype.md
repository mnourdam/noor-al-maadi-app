# Dormant staff sending and explicit route integration

This extends the independently verified owner-only sender experiment, not a deployed API or activation. The older sender audit describes its original source/result. Production image picker and new canonical build opt-in remain OFF unless explicitly configured; no hosted configuration, migration, policy or data changed.

## Principals and authorization

`owner_id` continues to mean thread recipient, including canonical key/read/retirement scope. New immutable `uploader_id` is distinct in reservation, attempt and input intent. Existing service fixture reservations with no explicit uploader retain their owner as uploader; actor reservations explicitly store both. The actor RPC derives uploader from auth.uid and recipient from the actual fixture issue reporter. A reporter may send public content to their issue; current staff may send public or internal content. No caller-supplied role/recipient is accepted. Quarantine key is uploader/image, canonical key remains recipient/attempt. Input admission and cleanup compare immutable uploader scope; newly admitted upload requires that uploader's current eligible role and intent.

The prototype sender RPC signature now includes immutable `p_internal` with false default; this is a change to an undeployed prototype, not a compatibility promise for a deployed API. Canonical descriptor v1 is unchanged. Exact retry binds recipient, uploader, issue, message, image, body, internal flag, digest and size. Staff cannot reuse a player's request, players cannot reuse staff requests, and another staff identity cannot impersonate the uploader. Current staff eligibility and issue recipient are rechecked at finalize. A private guard on the older fixture finalize helper runs before both insert and replay, preventing alternate message/body/author/internal or changed-recipient bypass. It leaves older non-client fixture attempts under their existing checks.

## Product code and explicit callsites

The actual composer supports one canonical image for player or staff. Staff retains the actual internal checkbox; frozen pending draft, owner/epoch/thread/protocol/staff retirement and exact retry behavior remain. The client uploads using actor credentials only and cannot mark trusted writer terminality or call the worker.

Both actual feedback and admin route callsites use one shared exact-true `VITE_FEEDBACK_CANONICAL_ENABLED` flag, default legacy. Neither descriptor shape nor message data selects the sender protocol. A shared message component always renders old `attachments` through the legacy parser; only the explicitly enabled build additionally renders the separately named `canonical_attachments_v1` server response field through canonical-v1. Thus enabling the dormant route selection does not discard existing legacy rows. This is an explicit proposed response field, not an assertion the current production thread RPC already emits it. The disposable actor message projection emits that field directly; the browser does not rewrite SDK paths or masquerade canonical data as legacy descriptors.

## Local controls and planned disposable execution

81 focused JS controls across eight suites pass. Four controls mount the actual player and admin route components with mocked routing/service boundaries and verify OFF, exact true, uppercase TRUE and empty flag behavior, composer role/protocol props and retained mixed legacy/canonical fields. These are real callsite tests, not full route browser/auth-provider acceptance. Actual sender/composer tests cover public/internal binding and the existing pending/retirement/legacy boundaries.

Expanded actual PGlite controls pass: staff public/internal, reporter read versus internal denial, unrelated actor and second-staff retry denial, wrong-uploader input/start/attest, recipient change, role loss, alternate finalize helper and replay bypass negatives. Twenty-six Python controls, both TypeScript checks and scrubbed actual Vite fixture build pass. No local Chromium is launched.

The reviewed existing disposable lane is extended to three separate browser scenarios: reporter public, staff public and staff internal. Each uses actual composer/preparation/actor reserve and upload, pending with no sent acknowledgement, an outside-client service worker, same-draft retry, one publication and exact visible canonical pixels. Separate receipts retain each scenario rather than overwrite success history. Native checks add wrong-uploader INSERT denials before positive upload, exact staff/recipient byte reads, player/internal and unrelated-owner denials, role-loss retry denial and unchanged immutable replay. Runtime is pending independent review and coordinated CI; no new scenario is claimed to have executed yet.

## Unclosed activation gates

Synthetic staff authorization and issue model are not the production authority deployment. Account deletion or transfer across either principal, production writer terminality/leases and earlier in-flight PUT, complete cleanup drain/SLA, decoder native resource containment, full authentication-provider flow, full app/Android and actual hosted thread response integration remain open. Existing controlled SQL contention proves only its two specific orders, not all actor reservation races. Browser interception disables normal cache; fresh denial is not cached/downloaded-byte revocation. The service controller supplies testbench-only terminal evidence and is not a deployed scheduler. No production flag is enabled.

Current reporter and staff checks are transaction observations, not a proved serialization guarantee for concurrent recipient or role changes. Existing native contention evidence concerns publication versus cleanup only.
