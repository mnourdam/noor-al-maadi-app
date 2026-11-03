import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWriterFence } from "@/lib/rewards/writer-fence";
import {
  createIntentPrototype,
  openIntentPrototype,
  STORES,
  TEST_PREFIX,
  type Checkpoint,
  type Session,
} from "./helpers/indexeddb-intent-prototype";
let factory: IDBFactory,
  serial = 0;
const connections: IDBDatabase[] = [];
const name = () => `${TEST_PREFIX}${++serial}`;
async function connect(dbName: string) {
  const db = await openIntentPrototype(factory, dbName);
  connections.push(db);
  return db;
}
async function fixture(db: IDBDatabase, owner = "user:alice", value = 100) {
  await raw(db, "syntheticEconomy", owner, { schema: 1, owner, value, revision: 0 });
}
async function raw(db: IDBDatabase, store: string, key: IDBValidKey, value: unknown) {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
async function read(db: IDBDatabase, store: string, key: IDBValidKey) {
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction(store),
      req = tx.objectStore(store).get(key);
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = () => reject(tx.error);
  });
}
function context(db: IDBDatabase, instanceId = "context-1", epoch = 1, owner = "user:alice") {
  let identity: Session = { owner, epoch, generation: 1, instanceId };
  const subscribers = new Set<() => void>();
  const hooks = {
    current: undefined as undefined | ((at: Checkpoint, tx: IDBTransaction) => unknown),
  };
  const p = createIntentPrototype({
    db,
    session: identity,
    readSession: () => identity,
    subscribe: (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    checkpoint: (at, tx) => hooks.current?.(at, tx),
  });
  return {
    p,
    hooks,
    switch(owner: string, epoch: number) {
      identity = { ...identity, owner, epoch };
      for (const callback of subscribers) callback();
    },
    get identity() {
      return identity;
    },
    get subscribers() {
      return subscribers.size;
    },
  };
}
const cmd = (by = 50) => ({ kind: "increment" as const, by });
async function setup() {
  const dbName = name(),
    db = await connect(dbName);
  await fixture(db);
  return { dbName, db, ...context(db) };
}
const economy = (db: IDBDatabase, owner = "user:alice") => read(db, STORES[1], owner);
const intent = (db: IDBDatabase, id = "a") => read(db, STORES[0], ["user:alice", id]);
const applied = (db: IDBDatabase, id = "a") => read(db, STORES[2], ["user:alice", id]);
beforeEach(() => {
  factory = new IDBFactory();
  for (const key of ["localStorage", "sessionStorage"])
    vi.stubGlobal(
      key,
      new Proxy(
        {},
        {
          get() {
            throw new Error("player storage forbidden");
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
  for (const db of connections.splice(0)) db.close();
  vi.unstubAllGlobals();
});

describe("Stage 3B-2E isolated IndexedDB durable intent contract", () => {
  it("refuses production database names and never initializes missing economy", async () => {
    await expect(openIntentPrototype(factory, "irth-reward-settlement-v1")).rejects.toThrow(
      "test-db-only",
    );
    const db = await connect(name()),
      c = context(db);
    await c.p.admit("a", cmd());
    await expect(c.p.apply("a")).rejects.toThrow("missing-economy");
    expect(await economy(db)).toBeUndefined();
    expect((await c.p.discover())[0]).toMatchObject({ state: "unresolved" });
  });
  it("admits only after transaction completion, before any economic mutation", async () => {
    const c = await setup();
    let resolved = false,
      requestSucceeded = false;
    c.hooks.current = (at) => {
      if (at === "intent_put_success") {
        requestSucceeded = true;
        expect(resolved).toBe(false);
      }
      if (at === "transaction_complete") expect(resolved).toBe(false);
    };
    const result = await c.p.admit("a", cmd()).then((i) => {
      resolved = true;
      return i;
    });
    c.hooks.current = undefined;
    expect(requestSucceeded).toBe(true);
    expect(result.state).toBe("pending");
    expect(result.admittedBy).toEqual(c.identity);
    expect((await economy(c.db)).value).toBe(100);
    expect(await applied(c.db)).toBeUndefined();
    expect((await c.p.discover())[0].state).toBe("pending");
  });
  it("returned evidence cannot mutate the captured session or durable command", async () => {
    const c = await setup(),
      admitted = await c.p.admit("a", cmd());
    admitted.admittedBy.owner = "user:bob";
    admitted.command.by = 999;
    const committed = await c.p.apply("a");
    expect(committed.applied?.after).toBe(150);
    committed.applied!.by.epoch = 999;
    expect((await c.p.discover())[0].intent?.command.by).toBe(50);
    expect((await c.p.apply("a")).applied?.by.epoch).toBe(1);
  });
  it("A: crash before durable admission has no discoverable operation", async () => {
    const c = await setup();
    c.db.close();
    const fresh = context(await connect(c.dbName), "restart", 2);
    expect(await fresh.p.discover()).toEqual([]);
    expect((await economy(await connect(c.dbName))).value).toBe(100);
  });
  it("B/G: cold connection discovers pending intent and resumes with a new session", async () => {
    const c = await setup();
    await c.p.admit("a", cmd());
    c.db.close();
    const db = await connect(c.dbName),
      fresh = context(db, "restart", 7);
    expect((await fresh.p.discover())[0]).toMatchObject({
      state: "pending",
      intent: { admittedBy: { epoch: 1 } },
    });
    const result = await fresh.p.apply("a");
    expect(result.state).toBe("applied");
    expect(result.applied?.by).toMatchObject({ epoch: 7, instanceId: "restart" });
    expect(await economy(db)).toMatchObject({ value: 150, revision: 1 });
    expect((await fresh.p.discover())[0].state).toBe("applied");
  });
  it("C: calculation crash retains a discoverable pending intent without effects", async () => {
    const c = await setup();
    await c.p.admit("a", cmd());
    c.hooks.current = (at) => {
      if (at === "calculation") throw new Error("crash-calculation");
    };
    await expect(c.p.apply("a")).rejects.toThrow("crash-calculation");
    c.db.close();
    const db = await connect(c.dbName),
      fresh = context(db, "restart");
    expect((await fresh.p.discover())[0].state).toBe("pending");
    expect(await applied(db)).toBeUndefined();
    expect((await economy(db)).value).toBe(100);
    await fresh.p.apply("a");
    expect((await economy(db)).value).toBe(150);
  });
  it.each(["economy_put_success", "applied_put_success", "intent_applied_put_success"] as const)(
    "D/E: request success at %s followed by abort rolls back ALL three stores",
    async (point) => {
      const c = await setup();
      await c.p.admit("a", cmd());
      let succeeded = false;
      c.hooks.current = (at, tx) => {
        if (at === point) {
          succeeded = true;
          tx.abort();
        }
      };
      await expect(c.p.apply("a")).rejects.toThrow();
      expect(succeeded).toBe(true);
      c.db.close();
      const db = await connect(c.dbName),
        fresh = context(db, "restart");
      expect(await economy(db)).toMatchObject({ value: 100, revision: 0 });
      expect(await applied(db)).toBeUndefined();
      expect((await intent(db)).state).toBe("pending");
      await fresh.p.apply("a");
      expect(await economy(db)).toMatchObject({ value: 150, revision: 1 });
    },
  );
  it.each(["admission", "application"] as const)(
    "F/H: lost %s commit notification reconciles from another connection",
    async (phase) => {
      const c = await setup();
      if (phase === "application") await c.p.admit("a", cmd());
      c.hooks.current = (at) => {
        if (at === "transaction_complete") throw new Error("lost-commit-notification");
      };
      await expect(phase === "admission" ? c.p.admit("a", cmd()) : c.p.apply("a")).rejects.toThrow(
        "lost-commit",
      );
      c.db.close();
      const db = await connect(c.dbName),
        fresh = context(db, "restart", 2);
      expect((await fresh.p.discover())[0].state).toBe(
        phase === "admission" ? "pending" : "applied",
      );
      await fresh.p.admit("a", cmd());
      const receipt = await fresh.p.apply("a");
      await fresh.p.apply("a");
      expect(receipt.state).toBe("applied");
      expect(await economy(db)).toMatchObject({ value: 150, revision: 1 });
    },
  );
  it("I: restart after applied and before projection does not repeat the effect", async () => {
    const c = await setup();
    await c.p.admit("a", cmd());
    const result = await c.p.apply("a");
    const render = vi.fn();
    expect(render).not.toHaveBeenCalled();
    c.db.close();
    const db = await connect(c.dbName),
      fresh = context(db, "new-session", 2);
    const replay = await fresh.p.apply("a");
    expect(replay.applied).toEqual(result.applied);
    render(await economy(db));
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ value: 150, revision: 1 }));
  });
  it("concurrent independent connections using same ID apply only once", async () => {
    const c = await setup(),
      db2 = await connect(c.dbName),
      second = context(db2, "other");
    await Promise.all([c.p.admit("a", cmd()), second.p.admit("a", cmd())]);
    const results = await Promise.all([c.p.apply("a"), second.p.apply("a")]);
    expect(results[0].applied).toEqual(results[1].applied);
    expect(await economy(db2)).toMatchObject({ value: 150, revision: 1 });
    expect(await c.p.discover()).toHaveLength(1);
  });
  it("same ID with different full payload conflicts without changing durable command", async () => {
    const c = await setup(),
      other = context(await connect(c.dbName), "other");
    const results = await Promise.allSettled([c.p.admit("a", cmd()), other.p.admit("a", cmd(99))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ message: expect.stringContaining("operation-conflict") }),
    });
    await c.p.apply("a");
    const committed = await intent(c.db);
    expect((await economy(c.db)).value).toBe(100 + committed.command.by);
    await expect(c.p.admit("a", { ...cmd(), ignored: true } as any)).rejects.toThrow(
      "invalid-command",
    );
  });
  it("two different IDs for one owner serialize against latest economy", async () => {
    const c = await setup(),
      other = context(await connect(c.dbName), "other");
    await Promise.all([c.p.admit("a", cmd(50)), other.p.admit("b", cmd(25))]);
    await Promise.all([c.p.apply("a"), other.p.apply("b")]);
    expect(await economy(c.db)).toMatchObject({ value: 175, revision: 2 });
    expect(
      [(await applied(c.db, "a")).revision, (await applied(c.db, "b")).revision].sort(),
    ).toEqual([1, 2]);
  });
  it("same ID for two owners is isolated even with concurrent transactions", async () => {
    const c = await setup();
    await fixture(c.db, "user:bob", 900);
    const bob = context(await connect(c.dbName), "bob", 3, "user:bob");
    await Promise.all([c.p.admit("a", cmd()), bob.p.admit("a", cmd(7))]);
    await Promise.all([c.p.apply("a"), bob.p.apply("a")]);
    expect((await economy(c.db)).value).toBe(150);
    expect((await economy(c.db, "user:bob")).value).toBe(907);
    expect(await c.p.discover()).toHaveLength(1);
    expect(await bob.p.discover()).toHaveLength(1);
  });
  it("revision conflict becomes durable unresolved and cannot automatically replay", async () => {
    const c = await setup();
    await c.p.admit("a", cmd());
    await c.p.admit("b", cmd(25));
    await c.p.apply("b");
    expect((await c.p.apply("a", 0)).state).toBe("unresolved");
    c.db.close();
    const db = await connect(c.dbName),
      fresh = context(db, "restart");
    expect((await fresh.p.apply("a")).state).toBe("unresolved");
    expect(await economy(db)).toMatchObject({ value: 125, revision: 1 });
    expect((await fresh.p.discover()).find((i) => i.id === "a")?.intent?.disposition?.reason).toBe(
      "revision-conflict",
    );
  });
  it.each(["rejected", "cancelled", "unresolved"] as const)(
    "%s is a durable disposition, not a grant",
    async (state) => {
      const c = await setup();
      await c.p.admit("a", cmd());
      await c.p.disposition("a", state, "explicit-test-evidence");
      c.db.close();
      const db = await connect(c.dbName),
        fresh = context(db, "restart");
      expect((await fresh.p.apply("a")).state).toBe(state);
      expect((await fresh.p.discover())[0].intent?.disposition?.reason).toBe(
        "explicit-test-evidence",
      );
      expect((await economy(db)).value).toBe(100);
      expect(await applied(db)).toBeUndefined();
      await expect(fresh.p.disposition("a", "cancelled", "different")).rejects.toThrow(
        "terminal-conflict",
      );
    },
  );
  it("no-op has durable cancellation evidence across restart", async () => {
    const c = await setup();
    await c.p.admit("a", cmd(0));
    expect((await c.p.apply("a")).intent.disposition?.reason).toBe("no-effect");
    c.db.close();
    const db = await connect(c.dbName),
      fresh = context(db, "restart");
    expect((await fresh.p.apply("a")).state).toBe("cancelled");
    expect(await economy(db)).toMatchObject({ value: 100, revision: 0 });
    expect(await applied(db)).toBeUndefined();
  });
  it.each(["intent", "applied", "missing-applied", "orphan", "economy"] as const)(
    "J: %s corruption is preserved and never repaired into an automatic grant",
    async (kind) => {
      const c = await setup();
      await c.p.admit("a", cmd());
      if (["applied", "missing-applied", "economy"].includes(kind)) await c.p.apply("a");
      if (kind === "intent") await raw(c.db, STORES[0], ["user:alice", "a"], null);
      if (kind === "applied")
        await raw(c.db, STORES[2], ["user:alice", "a"], {
          ...(await applied(c.db)),
          fingerprint: "corrupt",
        });
      if (kind === "orphan") await raw(c.db, STORES[2], ["user:alice", "a"], { schema: 1 });
      if (kind === "economy")
        await raw(c.db, STORES[1], "user:alice", {
          schema: 1,
          owner: "user:bob",
          value: 999,
          revision: 1,
        });
      if (kind === "missing-applied")
        await new Promise<void>((resolve) => {
          const tx = c.db.transaction(STORES[2], "readwrite");
          tx.objectStore(STORES[2]).delete(["user:alice", "a"]);
          tx.oncomplete = () => resolve();
        });
      const before = await economy(c.db),
        beforeIntent = await intent(c.db),
        beforeApplied = await applied(c.db);
      expect((await c.p.discover())[0].state).toBe("unresolved");
      await expect(c.p.apply("a")).rejects.toThrow();
      if (kind === "intent") await expect(c.p.admit("a", cmd())).rejects.toThrow();
      expect(await economy(c.db)).toEqual(before);
      expect(await intent(c.db)).toEqual(beforeIntent);
      expect(await applied(c.db)).toEqual(beforeApplied);
    },
  );
  it("an orphan applied record with no intent is discovered, retained, and cannot be re-admitted", async () => {
    const c = await setup();
    await c.p.admit("a", cmd());
    await c.p.apply("a");
    await new Promise<void>((resolve) => {
      const tx = c.db.transaction(STORES[0], "readwrite");
      tx.objectStore(STORES[0]).delete(["user:alice", "a"]);
      tx.oncomplete = () => resolve();
    });
    c.db.close();
    const db = await connect(c.dbName),
      fresh = context(db, "restart");
    expect(await fresh.p.discover()).toEqual([
      { id: "a", state: "unresolved", reason: "orphan-applied-preserved" },
    ]);
    await expect(fresh.p.admit("a", cmd())).rejects.toThrow("orphan-applied");
    await expect(fresh.p.apply("a")).rejects.toThrow("missing-intent");
    expect(await economy(db)).toMatchObject({ value: 150, revision: 1 });
    expect(await applied(db)).toBeDefined();
  });
  it("asynchronous hooks cannot hold a transaction open or mutate a partial grant", async () => {
    const c = await setup();
    await c.p.admit("a", cmd());
    c.hooks.current = (at) => (at === "calculation" ? Promise.resolve() : undefined);
    await expect(c.p.apply("a")).rejects.toThrow("async-hook-forbidden");
    expect(await economy(c.db)).toMatchObject({ value: 100, revision: 0 });
    expect((await intent(c.db)).state).toBe("pending");
    expect(await applied(c.db)).toBeUndefined();
  });
  it.each(["intent", "effect"] as const)(
    "K: quota failure during %s preserves prior durable records",
    async (phase) => {
      const c = await setup();
      if (phase === "effect") await c.p.admit("a", cmd());
      c.hooks.current = (at) => {
        if (at === (phase === "intent" ? "intent_put_success" : "economy_put_success"))
          throw new DOMException("quota", "QuotaExceededError");
      };
      await expect(phase === "intent" ? c.p.admit("a", cmd()) : c.p.apply("a")).rejects.toThrow(
        "quota",
      );
      expect(await economy(c.db)).toMatchObject({ value: 100, revision: 0 });
      expect(await applied(c.db)).toBeUndefined();
      c.hooks.current = undefined;
      expect(await c.p.discover()).toHaveLength(phase === "intent" ? 0 : 1);
    },
  );
  it("K: failed IDB open does not fall back to empty storage", async () => {
    const broken = {
      open() {
        throw new DOMException("blocked storage", "SecurityError");
      },
    } as unknown as IDBFactory;
    await expect(openIntentPrototype(broken, name())).rejects.toThrow("blocked storage");
  });
  it.each(["intent_put_success", "economy_put_success"] as const)(
    "L: account switch at %s aborts the active transaction",
    async (point) => {
      const c = await setup();
      await fixture(c.db, "user:bob", 900);
      if (point === "economy_put_success") await c.p.admit("a", cmd());
      c.hooks.current = (at) => {
        if (at === point) {
          c.switch("user:bob", 2);
          c.switch("user:alice", 3);
        }
      };
      await expect(
        point === "intent_put_success" ? c.p.admit("a", cmd()) : c.p.apply("a"),
      ).rejects.toThrow("identity-changed");
      expect(c.subscribers).toBe(0);
      expect((await economy(c.db)).value).toBe(100);
      expect((await economy(c.db, "user:bob")).value).toBe(900);
      c.hooks.current = undefined;
      await expect(c.p.discover()).rejects.toThrow("identity-changed");
      const fresh = context(await connect(c.dbName), "returned-alice", 3);
      if (point === "intent_put_success") expect(await fresh.p.discover()).toEqual([]);
      else {
        expect((await fresh.p.discover())[0].state).toBe("pending");
        await fresh.p.apply("a");
      }
    },
  );
  it("account switch after commit blocks the response without undoing old-owner commit", async () => {
    const c = await setup();
    await c.p.admit("a", cmd());
    c.hooks.current = (at) => {
      if (at === "transaction_complete") c.switch("user:bob", 2);
    };
    await expect(c.p.apply("a")).rejects.toThrow("identity-changed");
    const fresh = context(await connect(c.dbName), "alice-returned", 3);
    expect((await fresh.p.discover())[0].state).toBe("applied");
    await fresh.p.apply("a");
    expect(await economy(c.db)).toMatchObject({ value: 150, revision: 1 });
  });
  it.each(["timeout", "cancel"] as const)(
    "%s of a real fence wait cannot cancel a durable intent",
    async (mode) => {
      const c = await setup();
      let fire = () => {};
      const identity = { owner: "user:alice", epoch: 1 };
      const fence = createWriterFence({
        instanceId: "waiting",
        identity,
        readIdentity: () => identity,
        schedule: (_ms, callback) => {
          fire = callback;
          return () => {};
        },
      });
      const writer = fence.registerWriter("intent-observer"),
        ticket = writer.accept("a");
      await c.p.admit("a", cmd());
      writer.computationFinished(ticket);
      const lease = fence.requestClose(),
        waiting = fence.wait(lease, 10);
      if (mode === "timeout") fire();
      else fence.cancelWait(lease);
      expect((await waiting).status).toBe(mode === "timeout" ? "timed_out" : "cancelled");
      expect(fence.snapshot()).toMatchObject({
        phase: "closing",
        localWork: "unresolved",
        activeLeases: 1,
      });
      const fresh = context(await connect(c.dbName), "next");
      expect((await fresh.p.discover())[0].state).toBe("pending");
      await fresh.p.apply("a");
      expect((await economy(c.db)).value).toBe(150);
      expect(fence.snapshot().localWork).toBe("unresolved");
    },
  );
  it("durable discovery does not restore old fence trust or establish global exclusion", async () => {
    const c = await setup();
    const identity = { owner: "user:alice", epoch: 1 };
    const fence = (instanceId: string) =>
      createWriterFence({
        instanceId,
        identity,
        readIdentity: () => identity,
        schedule: () => () => {},
      });
    const old = fence("old"),
      writer = old.registerWriter("test-only-intent"),
      ticket = writer.accept("a");
    await c.p.admit("a", cmd());
    writer.computationFinished(ticket);
    const fresh = context(await connect(c.dbName), "new", 2);
    await fresh.p.apply("a");
    expect(old.snapshot().localWork).toBe("unresolved");
    const newFence = fence("new"),
      newWriter = newFence.registerWriter("test-only-intent");
    expect(newWriter.acknowledgeDurable(ticket, "foreign-ticket")).toBe(false);
    const lease = newFence.requestClose(),
      local = await newFence.wait(lease, 1);
    expect(local.status).toBe("local_quiescent");
    expect(local.snapshot).toMatchObject({
      continuity: "in_memory_only",
      globalWriterExclusion: "unproven",
      importDecision: "HOLD",
    });
    expect(local.snapshot.unknownWriterBlockers).toContain("prior_context_work_not_reconciled");
    expect(fetch).not.toHaveBeenCalled();
  });
});
