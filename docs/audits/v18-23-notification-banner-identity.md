# V18-23: mounted notification banner identity lifetime

## Reproduction and scope

Actual mounted banner tests with real owner state and synthetic service/router spies demonstrated that originating-owner text remained visible after an account switch. Clicking the stale banner invoked the read helper with its old notification ID; a dismissal started before switching likewise invoked its delayed analytics helper after switching. These are client invocation observations, not live backend writes or server authorization findings.

This repair changes only the banner component. Its inner instance is keyed by owner and monotonic identity epoch, so identity changes including ABA retire visible text, queued banners and dedup state. Scope/mount checks guard manual event handling, realtime callbacks and their awaited lookups, delayed dismiss/navigation and navigation-error fallback. All scheduled timers are tracked and cleared on cleanup. Each realtime subscription also has its own active flag so StrictMode's retired subscription cannot become active again when the replacement effect mounts.

Same-owner display, dedup, queue advancement, timing and navigation behavior remain. A read already invoked before switching is not canceled or claimed undone. Incoming manual producer events carry no originating identity; this patch cannot establish provenance for an old producer that emits a new unscoped event after switching. Channel reconnection and Center/Home/HUD mounted-state behavior remain separate work.

## Evidence

The exact committed original banner was loaded through a temporary test-only Vite overlay (no shared-source swap). Against the first nine new tests it failed seven and passed two healthy controls. Corrected component: **10/10 PASS**, including owner switch/ABA, delayed dismiss/navigation, late realtime response, healthy StrictMode queue progression, normal navigation/dedup, unmount cleanup and retired StrictMode subscription.

Tests mount the actual React component with real identity state; SDK bridge/router are synthetic spies. No live data, remote calls, native/browser runtime acceptance, producer authorization, notification delivery changes or production activation is claimed.

Final local gates: both TypeScript projects PASS; 1,841/1,841 tests across 89 files PASS; seven economic inventory checks and drift PASS without pin changes. Independent review reran all ten focused cases and cleared the bounded implementation. No native or live delivery acceptance is inferred.
