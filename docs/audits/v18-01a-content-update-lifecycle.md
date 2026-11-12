# V18 content update: bounded initial lifecycle

## Demonstrated failure and bounded correction

`applyContentUpdate` previously set `applying=true` and awaited its initial `loadSnapshot` before entering the timeout and try/catch. A rejected read escaped cleanup; a hung read never reached the timer. Both could leave the update control blocked until runtime restart.

The explicit update action now lazily obtains its local activation adapter inside the timed work, checks the attempt epoch, and then performs the initial read inside that same timed operation. Late adapter/read completion returns before starting a retired download. The cached per-attempt adapter permits synchronous best-effort restoration on failure: there is no awaited recovery import to stall completion or roll back a later retry. No eager application-startup import or arbitrary recovery timeout was added.

Normal download/validation/persistence/activation semantics remain otherwise unchanged. This is not a network cancellation or durable-write fencing fix. The misleading old comment that a timed-out durable write was harmless was corrected.

## Evidence

New actual-controller tests: `tests/offline/outbox-content-update-lifecycle.test.ts`. Storage, download and optional identity dependencies are mocked; no live update request is issued by these tests. Final original-source counterfactual: **4 failed / 1 passed**, loaded with a temporary Vite override without swapping shared source. Corrected source: **5/5 pass**. Cases include rejected/hung initial read, successful retry without restart, late initial completion, ordinary persist-before-activate ordering, and hung/late activation-adapter import.

Historical release-pipeline and quota tests are now included in `vitest.outbox.config.ts`, adding their 41 existing cases to normal regression CI. The release-pipeline file explicitly mocks only optional `stories/content-identity-check` metadata: null fingerprint and unknown verification. These tests do not target editorial fingerprint networking; every historical assertion and timeout is unchanged. Using the normal committed configuration, **46/46 pass** across these two files and the new lifecycle suite. The original-source counterfactual was rerun with an isolated loader and remains **4 failed / 1 passed**; its source matches the committed pre-fix controller exactly.

An earlier unisolated fixed-source run had one historical first-success test exceed its 5-second deadline; the matched original-source run passed those historical tests. The optional fingerprint function has an 8-second timeout, but that observation is not proof of the failure's cause or a baseline bug. The explicit dependency mock provides scoped offline pipeline evidence, not unmocked network acceptance. The generator subprocess retains `VITE_SUPABASE_URL=http://127.0.0.1:1` and an invalid synthetic key; the generator uses this nonempty URL rather than replacing it from `.env`. It exercises failed local generation and unchanged artifact bytes/mtime, not a live service.

Independent review cleared the bounded source and fixture/config changes, independently running 46/46 focused checks under the normal configuration. Final local aggregate acceptance passed **1,619/1,619 tests across 66 files**, both TypeScript projects, client/SSR build and 41/41 scheduler checks. Remote CI is pending publication.

## Outstanding separate defects / acceptance

A separate temporary actual-controller reproduction still demonstrates that a timed-out download can later overwrite a successful retry's durable snapshot. This slice intentionally does not claim to fix that. Correct retirement must fence storage after async open/quota-reclaim/retry/fallback and abort active IndexedDB transactions; a check only before `saveSnapshot` is insufficient.

Network request cancellation, optional metadata continuation, honest completion when some incremental collections failed, large-content Android/WebView acceptance and connectivity restoration without restart require their own evidence. Historical user symptoms motivated the investigation but are not proven caused by this specific lifecycle defect. No production content, player progress, backend or authority changes were made.
