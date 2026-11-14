# Notification Center owner retirement

## Reproduction and boundary

At source 7e2e337, the actual mounted Center retained a synthetic Alice body after
real identity switched to Bob without a route unmount or notification event.
Clicking that retained row called the mocked read action with Alice's row ID.
The initial isolated test yielded one same-owner positive PASS and two RED.
Original counterfactual log is retained as local execution evidence.
This is UI disclosure/action-admission evidence, not proof a backend accepts a
cross-account mutation. Router, server and shell boundaries are mocked; the
Center, rows and identity module are actual code. No real account data was used.

## Narrow correction

A real owner/epoch external-store subscription keys the inner Center lifecycle.
Scope replacement retires rows, loading and feedback at render rather than
waiting for a list refresh; ABA epochs are distinct. Each effect invocation has
its own retirement flag so old notification callbacks and fetch completions do
not update successor state. Actions check current mounted scope; confirmation
reentry, navigation fallback and mark-all continuation are guarded. The feedback
timer is replaced deliberately and cleared on cleanup. Existing server/cache,
Home, HUD and banner behavior is not changed.

## Verification scope

Mounted synthetic tests preserve ordinary same-owner reading/navigation and fresh
Bob actions, cover retained content/action RED controls, delayed old fetches,
owner ABA/logout, retired callbacks, mark-all feedback, confirmation reentry and
unmount. The rejected-navigation control proves same-owner fallback changes the
URL hash while the retired-owner continuation does not. All 13 focused controls
pass, and application plus regression TypeScript checks pass. Already-dispatched backend calls/navigation cannot be undone. Same-owner
request ordering, cross-tab coordination, server authorization and actual native
account-switch acceptance remain outside this patch. No deployment is implied.
