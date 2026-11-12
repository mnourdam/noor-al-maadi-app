# V18 economic cutover: evidence-led implementation plan

Decision: **HOLD / production NO-GO**. This plan authorizes no live migration,
policy change, old-client shutdown, historical import or opening grant.

## Current evidence, not extrapolation

The authority ENGINE proof established 325 isolated PostgreSQL assertions. The
local Supabase lane established 66 assertions with actual Auth JWTs/PostgREST and
actual Supabase roles. The investigation extension established 72 assertions,
including the original 11 vulnerability reproductions, a guarded producer with
synthetic trusted approvals, immutable issuance and observed lock overlap.

These are connected building blocks, not full cutover acceptance. The eligibility
issuer remains synthetic. Existing wallets have no complete trusted genesis and
debit journal. Hosted catalog, whole-app ingress exclusion, device/crash/offline
recovery and production policy remain unverified. Local provider frame revision
is explicitly single-instance, not global authority.

## Highest-value next implementation

Finish the repository ingress/admission manifest in `tests/economic-ingress` into
a closed, reviewed writer contract. It already pins source evidence and detects
migration/literal client ingress drift. It intentionally retains parser and
semantic unknowns. Resolve exact columns, indirect calls/triggers and permissions
before implementing enrollment; do not add more independent toy grant APIs.

Each writer gets an explicit disposition: unchanged legacy-only; non-economic
allowlist proven not to trigger economics; typed authority route for enrolled
owners; or denied/unresolved. Include direct table/column grants, SECURITY DEFINER
functions, trigger-created writes, admin/service routines and external jobs.
Cross-check actual deployed catalog later through an authorized read-only step.
A repository source scan alone cannot certify effective production permissions.

## Phased implementation without economic changes

1. **Inventory closure and version contract.** Build a dormant server-owned
   account admission state (legacy/unresolved/enrolled, protocol version and
   generation). Unknowns remain legacy/unresolved. No client version header can
   self-enroll. Write exclusion and enrollment must share a transaction lock so
   an already-running legacy write cannot commit after enrollment unnoticed.
2. **Fresh accounts only, when actually fresh.** Design enrollment at account
   creation with a protected approved genesis event and no competing legacy
   writes. A recent signup date, empty-looking profile or current default balance
   is not proof of fresh economic history. Do not enroll existing users or assume
   an opening amount until product policy explicitly supplies it.
3. **Read-only shadow comparison.** Compute prospective journal projections and
   record divergence/unknowns without writing profiles, merging cloud/local data,
   selecting max totals or repairing balances. Start in disposable fixtures;
   real-user diagnostics require separately authorized scope and privacy review.
4. **One genuine typed producer.** Replace synthetic approval only when a real
   eligibility issuer and stable entitlement/version contract are defined. Use
   the same transaction admission, receipt, idempotency and inclusion protocol.
   Prove all manifest routes obey it before broadening beyond that cohort.
5. **End-to-end readiness.** Verify crash/restart/retry durability, two-device and
   offline behavior, delayed old clients, migration recovery, support messaging
   and rollback that does not erase committed grants. No gate activation until
   hosted/catalog and application evidence meet the reviewed contract.

## Historical wallets: what remains unknowable

Current sources permit client absolute totals, arbitrary delta amounts, own-ledger
inserts and evidence rows that were writable before hardening. Spending and admin
adjustments do not form a complete immutable history. No hashchain, timestamp,
cloud maximum, row existence or newly revoked privilege can prove those historical
amounts were earned or fully account for every debit. Revocation today does not
make yesterday's rows trustworthy.

A product may explicitly honor an existing snapshot as a NEW authorized opening
adjustment. That would be a business decision with auditable provenance of that
choice, not a technical discovery that the snapshot is historically verified.
Never silently reset, claw back or normalize players to make tests pass.

## Actual product/user choices needed later

- Historical policy: keep legacy accounts indefinitely; explicitly honor a frozen
  snapshot as a new opening adjustment; or individually review disputed balances.
- Approved new-account opening grant and terms, including what “new” means.
- Real gameplay eligibility issuer and one-time/repeatable entitlement identity
  across content edits, seasons, refunds and administrative corrections.
- Offline spending: server-confirmed intents versus explicitly defined offline
  allowance, and player experience when authority is unresolved.
- Old-client support/minimum-version window and timing of any economic freeze.

These choices do not block source inventory, drift tests or dormant contract
implementation. Routine safety choices remain ours: no invented balances, no
unknown-source admission, no silent migration and no misleading success claims.
