# V18 ordinary profile persistence readback evidence

## Defect and change

The profile writer previously verified exact serialized readback only for its
conditional receipt path. Ordinary requested frames marked persistence `written`
after a nonthrowing `localStorage.setItem`, even when the actual identity partition
adapter silently quarantined the write. A storage shim that silently drops a write
or returns different bytes had the same false-positive result.

Every requested frame now serializes once, calls setItem, reads the logical profile
key back, and requires exact serialized equality plus the still-current owner,
epoch and generation before reporting `written`. The existing conditional token
and own-admission checks remain in addition to this evidence.

Mismatched, absent, or unreadable readback yields `unresolved`. A readback exception
is caught separately: it does not newly crash ordinary writes. For conditional
writes this intentionally narrows the former broad catch behavior: unavailable
readback resolves the receipt false/unresolved instead of throwing. Serialization
and setItem exceptions retain the existing failed status and error-boundary throw.

This changes evidence, not the legacy update contract. React state and immediate
return timing are not rolled back or rewritten, no automatic retry is scheduled,
and unresolved is never proof that a backend or local write did not happen.
Exact matching bytes do not establish exclusive writer ownership, disk-fsync,
economic inclusion, cross-tab ordering, or a trusted migration baseline.

## Evidence

New suite: `tests/offline/outbox-profile-readback-evidence.test.tsx`.

Before source repair, the original eight-case suite: **6 failed / 2 passed**.
After repair and three additional consumer controls: **11/11 pass**. Combined
with unchanged conditional-writer, writer-fence and provider-capability suites:
**119/119 pass** across four files.

Tests exercise the actual ProfileProvider/writer and real identity partition with
synthetic data: ordinary silent no-op, mismatched bytes, readback exception,
identity change during readback, actual guest quarantine of authenticated profile
data, positive exact-write/remount, unchanged storage-write error behavior, and
conditional readback exception. Actual Provider consumer tests also verify that
unresolved silent-no-op/mismatch evidence blocks a subsequent trySpendDinars debit,
while written evidence preserves its existing synchronous acceptance and debit.
State persistence is distinguished explicitly:
a mismatched or failed read can be unresolved even when a write already took effect.
No historical assertions changed. No real backend or player data is accessed.

Independent review cleared the source and independently ran the focused suites. Combined local validation with the separate heart-anchor repair passed 1,526/1,526 offline tests across 60 files, both TypeScript projects and client/SSR build, plus 41/41 scheduler checks. Remote CI is pending publication. No economic gate, schema,
new authority, repair, import, rollback, or deployment is introduced. V18 HOLD;
production NO-GO.
