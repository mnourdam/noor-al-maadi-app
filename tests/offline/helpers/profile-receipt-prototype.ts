/** Test-only contract model, NOT a ProfileProvider/storage implementation. */
import type { createWriterFence, FenceIdentity, OperationTicket } from "@/lib/rewards/writer-fence";
export type SyntheticProfile = { value: number; flags: string[] };
export type ChangeCommand = { kind: "increment"; by: number } | { kind: "flag"; flag: string };
interface Binding extends FenceIdentity {
  instanceId: string;
  generation: number;
  changeVersion: number;
}
export interface IncludedOperation {
  id: string;
  fingerprint: string;
  binding: Binding;
  firstIncludedRevision: number;
}
export interface SyntheticSnapshot {
  owner: string;
  revision: number;
  transactionId: string;
  profile: SyntheticProfile;
  includedOperations: IncludedOperation[];
}
export interface AcceptedChange {
  status: "accepted";
  id: string;
  command: ChangeCommand;
  fingerprint: string;
  binding: Binding;
  ticket: OperationTicket;
}
export interface BatchInput {
  binding: Omit<Binding, "changeVersion">;
  base: SyntheticSnapshot;
  changes: AcceptedChange[];
}
export interface ProfileFrame extends BatchInput {
  id: string;
  preview: SyntheticProfile;
}
export interface ProfileReceipt {
  transactionId: string;
  frameSignature: string;
  owner: string;
  revision: number;
  snapshot: SyntheticSnapshot;
  included: IncludedOperation[];
}
export interface AtomicProfileStore {
  read(owner: string): Promise<SyntheticSnapshot | undefined>;
  commit(frame: ProfileFrame, beforeWrite: () => void): Promise<ProfileReceipt>;
  authentic(receipt: ProfileReceipt): boolean;
  isCurrent(receipt: ProfileReceipt): boolean;
}
const clone = <T>(v: T): T => structuredClone(v);
function frozen<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const item of Object.values(v)) frozen(item);
    Object.freeze(v);
  }
  return v;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function apply(profile: SyntheticProfile, command: ChangeCommand): SyntheticProfile {
  if (command.kind === "increment") {
    if (!Number.isSafeInteger(command.by) || !Number.isSafeInteger(profile.value + command.by))
      throw new Error("prototype:invalid-command");
    return { ...profile, value: profile.value + command.by };
  }
  if (command.kind !== "flag" || typeof command.flag !== "string" || !command.flag.length)
    throw new Error("prototype:invalid-command");
  return profile.flags.includes(command.flag)
    ? profile
    : { ...profile, flags: [...profile.flags, command.flag] };
}
/** Pure reducer-like calculation over an immutable capture; safe to replay. No fence methods. */
export function computeProfileFrame(input: BatchInput): ProfileFrame {
  const captured = clone(input);
  let preview = clone(captured.base.profile);
  for (const change of captured.changes) {
    const existing = captured.base.includedOperations.find((o) => o.id === change.id);
    if (existing) {
      if (existing.fingerprint !== change.fingerprint)
        throw new Error("prototype:operation-conflict");
      continue;
    }
    preview = apply(preview, change.command);
  }
  return frozen({ ...captured, id: JSON.stringify(captured), preview });
}

