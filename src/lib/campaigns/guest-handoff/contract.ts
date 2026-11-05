/** Inactive foundation. These facts authorize neither transfer nor reward delivery. */
export interface Identity {
  owner: string;
  epoch: number;
  contextId: string;
  ready: boolean;
}
export type Phase =
  | "awaiting_target"
  | "awaiting_consent"
  | "approved"
  | "declined"
  | "cancelled"
  | "blocked";
export interface SourceAddress {
  deviceId: string;
  sourceGuestOwner: string;
  physicalKey: string;
  schema: "buffer-v1";
  generation: 1;
}
export interface Source extends SourceAddress {
  schemaVersion: 1;
  sourceId: string;
  address: string;
  handoffId: string;
  boundUid: string | null;
}
export interface Attempt {
  id: string;
  action: "capture" | "bind" | "approve" | "decline" | "cancel" | "block";
  owner: string;
  epoch: number;
  contextId: string;
  at: number;
}
export interface Handoff {
  schemaVersion: 1;
  id: string;
  sourceId: string;
  sourceAddress: string;
  transitionId: string;
  snapshot: string;
  snapshotHash: string;
  provenance: "captured_active_guest" | "legacy_captured_now";
  capturedIdentity: Identity;
  target: null | { uid: string; verifiedAt: number };
  consent: null | {
    uid: string;
    snapshotHash: string;
    policyVersion: 1;
    decision: "approve" | "decline";
  };
  phase: Phase;
  blockedReason: string | null;
  revision: number;
  attempts: Attempt[];
  /** Permanent stage marker: no consumer may interpret approval as transfer confirmation. */
  mode: "foundation_only";
}
export type Reason =
  | "invalid_input"
  | "identity_changed"
  | "source_conflict"
  | "target_conflict"
  | "transition_conflict"
  | "snapshot_conflict"
  | "revision_conflict"
  | "legacy_unknown"
  | "corrupt"
  | "not_found"
  | "storage_unresolved"
  | "invalid_state";
export class HandoffError extends Error {
  constructor(public readonly reason: Reason) {
    super(`guest-handoff:${reason}`);
  }
}
export function fail(reason: Reason): never {
  throw new HandoffError(reason);
}
export interface GuestCapturePort {
  /** Trusted adapter: exact source only, no namespace enumeration. Lock/read-only. */
  address: SourceAddress;
  persistedDeviceId: string;
  provenance: "captured_active_guest" | "legacy_captured_now" | "legacy_unknown";
  withSnapshot<T>(work: (raw: string) => Promise<T>): Promise<T>;
}
export interface Dependencies {
  db: IDBDatabase;
  identity(): Identity;
  /** Must notify synchronously on identity invalidation, including context disposal. */
  subscribeInvalidation(callback: () => void): () => void;
  /** Trusted auth adapter: verify actual user, fresh session and original transition.
   * For bound recovery transitionId may be null: still verify the same actual UID.
   * A current login or caller-supplied UID alone is insufficient. Never store tokens. */
  verifyTarget(
    uid: string,
    transitionId: string | null,
  ): Promise<{ uid: string; transitionId: string | null }>;
  hash(raw: string): Promise<string>;
  newId(): string;
  now(): number;
}
