# V18: finite scalar ingress for cloud profile merge

## Defect and bounded repair

`mergeCloudSave` previously admitted nonfinite numeric points, dinars and streak.
Math.floor/Math.max can preserve NaN or positive Infinity; JSON serialization then
writes null over valid profile data. Negative Infinity can also admit a partial
merge from an invalid snapshot. Hydration readability checks occur too late to
protect those overwritten bytes.

Capture the incoming cloud object's own enumerable fields once, before admitting
the React update, then reject the entire merge if points, dinars or streak is a
number but not finite. All subsequent merge reads use that captured snapshot.
This is a shallow snapshot: nested collections and extras retain their existing
reference semantics. It is not comprehensive schema validation.

Existing finite max/floor reconciliation, null/omitted behavior, finite negatives,
STARTING_DINARS floor, heart tuple selection, array unions and sticky completion
handling are unchanged. No economic baseline, migration, authority or deployment
is introduced. This does not repair numeric corruption via other setters,
arithmetic overflow, nonnumeric coercions, or nested cooldown/hint maps.

## Deterministic evidence

New actual-ProfileProvider StrictMode suite:
`tests/offline/outbox-cloud-scalar-validation.test.tsx`.

Before source repair: 12 failures / 6 passes. Failures cover nine nonfinite field
combinations, deferred caller mutation, repeated scalar getters and write-admission
invalidation. Existing finite/merge compatibility controls already passed.

After repair: 18/18 new tests pass. Combined with unchanged stats, capabilities,
writer-fence and real-profile-authority suites: 137/137 tests across five files.
Tests require unchanged profile identity, exact persisted bytes, persistence
receipt, remounted balances and an existing unchanged-profile asynchronous
operation after invalid input. Valid controls preserve current behavior rather
than proposing new balance rules. No live data or network service is used.

Independent review and broader release validation are pending. V18 remains HOLD;
production remains NO-GO. This slice does not establish an economic cutover.

Independent review: **CLEAR**, independently rerun **18/18 PASS**. Capture is
appropriate for ordinary JSON cloud records; own enumerable getters are read
once eagerly, while inherited/nonenumerable properties are not copied. It is
not a deep snapshot or comprehensive schema/authority validation.

Full local validation: **1260/1260 tests across 50 files PASS**, both TypeScript
projects PASS, and client/SSR build PASS. Remote CI is pending for this commit.
V18 HOLD and production NO-GO remain unchanged.

Remote runtime CI **SUCCESS**: [43186222782](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43186222782), tested commit `dbea4073755683ef65dcc79bb4beb5b59d99599c`.
Verified job `131073929925` passed every step, including regressions, scheduler,
typecheck and client/SSR build. No deployment.
