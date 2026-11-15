# Reviewed synthetic Home pair producer draft

Application source is pinned to `56bd440232ca1a7b426b1b7dcf928f36f0aa76ce`; harness comes from the separately reviewed workflow commit. The job is restricted to one exact push branch, `v18-home-pair-56bd4402`; the source rebind is permitted only there in debug mode, with the pinned clean application checkout. Independent review is required before pushing. GITHUB_REF is never rewritten. No CI build, APK upload, Firebase execution or live DB action has been performed by this preparation.

`build-pair.py` verifies SHA256 of IrthHomeTest.java, SafeCleanup.java and SafeCleanupTest.java. Before any Android producer/build command, it compiles SafeCleanup plus SafeCleanupTest using the CI JDK and runs all cleanup failure combinations. It fails closed if compilation/tests fail. This JVM test is not Android acceptance. Only IrthHomeTest and SafeCleanup are copied into the disposable androidTest source tree.

The app APK comes from the original synthetic producer unchanged. After test assembly, app bytes must still match its original receipt. Both APKs must have the isolated package identifiers, no INTERNET permission and the same ephemeral signer. Test manifest must name the expected target and AndroidJUnitRunner. Export allowlist is exactly acceptance.apk, instrumentation.apk, apk-receipt.json, pair-receipt.json; no key or environment or raw build log is exported.

Before Firebase is allowed, independently inspect the exported pair and receipts. Instrumentation requires these exact argument names, derived from pair-receipt.json:
- sourceSha = source_sha
- appSha256 = files["acceptance.apk"]
- testSha256 = files["instrumentation.apk"]
- signerSha256 = signer_sha256

Use a fresh installation with no app_webview or CapacitorStorage.xml. Set external Firebase timeout to five minutes. The 150-second loop is not an external timeout. Do not run until the artifact has been reviewed and quota/device verified. No Firebase invocation exists in this workflow.

Local checks so far: Python parse, YAML parse/exact branch gate, four source-integrity guard tests passed. This machine lacks javac/Android SDK, so compilation remains to be established by the gated CI run.
