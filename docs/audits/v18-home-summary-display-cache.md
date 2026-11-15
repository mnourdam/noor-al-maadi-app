# Home completion summary display cache

Base: `fa84386d` on V18 preparation branch. This change does not deploy the app.

## Bounded scope
Only Home/share-card completed campaign and story counters. Uses existing React
Query, not new persistent storage. Museum/discovery hooks, campaign recommendation,
notifications, reward transactions and progress writes are unchanged.

- Cache keys contain active owner AND identity epoch. A -> B -> A cannot reuse an
  old session's in-memory answer. Auth restoration, namespace mismatch and pending
  reconciliation withhold personal summary values.
- Strict read helper distinguishes a successful empty ledger from errors, malformed
  results, aborted requests and stale identity. Existing tolerant completion helper
  used by other consumers is not changed.
- Remount presents the last successful result synchronously, revalidating in the
  background. Explicit refetch-on-mount overrides the Android stable-mode default
  that would otherwise suppress revalidation. Unused queries expire after 5 min.
- Accepted partition-local campaign facts and uid-scoped acknowledged story mirror
  entries are unioned for display. Guest completions are never used for a signed-in
  account. Errors keep last successful results; failed first reads stay unresolved.
- Completion/outbox events cancel old requests immediately and schedule one shared
  75 ms trailing refresh, including across simultaneous consumers. Local accepted
  facts render without waiting for that timer. Remount always revalidates, covering
  changes while Home was unmounted.
- No calls to grant rewards, mutate progress, write localStorage or alter schema.

## Verification
28 focused tests passed:
- Cached return while network responses are withheld; newer result updates later.
- Two concurrent consumers share two requests, not four.
- Failure on first read remains unresolved (not verified zero); actual zero works.
- Background failure preserves verified counts.
- A -> B, A -> guest and A -> B -> A with delayed responses.
- Cached A values never flash for B or for a new A identity epoch.
- Auth/bootstrap and reconciliation pending gates.
- Local completion visible immediately, pre-completion response discarded.
- Bursts of completion events across consumers coalesced to one pair of reads.
- Completion while Home is unmounted overlaid on first return render.
- Strict reader abort/identity/epoch checks and campaign normalization parity.
- Real localStorage mirror with null/primitive/array siblings and non-boolean
  completed flags cannot erase trusted counts or create false completions.
- Distinct A/B/new-A response payloads prove old A data never appears in B.

A temporary controlled comparison imported the unmodified baseline hook and the
new hook with identical synthetic ledgers (one campaign, one story), then held all
return-mount network responses unresolved. Baseline showed 0/0 after 100 ms (and
reported loading=false because guest-initialization values survived while its
signed-in fetches waited). New hook showed verified 1/1 in the first return render,
without waiting for any response. This is a deterministic hook-level comparison,
NOT a device/frame-time benchmark or whole-Home speed percentage. The permanent
regression tests cover the intended return/identity/error behavior; the temporary
baseline fixture is not shipped.

TypeScript passed. Aggregate test and build outcome is supplied in the handoff.
No real Android acceptance or production network latency was measured here.

## Limits / next diagnostics
This does not promise instant entire Home: campaign hero, collection/discovery
metadata, daily challenges, images and device render cost remain independent.
No new TTL hides server updates; requests still run on each return. Cached display
is the last confirmed value during that refresh, with locally accepted completions
overlaid. A first-ever offline session cannot invent the missing server count.
