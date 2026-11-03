/** Inactive in-memory protocol core. No storage, network, React or discovery integration. */
export type FencePhase = "open" | "closing" | "quiescent" | "failed" | "invalidated";
export interface FenceIdentity {
  owner: string;
  epoch: number;
}
export interface FenceChallenge extends FenceIdentity {
  instanceId: string;
  generation: number;
  round: number;
  revision: number;
}
export interface OperationTicket extends FenceIdentity {
  readonly instanceId: string;
  readonly writer: string;
  readonly id: string;
  readonly generation: number;
  readonly sequence: number;
}
export interface CloseLease {
  readonly instanceId: string;
  readonly id: number;
  readonly round: number;
  readonly generation: number;
}
export interface LocalQuiescenceProof extends FenceChallenge {
  readonly scope: "registered_participants";
  readonly globalWriterExclusion: "unproven";
  readonly importDecision: "HOLD";
}
export interface FenceSnapshot {
  phase: FencePhase;
  identity: FenceIdentity;
  challenge: FenceChallenge;
  reason?: string;
  localWork: "unresolved" | "drained";
  operations: Array<{
    writer: string;
    id: string;
    generation: number;
    computationFinished: boolean;
    state: "running" | "awaiting_durability" | "storage_failed" | "settled";
    durabilityReceipt?: string;
    storageFailures: string[];
  }>;
  participants: Array<{
    id: string;
    incarnation: string;
    state: "disconnected" | "awaiting_ack" | "acknowledged";
  }>;
  activeLeases: number;
  globalWriterExclusion: "unproven";
  continuity: "in_memory_only";
  unknownWriterBlockers: string[];
  importDecision: "HOLD";
}
export type FenceWaitResult =
  | { status: "local_quiescent"; proof: LocalQuiescenceProof; snapshot: FenceSnapshot }
  | { status: "timed_out" | "cancelled" | "failed" | "invalidated"; snapshot: FenceSnapshot };
export interface WriterAdapter {
  accept(operationId: string): OperationTicket;
  canContinueAccepted(ticket: OperationTicket): boolean;
  computationFinished(ticket: OperationTicket): boolean;
  acknowledgeDurable(ticket: OperationTicket, receipt: string): boolean;
  storageFailed(ticket: OperationTicket, reason: string): boolean;
}
export interface WriterFenceDependencies {
  instanceId: string;
  identity: FenceIdentity;
  /** Must be pure and already boot-resolved, unlike a lazy owner bootstrap. */
  readIdentity(): FenceIdentity;
  schedule(delayMs: number, callback: () => void): () => void;
}
interface Operation {
  ticket: OperationTicket;
  writerRegistration: number;
  computed: boolean;
  receipt?: string;
  failures: string[];
}
interface Participant {
  incarnation: string;
  connected: boolean;
  ackRevision?: number;
}
interface Waiter {
  lease: CloseLease;
  promise: Promise<FenceWaitResult>;
  resolve(result: FenceWaitResult): void;
  cancelTimer(): void;
}
const nonempty = (v: string) => typeof v === "string" && v.length > 0;
function requireText(v: string) {
  if (!nonempty(v)) throw new Error("writer-fence:invalid-identifier");
}

