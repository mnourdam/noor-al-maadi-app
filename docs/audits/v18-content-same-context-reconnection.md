# Content-update reconnection without restarting the browser context

Source baseline: exact public609919d99cb7e3320242052fe7fbce6cf2a6efcb. This is a test-only extension, with no application source, content, native runtime, authority or dependency changes.

## Existing coverage and actual gap

Existing lifecycle tests already cover rejected/hung initial reads, retirement and retry. Actual Supabase/PostgREST tests cover signal forwarding, independent requests and delta retry. Real storage tests cover retired IDB writes and fallback fencing. The existing browser lane exercises actual bundled controller/SDK/storage/local-store code over a loopback partial HTTP response, verifies browser ERR_ABORTED, retries, checks late-stream retirement and persistent storage. It then went offline and immediately closed/reopened the context. That did not establish offline failed update followed by reconnection and retry in the same live context.

The extension mounts the real useOnline hook (no replacement) and observes its effect separately from update state. After the original successful update and interruption controls, it marks the browser offline, waits for navigator and hook false, then awaits a real apply failure with nonempty error and applying=false. Exact durable snapshot summary and verified active version/all titles remain unchanged. No fixture GET reached the loopback service while offline. After changing the served title to reconnected and restoring network, navigator and the real hook must both recover. A real SDK-driven update must activate1500 rows with the new title, changed durable checksum and matching active snapshot version/all titles. An ordinary HTTP request then succeeds. Page/context object identity and a window token remain unchanged across the transition; no reload or reinitialization is used. The prior orderly close/reopen persistence assertion runs separately afterward against the new durable candidate.

The exact held-response transport counterfactual remains unchanged. Only the test fixture and browser scenario are modified; no product bug is asserted from missing coverage. Browser connectivity is not proof of Android bridge, app lifecycle, radio state or release acceptance.

## Local evidence and blocker

Ordinary public Git HTTPS restored the exact6099 full checkout. Locked npm ci --ignore-scripts installed695 packages using a workspace cache after the default cache path failed. All original package.json/package-lock.json/bun.lock hashes remain unchanged. Five build-boundary tests passed; actual Vite fixture compilation completed before browser launch. Five actual-code offline suites passed25/25 tests. An initial typecheck command used a nonexistent project filename and failed TS5058; the correct committed base and tsconfig.outbox.json checks were then run sequentially and both passed.

Local Chromium launch stopped before loading the fixture with process_singleton_posix socket() Operation not permitted. The supported execution review granted a retry with writable temporary HOME, but the same socket restriction remained. No security flags, host settings, browser alternative or permission workaround was added. Both attempts ended; fixture server cleanup ran. These are environment startup failures, not app/network assertions. Full browser runtime and the new same-context assertions remain unexecuted until the existing reviewed remote browser lane runs.

Independent source review requested and received a nonvacuous exact active baseline check before interruption. Both TypeScript projects passed. Final independent static review remains separate from unexecuted browser assertions; no browser PASS is claimed here.
