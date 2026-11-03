import React, { StrictMode, forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWriterFence } from "@/lib/rewards/writer-fence";
import {
  computeProfileFrame,
  createProfileReceiptPrototype,
  SyntheticAtomicStore,
  type BatchInput,
  type ProfileFrame,
  type SyntheticSnapshot,
} from "./helpers/profile-receipt-prototype";
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
    for (const [id, t] of [...this.tasks])
      if (t.at <= this.now) {
        this.tasks.delete(id);
        t.run();
      }
  }
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function store() {
  return new SyntheticAtomicStore([
    { owner: "user:alice", profile: { value: 0, flags: [] } },
    { owner: "user:bob", profile: { value: 100, flags: [] } },
  ]);
}
async function context(storage = store(), instanceId = "boot-1") {
  const identity = { owner: "user:alice", epoch: 4 },
    scheduler = new Scheduler();
  const fence = createWriterFence({
    instanceId,
    identity,
    readIdentity: () => identity,
    schedule: scheduler.schedule,
  });
  const adapter = createProfileReceiptPrototype({
    fence,
    store: storage,
    readIdentity: () => identity,
  });
  const base = await adapter.refresh();
  return { storage, identity, scheduler, fence, adapter, base };
}
type Context = Awaited<ReturnType<typeof context>>;
function accept(c: Context, id = "a", by = 1) {
  return c.adapter.accept(id, { kind: "increment", by });
}
function compute(c: Context, ids = ["a"]) {
  const frame = computeProfileFrame(c.adapter.capture(ids));
  c.adapter.computationFinished(frame);
  return frame;
}
async function saved(c: Context, ids = ["a"]) {
  const frame = compute(c, ids),
    receipt = await c.adapter.submit(frame);
  return { frame, receipt };
}
const value = async (c: Context) => (await c.storage.read("user:alice"))!;
interface HarnessHandle {
  replay(): void;
  present(snapshot: SyntheticSnapshot): void;
}
const Harness = forwardRef<
  HarnessHandle,
  {
    adapter: Context["adapter"];
    input: BatchInput;
    base: SyntheticSnapshot;
    onFrame(frame: ProfileFrame): void;
    onCalculation?(): void;
  }
