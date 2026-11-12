# Android hardware Back listener lifecycle fence

## Reproduction and narrow fix

The real NavigationProvider mounts HardwareBackListener, which awaited the native registration handle before checking cancellation. The callback itself did not check cancellation. A native Back callback queued before removal, or fired while registration remained pending after unmount/route replacement, could therefore invoke an obsolete navigation closure.

The new mounted-provider suite reproduces four failures against the unchanged implementation, with two positive controls passing (live Android callback and non-Android no-registration). It uses actual provider/hooks/effects and mocks the router, native bridge, registry validation, and unrelated dialog rendering. It does not merely match source text.

The bounded change checks cancellation after the module import, guards every callback synchronously, and removes eventual registration handles. Best-effort native removal catches both synchronous throws and asynchronous rejection. Live Back routing and the existing resolution algorithm are unchanged. Cancellation does not undo a navigation already dispatched before cleanup and cannot guarantee native removal if the bridge fails.

## Evidence

- Baseline: 4 failed / 2 passed, with failures for pending-registration unmount, route replacement, pre-import cleanup, and queued callback after resolved-handle cleanup.
- Final focused suite: 9/9 passed, including native removal throw/rejection and registration rejection controls.
- Test: `tests/offline/outbox-hardware-back-lifecycle.test.tsx`.
- Independent review cleared this bounded repair and independently reran all nine tests.
- Combined local acceptance with the terminal-history validator change: 1,506/1,506 offline tests across 58 files, both TypeScript projects, client/SSR build, and 41/41 scheduler tests passed. Remote CI is pending publication.

An extra StrictMode scenario was investigated but not retained as acceptance evidence: concurrent dynamic imports in that harness loaded the real Capacitor runtime despite the module mock (observed replacement of window.Capacitor), so the expected mocked registration was absent. Core mocking/preloading did not establish reliable isolation. No StrictMode pass is claimed, no skipped failing test is included, and no debugging instrumentation remains. The deterministic ordinary mount/cleanup/replace cases above establish the specific stale-callback defect and correction.

No Android device, emulator, WebView, APK installation, production deployment, or historical-player-symptom resolution is claimed. This is a source lifecycle repair with mocked-native-boundary evidence only.
