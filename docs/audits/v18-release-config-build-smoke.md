# Isolated release-config minification/resource-shrinking build smoke

Design and pure validation only. No APK was built locally, no emulator/device was started and no CI was dispatched during implementation. One separate build-only publication trial is planned after independent review.

## Exact change and safety boundary

The existing actual-app producer gains a closed `debug` (default) / `release_config` mode. Default debug output location, build invocation, ephemeral signer, manifest expectations and receipt shape remain unchanged. The APK image receipt wrapper likewise defaults to its existing debug path. The separate release entry invokes the release mode only. Source app files, product Gradle build types, ProGuard rules and gradle.properties remain byte-identical in the repository.

The disposable source copy retains the established synthetic SDK boundary, isolated application ID and OAuth/provider identities, Firebase disabled metadata/resources, no INTERNET permission, exact source identity, ephemeral certificate verification and full packaged-assets equality checks. Only its release signing configuration is appended to use the same fresh two-day disposable certificate. No owner/release credential is loaded. The actual release variant must be nondebuggable: absent manifest attribute or exact typed false only; true, malformed or ambiguous values reject. Existing debug verification still requires true.

The original full-app workflow had push triggers on producer files that could automatically launch its downstream emulator job. Both of its existing jobs are now explicitly manual-dispatch-only on the same repair branch. The old debug image-packaging job is also manual-dispatch-only because the shared image-wrapper edit would otherwise trigger a redundant debug build. Manual behavior is otherwise retained; no dispatch occurs here. The new release-config workflow admits manual dispatch or a push on the exact repair branch that changes only its own workflow path for trigger matching. This narrowly enables the authorized publication trial without a workflow-dispatch connector; producer-only changes do not trigger another build. It is not globally single-use: any future edit of that workflow on the repair branch would trigger another trial and must be deliberately reviewed. It has one build job, read-only repository permission, no credential persistence, no emulator/adb/install/device step, and uploads one sanitized JSON result only. No APK, key, mapping report or raw logs are uploaded. SDK36/build-tools35 are provisioned only with existing accepted licenses and closed stdin; no new license acceptance or host security/billing changes.

## What the single build must prove

- Fresh disposable root, no preexisting release reports or task-event log.
- Original release Gradle/ProGuard/Gradle-properties hashes unchanged; copied source rules match except the established isolated app-ID substitution. Copied rules remain unchanged after the pre-build signing append.
- One `assembleRelease`, with build cache disabled, never an initial debug build, dry-run fallback or automatic retry.
- Observer attached to this build records effective minify/shrink true and debuggable false. `minifyReleaseWithR8` plus a recognized resource shrink task (`shrinkReleaseRes` or `optimizeReleaseResources`) must each report executed work, not cached/up-to-date/skipped/no-source/failed. Unknown task behavior fails closed rather than inferred success.
- Fresh regular non-symlink mapping.txt, configuration.txt and resources.txt under the expected release output directory, bounded to64MiB each. Receipt contains sizes/hashes only. No raw class names/mapping text is retained.
- Full existing APK gates, including exact source→synced→ZIP equality for all assets and the three pinned1600×900RGB WebPs (682680bytes), source pixel decode, unique ZIP entries, APK digest and ephemeral signer digest.

## Important optimization terminology

The current release configuration uses `proguard-android.txt`, not `proguard-android-optimize.txt`. Android documentation explains that the former includes `-dontoptimize`; this test deliberately does not change that rule. Receipt records whether the effective R8 configuration includes `-dontoptimize`, the explicit optimized-resource-shrinking property (`true`, `false` or `unspecified`) and always labels actual optimized-resource mode UNKNOWN_NOT_INFERRED. It never claims full code optimization from minify flags or filenames. AGP8.13's optional optimization switches are not enabled by this test.

Official references checked for scope: https://developer.android.com/topic/performance/app-optimization/enable-app-optimization and https://developer.android.com/topic/performance/app-optimization/customize-which-resources-to-keep (resources.txt diagnostic location). No changes to keep rules, default rules, Android plugin version or optimization flags.

## Acceptance limits

A future PASS means the current isolated release configuration can shrink/package and retain exact asset bytes. It does not prove native reflection/bridge behavior after shrinking, image rendering in WebView, fresh-install airplane mode, production signing, distribution readiness or a full V18 release. Existing synthetic/config differences remain explicit. A missing task/report or build failure stays failure; no rules are weakened to obtain green.

Pure validation includes closed mode/debug compatibility, manifest false/absence vs malformed/true, retained identity gates, actual-work vs skipped/cache flags, missing/duplicate task/config cases, missing/empty/symlink/preexisting reports, unchanged producer controls and workflow no-device guards. Actual AGP observer/report availability remains untested until the one reviewed runtime trial.
