import { createHash } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createGuestTransitionCoordinator } from "@/lib/campaigns/guest-handoff/transition-coordinator";
import { createGuestSourceCapturePort } from "@/lib/campaigns/guest-handoff/source-adapter";
import { openHandoffJournal, createHandoffFoundation } from "@/lib/campaigns/guest-handoff/journal";
import type {
  Anchor,
  AuthProof,
  TransitionDependencies,
  TransitionEvidence,
} from "@/lib/campaigns/guest-handoff/transition-contract";
import { GUEST_BUFFER_KEY } from "@/lib/campaigns/guest-progress-buffer";
import {
  getActiveOwner,
  getIdentityEpoch,
  onOwnerChange,
  setActiveOwnerInternal,
  __resetIdentityForTests,
  IDENTITY_DEVICE_ID_KEY,
} from "@/lib/identity/owner";
import {
  installIdentityPartition,
  physicalKey,
  __uninstallPartitionForTests,
} from "@/lib/identity/partition";
vi.mock("@/lib/diag-trace", () => ({ recordTrace: vi.fn() }));
const methods = {
  getItem: Storage.prototype.getItem,
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
};
const device = "transition-device",
  guest = `guest:${device}`,
  physical = physicalKey(GUEST_BUFFER_KEY, guest);
const snapshot = JSON.stringify({
  boundUid: null,
  entries: {
    "c::a": {
      campaignId: "c",
      chapterId: "a",
      status: "completed",
      bufferedAt: "2026-11-05T00:00:00Z",
      xpEarned: 10,
    },
  },
});
let factory: IDBFactory,
  serial = 0,
  contextId: string;
