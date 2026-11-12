# V18 cloud map finite-value boundary

## Defect and bounded repair

`mergeCloudSave` previously converted each incoming `activityCooldowns` and `hintsPurchased` entry with `Number(value) || 0` inside its deferred React updater. Positive infinity (including the string `Infinity`) survived `Math.max`, then serialized as null alongside unrelated balances/progression. Caller mutation after invocation and repeated getter evaluation could also change the merged values.

The method now captures and normalizes incoming scalar map entries once before scheduling the updater. It preserves the exact `Number(value) || 0` fallback and maximum policy. After merging, it inspects every final value in both maps, including untouched local entries. Any nonfinite final value rejects the complete merge by returning the original profile. It does not repair, zero or rewrite existing corrupt stored bytes, and does not partially accept unrelated balances, stories or completion flags.

NaN, garbage strings and null retain the existing zero fallback. Negative infinity is not independently banned: it remains accepted when the final maximum is finite. Finite negative, zero, fractional and numeric-string inputs retain prior behavior. This is not comprehensive nested-schema validation, economic authority, a pricing change or cross-tab synchronization. A rejected merge can still consume writer admission.

## Evidence

`tests/offline/outbox-cloud-map-validation.test.tsx` uses the actual StrictMode provider with synthetic storage and mocked backend dependencies. Before source edits, the isolated temporary suite reported **10 failed / 18 passed**. Failures demonstrated both maps' infinity/string-infinity corruption, deferred nested mutation, repeated getter evaluation and unrelated merge of existing corrupt map entries.

After repair, **28/28 pass**. Combined with unchanged cloud-scalar and historical capability suites: **112/112 pass**. Controls preserve existing fallback/max behavior for NaN, garbage, null, negative infinity (numeric/string), finite negatives, zero, fractions and numeric strings. Rejection assertions check original profile identity and exact persisted bytes; malformed incoming-map cases also verify no unrelated story acceptance and remount balance preservation.

`git diff --check` passes. Full validation/publication are coordinated separately. No production data, backend mutations, migration, activation or baseline decisions were involved.

Independent review **CLEAR**, independently rerun **28/28 PASS**. Final maps must
contain finite numbers: untouched malformed local values such as null or numeric
strings are also rejected, not silently repaired/coerced. Incoming numeric
strings retain the prior normalization and valid maximum behavior. This does not
validate the complete profile schema or create economic authority.

Full local validation: **1431/1431 tests across 56 files PASS**, both TypeScript
projects PASS, client/SSR build PASS. The initial typecheck identified partial
wire-fixture typing in the new tests; explicit casts preserved exact runtime
inputs and assertions, then the full sequence was rerun. Remote npm CI pending
for this commit; no Bun/Android release parity or deployment is claimed.

Remote npm runtime CI **SUCCESS**: [43191353623](https://github.com/mnourdam/noor-al-maadi-app/actions/runs/43191353623), tested commit `3d9ac5602db8f4355349e184d3999be9c7577eec`.
Verified job `131091171786` passed every step, including regressions, scheduler,
typecheck and client/SSR build. No deployment; Bun and Android acceptance are
tracked separately.
