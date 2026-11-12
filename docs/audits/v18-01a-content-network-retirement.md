# V18 explicit content refresh: cancellation and complete collection fetches

## Scope

The explicit controller now requests `refreshSnapshotIncremental({ signal, strictComplete: true })`. The optional options preserve legacy zero-argument behavior. Attempt-scoped refreshes forward the signal to actual PostgREST count, full-page, delta-page and story-manifest builders. The no-cache generation fallback receives the same options. Aborted requests throw rather than becoming a cached collection or a full-fetch fallback. Checks also cover asynchronous storage/module/digest boundaries before returning a candidate.

Each options-bearing refresh owns its story-manifest promise. The optional signaled content-manifest RPC bypasses the background shared promise/cache, so one canceled refresh cannot poison an independent caller or retry. Legacy background calls retain their previous sharing behavior.

Strict mode rethrows collection fetch failures rather than retaining old rows and publishing a fresh candidate timestamp. An unavailable content manifest can still lead to a successful full refresh if collection fetches succeed. Existing successful delta-to-full fallback, story merging, empty-collection preservation and validation policies are unchanged. This is not a new authoritative deletion or content-schema policy.

## Evidence

Initial test-first actual-source probes: **3 failed / 1 passed** before the repair. They demonstrated swallowed collection failure, requests issued despite pre-abort, and absence of the caller signal at the actual PostgREST fetch boundary. Legacy cached-row retention was the passing control.

The final new suites contain **10 passing tests**: strict rejection, unchanged legacy fallback, pre-abort, actual builder signal forwarding, successful full refresh without a manifest, cancellation with an independent call and a later retry, isolated story-manifest requests, genuine content-manifest builder cancellation/isolation, and aborted no-cache generation fallback. Supabase/PostgREST builders are real; the fetch boundary returns synthetic responses or controlled abort rejection. No live server, credential or player data is used. These tests establish request wiring and continuation behavior, not Android network-stack recovery.

Related lifecycle/storage/pipeline tests run under the normal regression configuration. One historical source-shape assertion is updated to require `fetchCollection(def, scope)` instead of `fetchCollection(def)` in the same count-mismatch/full-refresh replacement branch; its branch and replacement requirements are unchanged. Strict completeness does not require an available manifest or an exact count for every optional collection if the full fetch succeeds. No production activation or deployment occurs.

## Limits

Cancellation here covers refresh/generation queries, not every network operation in the app. Post-activation editorial metadata manifest/fingerprint calls remain non-canceled network work, although the prior retirement repair fences their eventual metadata publication. Already-started image warming and unrelated background callers are not canceled. No historical connectivity symptom is attributed to this defect, and large interrupted-download Android/WebView acceptance remains outstanding. An AbortSignal asks the transport to stop; it does not prove a remote server stopped processing a request.
