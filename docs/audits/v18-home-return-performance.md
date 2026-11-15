# V18 Home return performance: bounded investigation

Base verified via GitHub branch resolution: `56bd440232ca1a7b426b1b7dcf928f36f0aa76ce`.
The original local commit `88a241d8` has an identical tree; this patch was reapplied
to the actual remote V18 head and checks rerun there.
Scope: local code and isolated checks only. No live backend writes, deployment,
Android acceptance or timing claims.

## Confirmed redundant work removed

`HomeFull` called `useRealCollectionStats()` and discarded its result. It also
called `useHomeSummary()`, which legitimately calls that same hook. Each hook
instance owns an independent `useSupabaseCollection` effect, auth subscription,
outbox/online listeners, collection query, and enabled encyclopedia metadata
query. Both requests repeat on mount and eligible refresh events.

Remove only the discarded top-level call and change its import to type-only.
The canonical summary stays unchanged. No persistence, counters, rewards,
identity guards, cache policy, or database data are changed.

Deterministic request-path comparison for a signed-in mount outside Android
ultra-stable mode (without development StrictMode replay):

| This duplicated path only | Before | After |
| --- | ---: | ---: |
| `user_collection` queries | 2 | 1 |
| enabled encyclopedia `slug,title,metadata` queries | 2 | 1 |
| total queries | 4 | 2 |

This is **not** a measured 50% improvement in total Home latency. Other Home
consumers still query collections/encyclopedia independently, and actual network
latency, payload size and server pressure were not measured.

## Remaining supported contributors

- `useHomeSummary` starts with unresolved counts on each mount and re-fetches
  campaign/story completion ledgers. The UI gates all summary numbers behind
  their combined loading flag, even museum/investigation values available sooner.
- `useCloudCampaignProgressLocal` starts from an empty Map and queries the whole
  user's campaign progress on remount, then awaits session confirmation.
- `useUnifiedDiscoveryFeed` separately fetches its encyclopedia index and
  collection/discovery rows on mount.
- `useStoryCollections` seeds from the baseline, but still requests fresh
  collections every mount. Story summaries/campaign content do use React Query;
  therefore it would be inaccurate to say the entire Home has no cache.

These patterns explain avoidable repeated work, not the complete device-specific
cause. Small database sizing, slow network and Android rendering remain
unmeasured. Do not blame any one of those without traces.

## Safe next increment (not implemented here)

Use one shared, identity-and-epoch-keyed display snapshot for personal Home data,
with immediate local progress overlays and deduplicated background refresh.
Invalidate on completion/reward/content events, preserve last verified values
when refresh fails, and never replace errors with verified zero. Separate public
metadata caching from private progress. Ensure A -> B -> A switches, logout and
late responses cannot reuse another session's result. Do not simply lengthen TTL
or bypass reconciliation to make the page look faster.

Acceptance needs cold vs repeat returns under slow/offline networking, completion
and rewards immediately before return, auth switching with in-flight requests,
and Android traces. Measure time-to-useful-content separately from background
refresh and count requests/payloads. Avoid expanding into a wholesale data-layer
rewrite immediately before release.

## Verification

- AST regression test reproduces the redundant-hook condition: fails against
  base source, passes after removal; canonical summary hook remains exactly once.
- TypeScript `tsc --noEmit`: passed.
- Regression added to standard outbox test configuration.
- Build status recorded in task handoff; build success is not Android acceptance.
