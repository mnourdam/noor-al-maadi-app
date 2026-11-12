# V18 isolated Android compilation verification

## Motivation and scope

Existing `.github/workflows/build-android.yml` selects Node 20 and Java 17, invokes `npm install`, rebuilds web assets twice, runs `assembleDebug` and uploads an APK. Installed Capacitor CLI declares Node >=22 and generated `android/app/capacitor.build.gradle` declares Java 21 source/target. This existing workflow is not modified by this slice.

New `.github/workflows/v18-android-verification.yml` is restricted to the repair branch (push path filters plus job-level ref guard, including manual dispatch). It uses Node 24, Temurin JDK 21, the committed Gradle 8.14.3 wrapper, compile SDK 36 and build tools 35.0.0. Dependency installation uses the lockfile and disables install scripts.

Only `:app:compileDebugSources` and `:app:testDebugUnitTest` execute. A dry-run task graph is checked before task execution by `scripts/verify-android-compilation-task-graph.mjs`. Task basenames beginning with assemble, sign, validateSigning, package or bundle are rejected, except `package*Resources`, `bundleLib*` library aggregation and the two exact debug application class-JAR tasks documented below. Flavor/test APK packaging is not exempt. Missing/unrecognized task output fails closed. A subsequent check rejects APK/AAB/keystore output. No release credentials, signing material, device/emulator, deployment or app publication is configured. Only verification text logs and JVM unit-test XML/HTML reports are uploaded, never APKs or broad workspace archives.

## Offline content boundary

`sync:android` already runs `build:android:web`, branding generation, Capacitor sync and snapshot post-verification; it is invoked once. `SKIP_SNAPSHOT_GEN=1` both skips the generator's live production fetch and disables its live-manifest freshness check in the existing snapshot verifier. This is explicitly an offline developer verification, not freshness/release acceptance.

An empty service-role environment variable and `REQUIRE_LIVE_CONTENT=0` select existing `PREGENERATED_VERIFIED` story/media modes, which validate committed baseline/media artifacts without service access. Story generation is not blindly skipped: committed-pack integrity checks remain active. Public build connection variables are overridden with a synthetic loopback URL/key. No GitHub environment secrets are referenced. Package registries, Android SDK and Maven/Gradle downloads remain necessary; “offline content” does not mean network-disabled tool installation.

## Evidence and limits

The new adversarial task-name suite passes 20/20, including root, flavored and test APK tasks plus permitted resource/JAR aggregation. Workflow YAML was parsed and shell run blocks syntax-checked; `git diff --check` passes. At initial preparation no Android task graph, Gradle build or CI execution had been performed by this author. The first subsequent CI attempt is recorded below; Android compilation remains unverified. If the actual graph includes signing/packaging, verification fails before executing it rather than silently weakening the boundary.

A successful run would prove this committed debug source graph and packaged offline web inputs compile under the selected toolchain, plus whichever JVM unit tests actually exist. It would not prove an APK build, release signing, Android device/WebView behavior, production content freshness, hosted staging acceptance or V18 economic activation. Unit-test tasks may report NO-SOURCE when no tests exist, which must not be presented as executed behavioral tests.

Independent static safety review: **CLEAR** for branch-only verification CI.
Reviewer reran **20/20** adversarial graph tests and checked the current known
Gradle source graph. Full existing npm regression suite also passed **1431/1431**.
Actual Android SDK/Gradle execution remains pending; no APK/device/release claim.

## First CI execution and SDK-path correction

Run `43192555734`, job `131095278240`, selected Node 24.22.2/JDK 21.0.13 and passed npm ci, then failed with exit 127: `sdkmanager: command not found`. ANDROID_HOME was present, but the executable was not on PATH. No Android compilation was reached. The workflow now checks the installed `$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager`, then existing versioned cmdline-tools directories, requiring an executable and failing closed if absent. It does not download a new SDK manager or accept licenses. The existing SDK-package provisioning arguments and compilation/signing guards remain unchanged.

The revised inline resolver was tested using synthetic SDK directory fixtures: latest path, versioned fallback, missing tool failure and latest preference all pass (4/4). Workflow shell syntax and diff checks pass. No real SDK install or license command was executed during these local tests.

SDK-path correction independently reviewed **CLEAR**; coordinator independently
reran the four synthetic resolver fixtures **4/4 PASS**. Retrying the corrected
workflow is authorized without relaxing any compilation/task/artifact boundary.

## Second CI execution and exact JVM class-JAR exception