/** One owner row contains profile AND inclusion ledger. Delays are OUTSIDE the atomic section. */
export class SyntheticAtomicStore implements AtomicProfileStore {
  private rows = new Map<string, SyntheticSnapshot>();
  private committedFrames = new Map<string, ProfileReceipt>();
  private receipts = new WeakSet<ProfileReceipt>();
  private tail: Promise<unknown> = Promise.resolve();
  private serial = 0;
  commits = 0;
  beforeAtomic?: (frame: ProfileFrame) => Promise<void> | void;
  duringAtomic?: () => void;
  afterCommit?: (receipt: ProfileReceipt) => Promise<void> | void;
  /** Fault injection: model an actually excluded/no-effect command, not a declared full batch. */
  excludeIds = new Set<string>();
  constructor(seeds: Array<{ owner: string; profile: SyntheticProfile }>) {
    for (const seed of seeds)
      this.rows.set(
        seed.owner,
        frozen({
          owner: seed.owner,
          revision: 0,
          transactionId: "synthetic-seed",
          profile: clone(seed.profile),
          includedOperations: [],
        }),
      );
  }
  async read(owner: string) {
    const row = this.rows.get(owner);
    return row ? clone(row) : undefined;
  }
  authentic(receipt: ProfileReceipt) {
    return !!receipt && this.receipts.has(receipt);
  }
  isCurrent(receipt: ProfileReceipt) {
    return (
      this.authentic(receipt) &&
      this.rows.get(receipt.owner)?.transactionId === receipt.transactionId
    );
  }
  async commit(frame: ProfileFrame, beforeWrite: () => void): Promise<ProfileReceipt> {
    const captured = frozen(clone(frame));
    await this.beforeAtomic?.(captured);
    const transaction = this.tail.then(() => {
      const duplicate = this.committedFrames.get(captured.id);
      if (duplicate) {
        if (duplicate.frameSignature !== JSON.stringify(captured))
          throw new Error("prototype:frame-conflict");
        return duplicate; // no new write, revision or effect
      }
      const current = this.rows.get(captured.binding.owner);
      if (!current || !same(current, captured.base))
        throw new Error("prototype:snapshot-CAS-conflict");
      beforeWrite();
      const next = clone(current),
        included: IncludedOperation[] = [];
      next.revision++;
      for (const change of captured.changes) {
        if (
          change.binding.owner !== current.owner ||
          change.fingerprint !== JSON.stringify(change.command)
        )
          throw new Error("prototype:change-conflict");
        const existing = next.includedOperations.find((o) => o.id === change.id);
        if (existing) throw new Error("prototype:operation-already-committed");
        if (this.excludeIds.has(change.id)) continue;
        const calculated = apply(next.profile, change.command);
        if (same(calculated, next.profile)) continue; // a no-effect computation is not inclusion evidence
        next.profile = calculated;
        const entry: IncludedOperation = {
          id: change.id,
          fingerprint: change.fingerprint,
          binding: clone(change.binding),
          firstIncludedRevision: next.revision,
        };
        next.includedOperations.push(entry);
        included.push(entry);
      }
      const result: unknown = this.duringAtomic?.();
      if (result && typeof (result as PromiseLike<unknown>).then === "function")
        throw new Error("prototype:async-inside-atomic-section");
      next.transactionId = `synthetic-transaction:${++this.serial}`;
      const snapshot = frozen(next);
      const receipt = frozen({
        transactionId: snapshot.transactionId,
        frameSignature: JSON.stringify(captured),
        owner: snapshot.owner,
        revision: snapshot.revision,
        snapshot,
        included: clone(included),
      });
      // Only this synchronous assignment publishes profile+ledger. No partial draft is visible.
      this.rows.set(snapshot.owner, snapshot);
      this.committedFrames.set(captured.id, receipt);
      this.receipts.add(receipt);
      this.commits++;
      return receipt;
    });
    this.tail = transaction.catch(() => {});
    const receipt = await transaction;
    await this.afterCommit?.(receipt); // response/ACK can be lost after the commit really happened
    return receipt;
  }
}

