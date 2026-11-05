import { fail, type Handoff, type Identity, type Source, type SourceAddress } from "./contract";
export const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export function addressKey(a: SourceAddress): string {
  if (
    !text(a.deviceId) ||
    a.sourceGuestOwner !== `guest:${a.deviceId}` ||
    !text(a.physicalKey) ||
    a.schema !== "buffer-v1" ||
    a.generation !== 1
  )
    fail("invalid_input");
  return JSON.stringify([a.deviceId, a.sourceGuestOwner, a.physicalKey, a.schema, a.generation]);
}
export function validIdentity(v: Identity): boolean {
  return (
    !!v &&
    text(v.owner) &&
    Number.isSafeInteger(v.epoch) &&
    v.epoch >= 0 &&
    text(v.contextId) &&
    v.ready === true
  );
}
/** Validate the whole archive; never filter corrupt members or replace it with an empty set. */
export function validateSnapshot(raw: string): void {
  try {
    const v = JSON.parse(raw);
    if (
      !v ||
      Array.isArray(v) ||
      v.boundUid !== null ||
      !v.entries ||
      typeof v.entries !== "object" ||
      Array.isArray(v.entries)
    )
      fail("corrupt");
    for (const [key, e] of Object.entries(v.entries) as [string, any][]) {
      if (
        !e ||
        !text(e.campaignId) ||
        !text(e.chapterId) ||
        key !== `${e.campaignId}::${e.chapterId}` ||
        !["locked", "unlocked", "completed"].includes(e.status) ||
        !text(e.bufferedAt) ||
        !Number.isFinite(Date.parse(e.bufferedAt)) ||
        (e.completed !== undefined && typeof e.completed !== "boolean") ||
        [e.score, e.xpEarned, e.coinsEarned].some(
          (n) => n !== undefined && (typeof n !== "number" || !Number.isFinite(n)),
        )
      )
        fail("corrupt");
    }
  } catch {
    fail("corrupt");
  }
}
export function sourceRow(v: any): Source {
  if (
    !v ||
    v.schemaVersion !== 1 ||
    !text(v.sourceId) ||
    !text(v.handoffId) ||
    !(v.boundUid === null || text(v.boundUid))
  )
    fail("corrupt");
  try {
    if (addressKey(v) !== v.address) fail("corrupt");
  } catch {
    fail("corrupt");
  }
  return v;
}
export function handoffRow(v: any): Handoff {
  if (
    !v ||
    v.schemaVersion !== 1 ||
    v.mode !== "foundation_only" ||
    !text(v.id) ||
    !text(v.sourceId) ||
    !text(v.sourceAddress) ||
    !text(v.transitionId) ||
    !text(v.snapshotHash) ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 0 ||
    !validIdentity(v.capturedIdentity) ||
    !["captured_active_guest", "legacy_captured_now"].includes(v.provenance) ||
    ![
      "awaiting_target",
      "awaiting_consent",
      "approved",
      "declined",
      "cancelled",
      "blocked",
    ].includes(v.phase) ||
    !(v.blockedReason === null || text(v.blockedReason)) ||
    !Array.isArray(v.attempts) ||
    !v.attempts.length
  )
    fail("corrupt");
  validateSnapshot(v.snapshot);
  for (const a of v.attempts)
    if (
      !a ||
      !text(a.id) ||
      !["capture", "bind", "approve", "decline", "cancel", "block"].includes(a.action) ||
      !text(a.owner) ||
      !text(a.contextId) ||
      !Number.isSafeInteger(a.epoch) ||
      a.epoch < 0 ||
      !Number.isFinite(a.at)
    )
      fail("corrupt");
  const first = v.attempts[0];
  if (
    v.revision !== v.attempts.length - 1 ||
    first.action !== "capture" ||
    first.owner !== v.capturedIdentity.owner ||
    first.epoch !== v.capturedIdentity.epoch ||
    first.contextId !== v.capturedIdentity.contextId ||
    !v.capturedIdentity.owner.startsWith("guest:")
  )
    fail("corrupt");
  if (v.phase === "awaiting_consent" && v.consent !== null) fail("corrupt");
  if (new Set(v.attempts.map((a: any) => a.id)).size !== v.attempts.length) fail("corrupt");
  if (!(v.target === null || (text(v.target.uid) && Number.isFinite(v.target.verifiedAt))))
    fail("corrupt");
  if (v.phase === "awaiting_target" && v.target !== null) fail("corrupt");
  if (["awaiting_consent", "approved", "declined"].includes(v.phase) && !v.target) fail("corrupt");
  if (
    v.consent !== null &&
    (!v.target ||
      v.consent.uid !== v.target.uid ||
      v.consent.snapshotHash !== v.snapshotHash ||
      v.consent.policyVersion !== 1 ||
      !["approve", "decline"].includes(v.consent.decision))
  )
    fail("corrupt");
  if (
    (v.phase === "approved" && v.consent?.decision !== "approve") ||
    (v.phase === "declined" && v.consent?.decision !== "decline") ||
    (v.phase === "blocked" && !text(v.blockedReason))
  )
    fail("corrupt");
  return v;
}
