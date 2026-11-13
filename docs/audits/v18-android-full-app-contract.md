# Actual Android full-app acceptance: preparation boundary (not acceptance)

This test-only preparation slice preserves the actual Android entry, complete generated router, root and providers, real components and local Capacitor plugins. It does not mount selected components or replace the root with a fixture. Source entry path remains android-web/index.html → src/android-client.tsx → getRouter → actual route tree/root. The receipt hashes actual entry/router/root/provider/config files; copied source is unchanged.

`prepare-full-app.py <fresh directory>` prepares only. It does not compile, install, run Gradle, boot a device or claim readiness. It copies source/public/native project into a fresh disposable directory, excluding dotenv, google-services configuration, signing files and previous generated builds. It inflates the committed snapshot directly, never calls snapshot:generate, content generation, sync:android or apk:debug (those existing scripts invoke live generation). A separate wrapper uses the real Android Vite config with dotenv loading disabled and explicit synthetic URL/key/public origin and feature-OFF overrides. The preboot classic transport script runs before the unchanged actual entry import.

## Narrow synthetic transport

Exact request matching includes origin, method, path, literal query and body. Initially only get_content_manifest POST{} has a response, derived from exact packaged collection counts/timestamp. No generic REST response or wildcard RPC success exists. Startup calls not yet inventoried fail and increment unexpected counters; future explicit fixtures require review. Same-origin fetch permits exact packaged public files only; images and static module assets continue through the real WebView asset path. Network activity from other browser primitives is rejected. Native INTERNET removal is the final backstop for remote images/dynamic imports; it must be verified after APK manifest merging, not assumed from source XML.

Actual local Capacitor calls remain, but external Browser/Share/Push registration, native URL opening and Filesystem downloadFile are rejected. window.open and external anchors are blocked. JavaScript location setters are not reliably interceptable; no claim otherwise. Journeys must avoid unguarded external-intent surfaces and use the isolated native scheme. This boundary is synthetic and does not validate OAuth, push or sharing.

Fresh native configuration changes only the disposable copy: package app.lovable.irth.acceptance, isolated OAuth scheme/provider authority, explicit original MainActivity/IrthApp class names, INTERNET removal directive and Firebase auto-init/analytics/data-collection disabled. Local notification permissions must not be auto-granted; package/AVD must be fresh and discarded. No host/KVM/OS policy changes.

## Mandatory remaining build/install gates

Before installation, a separate producer must compile the prepared actual app using isolated dependencies and an ephemeral debug key, inspect final merged APK package/permissions, ensure no INTERNET, no production Firebase resources/config or backend env, check signer and bind every packaged web/native config asset hash to the known prepared build. Runner must independently verify that receipt before install. This preparation receipt explicitly says these gates are pending and is not an install authorization receipt. No release certificate, Google Play upload, production data or runtime here.

The agreed runner uses macos-15-intel existing HVF only, no host permission changes. Actual installed-app DOM/native-bridge readiness is separate from six-priority acceptance; unexplained WebView detach is retained failure, not automatically reconnected into success.

## Six required journey groups (not yet implemented/passed)

1. Actual packaged image decode in chapter/story/encyclopedia routes, with missing editorial assets separately recorded.
2. Actual museum→Profile ownership and unconfirmed-reward presentation; no reward grants from language or route transitions.
3. Interrupted synthetic content update/retry, followed by Android Home/resume/force-stop/cold-launch, preserving content and connectivity. Synthetic transport does not validate a live backend.
4. Actual private feedback text lifecycle/default-OFF picker with synthetic actors only. Secure image activation is NOT accepted by this lane.
5. In-play unsent input survives reread; completed-chapter reread and native Back do not mutate rewards/progress.
6. English UI switching/layout/persistence on real pages; authored Arabic and incomplete English content explicitly remain.

Native Back/Home/force-stop/launch must be Android actions, not JS history replacements. Auth/service/RLS acceptance, protected image service deployment, editorial completeness and full English content still require their separate gates. No overall ready/release claim unless all required groups and unresolved gates are accounted for.