Run `43193285053`, job `131097736071`, passed SDK setup, offline web build and Capacitor sync. The Gradle dry-run succeeded, but the safety predicate rejected `bundleDebugClassesToRuntimeJar` and `bundleDebugClassesToCompileJar` before actual compilation. This is a guarded verification failure, not an Android compilation pass. Evidence artifact `13932415290` contains three logs (reported SHA-256 `ba185f606df0c2cd65d4729f0569d1480fd19b8e0b686ea6211bd729eea8fbf6`).

Android's official [BundleAllClasses implementation/change](https://android.googlesource.com/platform/tools/base/+/c61459899d80d29a921b9dfd99abe8b266cac2cb%5E%21/) identifies these task suffixes as publishing `classes.jar` for API/compile and runtime consumers, including unit tests; they are not APK or Android App Bundle producers. The predicate now allows only those two exact case-sensitive debug task basenames in addition to its previous compilation-resource/library exceptions. Release/flavored variants, extra APK/bundle suffixes and case lookalikes remain denied. No general bundle allowlist was added.

The exact JAR exception passed independent review **CLEAR** and **28/28**
adversarial guard tests. The coordinator downloaded and verified the artifact's
SHA-256 and its three text-only entries; the actual **186-task** dry-run graph
passes the corrected predicate. The reviewer independently rechecked that graph.
No signing, APK/AAB or assemble task is admitted. Actual compilation remains
pending a corrected CI execution, not established by this dry-run evidence.

## First actual compilation failure: application BuildConfig

Commit `c13de66c`, run `43194053322` / job `131100327904`, passed SDK/offline build/sync and the 186-task safety graph. Actual Gradle execution reached 146 tasks and compiled plugins, then failed at `MainActivity.java:31`: unresolved `BuildConfig` used by `WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)`. Evidence artifact `13931364101`, reported SHA-256 `73e01e4a1afc1262ecf4a5fef729d0b0d02de73bf4f67e598b77a77871526401`.

The application namespace and Java package both match `app.lovable.irth`; the application Gradle configuration omitted explicit BuildConfig generation. The bounded correction adds only `buildFeatures { buildConfig true }` to the app Android block. MainActivity remains unchanged and continues to use the generated variant-specific DEBUG constant; no unconditional WebView debugging, custom DEBUG override, release debuggable flag or signing changes were introduced.

New static configuration/security regressions (`scripts/test-android-build-config.mjs`) reproduced 1 fail / 1 pass before the change and pass 2/2 afterward. They run in the verification workflow alongside the task-graph guard tests. These checks verify the checked-in configuration intent, not generated release output or runtime WebView behavior. A subsequent CI compile is still required; this failed run is not presented as Android acceptance.

BuildConfig-generation correction independently reviewed **CLEAR**; reviewer
reran **30/30** combined static configuration and task-graph tests. This does not
itself prove Java compilation or release behavior; corrected CI is still required.

## Verified Android compilation success

Run [43194997390](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43194997390), source `b824b06ffa52622af3f3c3ddc2987b4a22ddb869`, job `131103545613`: **SUCCESS**. Every step passed with Node 24.22.2, JDK 21.0.13 and Gradle 8.14.3. Offline content generation/validation and Capacitor sync completed; the corrected **187-task** graph passed the safety predicate. Actual `generateDebugBuildConfig`, app Java compilation and `compileDebugSources` executed successfully. Gradle reported **151 actionable tasks, 151 executed**. The post-build no-APK/AAB/keystore check passed.

The JVM report contains exactly **one existing template test**, `addition_isCorrect`, with zero failures/errors/skips. This is not player-behavior, authentication, WebView, device or economic-inclusion testing. The meaningful new evidence is native debug compilation with the committed offline inputs, without signing or application packaging.

Artifact `13932546919` was downloaded and independently hash-checked: SHA-256 `7dd69df75086a28c72ff79792cdc21c8ff9a9e507bc72cbebfbebe4d7aa83a5e`. Its entries contain only verification logs and JVM test reports, no APK/AAB/signing material. Sanitized durable evidence, task names and the actual unit-test count are in [evidence/v18-android-compilation-43194997390.json](evidence/v18-android-compilation-43194997390.json).

The existing APK/release workflow remains untouched and unverified; this new lane does not prove its toolchain or signing behavior. No emulator/device execution, release APK, production content freshness, hosted staging, trusted legacy balance baseline or global writer exclusion has been established. **V18 HOLD and production NO-GO remain.**
