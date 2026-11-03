import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWriterFence, type CloseLease } from "@/lib/rewards/writer-fence";
class Scheduler {
  now = 0;
  serial = 0;
  tasks = new Map<number, { at: number; run: () => void }>();
  schedule = (delay: number, run: () => void) => {
    const id = ++this.serial;
    this.tasks.set(id, { at: this.now + delay, run });
    return () => {
      this.tasks.delete(id);
    };
  };
  advance(ms: number) {
    this.now += ms;
    for (;;) {
      const due = [...this.tasks]
        .filter(([, t]) => t.at <= this.now)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) return;
      this.tasks.delete(due[0]);
      due[1].run();
    }
  }
}
let identity: { owner: string; epoch: number }, scheduler: Scheduler;
function make(instanceId = "context-1") {
  return createWriterFence({
    instanceId,
    identity,
    readIdentity: () => identity,
    schedule: scheduler.schedule,
  });
}
async function proof(f: ReturnType<typeof make>, lease: CloseLease) {
  const result = await f.wait(lease, 100);
  expect(result.status).toBe("local_quiescent");
  if (result.status !== "local_quiescent") throw new Error("expected local proof");
  return result.proof;
}
beforeEach(() => {
  identity = { owner: "user:alice", epoch: 4 };
  scheduler = new Scheduler();
  for (const name of ["localStorage", "sessionStorage", "indexedDB"] as const)
    vi.stubGlobal(
      name,
      new Proxy(
        {},
        {
          get() {
            throw new Error("storage forbidden");
          },
        },
      ),
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("inactive writer fence: registered work, adapter durability and scoped quiescence", () => {
  it("closes an empty registered scope without claiming global exclusion", async () => {
    const f = make(),
      lease = f.requestClose();
    const p = await proof(f, lease);
    expect(f.snapshot()).toMatchObject({
      phase: "quiescent",
      localWork: "drained",
      globalWriterExclusion: "unproven",
      importDecision: "HOLD",
      continuity: "in_memory_only",
    });
    expect(p).toMatchObject({
      scope: "registered_participants",
      importDecision: "HOLD",
      globalWriterExclusion: "unproven",
    });
    expect(f.isProofCurrent(p)).toBe(true);
    expect(scheduler.tasks.size).toBe(0);
  });
  it("records accepted work before an adapter starts effects and waits while it runs", async () => {
    const f = make(),
      writer = f.registerWriter("profile"),
      ticket = writer.accept("op1");
    expect(f.snapshot().operations).toHaveLength(1);
    const lease = f.requestClose();
    let resolved = false;
    const waiting = f.wait(lease, 100).then((r) => {
      resolved = true;
      return r;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(f.snapshot().phase).toBe("closing");
    expect(writer.canContinueAccepted(ticket)).toBe(true);
    writer.computationFinished(ticket);
    writer.acknowledgeDurable(ticket, "profile-commit:1");
    expect((await waiting).status).toBe("local_quiescent");
  });
  it("computation completion alone never means durable saving", async () => {
    const f = make(),
      writer = f.registerWriter("profile"),
      ticket = writer.accept("op1");
    writer.computationFinished(ticket);
    const lease = f.requestClose(),
      waiting = f.wait(lease, 100);
    expect(f.snapshot().operations[0].state).toBe("awaiting_durability");
    expect(f.snapshot().phase).toBe("closing");
    scheduler.advance(100);
    expect((await waiting).status).toBe("timed_out");
    expect(f.snapshot().operations[0].state).toBe("awaiting_durability");
  });
  it("durable acknowledgement before the callback finishes also cannot end accepted work", async () => {
    const f = make(),
      writer = f.registerWriter("transaction"),
      ticket = writer.accept("op1");
    writer.acknowledgeDurable(ticket, "idb-complete:1");
    const lease = f.requestClose();
    const waiting = f.wait(lease, 100);
    expect(f.snapshot().phase).toBe("closing");
    writer.computationFinished(ticket);
    expect((await waiting).status).toBe("local_quiescent");
  });
  it("acknowledged completion drains one operation only, not its unfinished sibling", async () => {
    const f = make(),
      writer = f.registerWriter("profile"),
      a = writer.accept("a"),
      b = writer.accept("b");
    const lease = f.requestClose(),
      waiting = f.wait(lease, 100);
    writer.computationFinished(a);
    writer.acknowledgeDurable(a, "commit-a");
    expect(f.snapshot().localWork).toBe("unresolved");
    expect(f.snapshot().phase).toBe("closing");
    writer.computationFinished(b);
    writer.acknowledgeDurable(b, "commit-b");
    expect((await waiting).status).toBe("local_quiescent");
  });
  it("refuses new work and writer registration during closing", () => {
    const f = make(),
      writer = f.registerWriter("profile");
    writer.accept("first");
    f.requestClose();
    expect(() => writer.accept("second")).toThrow("admission-closed");
    expect(() => f.registerWriter("late")).toThrow("admission-closed");
    expect(f.snapshot().operations).toHaveLength(1);
  });
  it("generation change invalidates old callbacks without deleting unresolved accepted work", async () => {
    const f = make(),
      writer = f.registerWriter("profile"),
      ticket = writer.accept("op1");
    const before = f.snapshot().challenge.generation,
      lease = f.requestClose(),
      waiting = f.wait(lease, 100);
    f.invalidate("round_abandoned_pending_recovery");
    expect((await waiting).status).toBe("invalidated");
    expect(f.snapshot().challenge.generation).toBeGreaterThan(before);
    expect(writer.canContinueAccepted(ticket)).toBe(false);
    expect(writer.acknowledgeDurable(ticket, "late")).toBe(false);
    expect(writer.computationFinished(ticket)).toBe(false);
    expect(f.snapshot().operations).toHaveLength(1);
    expect(f.snapshot().localWork).toBe("unresolved");
  });
  it.each(["user:bob", "user:alice"])(
    "owner/epoch guard invalidates an in-flight Alice session on %s",
    (owner) => {
      const f = make(),
        writer = f.registerWriter("profile"),
        ticket = writer.accept("op1");
      identity = { owner, epoch: 5 };
      expect(writer.canContinueAccepted(ticket)).toBe(false);
      expect(f.snapshot().phase).toBe("invalidated");
      expect(f.snapshot().identity).toEqual({ owner: "user:alice", epoch: 4 });
      expect(f.snapshot().operations).toHaveLength(1);
    },
  );
  it("Alice → Bob → Alice never revives the old epoch", () => {
    const f = make(),
      writer = f.registerWriter("profile"),
      ticket = writer.accept("op1");
    identity = { owner: "user:bob", epoch: 5 };
    f.snapshot();
    identity = { owner: "user:alice", epoch: 6 };
    expect(writer.computationFinished(ticket)).toBe(false);
    expect(f.snapshot().phase).toBe("invalidated");
  });
  it("detects identity change during waiting at the next scheduled guard without calling it a timeout", async () => {
    const f = make(),
      writer = f.registerWriter("profile");
    writer.accept("op1");
    const lease = f.requestClose(),
      waiting = f.wait(lease, 100);
    identity.epoch++;
    scheduler.advance(100);
    expect((await waiting).status).toBe("invalidated");
    expect(f.snapshot().localWork).toBe("unresolved");
  });
  it("storage failure is explicit and does not discard accepted work or make a successful round", async () => {
    const f = make(),
      writer = f.registerWriter("profile"),
      ticket = writer.accept("op1");
    writer.computationFinished(ticket);
    const lease = f.requestClose(),
      waiting = f.wait(lease, 100);
    writer.storageFailed(ticket, "quota");
    expect((await waiting).status).toBe("failed");
    expect(f.snapshot().operations[0]).toMatchObject({
      state: "storage_failed",
      storageFailures: ["quota"],
    });
    expect(f.snapshot().phase).toBe("failed");
    expect(f.release(lease).released).toBe(false);
    // A later real adapter receipt may be recorded, but never silently clears the failed round.
    writer.acknowledgeDurable(ticket, "retry-commit");
    expect(f.snapshot().operations[0].state).toBe("settled");
    expect(f.snapshot().phase).toBe("failed");
    expect(f.snapshot().importDecision).toBe("HOLD");
  });
  it("timeout leaves operation and close lease unresolved; a later receipt can drain them", async () => {
    const f = make(),
      writer = f.registerWriter("profile"),
      ticket = writer.accept("op1");
    const lease = f.requestClose(),
      waiting = f.wait(lease, 100);
    scheduler.advance(100);
    expect((await waiting).status).toBe("timed_out");
    expect(f.snapshot()).toMatchObject({
      phase: "closing",
      activeLeases: 1,
      localWork: "unresolved",
    });
    writer.computationFinished(ticket);
    writer.acknowledgeDurable(ticket, "commit");
    const p = await proof(f, lease);
    expect(f.release(lease, p).released).toBe(true);
    expect(f.snapshot().phase).toBe("open");
  });
  it("cancelling a wait never releases the gate or drops its operation", async () => {
    const f = make(),
      writer = f.registerWriter("profile"),
      ticket = writer.accept("op1");
    const lease = f.requestClose(),
      waiting = f.wait(lease, 100);
    expect(f.cancelWait(lease)).toBe(true);
    expect((await waiting).status).toBe("cancelled");
    expect(scheduler.tasks.size).toBe(0);
    expect(f.snapshot()).toMatchObject({
      phase: "closing",
      activeLeases: 1,
      localWork: "unresolved",
    });
    writer.computationFinished(ticket);
    writer.acknowledgeDurable(ticket, "commit");
    expect(f.release(lease, await proof(f, lease)).released).toBe(true);
  });
  it("two close callers share the pause but both leases must release before admission reopens", async () => {
    const f = make(),
      a = f.requestClose(),
      b = f.requestClose();
    expect(a.round).toBe(b.round);
    const pa = await proof(f, a),
      pb = await proof(f, b);
    expect(f.release(a, pa).released).toBe(true);
    expect(f.snapshot()).toMatchObject({ phase: "quiescent", activeLeases: 1 });
    expect(() => f.registerWriter("too-early")).toThrow("admission-closed");
    expect(f.release(b, pb).released).toBe(true);
    expect(f.snapshot().phase).toBe("open");
  });
  it("repeated wait on the same active lease is single-flight", async () => {
    const f = make(),
      writer = f.registerWriter("profile");
    writer.accept("op1");
    const lease = f.requestClose();
    const one = f.wait(lease, 100),
      two = f.wait(lease, 200);
    expect(one).toBe(two);
    expect(scheduler.tasks.size).toBe(1);
    f.cancelWait(lease);
    expect((await one).status).toBe("cancelled");
  });
  it("waits for another registered participant's ACK as well as local drain", async () => {
    const f = make();
    f.registerParticipant("tab-2", "boot-2");
    const lease = f.requestClose();
    const waiting = f.wait(lease, 100),
      request = f.snapshot().challenge;
    expect(f.snapshot()).toMatchObject({ phase: "closing", localWork: "drained" });
    scheduler.advance(50);
    expect(
      f.acknowledgeParticipant("tab-2", {
        ...request,
        incarnation: "boot-2",
        unresolved: 1,
        durable: true,
      }),
    ).toBe(false);
    expect(
      f.acknowledgeParticipant("tab-2", {
        ...request,
        incarnation: "boot-2",
        unresolved: 0,
        durable: false,
      }),
    ).toBe(false);
    expect(
      f.acknowledgeParticipant("tab-2", {
        ...request,
        incarnation: "boot-2",
        unresolved: 0,
        durable: true,
      }),
    ).toBe(true);
    expect((await waiting).status).toBe("local_quiescent");
    expect(f.snapshot().importDecision).toBe("HOLD");
  });
  it("a known context reconnect revokes its old ACK and previously issued proof", async () => {
    const f = make();
    f.registerParticipant("tab-2", "old");
    const lease = f.requestClose();
    const old = { ...f.snapshot().challenge, incarnation: "old", unresolved: 0, durable: true };
    f.acknowledgeParticipant("tab-2", old);
    const p = await proof(f, lease);
    f.disconnectParticipant("tab-2");
    expect(f.isProofCurrent(p)).toBe(false);
    expect(f.release(lease, p).released).toBe(false);
    f.registerParticipant("tab-2", "new");
    expect(f.acknowledgeParticipant("tab-2", old)).toBe(false);
    const waiting = f.wait(lease, 100);
    expect(
      f.acknowledgeParticipant("tab-2", {
        ...f.snapshot().challenge,
        incarnation: "new",
        unresolved: 0,
        durable: true,
      }),
    ).toBe(true);
    expect((await waiting).status).toBe("local_quiescent");
  });
  it("a newly known participant invalidates the roster challenge for all acknowledgements", async () => {
    const f = make();
    f.registerParticipant("tab-2", "b2");
    const lease = f.requestClose();
    const old = f.snapshot().challenge;
    f.acknowledgeParticipant("tab-2", { ...old, incarnation: "b2", unresolved: 0, durable: true });
    const p = await proof(f, lease);
    f.registerParticipant("tab-3", "b3");
    expect(f.isProofCurrent(p)).toBe(false);
    expect(
      f.acknowledgeParticipant("tab-2", {
        ...old,
        incarnation: "b2",
        unresolved: 0,
        durable: true,
      }),
    ).toBe(false);
    const current = f.snapshot().challenge;
    f.acknowledgeParticipant("tab-3", {
      ...current,
      incarnation: "b3",
      unresolved: 0,
      durable: true,
    });
    expect(f.snapshot().phase).toBe("closing");
    f.acknowledgeParticipant("tab-2", {
      ...current,
      incarnation: "b2",
      unresolved: 0,
      durable: true,
    });
    await proof(f, lease);
  });
  it("a disconnected or silent known participant is never removed by timeout", async () => {
    const f = make();
    f.registerParticipant("tab-2", "b2");
    f.disconnectParticipant("tab-2");
    const lease = f.requestClose(),
      waiting = f.wait(lease, 100);
    scheduler.advance(100);
    expect((await waiting).status).toBe("timed_out");
    expect(f.snapshot().participants[0].state).toBe("disconnected");
    expect(f.snapshot().phase).toBe("closing");
  });
  it("legacy/nonparticipating writers remain explicit HOLD blockers after every known participant ACKs", async () => {
    const f = make();
    f.noteUnknownWriter("old-webview-uncooperative");
    const lease = f.requestClose(),
      p = await proof(f, lease);
    expect(f.snapshot().unknownWriterBlockers).toContain("old-webview-uncooperative");
    expect(p.globalWriterExclusion).toBe("unproven");
    expect(p.importDecision).toBe("HOLD");
  });
  it("context restart loses no claimed durability: old work becomes unknown continuity, never a global proof", async () => {
    const old = make("old-boot"),
      writer = old.registerWriter("profile"),
      ticket = writer.accept("op1");
    const fresh = make("new-boot"),
      lease = fresh.requestClose(),
      p = await proof(fresh, lease);
    expect(fresh.snapshot().unknownWriterBlockers).toContain("prior_context_work_not_reconciled");
    expect(fresh.snapshot().continuity).toBe("in_memory_only");
    expect(p.importDecision).toBe("HOLD");
    expect(fresh.isProofCurrent({ ...p, instanceId: "old-boot" })).toBe(false);
    expect(fresh.registerWriter).toBeTypeOf("function");
    expect(old.snapshot().operations[0].state).toBe("running");
    expect(writer.canContinueAccepted(ticket)).toBe(true); // only the old live instance knows this job
  });
  it("release before completion or using a forged/cross-core proof cannot reopen admission", async () => {
    const f = make(),
      writer = f.registerWriter("profile"),
      ticket = writer.accept("op1"),
      lease = f.requestClose();
    expect(f.release(lease).released).toBe(false);
    writer.computationFinished(ticket);
    writer.acknowledgeDurable(ticket, "commit");
    const p = await proof(f, lease);
    expect(f.release(lease, { ...p }).released).toBe(false);
    const other = make("other"),
      otherLease = other.requestClose(),
      otherProof = await proof(other, otherLease);
    expect(f.release(lease, otherProof).released).toBe(false);
    expect(f.release(lease, p).released).toBe(true);
  });
  it("release increments generation and an old writer adapter cannot admit fresh work", async () => {
    const f = make(),
      writer = f.registerWriter("profile"),
      ticket = writer.accept("op1");
    writer.computationFinished(ticket);
    writer.acknowledgeDurable(ticket, "commit");
    const lease = f.requestClose(),
      before = f.snapshot().challenge.generation;
    f.release(lease, await proof(f, lease));
    expect(f.snapshot().challenge.generation).toBeGreaterThan(before);
    expect(writer.canContinueAccepted(ticket)).toBe(false);
    expect(writer.acknowledgeDurable(ticket, "late")).toBe(false);
    expect(() => writer.accept("op2")).toThrow("admission-closed");
    const next = f.registerWriter("profile");
    expect(next.accept("op2").generation).toBeGreaterThan(ticket.generation);
    expect(() => next.accept("op1")).toThrow("already-registered");
  });
  it("rejects duplicate admission and does not replace a writer with unresolved accepted work", () => {
    const f = make(),
      w = f.registerWriter("profile");
    w.accept("op1");
    expect(() => w.accept("op1")).toThrow("already-registered");
    expect(() => f.registerWriter("profile")).toThrow("unresolved-work");
    expect(f.snapshot().operations).toHaveLength(1);
  });
  it("duplicate matching durable receipts are harmless but conflicting ones fail closed", () => {
    const f = make(),
      w = f.registerWriter("profile"),
      t = w.accept("op1");
    expect(w.acknowledgeDurable(t, "commit")).toBe(true);
    expect(w.acknowledgeDurable(t, "commit")).toBe(true);
    expect(w.acknowledgeDurable(t, "other")).toBe(false);
    expect(f.snapshot().phase).toBe("failed");
    expect(f.snapshot().operations[0].durabilityReceipt).toBe("commit");
  });
  it("identity getter failure invalidates rather than releasing work", () => {
    const f = createWriterFence({
      instanceId: "denied",
      identity,
      readIdentity: () => {
        throw new Error("denied");
      },
      schedule: scheduler.schedule,
    });
    expect(f.snapshot().phase).toBe("invalidated");
    expect(() => f.requestClose()).toThrow("identity-invalidated");
  });
  it("the injected scheduler can fail without forgetting accepted operations", async () => {
    const f = createWriterFence({
      instanceId: "timer-fail",
      identity,
      readIdentity: () => identity,
      schedule: () => {
        throw new Error("timer failure");
      },
    });
    f.registerWriter("profile").accept("op1");
    const lease = f.requestClose();
    expect((await f.wait(lease, 100)).status).toBe("failed");
    expect(f.snapshot().localWork).toBe("unresolved");
  });
  it("does not execute application/storage/network effects or expose mutable internal snapshots", async () => {
    const f = make(),
      w = f.registerWriter("profile"),
      t = w.accept("op1");
    const snapshot = f.snapshot();
    snapshot.operations.length = 0;
    snapshot.unknownWriterBlockers.length = 0;
    expect(f.snapshot().operations).toHaveLength(1);
    expect(f.snapshot().unknownWriterBlockers.length).toBeGreaterThan(0);
    w.computationFinished(t);
    w.acknowledgeDurable(t, "synthetic adapter receipt");
    const lease = f.requestClose();
    await proof(f, lease);
    expect(fetch).not.toHaveBeenCalled();
    expect(f.snapshot().importDecision).toBe("HOLD");
  });
  it("is not imported by any production source entry point or writer", () => {
    const importedBy: string[] = [];
    function scan(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) scan(path);
        else if (
          /\.tsx?$/.test(entry.name) &&
          entry.name !== "writer-fence.ts" &&
          /(?:from\s*|import\s*\(|require\s*\()[\s]*["'][^"']*writer-fence["']/.test(
            readFileSync(path, "utf8"),
          )
        )
          importedBy.push(path);
      }
    }
    scan(join(process.cwd(), "src"));
    expect(importedBy).toEqual([]);
  });
});