export function createWriterFence(deps: WriterFenceDependencies) {
  const owner = deps.identity.owner,
    epoch = deps.identity.epoch,
    instanceId = deps.instanceId;
  requireText(instanceId);
  if (!/^(user|guest):.+/.test(owner) || !Number.isSafeInteger(epoch) || epoch < 0)
    throw new Error("writer-fence:invalid-identity");
  let phase: FencePhase = "open",
    reason: string | undefined;
  let generation = 1,
    round = 0,
    revision = 0,
    sequence = 0,
    registration = 0,
    leaseId = 0;
  const writers = new Map<string, number>();
  const operations = new Map<OperationTicket, Operation>();
  const operationIds = new Set<string>();
  const participants = new Map<string, Participant>();
  const leases = new Map<number, CloseLease>();
  const waiters = new Map<number, Waiter>();
  const proofs = new WeakSet<LocalQuiescenceProof>();
  const unknown = new Set([
    "global_writer_exclusion_unproven",
    "prior_context_work_not_reconciled",
  ]);
  const challenge = (): FenceChallenge => ({
    owner,
    epoch,
    instanceId,
    generation,
    round,
    revision,
  });
  const settled = (o: Operation) => o.computed && o.receipt !== undefined;
  function view(): FenceSnapshot {
    const jobs = [...operations.values()];
    return {
      phase,
      identity: { owner, epoch },
      challenge: challenge(),
      reason,
      localWork: jobs.some((o) => !settled(o)) ? "unresolved" : "drained",
      operations: jobs.map((o) => ({
        writer: o.ticket.writer,
        id: o.ticket.id,
        generation: o.ticket.generation,
        computationFinished: o.computed,
        state: settled(o)
          ? "settled"
          : o.failures.length
            ? "storage_failed"
            : o.computed
              ? "awaiting_durability"
              : "running",
        durabilityReceipt: o.receipt,
        storageFailures: [...o.failures],
      })),
      participants: [...participants].map(([id, p]) => ({
        id,
        incarnation: p.incarnation,
        state: !p.connected
          ? "disconnected"
          : p.ackRevision === revision
            ? "acknowledged"
            : "awaiting_ack",
      })),
      activeLeases: leases.size,
      globalWriterExclusion: "unproven",
      continuity: "in_memory_only",
      unknownWriterBlockers: [...unknown],
      importDecision: "HOLD",
    };
  }
  function resolveWaiter(w: Waiter, result: FenceWaitResult) {
    if (waiters.get(w.lease.id) !== w) return;
    waiters.delete(w.lease.id);
    try {
      w.cancelTimer();
    } catch {
      /* obsolete timeout callbacks are also fenced by waiter identity */
    }
    w.resolve(result);
  }
  function pump() {
    if (
      phase === "closing" &&
      [...operations.values()].every(settled) &&
      [...participants.values()].every((p) => p.connected && p.ackRevision === revision)
    )
      phase = "quiescent";
    for (const w of [...waiters.values()]) {
      if (phase === "quiescent") {
        const proof: LocalQuiescenceProof = Object.freeze({
          ...challenge(),
          scope: "registered_participants",
          globalWriterExclusion: "unproven",
          importDecision: "HOLD",
        });
        proofs.add(proof);
        resolveWaiter(w, { status: "local_quiescent", proof, snapshot: view() });
      } else if (phase === "failed" || phase === "invalidated")
        resolveWaiter(w, { status: phase, snapshot: view() });
    }
  }
  function invalidate(cause: string) {
    requireText(cause);
    if (phase !== "invalidated") {
      phase = "invalidated";
      reason = cause;
      generation++;
      revision++;
    }
    pump();
  }
  function identityMatches(): boolean {
    if (phase === "invalidated") return false;
    try {
      const now = deps.readIdentity();
      if (now.owner === owner && now.epoch === epoch) return true;
    } catch {
      /* an unavailable identity cannot authorize effects */
    }
    invalidate("identity_changed_or_unavailable");
    return false;
  }
  function fail(cause: string) {
    if (phase === "invalidated") return;
    phase = "failed";
    reason = cause;
    pump();
  }
  function assertIdentity() {
    if (!identityMatches()) throw new Error("writer-fence:identity-invalidated");
  }
  function currentOperation(
    ticket: OperationTicket,
    writerId: string,
    reg: number,
  ): Operation | undefined {
    if (!identityMatches() || writers.get(writerId) !== reg || ticket.generation !== generation)
      return;
    const op = operations.get(ticket);
    return op?.ticket.writer === writerId && op.writerRegistration === reg ? op : undefined;
  }
  function revokeParticipantProofs() {
    revision++;
    if (phase === "quiescent") phase = "closing";
    // Every registered participant must ACK the new challenge, not an obsolete roster.
    for (const p of participants.values()) p.ackRevision = undefined;
    pump();
  }
  function validLease(lease: CloseLease): boolean {
    return (
      !!lease &&
      leases.get(lease.id) === lease &&
      lease.round === round &&
      lease.generation === generation
    );
  }
  function isProofCurrent(proof: LocalQuiescenceProof): boolean {
    return (
      identityMatches() &&
      !!proof &&
      proofs.has(proof) &&
      phase === "quiescent" &&
      proof.instanceId === instanceId &&
      proof.generation === generation &&
      proof.round === round &&
      proof.revision === revision
    );
  }
  return {
    registerWriter(writerId: string): WriterAdapter {
      requireText(writerId);
      assertIdentity();
      if (phase !== "open") throw new Error("writer-fence:admission-closed");
      const reg = ++registration,
        writerGeneration = generation;
      if (
        writers.has(writerId) &&
        [...operations.values()].some((o) => o.ticket.writer === writerId && !settled(o))
      )
        throw new Error("writer-fence:writer-has-unresolved-work");
      writers.set(writerId, reg);
      return {
        accept(id) {
          requireText(id);
          assertIdentity();
          if (phase !== "open" || generation !== writerGeneration || writers.get(writerId) !== reg)
            throw new Error("writer-fence:admission-closed");
          const logical = JSON.stringify([writerId, id]);
          if (operationIds.has(logical))
            throw new Error("writer-fence:operation-already-registered");
          const ticket: OperationTicket = Object.freeze({
            owner,
            epoch,
            instanceId,
            writer: writerId,
            id,
            generation,
            sequence: ++sequence,
          });
          operations.set(ticket, {
            ticket,
            writerRegistration: reg,
            computed: false,
            failures: [],
          });
          operationIds.add(logical);
          return ticket;
        },
        canContinueAccepted(ticket) {
          const o = currentOperation(ticket, writerId, reg);
          return !!o && !settled(o);
        },
        computationFinished(ticket) {
          const o = currentOperation(ticket, writerId, reg);
          if (!o) return false;
          o.computed = true;
          pump();
          return true;
        },
        acknowledgeDurable(ticket, receipt) {
          requireText(receipt);
          const o = currentOperation(ticket, writerId, reg);
          if (!o) return false;
          if (o.receipt !== undefined && o.receipt !== receipt) {
            fail("conflicting_durability_ack");
            return false;
          }
          o.receipt = receipt;
          pump();
          return true;
        },
        storageFailed(ticket, cause) {
          requireText(cause);
          const o = currentOperation(ticket, writerId, reg);
          if (!o || settled(o)) return false;
          o.failures.push(cause);
          fail("accepted_operation_storage_failed");
          return true;
        },
      };
    },
    requestClose(): CloseLease {
      assertIdentity();
      if (phase === "open") {
        phase = "closing";
        round++;
        revision++;
        for (const p of participants.values()) p.ackRevision = undefined;
      }
      const lease: CloseLease = Object.freeze({ instanceId, id: ++leaseId, round, generation });
      leases.set(lease.id, lease);
      pump();
      return lease;
    },
    wait(lease: CloseLease, timeoutMs: number): Promise<FenceWaitResult> {
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
        throw new Error("writer-fence:invalid-timeout");
      if (!identityMatches() || !validLease(lease))
        return Promise.resolve({ status: "invalidated", snapshot: view() });
      const existing = waiters.get(lease.id);
      if (existing) return existing.promise;
      let resolve!: (result: FenceWaitResult) => void;
      const promise = new Promise<FenceWaitResult>((done) => {
        resolve = done;
      });
      const w: Waiter = { lease, promise, resolve, cancelTimer: () => {} };
      waiters.set(lease.id, w);
      pump();
      if (waiters.get(lease.id) === w) {
        try {
          const cancel = deps.schedule(timeoutMs, () => {
            if (!identityMatches()) return;
            resolveWaiter(w, { status: "timed_out", snapshot: view() });
          });
          w.cancelTimer = cancel;
          if (waiters.get(lease.id) !== w) {
            try {
              cancel();
            } catch {
              /* already resolved */
            }
          }
        } catch {
          fail("wait_scheduler_failed");
        }
      }
      return promise;
    },
    cancelWait(lease: CloseLease): boolean {
      identityMatches();
      const w = waiters.get(lease.id);
      if (!w || w.lease !== lease) return false;
      resolveWaiter(w, { status: "cancelled", snapshot: view() });
      return true;
    },
    isProofCurrent,
    release(
      lease: CloseLease,
      proof?: LocalQuiescenceProof,
    ): { released: boolean; reason?: string } {
      if (!identityMatches() || !validLease(lease))
        return { released: false, reason: "invalid_lease_or_identity" };
      if (!proof || !isProofCurrent(proof))
        return { released: false, reason: "local_quiescence_not_current" };
      leases.delete(lease.id);
      if (!leases.size) {
        phase = "open";
        generation++;
        revision++;
        for (const p of participants.values()) p.ackRevision = undefined;
      }
      return { released: true };
    },
    registerParticipant(id: string, incarnation: string) {
      requireText(id);
      requireText(incarnation);
      assertIdentity();
      if (phase === "failed") throw new Error("writer-fence:round-failed");
      const p = participants.get(id);
      if (p?.incarnation === incarnation && p.connected) return;
      participants.set(id, { incarnation, connected: true });
      revokeParticipantProofs();
    },
    disconnectParticipant(id: string): boolean {
      assertIdentity();
      const p = participants.get(id);
      if (!p) return false;
      p.connected = false;
      revokeParticipantProofs();
      return true;
    },
    acknowledgeParticipant(
      id: string,
      ack: FenceChallenge & { incarnation: string; unresolved: number; durable: boolean },
    ): boolean {
      if (!identityMatches() || (phase !== "closing" && phase !== "quiescent")) return false;
      const p = participants.get(id),
        current = challenge();
      if (
        !p ||
        !p.connected ||
        p.incarnation !== ack.incarnation ||
        ack.unresolved !== 0 ||
        ack.durable !== true ||
        (Object.keys(current) as Array<keyof FenceChallenge>).some((k) => current[k] !== ack[k])
      )
        return false;
      p.ackRevision = revision;
      pump();
      return true;
    },
    noteUnknownWriter(blocker: string) {
      requireText(blocker);
      unknown.add(blocker);
    },
    invalidate,
    snapshot(): FenceSnapshot {
      identityMatches();
      return view();
    },
  };
}
