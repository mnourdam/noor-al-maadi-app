# Synthetic Chromium quota acceptance fixture (runtime pending)

This narrowly triggered isolated lane mounts actual ProfileProvider, profile writer,
AppShell, warning, owner module and styles. Router/HUD/poller and unrelated SDK
boundaries are synthetic; no backend module or real user data is admitted.
The real partition adapter is not installed. This is not Android, boot, hosted
service, entire-app or device-pressure acceptance.

After healthy hydration and no-warning control, the fixture keeps exact synthetic
profile/history/outbox bytes and fills one dedicated fixture key using native
Chromium localStorage. A binary search is bounded by 8 Mi characters, 40 calls and
5 seconds of admission-time checks, under a 90-second browser-task timeout. Native
DOMException QuotaExceededError must occur; no synthesized exception substitutes.
Transparent wrappers count profile writes and app removals/clears while preserving
native behavior. The subsequent real profile update must fail with quota, retain
all seeded bytes, and leave the warning and an interactive shell mounted.

Only after retention assertions does the harness deliberately remove its own
filler using the captured native method. It checks a 500ms no-auto-retry window;
an explicit later profile update must receive verified-written evidence, clear
the notice and retain history/outbox. This harness action is not app cleanup or
a recommended player workaround. Failure emits no success evidence.

Browser profile and generated assets are separate temporary directories. Routing
admits only exact loopback-origin static inventory GETs, blocks service workers
and WebSockets, and requires no unexpected requests or browser errors. No APK,
production access, authentication or deployment occurs. Only its own workflow-file change on the repair branch (or an explicit manual dispatch) triggers this lane. Only sanitized JSON is
uploaded. Local builds/guard checks are not browser runtime acceptance.
