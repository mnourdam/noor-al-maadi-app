# V18 notification thumbnail viewport admission

## Bounded source correction

The notification center mounted `CachedImage` for every image row. Although its
`img` used `loading="lazy"`, the actual image-cache hook fetched cold remote
images before producing that img. A 150-row synthetic fixture reproduced 150
concurrent held fetches. This is a source/fixture finding, not proof of the cause
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

Real isolated browser request/byte and slow-network interaction evidence is
still needed. Repeated full-list fetches/pagination are separate. V18-21 sound
requires clean-install versus upgrade Android channel/playback acceptance.
No browser/native/production acceptance or release readiness is implied.

## Browser measurement lane (runtime pending)

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
no restricted local server/browser run was attempted. Branch-only CI will supply
runtime evidence after independent review. Until that succeeds, the browser lane
is pending, not a performance acceptance result. Fixed waits are bounded fixture
observations, not promises of universal timing or production responsiveness.

Final local gates: both TypeScript projects PASS; 1,815/1,815 offline tests across 87 files PASS; seven economic inventory checks and drift PASS without pin changes. Independent reviews cleared the eight component cases and browser-lane safety/measurement contract, including same-context browser-version lookup and nonempty visible-image assertions. Four builder guards, bundle, Python AST, YAML/shell syntax and diff checks PASS. Actual Chromium request/byte/interaction measurements remain pending remote CI; modeled unit-test bytes are not production traffic or device performance.
