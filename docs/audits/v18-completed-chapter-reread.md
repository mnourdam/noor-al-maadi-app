# Explicit completed-chapter reread

## Reproduction
Actual chapter route with real progress adapter: completed chapter one in an unfinished two-chapter campaign showed the completion panel, not ActivityReviewCard content. Entering it also wrote the resume pointer. Whole-campaign completion already enabled read-only review. These are distinct from the in-play ChapterReadingReview overlay and Story reread controls.

## Bounded repair
Only overview links labelled «أعد القراءة» add review=chapter. Chapter search accepts that exact value alongside existing preview=draft; unknown review values are ignored. Plain chapter URLs retain normal completion-panel behavior. Explicit review is admitted only for a completed, unlocked current chapter, except the preexisting whole-campaign completed policy. Rejected exact requests redirect without rendering answer keys or running plan/bank/resume effects.

Partial review reuses the real pure ActivityReviewCard for currently present completed activity IDs only. Newly added uncompleted content is excluded; absent historical per-activity evidence yields an honest empty notice, not invented completion. Intro/historical reading remains existing chapter content. Partial banner says chapter, not campaign. Next-chapter link carries review intent only when that next chapter is completed and unlocked; otherwise its ordinary navigation remains unchanged.

Read/rejected mode skips resume pointer, memory harvest/refresh/plan and zero-heart modal effects. Owner epoch subscription re-evaluates partitioned completion. Per-admission owner/epoch/route/intent identity guards captured gameplay and memory callbacks, including ABA and post-await local settlement. Dispatched server work is not canceled or rolled back. No economic formula or reward-ledger operation was rewritten.

Existing whole-campaign plain-URL review remains. Fresh normal campaign completion still shows its earned completion modal using admission-tagged completion evidence; explicit read or a retired owner/route/intent cannot resurrect that modal. Heart callbacks similarly check their live admission. This avoids suppressing the ordinary fresh-completion experience merely because campaign completion changes review eligibility.

## Tests and limits
Actual overview links and chapter components with real progress/partition adapters and ActivityReviewCard are mounted; the router adapter captures href/search and then mounts the destination, not a real browser router. Tests cover partial/whole/plain behavior, zero hearts, forged incomplete/locked review, new activity exclusion and missing evidence, owner A→B→A partition retirement, stale callback intent ABA and owner ABA, next-link intent, search validation preserving recognized draft, late dispatched-save local retirement, and fresh completion modal preservation.

Memory/SDK/profile/rendering infrastructure are mocked at explicit boundaries with no-call counters; no read-path plan/harvest/resume/reward/heart/RPC or localStorage changes occur. Existing campaign boundary, gameplay and in-play reread suites remain included. No backend, native/browser routing, hosted authorization or draft-content access test is claimed. Existing draft access policy is unchanged. No publication or deployment.

## Follow-up retirement controls
Mounted-state is checked before callbacks can begin, including an old unmounted instance followed by a new read-mode mount. A real normal two-chapter gameplay finish followed by acknowledgement is tested to retain its completion panel and ordinary next link, not accidentally enter reread.

No new read-path memory bank call is started. A refreshMemoryBank already dispatched before an intent transition can still merge its cache internally; the alive guard suppresses only its UI bankTick. This patch does not cancel or roll back that prior cache work, just as it does not cancel already-dispatched server writes.

## Content evidence boundary
Partial review matches completed activity IDs against current authored definitions, not an immutable historical text/version snapshot. Fresh IDs are excluded, but a later edit under an already-completed ID is not distinguishable with the current ledger. This does not establish historical content authenticity or universal spoiler prevention; no new version/evidence storage contract is introduced.

## Integrated gates
Final reviewed stack integrated locally: both TypeScript projects and all 2,040 isolated tests across 115 files pass. Economic source drift and diff checks pass. The router-core implementation was also read to verify that the previous omitted search and new ordinary-link empty search both resolve to an empty search under its default behavior. This is not a real browser/router, draft authorization, native or production acceptance result.