const connections: IDBDatabase[] = [];
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
function locks() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: vi.fn((key: string, _opts: unknown, work: () => unknown) => {
      const next = (tails.get(key) ?? Promise.resolve()).then(work);
      tails.set(
        key,
        next.catch(() => {}),
      );
      return next;
    }),
  };
}
const identity = () => ({
  owner: getActiveOwner(),
  epoch: getIdentityEpoch(),
  contextId,
  ready: true,
});
const raw = () => methods.getItem.call(localStorage, physical)!;
const digest = async (v: string) => createHash("sha256").update(v).digest("hex");
async function rows(db: IDBDatabase, store = "handoffs"): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store);
    const req = tx.objectStore(store).getAll();
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = () => reject(tx.error);
  });
}
async function fixture() {
  const db = await openHandoffJournal(factory, "irth-guest-handoff-synthetic:transition");
  connections.push(db);
  const address = createGuestSourceCapturePort().address;
  let anchor: unknown = {
    schema: 1,
    address: JSON.stringify([device, guest, physical, "buffer-v1", 1]),
    revision: 0,
    phase: "enrolled",
    evidence: null,
    target: null,
  } satisfies Anchor;
  let receipt: AuthProof | null = null;
  const d: TransitionDependencies = {
    foundation: {
      db,
      identity,
      subscribeInvalidation: (cb) => onOwnerChange(() => cb()),
      verifyTarget: async () => {
        throw Error("must use transition verifier");
      },
      hash: vi.fn(digest),
      newId: () => `id-${++serial}`,
      now: () => 1000,
    },
    source: vi.fn(createGuestSourceCapturePort),
    anchor: {
      address,
      exclusive: async (work) =>
        await navigator.locks.request(`test-anchor:${physical}`, { mode: "exclusive" }, work),
      read: vi.fn(async () => structuredClone(anchor)),
      write: vi.fn(async (next, revision) => {
        if ((anchor as Anchor)?.revision !== revision) throw Error("anchor_revision_conflict");
        anchor = structuredClone(next);
      }),
    },
    auth: {
      authenticate: vi.fn(async (evidence) => {
        setActiveOwnerInternal("user:alice");
        if (evidence)
          receipt = {
            transitionId: evidence.transitionId,
            attemptId: "auth-attempt",
            sourceOwner: evidence.source.sourceGuestOwner,
            sourceEpoch: evidence.capturedIdentity.epoch,
            sourceContextId: evidence.capturedIdentity.contextId,
            snapshotHash: evidence.snapshotHash,
            uid: "alice",
            sessionUid: "alice",
            switchedIdentity: identity(),
            currentIdentity: identity(),
            sessionContinuity: true,
          };
      }),
      verify: vi.fn(async () => (receipt ? { ...receipt, currentIdentity: identity() } : null)),
    },
    recoveredSnapshot: vi.fn(async (e, work) => {
      expect(e.source.physicalKey).toBe(physical);
      return navigator.locks.request(
        `irth:guest-storage:${physical}:write`,
        { mode: "exclusive" },
        () => work(raw()),
      );
    }),
  };
  return {
    d,
    db,
    coordinator: () => createGuestTransitionCoordinator(d),
    get anchor(): Anchor {
      return structuredClone(anchor) as Anchor;
    },
    set anchor(v: unknown) {
      anchor = structuredClone(v);
    },
    get receipt() {
      return receipt;
    },
    set receipt(v: AuthProof | null) {
      receipt = v;
    },
  };
}
beforeEach(() => {
  __uninstallPartitionForTests();
  Object.assign(Storage.prototype, methods);
  localStorage.clear();
  __resetIdentityForTests();
  methods.setItem.call(localStorage, IDENTITY_DEVICE_ID_KEY, device);
  setActiveOwnerInternal(guest);
  installIdentityPartition();
  methods.setItem.call(localStorage, physical, snapshot);
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks() });
  factory = new IDBFactory();
  contextId = `ctx-${++serial}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("network forbidden");
    }),
  );
});
afterEach(() => {
  for (const db of connections.splice(0)) db.close();
  expect(fetch).not.toHaveBeenCalled();
  expect(raw()).toBeDefined();
  vi.useRealTimers();
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
  Object.assign(Storage.prototype, methods);
  vi.unstubAllGlobals();
});
it.each(["new account", "existing account"])(
  "%s: actual source capture, durable evidence, verified target, awaiting consent",
  async () => {
    const f = await fixture();
    const o = await f.coordinator().start("t").result;
    expect(o).toMatchObject({ state: "awaiting_consent", handoffConfirmed: false });
    expect(f.anchor.phase).toBe("awaiting_consent");
    const h = (await rows(f.db))[0];
    expect(h).toMatchObject({
      target: { uid: "alice" },
      phase: "awaiting_consent",
      consent: null,
      snapshot,
    });
    expect(raw()).toBe(snapshot);
    expect(f.d.auth.authenticate).toHaveBeenCalledTimes(1);
  },
);
it("User A to User B does not create or infer a Guest source", async () => {
  const f = await fixture();
  setActiveOwnerInternal("user:a");
  const o = await f.coordinator().start("t").result;
  expect(o).toMatchObject({ state: "blocked", normalLoginAllowed: true });
  expect(f.d.source).not.toHaveBeenCalled();
  expect(f.d.auth.authenticate).toHaveBeenCalledWith(null);
  expect(await rows(f.db)).toEqual([]);
});
it("shared device capture grants no consent or human provenance", async () => {
  const f = await fixture();
  await f.coordinator().prepare("t").result;
  expect(f.anchor.evidence?.provenance).toBe("legacy_captured_now");
  expect((await rows(f.db))[0]).toMatchObject({ target: null, consent: null });
  expect(f.d.auth.authenticate).not.toHaveBeenCalled();
});
it("missing anchor fails closed even with a valid journal and allows ordinary login", async () => {
  const f = await fixture();
  await f.coordinator().prepare("t").result;
  f.anchor = null;
  const prior = await rows(f.db);
  const o = await f.coordinator().start("t2").result;
  expect(o.reason).toBe("anchor_missing");
  expect(await rows(f.db)).toEqual(prior);
  expect(f.d.auth.authenticate).toHaveBeenCalledWith(null);
});
it("missing journal with established anchor cannot recapture or remint", async () => {
  const f = await fixture();
  await f.coordinator().prepare("t").result;
  const anchor = f.anchor;
  f.db.close();
  f.d.foundation.db = await openHandoffJournal(factory, "irth-guest-handoff-synthetic:lost");
  connections.push(f.d.foundation.db);
  const o = await f.coordinator().start("t").result;
  expect(o.state).toBe("blocked");
  expect(f.anchor).toEqual(anchor);
  expect(await rows(f.d.foundation.db)).toEqual([]);
});
it("absence of both stores is not a first-use enrollment signal", async () => {
  const f = await fixture();
  f.anchor = undefined;
  const o = await f.coordinator().prepare("t").result;
  expect(o.reason).toBe("anchor_missing");
  expect(await rows(f.db)).toEqual([]);
});
it("before capture commit: quota preserves prepared IDs and rolls back journal", async () => {
  const f = await fixture();
  const original = f.db.transaction.bind(f.db);
  vi.spyOn(f.db, "transaction").mockImplementation(((...args: any[]) => {
    const tx = (original as any)(...args) as IDBTransaction;
    const store = tx.objectStore.bind(tx);
    tx.objectStore = (name: string) => {
      const s = store(name);
      if (name === "handoffs")
        s.add = () => {
          throw new DOMException("full", "QuotaExceededError");
        };
      return s;
    };
    return tx;
  }) as typeof f.db.transaction);
  const o = await f.coordinator().prepare("t").result;
  expect(o.state).toBe("blocked");
  expect(f.anchor.phase).toBe("prepared");
  vi.restoreAllMocks();
  expect(await rows(f.db)).toEqual([]);
  const ids = f.anchor.evidence;
  expect((await f.coordinator().prepare("t").result).state).toBe("awaiting_auth");
  expect(f.anchor.evidence).toEqual(ids);
});
it("anchor write fails before journal: no journal or fabricated intent", async () => {
  const f = await fixture();
  vi.mocked(f.d.anchor.write).mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
  expect((await f.coordinator().prepare("t").result).state).toBe("blocked");
  expect(f.anchor.phase).toBe("enrolled");
  expect(await rows(f.db)).toEqual([]);
});
it("commit capture then fail anchor acknowledgment: reserved IDs recover same intent", async () => {
  const f = await fixture();
  const write = vi.mocked(f.d.anchor.write).getMockImplementation()!;
  vi.mocked(f.d.anchor.write)
    .mockImplementationOnce(write)
    .mockRejectedValueOnce(Error("anchor quota"));
  const o = await f.coordinator().prepare("t").result;
  expect(o.state).toBe("blocked");
  expect(f.anchor.phase).toBe("prepared");
  const before = (await rows(f.db))[0];
  expect((await f.coordinator().prepare("t").result).state).toBe("awaiting_auth");
  expect((await rows(f.db))[0]).toEqual(before);
  expect(f.anchor.evidence?.handoffId).toBe(before.id);
});
it("anchor commit but lost acknowledgment remains recoverable without replacement", async () => {
  const f = await fixture();
  const write = vi.mocked(f.d.anchor.write).getMockImplementation()!;
  vi.mocked(f.d.anchor.write).mockImplementationOnce(async (...args) => {
    await write(...args);
    throw Error("lost acknowledgment");
  });
  expect((await f.coordinator().prepare("t").result).state).toBe("blocked");
  expect(f.anchor.phase).toBe("prepared");
  const e = f.anchor.evidence;
  expect((await f.coordinator().prepare("t").result).state).toBe("awaiting_auth");
  expect(f.anchor.evidence).toEqual(e);
});
it("stop after capture before auth: resume does not infer target from login", async () => {
  const f = await fixture();
  await f.coordinator().prepare("t").result;
  contextId = "restart";
  setActiveOwnerInternal("user:alice");
  expect((await f.coordinator().resume("t").result).reason).toBe("auth_unverified");
  expect((await rows(f.db))[0].target).toBeNull();
});
it("stop during auth: pending auth is not a failure or consent", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const f = await fixture(),
    gate = deferred<void>(),
    entered = deferred<void>();
  vi.mocked(f.d.auth.authenticate).mockImplementationOnce(async () => {
    entered.resolve();
    await gate.promise;
  });
  const h = f.coordinator().start("t", 1000);
  await entered.promise;
  await vi.advanceTimersByTimeAsync(1000);
  expect((await h.result).state).toBe("timed_out");
  expect(f.anchor.phase).toBe("auth_started");
  expect((await rows(f.db))[0].consent).toBeNull();
  gate.resolve();
  expect((await h.settled).state).toBe("timed_out");
});
it("login succeeds but first verifier cannot save handoff: fresh resume can recover", async () => {
  const f = await fixture();
  vi.mocked(f.d.auth.verify).mockRejectedValueOnce(Error("verification unavailable"));
  expect((await f.coordinator().start("t").result).state).toBe("blocked");
  expect(getActiveOwner()).toBe("user:alice");
  expect((await rows(f.db))[0].target).toBeNull();
  contextId = "restart";
  expect((await f.coordinator().resume("t").result).state).toBe("awaiting_consent");
});
it("after bind before final anchor marker: recovery keeps target and no consent", async () => {
  const f = await fixture(),
    write = vi.mocked(f.d.anchor.write).getMockImplementation()!;
  vi.mocked(f.d.anchor.write).mockImplementation(async (a, r) => {
    if (a.phase === "awaiting_consent") throw Error("anchor quota");
    await write(a, r);
  });
  expect((await f.coordinator().start("t").result).state).toBe("blocked");
  expect(f.anchor.phase).toBe("target_claimed");
  const before = (await rows(f.db))[0];
  expect(before.target.uid).toBe("alice");
  vi.mocked(f.d.anchor.write).mockImplementation(write);
  contextId = "restart";
  expect((await f.coordinator().resume("t").result).state).toBe("awaiting_consent");
  expect((await rows(f.db))[0]).toEqual(before);
});
it.each([
  "transitionId",
  "snapshotHash",
  "sessionUid",
  "sourceOwner",
  "sourceEpoch",
  "attemptId",
] as const)("rejects mismatched auth evidence: %s", async (field) => {
  const f = await fixture(),
    verify = vi.mocked(f.d.auth.verify).getMockImplementation()!;
  vi.mocked(f.d.auth.verify).mockImplementation(async (e) => {
    const p = await verify(e);
    return { ...p!, [field]: field === "sourceEpoch" ? 99 : field === "attemptId" ? "" : "wrong" };
  });
  expect((await f.coordinator().start("t").result).reason).toBe("auth_unverified");
  expect((await rows(f.db))[0].target).toBeNull();
});
it.each(["user:bob", "roundtrip", "guest"])(
  "stale auth verification cannot survive %s",
  async (mode) => {
    const f = await fixture(),
      verify = vi.mocked(f.d.auth.verify).getMockImplementation()!,
      gate = deferred<void>(),
      entered = deferred<void>();
    vi.mocked(f.d.auth.verify).mockImplementationOnce(async (e) => {
      const p = await verify(e);
      entered.resolve();
      await gate.promise;
      return p;
    });
    const h = f.coordinator().start("t");
    await entered.promise;
    if (mode === "guest") setActiveOwnerInternal(guest);
    else {
      setActiveOwnerInternal("user:bob");
      if (mode === "roundtrip") setActiveOwnerInternal("user:alice");
    }
    gate.resolve();
    expect((await h.result).state).toBe("blocked");
    expect((await rows(f.db))[0].target).toBeNull();
  },
);
it("Guest to User while capture hash waits cannot create handoff", async () => {
  const f = await fixture(),
    gate = deferred<string>(),
    entered = deferred<void>();
  vi.mocked(f.d.foundation.hash).mockImplementationOnce(() => {
    entered.resolve();
    return gate.promise;
  });
  const h = f.coordinator().prepare("t");
  await entered.promise;
  setActiveOwnerInternal("user:bob");
  gate.resolve(await digest(snapshot));
  expect((await h.result).reason).toBe("identity_changed");
  expect(await rows(f.db)).toEqual([]);
});
it("source changed between capture/auth and recovery never binds", async () => {
  const f = await fixture(),
    auth = vi.mocked(f.d.auth.authenticate).getMockImplementation()!;
  vi.mocked(f.d.auth.authenticate).mockImplementationOnce(async (e) => {
    await auth(e);
    methods.setItem.call(localStorage, physical, snapshot.replace("10", "11"));
  });
  expect((await f.coordinator().start("t").result).reason).toBe("snapshot_conflict");
  expect((await rows(f.db))[0].target).toBeNull();
});
it("a different transition cannot bypass an existing target binding", async () => {
  const f = await fixture();
  await f.coordinator().start("t").result;
  setActiveOwnerInternal(guest);
  const before = f.anchor;
  expect((await f.coordinator().prepare("new-transition").result).reason).toBe(
    "transition_conflict",
  );
  expect(f.anchor).toEqual(before);
  expect((await rows(f.db))[0].target.uid).toBe("alice");
});
it("same source cannot change destination even with a new authenticated account", async () => {
  const f = await fixture();
  await f.coordinator().start("t").result;
  setActiveOwnerInternal("user:bob");
  f.receipt = {
    ...f.receipt!,
    uid: "bob",
    sessionUid: "bob",
    switchedIdentity: { ...f.receipt!.switchedIdentity, owner: "user:bob" },
  };
  contextId = "restart-bob";
  expect((await f.coordinator().resume("t").result).reason).toBe("target_conflict");
  expect((await rows(f.db))[0].target.uid).toBe("alice");
});
it("same-coordinator duplicate start is single flight; another transition is blocked", async () => {
  const f = await fixture(),
    gate = deferred<void>(),
    auth = vi.mocked(f.d.auth.authenticate).getMockImplementation()!;
  vi.mocked(f.d.auth.authenticate).mockImplementationOnce(async (e) => {
    await gate.promise;
    await auth(e);
  });
  const c = f.coordinator(),
    first = c.start("t");
  expect(c.start("t")).toBe(first);
  expect((await c.start("other").result).reason).toBe("concurrent_transition");
  gate.resolve();
  expect((await first.result).state).toBe("awaiting_consent");
  expect(f.d.auth.authenticate).toHaveBeenCalledTimes(1);
});
it("two coordinators cannot claim the source for different transitions", async () => {
  const f = await fixture();
  const results = await Promise.all([
    f.coordinator().prepare("t").result,
    f.coordinator().prepare("other").result,
  ]);
  expect(results.map((r) => r.state).sort()).toEqual(["awaiting_auth", "blocked"]);
  expect(await rows(f.db)).toHaveLength(1);
});
it("no Web Locks allows ordinary login without handoff writes", async () => {
  const f = await fixture();
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  const o = await f.coordinator().start("t").result;
  expect(o.state).toBe("blocked");
  expect(o.normalLoginAllowed).toBe(true);
  expect(f.d.auth.authenticate).toHaveBeenCalledWith(null);
  expect(await rows(f.db)).toEqual([]);
});
it("timeout does not cancel a pending IDB/anchor write; late completion cannot auto-bind", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const f = await fixture(),
    gate = deferred<void>(),
    entered = deferred<void>(),
    write = vi.mocked(f.d.anchor.write).getMockImplementation()!;
  vi.mocked(f.d.anchor.write).mockImplementationOnce(async (...args) => {
    entered.resolve();
    await gate.promise;
    await write(...args);
  });
  const h = f.coordinator().start("t", 1000);
  await entered.promise;
  await vi.advanceTimersByTimeAsync(1000);
  expect(await h.result).toMatchObject({ state: "timed_out", reason: "outcome_unresolved" });
  expect(f.d.auth.authenticate).toHaveBeenCalledWith(null);
  gate.resolve();
  expect((await h.settled).state).toBe("timed_out");
  expect(f.anchor.phase).toBe("prepared");
  expect(await rows(f.db)).toEqual([]);
});
it("unknown anchor shape is not silently reset", async () => {
  const f = await fixture();
  f.anchor = { bad: "data" };
  expect((await f.coordinator().prepare("t").result).reason).toBe("anchor_corrupt");
  expect(f.anchor).toEqual({ bad: "data" });
  expect(await rows(f.db)).toEqual([]);
});
it("actual journal reopen before consent restores same binding and no grants", async () => {
  const f = await fixture();
  await f.coordinator().start("t").result;
  const before = await rows(f.db);
  f.db.close();
  f.d.foundation.db = await openHandoffJournal(factory, "irth-guest-handoff-synthetic:transition");
  connections.push(f.d.foundation.db);
  contextId = "restart";
  expect((await f.coordinator().resume("t").result).state).toBe("awaiting_consent");
  expect(await rows(f.d.foundation.db)).toEqual(before);
  expect(raw()).toBe(snapshot);
});
it("source recovery capability unavailable blocks, never falls back to a current user namespace", async () => {
  const f = await fixture();
  vi.mocked(f.d.recoveredSnapshot).mockRejectedValueOnce(Error("source_reverification_required"));
  expect((await f.coordinator().start("t").result).reason).toBe("source_reverification_required");
  expect((await rows(f.db))[0].target).toBeNull();
});
it("an actual pending IDB boundary times out without a false abort claim", async () => {
  const f = await fixture();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.mocked(f.d.auth.authenticate).mockResolvedValueOnce();
  const entered = deferred<void>();
  let tx: any;
  vi.spyOn(f.db, "transaction").mockImplementationOnce(() => {
    tx = {
      oncomplete: null,
      onabort: null,
      error: null,
      objectStore: () => ({
        get: () => {
          entered.resolve();
          return { onsuccess: null, result: undefined };
        },
      }),
      abort() {
        queueMicrotask(() => tx.onabort?.());
      },
    };
    return tx;
  });
  const handle = f.coordinator().start("t", 1000);
  await entered.promise;
  let settled = false;
  void handle.settled.then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(await handle.result).toMatchObject({ state: "timed_out", reason: "outcome_unresolved" });
  expect(settled).toBe(false);
  expect(handle.authWork()).not.toBeNull();
  expect(f.anchor.phase).toBe("prepared");
  tx.abort();
  expect((await handle.settled).state).toBe("timed_out");
  vi.restoreAllMocks();
  expect(await rows(f.db)).toEqual([]);
});
it("IDB quota after successful login preserves target claim without reporting consent", async () => {
  const f = await fixture(),
    original = f.db.transaction.bind(f.db);
  vi.spyOn(f.db, "transaction").mockImplementation(((...args: any[]) => {
    const tx = (original as any)(...args) as IDBTransaction;
    const store = tx.objectStore.bind(tx);
    tx.objectStore = (name: string) => {
      const s = store(name);
      if (name === "handoffs")
        s.put = () => {
          throw new DOMException("full", "QuotaExceededError");
        };
      return s;
    };
    return tx;
  }) as typeof f.db.transaction);
  const o = await f.coordinator().start("t").result;
  expect(o.state).toBe("blocked");
  expect(o.normalLoginAllowed).toBe(true);
  expect(getActiveOwner()).toBe("user:alice");
  expect(f.anchor.phase).toBe("target_claimed");
  vi.restoreAllMocks();
  expect((await rows(f.db))[0].target).toBeNull();
  expect((await f.coordinator().resume("t").result).state).toBe("awaiting_consent");
});
it("same UID without session continuity is insufficient after restart", async () => {
  const f = await fixture();
  await f.coordinator().start("t").result;
  contextId = "new-runtime";
  const verify = vi.mocked(f.d.auth.verify).getMockImplementation()!;
  vi.mocked(f.d.auth.verify).mockImplementation(
    async (e) => ({ ...(await verify(e))!, sessionContinuity: false }) as unknown as AuthProof,
  );
  expect((await f.coordinator().resume("t").result).reason).toBe("auth_unverified");
  expect((await rows(f.db))[0].target.uid).toBe("alice");
});
it("two coordinators never automatically restart an already begun auth attempt", async () => {
  const f = await fixture(),
    gate = deferred<void>(),
    entered = deferred<void>(),
    auth = vi.mocked(f.d.auth.authenticate).getMockImplementation()!;
  vi.mocked(f.d.auth.authenticate).mockImplementationOnce(async (e) => {
    entered.resolve();
    await gate.promise;
    await auth(e);
  });
  const first = f.coordinator().start("t");
  await entered.promise;
  const second = await f.coordinator().start("t").result;
  expect(second.reason).toBe("auth_attempt_unresolved");
  expect(second.normalLoginAllowed).toBe(true);
  expect(f.d.auth.authenticate).toHaveBeenCalledTimes(1);
  gate.resolve();
  expect((await first.result).state).toBe("awaiting_consent");
});
it("a damaged snapshot hash in anchor cannot inherit an authenticated receipt", async () => {
  const f = await fixture();
  await f.coordinator().start("t").result;
  const a = f.anchor;
  a.evidence!.snapshotHash = "different";
  f.anchor = a;
  expect((await f.coordinator().resume("t").result).reason).toBe("auth_unverified");
  expect((await rows(f.db))[0].snapshotHash).toBe(await digest(snapshot));
});
it("an existing independent intent cannot be adopted by new reserved IDs", async () => {
  const f = await fixture();
  const original = await createHandoffFoundation(f.d.foundation).capture(
    createGuestSourceCapturePort(),
    "t",
  );
  const o = await f.coordinator().prepare("t").result;
  expect(o).toMatchObject({ state: "blocked", reason: "source_conflict" });
  expect((await rows(f.db))[0]).toEqual(original);
  expect(f.anchor.evidence!.handoffId).not.toBe(original.id);
});
it("fallback login still in flight retains the local single-flight slot", async () => {
  const f = await fixture();
  f.anchor = null;
  const auth = deferred<void>();
  vi.mocked(f.d.auth.authenticate).mockImplementationOnce(() => auth.promise);
  const c = f.coordinator(),
    first = c.start("t");
  expect((await first.result).state).toBe("blocked");
  expect((await c.start("other").result).reason).toBe("concurrent_transition");
  expect(f.d.auth.authenticate).toHaveBeenCalledTimes(1);
  auth.resolve();
  await first.authWork();
});
