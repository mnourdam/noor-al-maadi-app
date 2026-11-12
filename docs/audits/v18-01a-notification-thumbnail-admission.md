# V18 notification thumbnail viewport admission

## Bounded source correction

The notification center mounted `CachedImage` for every image row. Although its
`img` used `loading="lazy"`, the actual image-cache hook fetched cold remote
images before producing that img. A 150-row jsdom synthetic fixture reproduced 150
concurrently held fetch promises (not 150 simultaneous network connections). This is a source/fixture finding, not proof of the cause
of the historical V18-23 report on a player's device.

Only notification thumbnails now defer mounting that hook until their reserved
56px slot intersects a viewport with a 200px vertical margin. No global image
cache, pagination, notification transport, sound, or economic policy changed.
The decorative thumbnail remains inside the existing action button, with empty
alt and no new focus target. The slot preserves dimensions while waiting/offline.
Observer absence or setup failure falls back to the old eager behavior.

Source, notification ID, and owner/epoch changes remount the thumbnail; retired
observer callbacks cannot admit work, and the generic hook's existing cleanup
prevents late old images from rendering. This does not authorize or isolate
notification records: stale list rows and globally URL-keyed image cache remain
outside this patch. It does not cancel fetches already admitted. No private-image
cache policy or identity-safe notification fetching is claimed.

## Deterministic evidence

`tests/offline/outbox-notification-thumbnail.test.tsx` uses the actual wrapper,
CachedImage and image-cache modules, synthetic URLs, in-memory Cache Storage,
held fetch promises, and jsdom with explicit intersection events. No real
network, player data, or native environment is used.

For 150 cold rows, zero offscreen requests start. Admitting five rows starts five
requests (peak five); releasing their modeled 64 KiB bodies yields 327,680 bytes,
versus 9,830,400 bytes for all 150 in the earlier eager fixture. These are fixture
body sizes, not actual production bytes, network savings or performance timings.
Warm remount/admission adds zero fetches. The fixture's action remains clickable
while responses are held; this is not real-browser responsiveness evidence.

Controls cover source/notification replacement, owner ABA, late results,
unmount, observer missing/constructor/observe errors, nonintersecting/foreign
entries, StrictMode cleanup, and no added focus targets. Historical tests and
generic image-cache source remain unchanged. Development StrictMode still starts
two cache fetches for one admitted image because that existing hook replays;
this patch does not claim cache single-flight or replay deduplication.

## Remaining acceptance

The isolated browser request/body-byte and held-response interaction checks
below now pass. Full-app/device performance remains untested. Repeated full-list
fetches/pagination are separate. V18-21 sound
requires clean-install versus upgrade Android channel/playback acceptance.
No full-app, Android, production-performance or release acceptance is implied.

## Browser measurement lane (verified synthetic runtime)

The separate notification-images browser fixture uses the actual React thumbnail
and cache implementations, with a test-only direct-CachedImage baseline selector.
A loopback HTTP server holds 150 unique valid 64 KiB SVG responses. Playwright
counts initiated requests separately from server arrivals, active handlers and
completed body bytes; HTTP connection limits mean these are not TCP concurrency
or aggregate throughput measurements. The synthetic button must work before
bodies are released. The wrapper admits near-viewport rows only, then warm
remounts and scrolls. The direct baseline must initiate all 150, not merely fail.

A fresh persistent Chromium profile per mode is outside served assets. The
browser-context exact-origin firewall blocks external requests, service workers
are blocked and every WebSocket is closed. This is not whole-machine egress
isolation. Local verification builds the bundle and checks syntax/target guards;
no restricted local server/browser run was attempted. Branch-only CI subsequently
supplied the bounded runtime evidence below. Fixed waits are fixture observations,
not promises of universal timing or production responsiveness.

Final local gates: both TypeScript projects PASS; 1,815/1,815 offline tests across 87 files PASS; seven economic inventory checks and drift PASS without pin changes. Independent reviews cleared the eight component cases and browser-lane safety/measurement contract, including same-context browser-version lookup and nonempty visible-image assertions. Four builder guards, bundle, Python AST, YAML/shell syntax and diff checks PASS. Those local checks were not browser runtime evidence. The separate CI measurements below now supply that evidence; neither modeled unit-test bytes nor synthetic browser bytes are production traffic or device performance.


## Verified browser evidence

[Run 43311042629](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43311042629), job `131506888924`, passed at source `85b5ecb1` (coordinator mapping to local `dcb6308c`, tree `daf778a24162529283c0f3ca11827e966a2f2dda`). Independent review verified that local tree and the unchanged harness, recomputed the downloaded artifact ZIP SHA-256 `59a192a37dbba34613409cac0f2059c4a28da664dc3088e2cdb4e3bdaba13411`, and confirmed artifact `13985992247` contains exactly one member, `notification-images-result.json`, matching the extracted result.

The result is **PASS_SYNTHETIC_BROWSER_ONLY**, using **Chrome/151.0.7922.34**, a fresh profile per mode, 150 synthetic rows, an **800×600** viewport and **65,536-byte** SVG bodies:

| Measurement | Direct CachedImage baseline | Viewport wrapper |
| --- | ---: | ---: |
| Initially initiated image requests | 150 | 9 |
| Server arrivals/active handlers while held | 6 / 6 | 6 / 6 |
| Body bytes sent while held | 0 | 0 |
| Final initiated requests | 150 | 20 |
| Final completed server body bytes | 9,830,400 | 1,310,720 |
| Peak simultaneous server handlers | 6 | 6 |
| Additional requests on tested warm remount | 0 | 0 |
| Synthetic action button while bodies held | PASS | PASS |

The wrapper's final 20 requests include the subsequent single scroll to 5,000px. The initial 9-versus-150 comparison demonstrates viewport admission in this fixture. Final byte totals compare different admitted image sets, not equal full-list navigation coverage or a guaranteed production savings ratio. Server body bytes exclude headers/transport overhead and are not receiver-level bandwidth measurements. Both modes peaked at six server handlers, so 150 initiated baseline requests must not be described as 150 concurrent HTTP transfers.

PASS also requires nonempty visible-image decoding, Cache Storage population, and no captured page errors, image-request failures, external requests or WebSocket attempts within the harness. The fixed observation windows and successful synthetic button click do not measure frame rates, latency distributions, real notification actions or production responsiveness. A warning from the separate pre-harness Playwright executable-discovery process was observed despite its explicit stop call; this artifact does not explain that warning, and no causal diagnosis is inferred from it.

This is actual Chromium transport/cache behavior of the selected components against loopback synthetic images. Actual app notification RPCs, full UI, Android lifecycle/sound, private-image authorization, production traffic and release readiness remain outside the result. No player backend or deployment was involved.
