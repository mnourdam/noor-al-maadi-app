# Completed-chapter Chromium acceptance lane: runtime pending

Prepared local-only fixture and narrowly scoped CI workflow. No Chromium/server runtime was executed during authoring. A successful static bundle or guard suite is not browser acceptance.

## Actual application surfaces

Both actual imported-campaign overview and chapter Route objects are registered under a real TanStack root with memory history. Actual Link, route matching, search validation, useParams/useSearch and navigate remain untouched. This targets client routing in memory, not browser history, reload/deep-link behavior or the full route tree.

React Query is real and preseeded with synthetic campaign content. A fallback fetch, SDK/session/database call throws and increments an unexpected-action counter. Actual identity/epoch, storage partition, campaign activity progress, reward claim/grant ledger, ActivityRenderer (fill-blank and its actual input), ActivityReviewCard, ChapterReadingReview, RichReadingText and production stylesheet are included; bundling fails if required source modules are absent.

Profile/save APIs are synthetic counted boundaries, not actual economic authority. Memory plan/harvest/refresh are counted; no review plan is supplied. Shell/intro/artwork/image/reward-modal/navigation-overlay infrastructure is explicitly stubbed. No production source changes.

## Five proposed browser checks

1. Seed only one completed chapter of a two-chapter campaign and capture all personal storage before overview mount. Click its actual completed-chapter link. Verify exact review query, real memory-router destination, answer key, zero-heart overlay absence, zero action counters and byte-identical personal storage.
2. Enter an incomplete chapter with forged exact review intent. Require real redirect to overview, no answer key/heart modal, and pre-entry zero-action/storage guarantees.
3. Plain completed chapter URL retains ordinary completion panel and normal next-chapter target.
4. Enter an unsent answer in the real activity input. Open/close the real reading dialog. Require the same input node/value, trigger focus restored, and unchanged post-gameplay-entry storage/action baseline.
5. Explicitly submit the correct synthetic answer and press Next. Require ordinary completion panel/next link, not review, and one synthetic save call. This is interaction evidence, not backend or economic settlement acceptance.

Seed validation explicitly requires one completed activity/chapter, incomplete whole campaign and nonempty physical personal storage before capturing review/normal baselines. Fresh forged/active scenarios must have no completed progress. Unexpected setup calls fail before counter reset. The real recordActivity schedules its completion-module import only when the whole campaign completes; this validated partial seed does not schedule that deferred completion. No arbitrary settling sleep is used.

Personal storage writes are counted by wrapping the real partition setItem/removeItem/clear methods after setup and before route mount. Logical and already-qualified owner keys are counted; clear is counted when personal keys exist; snapshots also compare bytes. Active gameplay retains its existing entry work before the separate in-play reading baseline. Zero-mutation claims apply to explicit review entry and reading, not ordinary gameplay.

## Safety and validation

Builder admits only empty absolute /tmp/irth-completed-reread-*/assets outputs, rejects symlink paths, disables environment/public-directory loading, and blocks real backend imports. Python admits only GETs to enumerated built assets on its exact ephemeral 127.0.0.1 origin, blocks WebSockets/service workers and other requests, fails on any requestfailed event including admitted assets, and emits sanitized JSON without storage contents or credentials. Workflow is restricted to the V18 repair branch and explicit paths, read-only contents, no checkout credentials, pinned Playwright 1.62.0 and disposable Chromium profile.

Favicon and arabesque decoration requests receive synthetic HTTP 204 responses; those decorative assets are not being accepted visually.

Author validation: static Vite bundle PASS; 8 output/workflow guards PASS; 2 Python egress/asset guards PASS. Python syntax checked without running acceptance. Independent static safety/semantics review passed; the coordinator rebuilt the final integrated lane at `8efc7a89` and reran all eight Node plus two Python guards successfully. No native, live Auth/Storage, browser runtime, publication or release-readiness claim.

## Final integrated source
After the five generated review labels were localized, the final lane at `ccae170a` rebuilt successfully and again passed all eight Node and two Python guards. Default Arabic expectations and the five runtime groups were not weakened or removed. This is static preparation only: the five Chromium runtime groups remain unexecuted, including the actual memory-router journey.
