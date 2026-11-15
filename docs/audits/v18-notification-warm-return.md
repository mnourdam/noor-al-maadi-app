# Notification Center warm-return preview (local candidate)

Base: 56bd440232ca1a7b426b1b7dcf928f36f0aa76ce. No publication or live service access.

## Small bounded change
The actual Center previously initialized an empty list and waited for every mount's
150-row read. It now initializes from at most one in-memory 150-row successful-read
snapshot, for 30 seconds. This is a display preview, not a response cache:
authentication and the list RPC still run on every mount. There is no request-count
saving claim, pagination change, offline-cache change or localStorage write added.

The snapshot includes owner, identity epoch and mutation generation; no other list
limit or persisted/fallback rows seed it. Expiry/backward clock clears it. Existing
mutations invalidate at entry/completion; no snapshot can be seeded while any
notification mutation is pending. This is conservative: a hung mutation suppresses
new warm snapshots until it settles, without suppressing normal list fetches.

The route rejects retired-owner, unmounted, older-sequence and retired-generation
responses. A latest mounted response retired solely by generation triggers a fresh
read: this handles recordDismissed, which invalidates without an update event,
rather than leaving a cold skeleton permanently. This is not network-error retry.

## Before/after controlled comparison
The test actually ran once with the original route from the pinned base, and once
with the candidate route, keeping the same synthetic SDK and controlled fake clock.
It used a previously populated 150-limit snapshot, then held the mount refresh
for 1,200 modeled milliseconds:

| Asserted observation | Original route | Candidate |
| --- | ---: | ---: |
| Wait before already-known rows appear | 1,200 ms | 0 ms (first commit) |
| Background refresh completion | 1,200 ms | 1,200 ms |
| List RPC calls for this mount | 1 | 1 |

This is jsdom/fake-clock component evidence, not measured Android/browser frame
latency, production service speed, bandwidth or a release gate.

## Regression coverage
New actual-route/bridge suite: 16 cases, passing locally. Cold/warm return,
fresh replacement/empty results, TTL, cache-source and exact-window controls,
Alice/Bob/guest/ABA, mutation entry/pending/completion, late old replies, detached
row copies, and non-emitting dismiss catch-up. Existing Center owner test's server
mock supplies the two new accessors; its original assertions remain unchanged.

Older thumbnail 150→9 browser fixture remains separate evidence. This change
does not repeat it, alter image admission, or claim it fixes the whole page.
The broader app and final Android acceptance remain independent release gates.

## Final integration checks
Rebased cleanly onto 3e32c874d15406790f9aebd79c6ac35523b476d3 (Home
unused-collection subscription removal); notification source at that base was
unchanged. On this composition: 75/75 notification tests, 2,233/2,233 aggregate
tests across 139 files, both TypeScript projects and diff whitespace checks PASS.
Independent static review cleared the generation catch-up after its regression
was added. No APK build, Android acceptance or deployed timing claim is added.
