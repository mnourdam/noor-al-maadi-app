# Mount-local profile storage warning

Separate from the quota crash-containment fix, the writer publishes a reactive
quota signal only after a genuine QuotaExceededError. Its owner, identity epoch,
writer source and generation bind the notice to the current provider. Owner/ABA
retirement synchronously masks it. Same-owner hydration carries the notice across
generation changes because reading saved data does not prove recovery. An exact
verified later write clears the notice; unresolved/readback failure does not.

The mounted player AppShell displays one inline role=status message, in its selected
Arabic or English UI locale: some changes could not be saved on this device; do
not clear app data. No toast, sound, retry button, cleanup, extra storage writes,
background retries or promise of safe/complete saved progress is introduced.
The optional shell hook returns false outside a ProfileProvider. The existing
stable-mode nested-shell suppression avoids a second rendered shell notice.

This is mount-local knowledge, not a durable failure journal. A new provider mount
cannot know about a prior failure, and the warning does not claim unsaved state
was rolled back. Later deliberate writes can include optimistic in-memory state.
Other storage errors retain their existing boundary behavior.

Synthetic tests mount the real writer/provider/AppShell/notice and locale store
with unrelated HUD/router/poller/diagnostic boundaries stubbed. Controls cover
repeated quota with a single notice, Arabic/English, unresolved retention, exact
write clearing, owner ABA masking, same-owner hydration retention and fresh-mount
limits. Fullscreen routes outside AppShell are not covered by this notice.
No actual Android/browser-pressure or full-app visual acceptance claimed.

## Regression scheduling correction

The first warning draft did not complete the bounded full regression run (180-second timeout); the existing conditional-writer suite also timed out alone at 25 seconds. A diagnostic counterfactual removing no-warning carry/clear scheduling passed its 19 unchanged checks. This isolates the scheduling group, not one exact individual call or a production hang.

The corrected writer maintains a current warning-decision ref, updated only from admitted callbacks and persistence effects, alongside reactive state. It skips identical decisions (including null-to-null), preserves existing same-owner warning carry, and still clears only a verified write. The final focused conditional/warning run passed 25 checks, including a no-quota hydrate/reset render-count control. The original timeout evidence is retained separately; it is not presented as a successful aggregate.

Final corrected-source validation: 2,212 tests across 136 files passed in 85.41 seconds; both application and isolated-outbox TypeScript checks passed. These are local synthetic/regression results, not deployment or device acceptance.
