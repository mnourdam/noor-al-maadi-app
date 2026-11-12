# V18 isolated Android compilation verification

## Motivation and scope

Existing `.github/workflows/build-android.yml` selects Node 20 and Java 17, invokes `npm install`, rebuilds web assets twice, runs `assembleDebug` and uploads an APK. Installed Capacitor CLI declares Node >=22 and generated `android/app/capacitor.build.gradle` declares Java 21 source/target. This existing workflow is not modified by this slice.

New `.github/workflows/v18-android-verification.yml` is restricted to the repair branch (push path filters plus job-level ref guard, including manual dispatch). It uses Node 24, Temurin JDK 21, the committed Gradle 8.14.3 wrapper, compile SDK 36 and build tools 35.0.0. Dependency installation uses the lockfile and disables install scripts.

Only `:app:compileDebugSources` and `:app:testDebugUnitTest` execute. A dry-run task graph is checked before task execution by `scripts/verify-android-compilation-task-graph.mjs`. Task basenames beginning with assemble, sign, validateSigning, package or bundle are rejected, except `package*Resources` and `bundleLib*` library aggregation tasks required for compilation. Flavor/test APK packaging is not exempt. Missing/unrecognized task output fails closed. A subsequent check rejects APK/AAB/keystore output. No release credentials, signing material, device/emulator, deployment or app publication is configured. Only verification text logs and JVM unit-test XML/HTML reports are uploaded, never APKs or broad workspace archives.

## Offline content boundary

`sync:android` already runs `build:android:web`, branding generation, Capacitor sync and snapshot post-verification; it is invoked once. `SKIP_SNAPSHOT_GEN=1` both skips the generator's live production fetch and disables its live-manifest freshness check in the existing snapshot verifier. This is explicitly an offline developer verification, not freshness/release acceptance.

An empty service-role environment variable and `REQUIRE_LIVE_CONTENT=0` select existing `PREGENERATED_VERIFIED` story/media modes, which validate committed baseline/media artifacts without service access. Story generation is not blindly skipped: committed-pack integrity checks remain active. Public build connection variables are overridden with a synthetic loopback URL/key. No GitHub environment secrets are referenced. Package registries, Android SDK and Maven/Gradle downloads remain necessary; “offline content” does not mean network-disabled tool installation.

## Evidence and limits

The new adversarial task-name suite passes 20/20, including root, flavored and test APK tasks plus permitted resource/JAR aggregation. Workflow YAML was parsed and shell run blocks syntax-checked; `git diff --check` passes. No Android task graph, Gradle build, SDK install or CI execution has yet been performed by this author. Those remain pending CI evidence, not a claimed pass. If the actual graph includes signing/packaging, verification fails before executing it rather than silently weakening the boundary.

A successful run would prove this committed debug source graph and packaged offline web inputs compile under the selected toolchain, plus whichever JVM unit tests actually exist. It would not prove an APK build, release signing, Android device/WebView behavior, production content freshness, hosted staging acceptance or V18 economic activation. Unit-test tasks may report NO-SOURCE when no tests exist, which must not be presented as executed behavioral tests.

Independent static safety review: **CLEAR** for branch-only verification CI.
Reviewer reran **20/20** adversarial graph tests and checked the current known
Gradle source graph. Full existing npm regression suite also passed **1431/1431**.
Actual Android SDK/Gradle execution remains pending; no APK/device/release claim.
