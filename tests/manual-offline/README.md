# Manual offline test only

Immutable application source: 6f2124d535cddc4b9cf7a1f77aa06b51b8e774da.
Isolated CI branch: v18-manual-offline-6f2124d5.
Package: app.lovable.irth.manualoffline20261116. Label: إرث — اختبار 16 نوفمبر بلا إنترنت.

This APK is for manual observation, not a production release or an acceptance claim. It has a distinct package/data sandbox and a disposable signing key, so it must not replace the installed app. Packaged content is from the pinned source; no live regeneration or freshness verification is performed in this build. Guest progress exists only in this separate sandbox; server rewards/auth/sync are untested and unavailable.

The web entry, router, providers and all src files remain unchanged. No synthetic fetch responses, native-fixture.js, fixture-loader, JavaScript bridge mocks, seeded player data or false readiness are present. A fixed non-routable `.invalid` backend URL and inert public key are explicitly compiled in with dotenv disabled. Offline error behavior is real and may prevent completing some screens.

The disposable native variant removes INTERNET, disables Firebase automatic initialization flags and excludes push/browser/share/local-notifications registration, rejects outgoing Activity launches, uses unique OAuth/provider identity, forbids sharedUserId and excludes all backup/transfer data. App label is visible Arabic offline-test wording. APK manifest, assets, plugin inventory, signer, package, backup exclusions and source receipt are mandatory producer checks. Only APK, public receipt, test instructions and checksums are exported. No install, Firebase, DB mutation or production deployment occurs in CI.

This reuses the reviewed manual-offline harness from 376bfd287970f6dab01f5f4d038de17046c3aa5a with new pinned source, branch, package and label. Local pure safety/compatibility evidence is separate from the pending CI APK and any later manual launch. It contains no private quarantine/recovery overlay.
