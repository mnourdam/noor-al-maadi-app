# Manual offline test only

Immutable application source: 56bd440232ca1a7b426b1b7dcf928f36f0aa76ce.
Isolated CI branch: v18-manual-offline-56bd4402.
Package: app.lovable.irth.manualoffline. Label: إرث — تجربة بلا إنترنت.

This APK is for manual observation, not a production release or an acceptance claim. It has a distinct package/data sandbox and a disposable signing key, so it must not replace the installed app. Committed content is old/unrefreshed. Guest progress exists only in this separate sandbox; server rewards/auth/sync are untested and unavailable.

The web entry, router, providers and all src files remain unchanged. No synthetic fetch responses, native-fixture.js, fixture-loader, JavaScript bridge mocks, seeded player data or false readiness are present. A fixed non-routable `.invalid` backend URL and inert public key are explicitly compiled in with dotenv disabled. Offline error behavior is real and may prevent completing some screens.

The disposable native variant removes INTERNET, disables Firebase automatic initialization flags and excludes push/browser/share/local-notifications registration, rejects outgoing Activity launches, uses unique OAuth/provider identity, forbids sharedUserId and excludes all backup/transfer data. App label is visible Arabic offline-test wording. APK manifest, assets, plugin inventory, signer, package, backup exclusions and source receipt are mandatory producer checks. Only APK, public receipt, test instructions and checksums are exported. No install, Firebase, DB mutation or production deployment occurs in CI.

Local preparation compared every src file and Android web index byte-for-byte to the source; six safety tests passed. Build and manual launch outcomes remain separate evidence.
