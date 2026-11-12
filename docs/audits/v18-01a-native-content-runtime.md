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

Use Node 24, JDK 21, official SDK/emulator/AOSP system image, and pinned websocket-client 1.8.0 for loopback adb-forwarded CDP. Existing accepted SDK licenses must be present. sdkmanager receives closed stdin: no `yes`, no automatic new license acceptance. The lane fails if the selected official image cannot be installed under existing terms; when KVM is unavailable/inaccessible or the emulator accelerator check fails, it selects software emulation (`-accel off`) instead. It does not change host permissions, kernel settings, emulator trust stores or security protections.

Local synthetic web bundle build and Python syntax checks pass. This cloud lacks SDK/emulator/KVM and its Chromium launch is separately blocked by socket permissions; no local APK build/install or emulator execution has occurred. Runtime PASS must come from the reviewed CI lane. No production backend, real account, eligibility issuer, reward baseline, deployment or V18 activation is involved; HOLD remains.

## First execution and bounded provisioning correction

Native run [43253860521](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43253860521), job `131306702091`, source `8f5a92a3aff44f338e0a75cc2ff2bea91f87b6d4`, failed during infrastructure provisioning. Node 24.22.2/JDK 21.0.13 and dependency installation passed; official emulator/AOSP image extraction reached 100%, then an unlabeled preflight check exited 1. The logs do not distinguish the final package.xml check from KVM permission checks. App preparation, debug signing/packaging, installation and runtime acceptance were all skipped.

The follow-up labels package metadata and KVM presence/read/write checks and records the existing emulator's read-only accelerator diagnostic. Hardware acceleration is selected only if the device exists, is readable/writable, and `emulator -accel-check` succeeds; otherwise software emulation is explicitly selected. No chmod, udev, group membership, root, certificate, host-security change or additional license acceptance is performed. Boot remains bounded by the 45-minute job: five minutes for adb availability, then a nominal ten-minute polling window plus adb command latency for boot completion. Result JSON identifies the selected acceleration mode. This correction is not evidence that an emulator has booted or that any native assertion passed.

## Second execution: packaged boundary passed, adb discovery failed

Run [43254789572](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43254789572), job `131309965892`, source `b3bb00063e54e578c937c14dd37a04592debbd63`, verified the AOSP package metadata. Read-only diagnostics reported accelerator exit 11 and KVM present but neither readable nor writable; software mode (`NATIVE_ACCEL=off`) was selected. Provisioning and isolated app/key preparation passed without modifying KVM permissions.

The debug APK built successfully in 2m20s with 209 Gradle tasks. Merged-manifest and final-APK INTERNET absence checks and signature verification passed. The emulator process started, but `timeout 300 adb wait-for-device` immediately failed with exit 127: `timeout: failed to execute process: No such file or directory`. The SDK's platform-tools directory was not on the runtime step's PATH. Emulator boot, APK installation and native assertions were not reached; cleanup terminated the emulator process and discarded temporary files. No APK was uploaded.

The bounded correction verifies `$ANDROID_HOME/platform-tools/adb` is executable, prepends that directory to PATH at the start of the runtime step (before any adb call or cleanup trap), and reports `adb version`. The Python harness inherits this same PATH. No tools are downloaded by this correction, and no host permissions, licenses, application behavior or acceptance assertions change. A subsequent run is still required for native runtime acceptance.
