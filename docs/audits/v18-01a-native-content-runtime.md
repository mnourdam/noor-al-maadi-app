# Native selected-module content acceptance (pending CI)

This separate lane packages a dedicated synthetic web bundle inside a temporary copy of the real Capacitor/MainActivity/plugin container. It is not full production UI, login, hardware Back or native network-transport acceptance. The existing no-package Android compilation lane is unchanged.

## Prelaunch boundary

- Copy only Android sources plus package/config inputs into a fresh direct child of RUNNER_TEMP; exclude build caches, local SDK settings, Google services JSON and keystores. The actual source checkout is not edited.
- Build the selected actual controller/storage/local-store/SDK modules with environment-file loading disabled and both SDK configuration paths fixed to `https://native-content.invalid` with a synthetic key.
- Install a synthetic fetch adapter before importing target modules. Unknown non-local origins/endpoints throw and are recorded. Local-origin fetch is only for Capacitor packaged assets.
- Remove INTERNET through a temporary manifest merge override. Before installing, independently reject INTERNET in the merged manifests and final APK permission dump. This prevents app networking even if JavaScript interception misses a path; it is not whole-emulator network isolation.
- Use a freshly generated two-day debug key in the temporary directory, not an existing developer/release key. Invoke only `:app:assembleDebug`; never distribute or upload APKs, keys, logs or emulator profiles. Upload only result JSON and discard temporary app/key/AVD data.

## Intended runtime checks

On a fresh official AOSP API 35 x86_64 emulator, use the actual debug WebView and real Capacitor App plugin. Check Android platform identity and active native bridge state; force a synthetic SDK request to hang, observe abort and released controller state without changing native IndexedDB baseline; retry and persist approximately 15 MB of synthetic content. Send real Android Home/start commands, observe native App state-change events, and verify unchanged durable content. Then issue `am force-stop`, relaunch a fresh activity/process and check native IndexedDB/local-store content and checksum survived. Only an emulator serial is admitted for installation.

Synthetic fetch validates JavaScript cancellation/lifecycle in the actual WebView, not physical HTTP cancellation; the separate Chromium streaming lane addresses real HTTP with a local server. Force-stop is tested only after the durable operation completed, not while an uncommitted transaction was in flight.

## Toolchain and current evidence

Use Node 24, JDK 21, official SDK/emulator/AOSP system image, and pinned websocket-client 1.8.0 for loopback adb-forwarded CDP. Existing accepted SDK licenses must be present. sdkmanager receives closed stdin: no `yes`, no automatic new license acceptance. The lane fails if the selected official image cannot be installed under existing terms or KVM is unavailable/inaccessible; it does not change host permissions, kernel settings, emulator trust stores or security protections.

Local synthetic web bundle build and Python syntax checks pass. This cloud lacks SDK/emulator/KVM and its Chromium launch is separately blocked by socket permissions; no local APK build/install or emulator execution has occurred. Runtime PASS must come from the reviewed CI lane. No production backend, real account, eligibility issuer, reward baseline, deployment or V18 activation is involved; HOLD remains.
