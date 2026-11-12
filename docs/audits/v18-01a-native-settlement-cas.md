# V18: native settlement CAS acceptance and authority boundary

## Scope

This change tests the existing dormant `src/lib/rewards/transaction.ts`,
`database.ts`, and real identity owner module in Chromium. It does not add a
second economy model, activate a gate, import a player balance, or connect
ProfileProvider to settlement. V18 remains **HOLD**, production **NO-GO**.

The preceding durable-intent native harness tests an explicitly experimental
helper. Existing source transaction tests use fake-indexeddb. This harness
addresses the separate question of how the actual dormant primitive behaves
across independent same-origin browser pages and a new browser process.

Only generated fixture assets are served on a random loopback port. The test
uses a new temporary browser profile and synthetic records. The deployed app,
Supabase, credentials, and real player data are not used. The real source DB
name exists only in this disposable origin/profile; production storage is not
opened. No app source, economic schema, migration, or existing assertion changes.

## Authority design: conditions that remain mandatory

1. **Admit a trusted baseline before economic writes.** A parseable V17 profile,
   localStorage total, or missing database is not evidence of a trustworthy
   opening balance. Unknown provenance stays unresolved. Synthetic fixtures
   are test setup, not an enrollment or migration algorithm.
2. **Exclude every competing writer at the actual authority boundary.** IDB
   serialization covers transactions using the shared store scope. It does not
   revoke direct IDB access, serialize localStorage, fence legacy RPCs, or stop
   another device. An in-memory writer acknowledgment is not global exclusion.
3. **Bind operations to authenticated ownership, immutable terms, and durable
   inclusion.** A client epoch/revision does not prove server permission, claim
   eligibility, or whether a server balance already includes a pending grant.
   Retries need exact operation identity and consistent receipt evidence; a
   revision alone is not idempotency.
4. **Commit the full economic effect atomically.** The current primitive can
   compare-write economy/appliedGrants/migrationState together, but entitlements
   are read-only through this interface. Existing settlement prepare/settle
   operations use separate transactions. Including the entitlements store in a
   transaction scope does not provide an atomic delivered mutation. This test
   does not widen that API or claim exactly-once reward delivery.
5. **Recover from ambiguous completion without inventing state.** An orderly
   browser reopen can show committed bytes survive that transition; it does not
   certify power-loss durability or Android force-stop. A timeout is not proof
   of rollback. Recovered bytes do not restore admission authority.

Consequently, connecting this primitive directly to current ProfileProvider
would leave legacy writes and baseline provenance unresolved. No such wiring
is made. Hosted staging and real Android acceptance remain separate gates.

## Results

- Existing settlement/schema/writer-fence unit suites: **83/83 PASS**.
- Actual-source fixture bundle: **PASS**; isolated TypeScript check: **PASS**.
- Python/Node syntax and diff whitespace checks: **PASS**.
- Local native execution: **BLOCKED before assertions** by Chromium process
  singleton socket permission, including the permitted elevated retry. This is
  not a passing browser run and not an application assertion failure.
- Dedicated branch-only GitHub workflow runs the same harness using official
  PyPI Playwright 1.62.0 and its installed Chromium, with no project secrets,
  deployed origin, backend access, or deployment step. npm dependencies use the
  existing lock. It uploads only the result JSON, not the temporary profile.
- Remote native acceptance: **PASS, all eight checks**, run
  [43176320739](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43176320739),
  tested commit `a0947aaa27133d05c848eb3906e5ab3c791a91a1`.
- Native artifact `13924347669` was downloaded, its SHA-256 verified as
  `add84b833fe61c5adbc35e4d8873617f67d1d663464242cac328f91dbfbb2749`,
  and the result JSON inspected. Durable copy:
  [v18-native-settlement-43176320739.json](evidence/v18-native-settlement-43176320739.json).
  The fixture reports Chromium's reduced user-agent version `151.0.0.0`,
  not an exact browser binary patch version.
- Full offline regression CI also **PASS** at the same tested commit:
  [43176320492](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43176320492),
  including locked install, 1,107 tests, scheduler, typecheck, and build.
- No production deployment occurred. Native success does not close the
  authority admission conditions above.

The eight passing checks are: two-tab stale-base race, full-snapshot comparison,
fresh-base retry, abort after three successful native puts across all three writable
stores, distinct-owner records, page reload, orderly browser-process reopen,
and an explicit raw-IDB overwrite negative control. The final negative control
must succeed in bypassing the primitive; it demonstrates why global writer
exclusion remains unproven, rather than treating cooperating CAS as security.

Run with installed tools:
`python3 tests/offline/browser/settlement-native.py`.
The optional `CHROMIUM_EXECUTABLE_PATH` selects the test Chromium executable;
it does not select a user browser profile or a deployed app origin.
