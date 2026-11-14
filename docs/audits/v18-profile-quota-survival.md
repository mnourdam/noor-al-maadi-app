# Profile quota exhaustion: bounded UI survival

Base public fac6762e2864e70b3c9e0a08bc1361dbb06a3454 and local
 a878b5359cba3e947d296fc8aa44f814b1fbbd90 share exact tree
bdf5b6fe6111494016b516bee04c78b498b19399.

A synthetic bounded-capacity WebStorage fixture reproduces the actual profile
writer persistence effect throwing QuotaExceededError into a React error boundary.
Actual ProfileProvider after-mount stats application and conditional writer each
removed the mounted app subtree: two RED controls before correction. This is not
proof of a zero-action boot crash or proof which keys exhausted a player's device.

The narrow correction keeps the existing failed persistence result and resolves
conditional writes false before handling only DOMException QuotaExceededError
without rethrowing. Generic errors and SecurityError still reach the boundary.
No key is removed, storage cleared, data migrated, automatic retry scheduled or
successful persistence fabricated. The current in-memory state may differ from
saved bytes, as before; remaining mounted does not mean progression was saved.
A later independent write can include that optimistic state; this is not rollback
or automatic durable recovery of the failed operation.
Old conditional failure remains false even if a later independent update succeeds.

Tests seed synthetic profile, daily challenges, quest history, outbox, grants,
reflections and diagnostic data; a capacity-based setItem rejects growth. Every
seeded byte remains intact and removeItem/clear are forbidden. Saved balances
survive remount. Additional controls cover no automatic retry, later available
capacity, and owner ABA capability retirement. Existing writer, real-profile
semantic, readback and conditional suites retain failure/receipt/identity checks;
only explicit quota crash expectations change to graceful failure. No daily or
quest history is classified disposable. Trace growth and user-facing failed-save
messaging are separate work, not claimed solved here.

All evidence is isolated React/jsdom with synthetic storage/services, not actual
browser storage pressure, Android startup or production acceptance. No hosted
calls, player data changes, deployment or release approval.