type Fence = ReturnType<typeof createWriterFence>;
export function createProfileReceiptPrototype(p: {
  fence: Fence;
  store: AtomicProfileStore;
  readIdentity(): FenceIdentity;
  writerId?: string;
}) {
  const initial = p.fence.snapshot().challenge;
  const binding = {
    owner: initial.owner,
    epoch: initial.epoch,
    instanceId: initial.instanceId,
    generation: initial.generation,
  };
  const writer = p.fence.registerWriter(p.writerId ?? "synthetic-profile");
  let base: SyntheticSnapshot | undefined,
    changeVersion = 0,
    projectionRevision = -1;
  const accepted = new Map<
    string,
    { change: AcceptedChange; computed: boolean; submitted: boolean; excluded: boolean }
  >();
  const submissions: Array<{ frameId: string; status: "submitted" | "committed" | "failed" }> = [];
  const acknowledged = new WeakSet<ProfileReceipt>();
  function current() {
    const now = p.readIdentity(),
      fence = p.fence.snapshot();
    if (
      now.owner !== binding.owner ||
      now.epoch !== binding.epoch ||
      fence.phase === "invalidated" ||
      fence.challenge.generation !== binding.generation
    )
      throw new Error("prototype:identity-or-generation-changed");
  }
  function checkFrame(frame: ProfileFrame) {
    current();
    if (
      !same(frame.binding, binding) ||
      frame.base.owner !== binding.owner ||
      frame.id !==
        JSON.stringify({ binding: frame.binding, base: frame.base, changes: frame.changes })
    )
      throw new Error("prototype:frame-conflict");
    const seen = new Set<string>();
    for (const change of frame.changes) {
      const op = accepted.get(change.id);
      if (!op || op.excluded || seen.has(change.id) || !same(op.change, change))
        throw new Error("prototype:operation-not-in-frame");
      seen.add(change.id);
    }
  }
  return {
    async refresh() {
      current();
      const loaded = await p.store.read(binding.owner);
      current();
      if (!loaded) throw new Error("prototype:missing-snapshot-no-default");
      base = frozen(clone(loaded));
      return clone(base);
    },
    accept(
      id: string,
      command: ChangeCommand,
    ): AcceptedChange | { status: "already_committed"; id: string; revision: number } {
      current();
      if (!base) throw new Error("prototype:load-required");
      const fingerprint = JSON.stringify(command),
        previous = accepted.get(id);
      if (previous) {
        if (previous.change.fingerprint !== fingerprint)
          throw new Error("prototype:operation-conflict");
        return previous.change;
      }
      const committed = base.includedOperations.find((o) => o.id === id);
      if (committed) {
        if (committed.fingerprint !== fingerprint) throw new Error("prototype:operation-conflict");
        return { status: "already_committed", id, revision: committed.firstIncludedRevision };
      }
      const ticket = writer.accept(id); // registration precedes computation or mutation
      const change: AcceptedChange = frozen({
        status: "accepted",
        id,
        command: clone(command),
        fingerprint,
        binding: { ...binding, changeVersion: ++changeVersion },
        ticket,
      });
      accepted.set(id, { change, computed: false, submitted: false, excluded: false });
      return change;
    },
    capture(ids: string[]): BatchInput {
      current();
      if (!base) throw new Error("prototype:load-required");
      const changes = ids.map((id) => {
        const op = accepted.get(id);
        if (!op || op.excluded) throw new Error("prototype:unknown-or-excluded-operation");
        return op.change;
      });
      return frozen(clone({ binding, base, changes }));
    },
    computationFinished(frame: ProfileFrame) {
      checkFrame(frame);
      for (const change of frame.changes) {
        const op = accepted.get(change.id)!;
        op.computed = true;
        writer.computationFinished(op.change.ticket);
      }
    },
    exclude(id: string) {
      current();
      const op = accepted.get(id);
      if (!op || op.submitted) throw new Error("prototype:cannot-exclude-submitted-operation");
      op.excluded = true; // never fabricates a durable disposition for its accepted fence ticket
    },
    async submit(frame: ProfileFrame): Promise<ProfileReceipt> {
      checkFrame(frame);
      for (const change of frame.changes) {
        const op = accepted.get(change.id)!;
        if (!op.computed) throw new Error("prototype:computation-not-finished");
        op.submitted = true;
      }
      const attempt = {
        frameId: frame.id,
        status: "submitted" as "submitted" | "committed" | "failed",
      };
      submissions.push(attempt);
      try {
        const receipt = await p.store.commit(frame, () => {
          checkFrame(frame);
          for (const change of frame.changes)
            if (!writer.canContinueAccepted(accepted.get(change.id)!.change.ticket))
              throw new Error("prototype:stale-callback");
        });
        attempt.status = "committed";
        current();
        return receipt;
      } catch (error) {
        attempt.status = "failed";
        throw error;
      }
    },
    acknowledge(frame: ProfileFrame, receipt: ProfileReceipt): string[] {
      checkFrame(frame);
      if (
        !p.store.authentic(receipt) ||
        receipt.owner !== binding.owner ||
        receipt.frameSignature !== JSON.stringify(frame) ||
        receipt.revision !== receipt.snapshot.revision ||
        receipt.transactionId !== receipt.snapshot.transactionId
      )
        throw new Error("prototype:unverified-receipt");
      const ids: string[] = [];
      for (const entry of receipt.included) {
        const op = accepted.get(entry.id);
        if (
          !op ||
          op.excluded ||
          !frame.changes.some((c) => c.id === entry.id) ||
          entry.fingerprint !== op.change.fingerprint ||
          !same(entry.binding, op.change.binding) ||
          !receipt.snapshot.includedOperations.some((o) => same(o, entry))
        )
          continue;
        if (
          writer.acknowledgeDurable(
            op.change.ticket,
            `${receipt.transactionId}:revision:${receipt.revision}:operation:${entry.id}:change:${entry.binding.changeVersion}`,
          )
        )
          ids.push(entry.id);
      }
      acknowledged.add(receipt);
      return ids;
    },
    publish(
      receipt: ProfileReceipt,
      updateProjection: (snapshot: SyntheticSnapshot) => void,
    ): boolean {
      current();
      if (
        !acknowledged.has(receipt) ||
        !p.store.isCurrent(receipt) ||
        receipt.revision <= projectionRevision
      )
        return false;
      updateProjection(clone(receipt.snapshot));
      projectionRevision = receipt.revision;
      return true;
    },
    inspect() {
      return {
        changes: [...accepted.values()].map((o) => ({
          id: o.change.id,
          binding: clone(o.change.binding),
          computed: o.computed,
          excluded: o.excluded,
        })),
        submissions: clone(submissions),
      };
    },
  };
}
