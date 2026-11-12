# V18: fence outbox dispatch after delayed authentication lookup

## Risk

flushOutbox captures an identity epoch and checks it before handling an item and
after the handler returns. However, handleItem first awaits getSession. An old
Alice session snapshot can resolve after active identity and the SDK session have
changed to Bob. Checking only the returned UID against the queued item's owner
then permits a request to start with the client's new session. The outer response
fence prevents dequeue, but cannot undo an already-issued server mutation.

## Bounded change

Pass the outer flush's captured epoch into handleItem, and compare it immediately
after the awaited session lookup, before UID evaluation, dispatch, or branch
side effects. Do not recapture a fresh epoch inside the handler. Preserve the
existing post-response fence, session-mismatch handling, revision comparisons,
and valid-session behavior.

For profile_delta there is no intervening await between this boundary and its
RPC dispatch. This closes the auth-wait gap; it is **not universal async fencing**.
Handlers with subsequent dynamic imports or other awaits require their own
continuation checks. SDK session changes not yet reflected in the identity
lifecycle are not proven excluded by an epoch check. Already-started requests
are not cancelled or rolled back.

## Evidence scope

Tests use the actual queue, flush, identity and persistence code with mocked
Supabase transport/session lookup. Delay an Alice auth result, switch the real identity owner to Bob (including Alice→Bob→Alice), then resolve
the old lookup. Require zero RPC calls and unchanged queues for both owners.
Unchanged-owner and session-mismatch controls retain prior behavior.

Reproduction, independent review, full tests/typecheck/build and branch CI results
are recorded once verified. No live session, backend or real player data is used.
V18 remains **HOLD**, production **NO-GO**. This guard does not establish a trusted
economic baseline or typed grant inclusion.

Counterfactual on the prior source: **2 stale-dispatch failures / 3 control passes**.
After the guard: all **5/5 auth-boundary cases PASS**, and **22/22** combined with
profile-delta receipt regressions. These tests prove no client RPC invocation
after the tested identity changes; they do not contact a real second account or
claim observed production cross-account mutation.

Independent review approved the narrow boundary and reran **22/22** focused tests.
Final local suite: **1,175/1,175 PASS** across 46 files. Application/regression
typecheck, offline client/SSR build and diff check: **PASS**. Branch CI is pending
at publication. No old assertions or receipt semantics were changed.

Initial remote run [43181238594](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43181238594)
passed the new auth tests but failed the existing investigation double-completion
singleflight assertion (1,174 passed, 1 failed). Therefore this initial overall
CI result is **FAIL**, not remote acceptance. The separate preparation-lifetime
race is investigated in `v18-01a-investigation-entry-singleflight.md` without
weakening the assertion or claiming a successful rerun prematurely.


Corrective full runtime CI **SUCCESS**: [43182614532](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43182614532), tested commit `20519f209bb4cb3b80d3a3aef15184423968186c`. Verified job `131062026464` completed every step successfully: locked install, complete offline/startup regressions, scheduler, application/regression typecheck and client/SSR build. This descendant includes the auth guard and investigation preparation fix; the original failed run remains documented above. No deployment occurred.
