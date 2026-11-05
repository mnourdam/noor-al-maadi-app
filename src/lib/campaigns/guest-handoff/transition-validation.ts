import { addressKey, text, validIdentity } from "./codec";
import type { Identity, SourceAddress } from "./contract";
import type { Anchor, AuthProof, TransitionEvidence } from "./transition-contract";
function stop(reason: string): never {
  throw new Error(reason);
}
export const equalIdentity = (a: Identity, b: Identity) =>
  a.owner === b.owner && a.epoch === b.epoch && a.contextId === b.contextId && a.ready && b.ready;
export function evidenceKey(e: TransitionEvidence): string {
  return JSON.stringify([
    e.transitionId,
    addressKey(e.source),
    e.sourceId,
    e.handoffId,
    e.snapshotHash,
    e.provenance,
    e.capturedIdentity.owner,
    e.capturedIdentity.epoch,
    e.capturedIdentity.contextId,
    e.capturedIdentity.ready,
  ]);
}
export function validateAnchor(raw: unknown, source: SourceAddress): Anchor {
  const key = addressKey(source);
  const a = raw as Anchor;
  if (!a) stop("anchor_missing");
  if (
    a.schema !== 1 ||
    a.address !== key ||
    !Number.isSafeInteger(a.revision) ||
    a.revision < 0 ||
    ![
      "enrolled",
      "prepared",
      "captured",
      "auth_started",
      "target_claimed",
      "awaiting_consent",
    ].includes(a.phase)
  )
    stop("anchor_corrupt");
  if (a.phase === "enrolled") {
    if (a.evidence !== null || a.target !== null || a.revision !== 0) stop("anchor_corrupt");
    return a;
  }
  const e = a.evidence;
  if (
    !e ||
    !text(e.transitionId) ||
    !text(e.sourceId) ||
    !text(e.handoffId) ||
    e.sourceId === e.handoffId ||
    !text(e.snapshotHash) ||
    !validIdentity(e.capturedIdentity) ||
    e.capturedIdentity.owner !== source.sourceGuestOwner ||
    addressKey(e.source) !== key ||
    !["captured_active_guest", "legacy_captured_now"].includes(e.provenance)
  )
    stop("anchor_corrupt");
  if (a.target !== null && (!text(a.target.uid) || !text(a.target.attemptId)))
    stop("anchor_corrupt");
  if (["target_claimed", "awaiting_consent"].includes(a.phase) !== (a.target !== null))
    stop("anchor_corrupt");
  return a;
}
export function validateAuthProof(
  p: AuthProof | null,
  e: TransitionEvidence,
  current: Identity,
): AuthProof {
  if (
    !p ||
    !text(p.attemptId) ||
    p.transitionId !== e.transitionId ||
    p.sourceOwner !== e.source.sourceGuestOwner ||
    p.sourceEpoch !== e.capturedIdentity.epoch ||
    p.sourceContextId !== e.capturedIdentity.contextId ||
    p.snapshotHash !== e.snapshotHash ||
    !text(p.uid) ||
    p.sessionUid !== p.uid ||
    p.sessionContinuity !== true ||
    !validIdentity(p.switchedIdentity) ||
    p.switchedIdentity.owner !== `user:${p.uid}` ||
    p.switchedIdentity.contextId !== e.capturedIdentity.contextId ||
    p.switchedIdentity.epoch !== e.capturedIdentity.epoch + 1 ||
    !validIdentity(p.currentIdentity) ||
    p.currentIdentity.owner !== `user:${p.uid}`
  )
    stop("auth_unverified");
  if (!equalIdentity(p.currentIdentity, current)) stop("identity_changed");
  if (
    p.currentIdentity.contextId === p.switchedIdentity.contextId &&
    p.currentIdentity.epoch !== p.switchedIdentity.epoch
  )
    stop("identity_changed");
  return p;
}
