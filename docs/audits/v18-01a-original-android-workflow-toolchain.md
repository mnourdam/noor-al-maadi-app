# Original Android APK workflow: toolchain and reproducible install

## Bounded branch-only correction

The separate unsigned compilation verification lane already exercised Node 24/JDK 21 and actual Android compilation at `b824b06f` (evidence HEAD `53f795e7`). The original `.github/workflows/build-android.yml` still selected Node 20/Java 17, despite Capacitor CLI requiring Node >=22 and the Android sources targeting Java 21.

This change updates the original workflow to Node 24 and Temurin Java 21, replaces unlocked `npm install` with `npm ci --ignore-scripts --no-audit --no-fund`, and removes the standalone `build:android:web` invocation because `sync:android` already invokes that entire pipeline. The same lockfile/disabled-install-script approach was exercised by the separate compilation lane, including branding and Capacitor synchronization.

The original main/master push and manual triggers remain exactly scoped as before. Its existing debug APK assembly and upload steps are unchanged. No repair-branch push trigger, release task, signing credential, publishing destination or secret reference was added. No package manifest, lockfile, generated Android source or protected file was changed.

## Evidence and boundaries

New `scripts/test-android-apk-workflow-config.mjs` statically checks compatible toolchains, reproducible install, a single web build through sync, and preservation of existing triggers/debug artifact scope. Before correction: 2 failed / 1 passed. After correction: 3/3 pass. Workflow YAML parses, all shell commands pass `bash -n`, and `git diff --check` passes.

The original APK workflow was **not dispatched or executed**. No APK was built, signed, uploaded or installed by this task. These are branch-only configuration changes and static checks, not original-workflow execution acceptance. The original workflow's live content/freshness behavior and existing debug packaging remain unchanged; unlike the separate verification lane, it is not claimed to be an offline-content or no-packaging workflow. Release readiness and device behavior remain separate requirements.
