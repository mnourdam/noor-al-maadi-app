# Minimal dormant private-media / disposable Storage subset

Base wrapper `4e969dfcad625d76a6662140a21ae7ea9e1cd3a9` has exact public `3f6adeab` tree `648f52c4`; it is not the remote commit identity. Exactly20 paths: existing14-file candidate, five-file isolated lane and this audit. No unrelated private batch, dictionary, AppShell, profile, authority harness or migrations imported.

## Provenance
| Path | Reviewed source revision | Blob |
|---|---|---|
| `docs/audits/v18-feedback-private-images.md` | `8abbdf3a` | `3646440f03eda5d89fa17298ce6ddc036e7a63f8` |
| `docs/proposals/v18-feedback-private-images.sql` | `33be2f4a` | `f4808b1dbdab08f25c7e083b16b9d05ba4a68fe9` |
| `scripts/lib/feedback-media-cleanup.mjs` | `33be2f4a` | `c52c7865c81ccc508424c1d9dd978d92b0792016` |
| `src/components/feedback/FeedbackImages.tsx` | `33be2f4a` | `999b4f717697b0b5c4e956fa8ebcfe65224fa547` |
| `src/components/feedback/FeedbackReplyComposer.tsx` | `33be2f4a` | `bcdbdf1b7fbb59bb67e686ca2966ad8e23fbd7ad` |
| `src/lib/feedback/images.ts` | `33be2f4a` | `6960f99b6a2c237f27ffd4d4633b1bb639601c59` |
| `src/routes/admin.community.tsx` | `33be2f4a` | `cb2e4ef335907cef1ed5fe9f4e34cc7d15ee226c` |
| `src/routes/feedback.$id.tsx` | `33be2f4a` | `0568a4ea18dbd0811c7eb5fa5aa1d1a9e4feba04` |
| `tests/offline/outbox-feedback-images-renderer.test.tsx` | `33be2f4a` | `ebfce5363609e807883298e005d41bcc63236231` |
| `tests/offline/outbox-feedback-images-ui.test.tsx` | `33be2f4a` | `725a48b208ffe9053b770de68ab1aef66966b63e` |
| `tests/offline/outbox-feedback-images.test.ts` | `33be2f4a` | `7835c214eafcd365b6e683a8604d4e764771ae5c` |
| `tests/offline/outbox-feedback-thread-images.test.tsx` | `33be2f4a` | `075bed09c131d622fb8e0b729e3a75c7aa8ada0e` |
| `tests/sql/feedback-private-images/acceptance.mjs` | `33be2f4a` | `e32daa663e2479af122616a0b5adf2d453d98a0a` |
| `tests/sql/feedback-private-images/cleanup.test.mjs` | `33be2f4a` | `081c144553e09e133199f1173f44fc626c57e3f6` |
| `.github/workflows/v18-feedback-media-local.yml` | `6f369bfc` | `cb546a39fda72114ecb6f452fb04291173993906` |
| `tests/sql/feedback-private-images-local-supabase/README.md` | `6f369bfc` | `432ff181118793ea41d7e32c3909207bceb59bff` |
| `tests/sql/feedback-private-images-local-supabase/fixture.sql` | `6f369bfc` | `81971fae864ff428e354ba9beb04f777f304c27c` |
| `tests/sql/feedback-private-images-local-supabase/harness.py` | `6f369bfc` | `fad8e5329bc231f0f82bcbcf1ace09b7d5f96bc1` |
| `tests/sql/feedback-private-images-local-supabase/test_safety.py` | `6f369bfc` | `53d0506f8889d904dc1c7992cfb0f5e7d3c7bac4` |

## Dormancy and active changes
`VITE_FEEDBACK_IMAGES_ENABLED` must explicitly equal `true`; no tracked environment enables it. The image picker remains OFF. However the shared composer and owner/thread-keyed route refactor are active even with images off: text sending/internal selection/error display and draft retirement must retain default-OFF client regression coverage. Do not call all five production files inert. Legacy text RPC idempotency is not added. Existing player attribution, close/rating and access gates must remain intact.

Proposal SQL hash `9c503b313b34fc0e8994aea96824d8499aba527fe4edf72e62a5979f056c9280` remains outside automatic migrations. No backend activation or deployed bucket/policy change. Existing public feedbackAPI/identity/Supabase dependencies are unchanged, so no extra source closure is needed.

## Acceptance boundaries
The manual/narrow repair-branch path-triggered workflow starts only a fresh local CI project with pinned CLI, loopback endpoints, native Auth/PostgREST/Storage and identity/port/container checks. Minimal feedback tables and `fixture_staff` predicate are intentionally synthetic; this cannot verify inherited/deployed effective policies. Neither the existing privileged helper nor its deployed catalog is probed or replaced.

Storage cleanup is tested only after PUTs terminate: positive same-service-token byte read, API deletion, recognized missing-object response plus SQL metadata absence, and exact id/path REST queue acknowledgement. This is not the JS drain loop, scheduler, disk-forensic erasure, full account purge or late in-flight PUT safety. Late-upload deletion/reconciliation, trusted server binary decoding, effective policy catalog, retention/worker operations, full text/notification/mobile lifecycle remain activation gates. No production/default flag activation follows from a CI pass.

## Fresh subset validation
Pending exact subset client tests, cleanup mocks, static lane guards, pinned PGlite metadata tests, both TypeScript projects, full aggregate and independent source/security review. Historical audit totals are provenance only. No local Docker/server/Auth/Storage runtime or publication performed.

Independent-review follow-up adds explicit default-OFF player picker absence and staff internal text failure/retry/committed-refresh-failure coverage; no image preparation/draft/send occurs. These two test files now differ additively from listed source inputs. Renderer remains active OFF for recognized existing descriptors on explicit download click; picker flag is not a whole-media kill switch. No production source changed.

## Final frozen subset evidence
Both independent reviews CLEAR through `2b8aa7f5`, including source/provenance, disposable-policy boundaries and nonvacuous OFF controls. Fresh checks: original29 client cases plus one added OFF lifecycle control (30 total in final aggregate), six cleanup mocks, thirteen pure lane safety checks and twenty-two PGlite0.3.14 metadata checks. PGlite was installed from the official registry in isolated tool/cache directories; application lockfiles unchanged.

Both TypeScript projects passed; after the additive test review deltas, tests-project TypeScript passed again. An intermediate aggregate ran during test refinement and is not the final proof. The exact frozen final rerun passed **1,983/1,983 tests across108files**, exit0. This is subset-specific evidence, not wider private totals. No local stack/Docker/server/Auth/Storage execution or publication occurred; real disposable runtime and all activation gates remain pending. Audit-only finalization does not alter tested source.