>(function Harness(props, ref) {
  const calculate = () => {
    props.onCalculation?.();
    return computeProfileFrame(props.input);
  };
  const [frame, setFrame] = useState(calculate),
    [projection, setProjection] = useState(props.base);
  useImperativeHandle(ref, () => ({
    replay: () => setFrame(() => calculate()),
    present: (snapshot) =>
      setProjection((previous) =>
        snapshot.owner === previous.owner && snapshot.revision > previous.revision
          ? snapshot
          : previous,
      ),
  }));
  useEffect(() => {
    props.adapter.computationFinished(frame);
    props.onFrame(frame);
  }, [frame, props.adapter, props.onFrame]);
  return (
    <output data-testid="profile">
      {projection.profile.value}:{projection.revision}
    </output>
  );
});
beforeEach(() => {
  for (const name of ["localStorage", "sessionStorage", "indexedDB"] as const)
    vi.stubGlobal(
      name,
      new Proxy(
        {},
        {
          get() {
            throw new Error("real player storage forbidden");
          },
        },
      ),
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("external network forbidden");
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Stage 3B-2D test-only profile receipt adapter", () => {
  it("registers a stable owner/epoch/generation/change version before calculation", async () => {
    const c = await context(),
      change = accept(c);
    expect(change.status).toBe("accepted");
    if (change.status !== "accepted") throw new Error("accepted expected");
    expect(change.binding).toMatchObject({
      owner: "user:alice",
      epoch: 4,
      generation: 1,
      changeVersion: 1,
    });
    expect(c.fence.snapshot().operations[0]).toMatchObject({
      state: "running",
      computationFinished: false,
    });
    expect((await value(c)).profile.value).toBe(0);
    const input = c.adapter.capture(["a"]),
      one = computeProfileFrame(input),
      replay = computeProfileFrame(input);
    expect(one).toEqual(replay);
    expect(c.fence.snapshot().operations[0].computationFinished).toBe(false);
    expect(c.storage.commits).toBe(0);
  });
  it("separates computation, submission, commit, ACK and projection", async () => {
    const c = await context();
    accept(c);
    const frame = compute(c);
    expect(c.fence.snapshot().operations[0].state).toBe("awaiting_durability");
    const gate = deferred();
    c.storage.beforeAtomic = () => gate.promise;
    const submission = c.adapter.submit(frame);
    expect(c.adapter.inspect().submissions[0].status).toBe("submitted");
    expect((await value(c)).revision).toBe(0);
    gate.resolve();
    const receipt = await submission;
    expect(receipt).toMatchObject({
      owner: "user:alice",
      revision: 1,
      transactionId: "synthetic-transaction:1",
    });
    expect(c.fence.snapshot().operations[0].state).toBe("awaiting_durability");
    let projection: SyntheticSnapshot | undefined;
    expect(
      c.adapter.publish(receipt, (next) => {
        projection = next;
      }),
    ).toBe(false);
    expect(c.adapter.acknowledge(frame, receipt)).toEqual(["a"]);
    expect(c.fence.snapshot().operations[0].state).toBe("settled");
    expect(projection).toBeUndefined();
    expect(
      c.adapter.publish(receipt, (next) => {
        projection = next;
      }),
    ).toBe(true);
    expect(projection!.profile.value).toBe(1);
  });
  it("a saved batch ACKs exactly its included accepted changes, not an unselected operation", async () => {
    const c = await context();
    accept(c, "a", 2);
    accept(c, "b", 3);
    accept(c, "excluded", 99);
    const { frame, receipt } = await saved(c, ["a", "b"]);
    expect(
      receipt.included.map((o) => [o.id, o.binding.changeVersion, o.firstIncludedRevision]),
    ).toEqual([
      ["a", 1, 1],
      ["b", 2, 1],
    ]);
    expect(c.adapter.acknowledge(frame, receipt)).toEqual(["a", "b"]);
    expect((await value(c)).profile.value).toBe(5);
    expect(c.fence.snapshot().operations.find((o) => o.id === "excluded")?.state).toBe("running");
    expect(c.fence.snapshot().localWork).toBe("unresolved");
  });
  it("actual store exclusion cannot be disguised by a preview containing both effects", async () => {
    const c = await context();
    accept(c, "a", 2);
    accept(c, "b", 3);
    c.storage.excludeIds.add("b");
    const { frame, receipt } = await saved(c, ["a", "b"]);
    expect(frame.preview.value).toBe(5);
    expect(receipt.snapshot.profile.value).toBe(2);
    expect(c.adapter.acknowledge(frame, receipt)).toEqual(["a"]);
    expect(c.fence.snapshot().operations.find((o) => o.id === "b")?.state).toBe(
      "awaiting_durability",
    );
  });
  it("an aborted/excluded accepted change receives no fabricated durable disposition", async () => {
    const c = await context();
    accept(c, "aborted", 9);
    accept(c, "b", 1);
    c.adapter.exclude("aborted");
    const { frame, receipt } = await saved(c, ["b"]);
    expect(c.adapter.acknowledge(frame, receipt)).toEqual(["b"]);
    expect(receipt.included.map((o) => o.id)).not.toContain("aborted");
    expect(c.fence.snapshot().localWork).toBe("unresolved");
  });
  it("no-effect mutation does not receive a receipt merely because a transaction commits", async () => {
    const c = await context();
    accept(c, "a", 0);
    const { frame, receipt } = await saved(c);
    expect(receipt.revision).toBe(1);
    expect(receipt.included).toEqual([]);
    expect(c.adapter.acknowledge(frame, receipt)).toEqual([]);
    expect(c.fence.snapshot().operations[0].state).toBe("awaiting_durability");
    const lease = c.fence.requestClose(),
      waiting = c.fence.wait(lease, 20);
    c.scheduler.advance(20);
    expect((await waiting).status).toBe("timed_out");
  });
  it("rejects a copied/forged commit receipt even when fields appear identical", async () => {
    const c = await context();
    accept(c);
    const { frame, receipt } = await saved(c);
    expect(() => c.adapter.acknowledge(frame, structuredClone(receipt))).toThrow(
      "unverified-receipt",
    );
    expect(c.fence.snapshot().localWork).toBe("unresolved");
  });
  it("storage failure leaves the accepted operation unresolved and retry uses its stable identity", async () => {
    const c = await context();
    const first = accept(c);
    const frame = compute(c);
    c.storage.beforeAtomic = () => {
      throw new Error("quota");
    };
    await expect(c.adapter.submit(frame)).rejects.toThrow("quota");
    expect((await value(c)).revision).toBe(0);
    expect(c.fence.snapshot().operations[0].state).toBe("awaiting_durability");
    expect(accept(c)).toBe(first);
    c.storage.beforeAtomic = undefined;
    const receipt = await c.adapter.submit(frame);
    c.adapter.acknowledge(frame, receipt);
    expect(c.fence.snapshot().operations).toHaveLength(1);
    expect((await value(c)).profile.value).toBe(1);
  });
  it("a delayed effect cannot make computation look saved", async () => {
    const c = await context();
    accept(c);
    const frame = compute(c),
      lease = c.fence.requestClose(),
      waiting = c.fence.wait(lease, 20);
    expect(c.storage.commits).toBe(0);
    c.scheduler.advance(20);
    expect((await waiting).status).toBe("timed_out");
    const receipt = await c.adapter.submit(frame);
    c.adapter.acknowledge(frame, receipt);
    expect((await c.fence.wait(lease, 20)).status).toBe("local_quiescent");
  });
  it("an older receipt never acknowledges a newer accepted operation", async () => {
    const c = await context();
    accept(c, "a", 1);
    const first = await saved(c, ["a"]);
    accept(c, "b", 2);
    compute(c, ["b"]);
    expect(c.adapter.acknowledge(first.frame, first.receipt)).toEqual(["a"]);
    expect(c.fence.snapshot().operations.find((o) => o.id === "b")?.state).toBe(
      "awaiting_durability",
    );
    await c.adapter.refresh();
    const next = await saved(c, ["b"]);
    c.adapter.acknowledge(next.frame, next.receipt);
    expect((await value(c)).profile.value).toBe(3);
    expect((await value(c)).revision).toBe(2);
  });
  it("a late old effect cannot overwrite a newer saved batch", async () => {
    const c = await context();
    accept(c, "a", 1);
    accept(c, "b", 2);
    const old = compute(c, ["a"]),
      newer = compute(c, ["a", "b"]);
    const receipt = await c.adapter.submit(newer);
    c.adapter.acknowledge(newer, receipt);
    await expect(c.adapter.submit(old)).rejects.toThrow("snapshot-CAS-conflict");
    expect((await value(c)).profile.value).toBe(3);
    expect(c.storage.commits).toBe(1);
    expect(() => c.adapter.acknowledge(old, receipt)).toThrow("unverified-receipt");
  });
  it("independent contexts compare snapshots rather than choosing the last write", async () => {
    const shared = store(),
      one = await context(shared, "one"),
      two = await context(shared, "two");
    accept(one, "a", 1);
    accept(two, "b", 2);
    const a = compute(one),
      b = compute(two, ["b"]);
    const results = await Promise.allSettled([one.adapter.submit(a), two.adapter.submit(b)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const winner = results[0].status === "fulfilled" ? one : two,
      loser = winner === one ? two : one;
    const result = results.find((r) => r.status === "fulfilled")!;
    if (result.status !== "fulfilled") throw new Error("winner expected");
    winner.adapter.acknowledge(winner === one ? a : b, result.value);
    await loser.adapter.refresh();
    const retry = await saved(loser, [loser === one ? "a" : "b"]);
    loser.adapter.acknowledge(retry.frame, retry.receipt);
    expect((await shared.read("user:alice"))!.profile.value).toBe(3);
    expect((await shared.read("user:alice"))!.includedOperations.map((o) => o.id).sort()).toEqual([
      "a",
      "b",
    ]);
    expect(
      winner.adapter.publish(result.value, () => {
        throw new Error("old projection must not publish");
      }),
    ).toBe(false);
  });
  it("account change between update and effect prevents persistence and publication", async () => {
    const c = await context();
    accept(c);
    const frame = compute(c);
    c.identity.owner = "user:bob";
    c.identity.epoch++;
    await expect(c.adapter.submit(frame)).rejects.toThrow("identity-or-generation-changed");
    expect((await c.storage.read("user:alice"))!.revision).toBe(0);
    expect((await c.storage.read("user:bob"))!.profile.value).toBe(100);
    expect(c.fence.snapshot().phase).toBe("invalidated");
  });
  it("identity change while a write is waiting is checked at the atomic mutation boundary", async () => {
    const c = await context();
    accept(c);
    const frame = compute(c),
      gate = deferred();
    c.storage.beforeAtomic = () => gate.promise;
    const writing = c.adapter.submit(frame);
    c.identity.epoch++;
    gate.resolve();
    await expect(writing).rejects.toThrow("identity-or-generation-changed");
    expect((await value(c)).revision).toBe(0);
  });
  it("a completed old-owner transaction is retained but cannot ACK or publish into the new account", async () => {
    const c = await context();
    accept(c);
    const { frame, receipt } = await saved(c);
    c.identity.owner = "user:bob";
    c.identity.epoch++;
    expect(() => c.adapter.acknowledge(frame, receipt)).toThrow("identity-or-generation-changed");
    expect(() =>
      c.adapter.publish(receipt, () => {
        throw new Error("must not publish");
      }),
    ).toThrow("identity-or-generation-changed");
    expect((await c.storage.read("user:alice"))!.profile.value).toBe(1);
    expect((await c.storage.read("user:bob"))!.profile.value).toBe(100);
  });
  it.each(["cancel", "timeout"] as const)(
    "%s ends waiting, not the accepted submission or close lease",
    async (mode) => {
      const c = await context();
      accept(c);
      const frame = compute(c),
        gate = deferred();
      c.storage.beforeAtomic = () => gate.promise;
      const writing = c.adapter.submit(frame),
        lease = c.fence.requestClose(),
        waiting = c.fence.wait(lease, 20);
      if (mode === "cancel") c.fence.cancelWait(lease);
      else c.scheduler.advance(20);
      expect((await waiting).status).toBe(mode === "cancel" ? "cancelled" : "timed_out");
      expect(c.fence.snapshot()).toMatchObject({
        phase: "closing",
        activeLeases: 1,
        localWork: "unresolved",
      });
      gate.resolve();
      const receipt = await writing;
      c.adapter.acknowledge(frame, receipt);
      const drained = await c.fence.wait(lease, 20);
      expect(drained.status).toBe("local_quiescent");
      expect(drained.snapshot.importDecision).toBe("HOLD");
    },
  );
  it("same-frame persistence and matching receipt retry never apply its mutation twice", async () => {
    const c = await context();
    accept(c);
    const frame = compute(c);
    const receipts = await Promise.all([c.adapter.submit(frame), c.adapter.submit(frame)]);
    expect(receipts[0]).toBe(receipts[1]);
    expect(c.storage.commits).toBe(1);
    c.adapter.acknowledge(frame, receipts[0]);
    c.adapter.acknowledge(frame, receipts[1]);
    expect((await value(c)).profile.value).toBe(1);
    expect(() => c.adapter.accept("a", { kind: "increment", by: 99 })).toThrow(
      "operation-conflict",
    );
  });
  it.each(["A", "B", "C"] as const)(
    "crash boundary %s before commit has no invented durable intent recovery",
    async (boundary) => {
      const c = await context();
      if (boundary !== "A") accept(c);
      if (boundary === "C") compute(c);
      const fresh = await context(c.storage, "restart");
      expect(fresh.base.profile.value).toBe(0);
      expect(fresh.base.includedOperations).toEqual([]);
      expect(fresh.adapter.inspect().changes).toEqual([]);
      expect(fresh.fence.snapshot().unknownWriterBlockers).toContain(
        "prior_context_work_not_reconciled",
      );
      const lease = fresh.fence.requestClose();
      const local = await fresh.fence.wait(lease, 20);
      expect(local.snapshot.importDecision).toBe("HOLD");
      if (boundary !== "A") expect(c.fence.snapshot().localWork).toBe("unresolved");
    },
  );
  it("D: abort after calculating the working draft rolls back profile AND inclusion records", async () => {
    const c = await context();
    accept(c);
    const frame = compute(c);
    c.storage.duringAtomic = () => {
      throw new Error("synthetic transaction aborted");
    };
    await expect(c.adapter.submit(frame)).rejects.toThrow("aborted");
    const fresh = await context(c.storage, "restart");
    expect(fresh.base.profile.value).toBe(0);
    expect(fresh.base.includedOperations).toEqual([]);
    expect(fresh.base.revision).toBe(0);
    expect(c.fence.snapshot().localWork).toBe("unresolved");
  });
  it("E: commit without fence ACK survives restart, but no old in-memory operation is claimed recovered", async () => {
    const c = await context();
    accept(c);
    await saved(c);
    expect(c.fence.snapshot().localWork).toBe("unresolved");
    const fresh = await context(c.storage, "restart");
    expect(fresh.base.profile.value).toBe(1);
    expect(fresh.adapter.inspect().changes).toEqual([]);
    expect(fresh.adapter.accept("a", { kind: "increment", by: 1 })).toEqual({
      status: "already_committed",
      id: "a",
      revision: 1,
    });
    expect(fresh.fence.snapshot().operations).toEqual([]);
    expect(fresh.fence.snapshot().importDecision).toBe("HOLD");
    expect((await value(fresh)).profile.value).toBe(1);
  });
  it("a response lost after atomic commit can be retried without creating a second revision", async () => {
    const c = await context();
    accept(c);
    const frame = compute(c);
    c.storage.afterCommit = () => {
      throw new Error("response lost after commit");
    };
    await expect(c.adapter.submit(frame)).rejects.toThrow("response lost");
    expect((await value(c)).revision).toBe(1);
    expect(c.fence.snapshot().localWork).toBe("unresolved");
    c.storage.afterCommit = undefined;
    const receipt = await c.adapter.submit(frame);
    expect(c.adapter.acknowledge(frame, receipt)).toEqual(["a"]);
    expect(c.storage.commits).toBe(1);
    expect((await value(c)).profile.value).toBe(1);
  });
  it("F/G: ACK can precede projection; restart restores only committed snapshot and known included IDs", async () => {
    const c = await context();
    accept(c);
    const { frame, receipt } = await saved(c);
    c.adapter.acknowledge(frame, receipt);
    let presented = false;
    expect(presented).toBe(false);
    const lease = c.fence.requestClose();
    expect((await c.fence.wait(lease, 20)).status).toBe("local_quiescent");
    const fresh = await context(c.storage, "restart");
    expect(fresh.base.profile.value).toBe(1);
    expect(fresh.adapter.accept("a", { kind: "increment", by: 1 }).status).toBe(
      "already_committed",
    );
    c.adapter.publish(receipt, () => {
      presented = true;
    });
    expect(presented).toBe(true);
    expect(c.fence.snapshot().importDecision).toBe("HOLD");
  });
  it("React StrictMode and updater replay batch two accepted operations into one actual commit", async () => {
    const c = await context();
    accept(c, "a", 2);
    accept(c, "b", 3);
    const input = c.adapter.capture(["a", "b"]),
      ref = React.createRef<HarnessHandle>();
    const writes: Promise<unknown>[] = [];
    let calculations = 0;
    const onFrame = (frame: ProfileFrame) => {
      writes.push(
        c.adapter.submit(frame).then((receipt) => {
          c.adapter.acknowledge(frame, receipt);
          c.adapter.publish(receipt, (snapshot) => ref.current?.present(snapshot));
        }),
      );
    };
    await act(async () => {
      render(
        <StrictMode>
          <Harness
            ref={ref}
            adapter={c.adapter}
            input={input}
            base={c.base}
            onFrame={onFrame}
            onCalculation={() => {
              calculations++;
            }}
          />
        </StrictMode>,
      );
    });
    await act(async () => {
      await Promise.all(writes);
    });
    expect(calculations).toBeGreaterThanOrEqual(2);
    expect(c.storage.commits).toBe(1);
    expect(screen.getByTestId("profile").textContent).toBe("5:1");
    await act(async () => {
      ref.current!.replay();
    });
    await act(async () => {
      await Promise.all(writes);
    });
    expect(c.storage.commits).toBe(1);
    expect(c.fence.snapshot().operations).toHaveLength(2);
    expect(c.adapter.inspect().changes.map((o) => o.binding.changeVersion)).toEqual([1, 2]);
    expect(c.fence.snapshot().localWork).toBe("drained");
  });
  it("unmount does not cancel accepted work; remount may read committed data before fence ACK", async () => {
    const c = await context();
    accept(c);
    const input = c.adapter.capture(["a"]),
      frames: ProfileFrame[] = [],
      onFrame = (frame: ProfileFrame) => {
        frames.push(frame);
      };
    const ui = render(
      <Harness adapter={c.adapter} input={input} base={c.base} onFrame={onFrame} />,
    );
    expect(screen.getByTestId("profile").textContent).toBe("0:0");
    ui.unmount();
    const lease = c.fence.requestClose();
    expect(c.fence.snapshot().localWork).toBe("unresolved");
    const receipt = await c.adapter.submit(frames[0]);
    const restored = await c.adapter.refresh();
    render(
      <Harness
        adapter={c.adapter}
        input={c.adapter.capture([])}
        base={restored}
        onFrame={() => {}}
      />,
    );
    expect(screen.getByTestId("profile").textContent).toBe("1:1");
    expect(c.fence.snapshot().phase).toBe("closing");
    c.adapter.acknowledge(frames[0], receipt);
    expect((await c.fence.wait(lease, 20)).status).toBe("local_quiescent");
  });
  it("no missing store snapshot is silently initialized by the adapter", async () => {
    const c = await context();
    const empty = new SyntheticAtomicStore([]),
      fence = createWriterFence({
        instanceId: "empty",
        identity: c.identity,
        readIdentity: () => c.identity,
        schedule: c.scheduler.schedule,
      });
    const adapter = createProfileReceiptPrototype({
      fence,
      store: empty,
      readIdentity: () => c.identity,
    });
    await expect(adapter.refresh()).rejects.toThrow("missing-snapshot-no-default");
    expect(empty.commits).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