## Current evidence

Three Python boundary tests and two mocked JavaScript transport tests pass. These prove selected preparation/guard behavior only, not an Android build, bridge readiness, full-app startup or any six-journey acceptance. No server, emulator or backend was run.

## Fail-closed preparation correction
A classic-script exception alone does not stop a later module script. The fixture now routes entry admission through a tiny test-only loader: only successful complete guard installation sets an immutable marker, then the loader imports the unchanged actual Android entry. Missing config, missing bridge or failed guard assignment all prove zero actual-entry calls in negative controls. Source-tree/file symlinks are rejected before copying. Build-time environment scrubbing remains mandatory in the upcoming producer; envDir:false alone is not an ambient-variable boundary. Current checks: four Python and three JavaScript tests. Still no compile/install/runtime acceptance.

## Producer draft (not executed)
`build-full-app.py` is CI/branch-only. It scrubs ambient environment to explicit toolchain paths, private HOME, exact source SHA and fixed build options; no ambient VITE/credentials/Node preload. It directly builds the real Android Vite graph in the prepared copy, runs the offline finalizer, syncs native plugin assets, generates a disposable two-day certificate, and builds debug APK. Expected asset hashes are captured from intended synchronized build assets before Gradle packaging, then compared to ZIP membership/bytes. Final aapt package/INTERNET/Firebase-resource and apksigner checks precede receipt production. Native config forbids remote server/allowNavigation/mixed content. These code paths are still unexecuted and require independent review plus real CI evidence. No preparation receipt alone permits installation.

Postboot observations expose bridgeGuardsIntact so runner can detect SDK overwriting the preboot native guard wrappers. Registered-plugin Browser-denial and actual App-positive controls are still required on the installed full app; mock tests do not establish native runtime persistence.

## Combined static lane and partial journeys

Actual Android Vite graph compiled offline in a fresh copy with scrubbed environment and receipt-bound source SHA (exit0,3.91s). No native Gradle/install/emulator ran. This validates the genuine module graph, not bridge behavior. Final wrapper-identity checks now include the global Capacitor object, and producer final manifest validation requires debug mode, actual activity class, isolated provider/OAuth scheme and disabled Firebase metadata; build-tools pinned35.0.0.

The journey module reports all six fixed groups separately. It uses DOM coordinates followed by Android taps, actual native Back/Home/force-stop/launch, and one explicitly authorized reconnection after intentional process restart only. Unknown detach fails without recovery. English UI/persistence is attempted as a scoped group; image and in-play reading guest controls are attempted, but missing story/editorial/completed-state evidence stays BLOCKED. Owned museum projection, authenticated private conversation and interrupted-update synthetic fixtures remain explicit missing prerequisites. Partial checks do not earn a group PASS. Driver retains partial records and exits nonzero whenever a required group is blocked or fails. No current runtime results exist.

A separate release-like disposable APK pass with actual release minification and resource shrinking, signed only by an ephemeral key, remains mandatory before release-artifact acceptance. Debug-only readiness is not that gate. Native sign-in, FCM, deep links, audio, offline/progress durability, protected-image activation and complete authored English remain distinct unaccepted requirements.

## Final workflow safeguards
The setup-android v3 action's documented accept-android-sdk-licenses input is explicitly false, with automatic package installation disabled. Existing accepted license file is required before exact sdkmanager packages are requested with closed stdin; no agreement is accepted by this lane. Initial sanitized JSON exists before toolchain setup, and producer failure updates a fixed stage/category while preserving nonzero exit, so build failures retain evidence even if runner never starts. No raw build output, credential values or request bodies are uploaded.

The guarded loader exposes a fixed diagnostic using the actual registered App/Browser plugin modules: positive App.getState then a deliberately forbidden synthetic Browser.open. The English journey demands exact one-increment unexpected/nativeBlocked counters and intact wrappers; counters are never reset. This is unexecuted native acceptance code, not a claimed bridge result.
