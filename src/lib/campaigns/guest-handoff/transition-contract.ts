/** Prototype contracts only: no tokens, SDK, production anchor provisioning or login hooks. */
import type { Dependencies, GuestCapturePort, Identity, SourceAddress } from "./contract";
export interface TransitionEvidence {
  transitionId: string;
  source: SourceAddress;
  capturedIdentity: Identity;
  provenance: GuestCapturePort["provenance"];
  snapshotHash: string;
  sourceId: string;
  handoffId: string;
}
export interface AuthProof {
  transitionId: string;
  attemptId: string;
  sourceOwner: string;
  sourceEpoch: number;
  sourceContextId: string;
  snapshotHash: string;
  uid: string;
  sessionUid: string;
  /** Historical transition receipt; not a restart epoch authorization. */
  switchedIdentity: Identity;
  /** Fresh context/session verification, including continuity with the original attempt. */
  currentIdentity: Identity;
  sessionContinuity: true;
}
export interface AuthTransitionAdapter {
  /** null means ordinary login, with NO handoff source authority. */
  authenticate(evidence: TransitionEvidence | null): Promise<void>;
  /** Reverify actual session + original attempt on every call; null if unprovable. */
  verify(evidence: TransitionEvidence): Promise<AuthProof | null>;
}
export interface Anchor {
  schema: 1;
  address: string;
  revision: number;
  /** enrolled is provisioned only by the synthetic fixture, never from missing storage. */
  phase:
    | "enrolled"
    | "prepared"
    | "captured"
    | "auth_started"
    | "target_claimed"
    | "awaiting_consent";
  evidence: TransitionEvidence | null;
  target: null | { uid: string; attemptId: string };
}
export interface AnchorPort {
  /** Exact source address selected BEFORE auth; never inferred from current user. */
  address: SourceAddress;
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  read(): Promise<unknown>;
  /** Compare revisions under this port's cooperative exclusive lock.
   * Never presented as localStorage CAS or an LS/IDB transaction. */
  write(next: Anchor, expectedRevision: number): Promise<void>;
}
export interface TransitionDependencies {
  foundation: Dependencies;
  source(): GuestCapturePort;
  anchor: AnchorPort;
  auth: AuthTransitionAdapter;
  /** Test-only exact-source capability, held through bind; no namespace search.
   * A production cross-owner source capability has NOT been implemented. */
  recoveredSnapshot<T>(evidence: TransitionEvidence, work: (raw: string) => Promise<T>): Promise<T>;
}
export interface TransitionOutcome {
  state: "awaiting_auth" | "awaiting_consent" | "blocked" | "timed_out";
  reason: string | null;
  normalLoginAllowed: true;
  /** A timeout or error is NOT evidence that storage/auth stopped. */
  handoffConfirmed: false;
}
export interface TransitionHandle {
  result: Promise<TransitionOutcome>;
  settled: Promise<TransitionOutcome>;
  authWork(): Promise<void> | null;
}
