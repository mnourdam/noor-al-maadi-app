# V18 failed cloud save: retain existing realtime protection window

## Demonstrated defect

The actual AccountProvider debounce and online-reconnect continuations cleared `lastLocalChangeRef` after `pushSave` resolved false, provided identity/profile/ticket still matched. Only `setLastSyncAt` was conditional on success. A recent local XP change could therefore lose its existing four-second protection from stale realtime rows even when saving failed or did not occur.

`pushSave` returns false for unsuccessful session admission (including no session), upsert errors and failed postresponse session checks. False is not an acknowledgment of durable saving. Thrown failures already skip the clearing path. The reproduction does not establish that this defect caused the user's historical symptoms.

## Minimal repair

Debounce and reconnect timestamp-clearing predicates now additionally require `ok`; explicit `syncNow` likewise requires `saveOk`. Its return value remains `saveOk`, and its successful cloud-save timestamp semantics are unchanged. Existing identity, exact source-profile and sync-ticket checks remain intact. Public-stat calls and successful-save timestamp behavior are unchanged. No retry, longer protection window, merge policy, backend contract, global writer exclusion or new economic authority is introduced.

The guard still expires naturally after 4,000 ms even if saving failed. This repair prevents premature removal, not indefinite stale-data exclusion. `pushPublicStats` retains its separate void/error acknowledgment limitations. Cross-tab whole-profile overwrite and already-issued requests are not solved by this patch.

## Actual-source evidence

New `tests/offline/outbox-account-failed-save-guard.test.tsx` mounts actual ProfileProvider and AccountProvider with synthetic storage and mocked transports. Initial nine cases before repair: **4 failed / 5 passed**. Both debounce and online paths fail for explicit false and for the actual `cloud-save.pushSave` no-session path (loaded with `vi.importActual`, mocked auth session null). Thrown-failure, successful-save and ABA controls passed on original source.

After repair, the nine cases plus an explicit 3,999-ms/4,000-ms expiry control pass: **10/10**. The later explicit-sync extension added false/success controls: before its source correction, the expanded suite had **1 failed / 11 passed**, reproducing the same premature clearing in `syncNow`. After adding the third success predicate, the complete suite passes **12/12**. Combined with unchanged account writer-fence suite: **32/32 pass**. The test verifies actual profile and persisted points, not just call counts. No old assertion was weakened. `git diff --check` passes; independent review cleared all three predicates and independently reran 32/32 focused checks. Full local acceptance passed 1,538/1,538 tests across 61 files, both TypeScript projects, client/SSR build and 41/41 scheduler checks. Remote CI is pending publication. No real backend requests, production changes, release operation or baseline decisions occurred.
