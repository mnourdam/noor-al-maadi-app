# Updated content hydration after an offline browser restart

## Gap and bounded extension

The existing actual content-runtime browser lane exercised interrupted HTTP abort, retry, freeze/resume, same-page offline failure and online recovery, then orderly online reopen. It did not exercise hydration after a module-memory reset with content transport unavailable.

This extension preserves all those controls and adds a third launch of the same persistent Chromium profile at the same scheme/host/port. Offline mode is set before navigation. Only exact Vite-emitted JavaScript chunks and fixture HTML are fulfilled from a hash-verified private build inventory. No content, snapshot, API, arbitrary file or remote response is supplied. The HTML uses `/offline-reopen.html` solely to select a fixture guard that rejects missing persisted data before any baseline seeding or local-store activation.

This is **offline data hydration with assisted static test boot**, not genuine offline navigation/package installation, a service worker, cold Android, process force-stop or complete app startup. Route interception also changes normal cache behavior. No production source changes.

## Required actual browser assertions

After the retained successful update to `reconnected` and online-reopen control:

- New browser/context/page module nonce differs; the old page sentinel is absent.
- Actual `navigator.onLine` and mounted `useOnline` are false.
- Fixture seed/apply counters are both zero.
- Real `loadSnapshot` returns exactly the previous version/checksum/count/title; real local-first store contains 1500 rows, only the updated title and exact active version.
- The health request is observed and denied, all server-received request counts remain unchanged, and no content API attempt is made.
- Best-effort bundled-snapshot requests are denied and counted separately. They cannot supply hydration data.
- Only enumerated immutable HTML/JS responses are fulfilled; unknown transport fails acceptance. Existing external/page-error and teardown boundaries remain.

The missing-persistence negative is a local test of the exact fixture guard called before seeding, not a second empty-profile browser run. No snapshot is injected during reopen.

## Local receipts and pending runtime

- Existing Node build-target guards: 5/5 PASS.
- Python controls: 2/2 PASS, covering exact static entries, traversal/content/non-JS rejection, duplicate/changed-byte rejection, and initialization failures at offline setup/navigation/readiness. Newly owned contexts are closed even before returning to the caller; cleanup failures retain the original exception with a fixed diagnostic note.
- Vitest missing-snapshot guard: PASS.
- Actual Vite build and hash validation: PASS, 15 emitted static files in this build.
- `git diff --check`: PASS.

No local Chromium was launched. The new offline restart result remains pending reviewed remote execution. Original online and transport-counterfactual evidence is not relabeled as this new scenario.
