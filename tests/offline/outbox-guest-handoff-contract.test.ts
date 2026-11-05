import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHandoffFoundation, openHandoffJournal } from "@/lib/campaigns/guest-handoff/journal";
import type {
  Dependencies,
  GuestCapturePort,
  Handoff,
  Identity,
} from "@/lib/campaigns/guest-handoff/contract";

const raw = JSON.stringify({
  boundUid: null,
  entries: {
    "c::a": {
      campaignId: "c",
      chapterId: "a",
      status: "completed",
      completed: true,
      bufferedAt: "2026-01-01T00:00:00Z",
      xpEarned: 20,
      coinsEarned: 10,
    },
  },
});
const hash = async (v: string) => createHash("sha256").update(v).digest("hex");
let factory: IDBFactory,
  serial = 0;
const connections: IDBDatabase[] = [];
async function connect(name = "irth-guest-handoff-synthetic:test") {
  const db = await openHandoffJournal(factory, name);
  connections.push(db);
  return db;
}
function context(db: IDBDatabase, owner = "guest:d", contextId = `ctx-${++serial}`) {
  let current: Identity = { owner, epoch: 0, contextId, ready: true };
  const listeners = new Set<() => void>();
  const verify = vi.fn(async (uid: string, transitionId: string | null) => ({ uid, transitionId }));
  const digest = vi.fn(hash);
  const d: Dependencies = {
    db,
    identity: () => current,
    subscribeInvalidation(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    verifyTarget: verify,
    hash: digest,
    newId: () => `id-${++serial}`,
    now: () => 1000 + serial,
  };
  const p = createHandoffFoundation(d);
  return {
    p,
    verify,
    digest,
    d,
    listeners,
    switch(owner: string) {
      current = { ...current, owner, epoch: current.epoch + 1 };
      for (const fn of [...listeners]) fn();
    },
    dispose() {
      current = { ...current, ready: false };
      for (const fn of [...listeners]) fn();
    },
  };
}
function port(snapshot = raw, deviceId = "d"): GuestCapturePort {
  return {
    address: {
      deviceId,
      sourceGuestOwner: `guest:${deviceId}`,
      physicalKey: `physical:${deviceId}:campaign`,
      schema: "buffer-v1",
      generation: 1,
    },
    persistedDeviceId: deviceId,
    provenance: "captured_active_guest",
    withSnapshot: vi.fn(async (work) => work(snapshot)),
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function rows(db: IDBDatabase, store: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store);
    const r = tx.objectStore(store).getAll();
    tx.oncomplete = () => resolve(r.result);
    tx.onabort = () => reject(tx.error);
  });
}
async function mutate(db: IDBDatabase, store: string, work: (v: any) => any) {
  const v = (await rows(db, store))[0];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(work(v));
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
/** IDB API operations on fake-indexeddb, controlled faults immediately before write or at commit event. */
function instrument(
  db: IDBDatabase,
  hooks: {
    write?: (store: string, value: any, tx: IDBTransaction) => void;
    commit?: (wrote: boolean) => void;
  },
) {
  const original = db.transaction.bind(db);
  return vi.spyOn(db, "transaction").mockImplementation(((...args: any[]) => {
    const tx = (original as any)(...args) as IDBTransaction;
    let wrote = false;
    tx.addEventListener("complete", () => hooks.commit?.(wrote));
    const store = tx.objectStore.bind(tx);
    tx.objectStore = (name: string) => {
      const target = store(name);
      return new Proxy(target, {
        get(obj, key) {
          const v = Reflect.get(obj, key, obj);
          if (key === "add" || key === "put")
            return (value: any, ...rest: any[]) => {
              wrote = true;
              hooks.write?.(name, value, tx);
              return (v as Function).call(obj, value, ...rest);
            };
          return typeof v === "function" ? v.bind(obj) : v;
        },
      });
    };
    return tx;
  }) as typeof db.transaction);
}
async function setup() {
  const db = await connect();
  const c = context(db);
  const h = await c.p.capture(port(), "transition");
  return { db, c, h };
}
async function bound() {
  const f = await setup();
  f.c.switch("user:alice");
  const h = await f.c.p.bind(f.h.id, 0, "alice", "transition");
  return { ...f, h };
}
beforeEach(() => {
  factory = new IDBFactory();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
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
});
afterEach(() => {
  for (const db of connections.splice(0)) db.close();
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("P1-06D-01 inactive provenance/intent foundation", () => {
  it("persists a complete source and intent only after commit", async () => {
    const { db, c, h } = await setup();
    expect(h).toMatchObject({
      phase: "awaiting_target",
      target: null,
      consent: null,
      mode: "foundation_only",
      snapshot: raw,
      revision: 0,
    });
    expect(h.snapshotHash).toBe(await hash(raw));
    expect(await rows(db, "sources")).toHaveLength(1);
    expect(await rows(db, "handoffs")).toHaveLength(1);
    expect(c.listeners.size).toBe(0);
  });
  it("retries the same source with stable handoff/source IDs and appends history", async () => {
    const { db, c, h } = await setup();
    const retry = await c.p.capture(port(), "transition");
    expect(retry.id).toBe(h.id);
    expect(retry.sourceId).toBe(h.sourceId);
    expect(retry.attempts).toHaveLength(2);
    expect(retry.revision).toBe(1);
    expect(await rows(db, "sources")).toHaveLength(1);
  });
  it("does not replace an earlier snapshot when source contents change", async () => {
    const { db, c, h } = await setup();
    await expect(c.p.capture(port(raw.replace("20", "21")), "transition")).rejects.toMatchObject({
      reason: "snapshot_conflict",
    });
    expect((await rows(db, "handoffs"))[0]).toEqual(h);
  });
  it("does not mint a new handoff for another transition", async () => {
    const { db, c, h } = await setup();
    await expect(c.p.capture(port(), "new-transition")).rejects.toMatchObject({
      reason: "transition_conflict",
    });
    expect((await rows(db, "handoffs"))[0]).toEqual(h);
  });
  it("rejects another guest on a shared device without reading its snapshot", async () => {
    const { c } = await setup();
    const other = port(raw, "other");
    await expect(c.p.capture(other, "transition")).rejects.toMatchObject({
      reason: "source_conflict",
    });
    expect(other.withSnapshot).not.toHaveBeenCalled();
  });
  it("rejects an unpersisted device identity", async () => {
    const db = await connect();
    const c = context(db);
    const p = port();
    p.persistedDeviceId = "other";
    await expect(c.p.capture(p, "t")).rejects.toMatchObject({ reason: "source_conflict" });
    expect(await rows(db, "handoffs")).toEqual([]);
  });
  it.each(["user:alice", "user:bob"])("never captures under %s", async (owner) => {
    const db = await connect();
    const c = context(db, owner);
    const p = port();
    await expect(c.p.capture(p, "t")).rejects.toMatchObject({ reason: "source_conflict" });
    expect(p.withSnapshot).not.toHaveBeenCalled();
  });
  it("refuses unknown legacy origin without overwriting its bytes", async () => {
    const db = await connect();
    const c = context(db);
    const p = port();
    p.provenance = "legacy_unknown";
    await expect(c.p.capture(p, "t")).rejects.toMatchObject({ reason: "legacy_unknown" });
    expect(p.withSnapshot).not.toHaveBeenCalled();
    expect(await rows(db, "sources")).toEqual([]);
  });
  it("labels V17 captured now without claiming historical provenance", async () => {
    const db = await connect();
    const c = context(db);
    const p = port();
    p.provenance = "legacy_captured_now";
    const h = await c.p.capture(p, "t");
    expect(h.provenance).toBe("legacy_captured_now");
    expect(h.target).toBeNull();
    expect(h.snapshot).toBe(raw);
  });
  it.each([
    "",
    "{",
    '{"boundUid":null,"entries":[]}',
    raw.replace('"status":"completed"', '"status":"bad"'),
    raw.replace('"boundUid":null', '"boundUid":"alice"'),
  ])("preserves/refuses malformed or previously bound V17: %s", async (snapshot) => {
    const db = await connect();
    const c = context(db);
    await expect(c.p.capture(port(snapshot), "t")).rejects.toMatchObject({ reason: "corrupt" });
    expect(await rows(db, "sources")).toEqual([]);
  });
  it("storage/lock read failures cannot create an intent", async () => {
    const db = await connect();
    const c = context(db);
    const p = port();
    p.withSnapshot = async () => {
      throw new Error("coordination_unavailable");
    };
    await expect(c.p.capture(p, "t")).rejects.toThrow("coordination_unavailable");
    expect(await rows(db, "handoffs")).toEqual([]);
  });
  it.each(["new account", "existing account"])(
    "%s must verify a target and separately await approval",
    async () => {
      const { c, h } = await setup();
      c.switch("user:alice");
      const b = await c.p.bind(h.id, 0, "alice", "transition");
      expect(b).toMatchObject({
        phase: "awaiting_consent",
        target: { uid: "alice" },
        consent: null,
      });
      expect(c.verify).toHaveBeenCalledWith("alice", "transition");
    },
  );
  it("records approval for exactly one target, snapshot and policy; not a transfer", async () => {
    const { c, h } = await bound();
    const a = await c.p.decide(h.id, h.revision, h.snapshotHash, "approve");
    expect(a).toMatchObject({
      phase: "approved",
      mode: "foundation_only",
      consent: {
        uid: "alice",
        snapshotHash: h.snapshotHash,
        policyVersion: 1,
        decision: "approve",
      },
    });
    expect(a).not.toHaveProperty("confirmed");
    expect(a).not.toHaveProperty("delivered");
  });
  it.each(["decline", "cancel", "block"] as const)(
    "persists %s without releasing target binding",
    async (decision) => {
      const { db, c, h } = await bound();
      const v = await c.p.decide(h.id, h.revision, h.snapshotHash, decision);
      expect(v.phase).toBe(
        { decline: "declined", cancel: "cancelled", block: "blocked" }[decision],
      );
      expect((await rows(db, "sources"))[0].boundUid).toBe("alice");
      c.switch("user:bob");
      await expect(c.p.bind(h.id, v.revision, "bob", "transition")).rejects.toMatchObject({
        reason: "target_conflict",
      });
    },
  );
  it("cancelling approved intent is not an undo of any server operation", async () => {
    const { c, h } = await bound();
    const approved = await c.p.decide(h.id, h.revision, h.snapshotHash, "approve");
    const cancelled = await c.p.decide(h.id, approved.revision, h.snapshotHash, "cancel");
    expect(cancelled.phase).toBe("cancelled");
    expect(cancelled.consent?.decision).toBe("approve");
    expect(cancelled.target?.uid).toBe("alice");
  });
  it("a different snapshot cannot inherit approval", async () => {
    const { db, c, h } = await bound();
    await expect(c.p.decide(h.id, h.revision, "different", "approve")).rejects.toMatchObject({
      reason: "snapshot_conflict",
    });
    expect((await rows(db, "handoffs"))[0]).toEqual(h);
  });
  it("login alone and wrong transition evidence do not bind", async () => {
    const { db, c, h } = await setup();
    c.switch("user:alice");
    expect((await rows(db, "handoffs"))[0].target).toBeNull();
    c.verify.mockResolvedValueOnce({ uid: "alice", transitionId: "other" });
    await expect(c.p.bind(h.id, 0, "alice", "transition")).rejects.toMatchObject({
      reason: "transition_conflict",
    });
    expect((await rows(db, "sources"))[0].boundUid).toBeNull();
  });
  it("rejects actual authenticated UID mismatch", async () => {
    const { db, c, h } = await setup();
    c.switch("user:alice");
    c.verify.mockResolvedValueOnce({ uid: "bob", transitionId: "transition" });
    await expect(c.p.bind(h.id, 0, "alice", "transition")).rejects.toMatchObject({
      reason: "transition_conflict",
    });
    expect((await rows(db, "sources"))[0].boundUid).toBeNull();
  });
  it("auth verification failure preserves awaiting_target", async () => {
    const { db, c, h } = await setup();
    c.switch("user:alice");
    c.verify.mockRejectedValueOnce(new Error("offline"));
    await expect(c.p.bind(h.id, 0, "alice", "transition")).rejects.toThrow("offline");
    expect((await rows(db, "handoffs"))[0]).toEqual(h);
  });
  it("stop before intent write leaves no claim or intent", async () => {
    const db = await connect();
    const c = context(db);
    const gate = deferred<string>();
    c.digest.mockReturnValueOnce(gate.promise);
    const pending = c.p.capture(port(), "t");
    await Promise.resolve();
    c.dispose();
    gate.resolve(await hash(raw));
    await expect(pending).rejects.toMatchObject({ reason: "identity_changed" });
    expect(await rows(db, "sources")).toEqual([]);
    expect(await rows(db, "handoffs")).toEqual([]);
  });
  it("cold restart after capture restores same intent before login", async () => {
    const { db, h } = await setup();
    db.close();
    const restarted = context(await connect());
    const restored = await restarted.p.recover(h.id, null);
    expect(restored).toEqual(h);
    expect(restored.target).toBeNull();
  });
  it("restart after login before binding requires original verified transition", async () => {
    const { db, h } = await setup();
    db.close();
    const restarted = context(await connect(), "user:alice");
    await expect(restarted.p.recover(h.id, null)).rejects.toMatchObject({
      reason: "transition_conflict",
    });
    expect((await restarted.p.recover(h.id, "transition")).target).toBeNull();
  });
  it("restart after binding restores awaiting approval under fresh epoch", async () => {
    const { db, h } = await bound();
    db.close();
    const c = context(await connect(), "user:alice", "fresh-runtime");
    const recovered = await c.p.recover(h.id, null);
    expect(recovered).toEqual(h);
    expect(recovered.consent).toBeNull();
    expect(c.verify).toHaveBeenCalledWith("alice", null);
  });
  it("wrong account cannot recover bound data", async () => {
    const { db, h } = await bound();
    const bob = context(db, "user:bob");
    await expect(bob.p.recover(h.id, null)).rejects.toMatchObject({ reason: "identity_changed" });
  });
  it("User A to User B cannot automatically attach an unbound source", async () => {
    const { db, h } = await setup();
    const bob = context(db, "user:bob");
    await expect(bob.p.bind(h.id, 0, "bob", "other-transition")).rejects.toMatchObject({
      reason: "transition_conflict",
    });
    expect((await rows(db, "sources"))[0].boundUid).toBeNull();
  });
  it.each(["user:bob", "roundtrip", "disposed"])(
    "stale verifier callback is fenced: %s",
    async (next) => {
      const { db, c, h } = await setup();
      c.switch("user:alice");
      const gate = deferred<{ uid: string; transitionId: string }>();
      c.verify.mockReturnValueOnce(gate.promise);
      const pending = c.p.bind(h.id, 0, "alice", "transition");
      if (next === "disposed") c.dispose();
      else {
        c.switch("user:bob");
        if (next === "roundtrip") c.switch("user:alice");
      }
      gate.resolve({ uid: "alice", transitionId: "transition" });
      await expect(pending).rejects.toMatchObject({ reason: "identity_changed" });
      expect((await rows(db, "sources"))[0].boundUid).toBeNull();
    },
  );
  it("account switch during approval suppresses stale result and consent", async () => {
    const { db, c, h } = await bound();
    const gate = deferred<{ uid: string; transitionId: null }>();
    c.verify.mockReturnValueOnce(gate.promise);
    const pending = c.p.decide(h.id, h.revision, h.snapshotHash, "approve");
    c.switch("user:bob");
    gate.resolve({ uid: "alice", transitionId: null });
    await expect(pending).rejects.toMatchObject({ reason: "identity_changed" });
    expect((await rows(db, "handoffs"))[0].consent).toBeNull();
  });
  it("CAS rejects stale revision without losing earlier attempts", async () => {
    const { db, c, h } = await bound();
    await expect(c.p.decide(h.id, 0, h.snapshotHash, "approve")).rejects.toMatchObject({
      reason: "revision_conflict",
    });
    expect((await rows(db, "handoffs"))[0]).toEqual(h);
  });
  it("two independent connections cannot bind one source to different targets", async () => {
    const { db, h } = await setup();
    const alice = context(db, "user:alice"),
      bob = context(await connect(), "user:bob");
    const results = await Promise.allSettled([
      alice.p.bind(h.id, 0, "alice", "transition"),
      bob.p.bind(h.id, 0, "bob", "transition"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(loser.reason.reason).toBe("target_conflict");
    const sources = await rows(db, "sources"),
      hs = await rows(db, "handoffs");
    expect(sources).toHaveLength(1);
    expect(hs[0].target.uid).toBe(sources[0].boundUid);
  });
  it("concurrent captures share a unique source and handoff without replacing history", async () => {
    const db = await connect();
    const a = context(db),
      b = context(await connect());
    const results = await Promise.all([
      a.p.capture(port(), "transition"),
      b.p.capture(port(), "transition"),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(await rows(db, "sources")).toHaveLength(1);
    expect((await rows(db, "handoffs"))[0].attempts).toHaveLength(2);
  });
  it("two approvals using one revision yield one commit", async () => {
    const { db, c, h } = await bound();
    const other = context(await connect(), "user:alice");
    const results = await Promise.allSettled([
      c.p.decide(h.id, h.revision, h.snapshotHash, "approve"),
      other.p.decide(h.id, h.revision, h.snapshotHash, "approve"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await rows(db, "handoffs"))[0].attempts).toHaveLength(3);
  });
  it("quota during second insert rolls back the entire source/intent transaction", async () => {
    const db = await connect();
    const c = context(db);
    const spy = instrument(db, {
      write(store) {
        if (store === "handoffs") throw new DOMException("full", "QuotaExceededError");
      },
    });
    await expect(c.p.capture(port(), "t")).rejects.toMatchObject({ reason: "storage_unresolved" });
    spy.mockRestore();
    expect(await rows(db, "sources")).toEqual([]);
    expect(await rows(db, "handoffs")).toEqual([]);
  });
  it("quota during binding rolls back source binding and preserves prior intent", async () => {
    const { db, c, h } = await setup();
    c.switch("user:alice");
    const spy = instrument(db, {
      write(store) {
        if (store === "handoffs") throw new DOMException("full", "QuotaExceededError");
      },
    });
    await expect(c.p.bind(h.id, 0, "alice", "transition")).rejects.toMatchObject({
      reason: "storage_unresolved",
    });
    spy.mockRestore();
    expect((await rows(db, "sources"))[0].boundUid).toBeNull();
    expect((await rows(db, "handoffs"))[0]).toEqual(h);
  });
  it("identity change inside IDB writes aborts both records", async () => {
    const { db, c, h } = await setup();
    c.switch("user:alice");
    const spy = instrument(db, {
      write(store) {
        if (store === "sources") c.switch("user:bob");
      },
    });
    await expect(c.p.bind(h.id, 0, "alice", "transition")).rejects.toMatchObject({
      reason: "identity_changed",
    });
    spy.mockRestore();
    expect((await rows(db, "sources"))[0].boundUid).toBeNull();
    expect((await rows(db, "handoffs"))[0]).toEqual(h);
  });
  it("lost capture acknowledgment after commit recovers committed intent, not an empty default", async () => {
    const db = await connect();
    const c = context(db);
    const spy = instrument(db, { commit: () => c.dispose() });
    await expect(c.p.capture(port(), "t")).rejects.toMatchObject({ reason: "identity_changed" });
    spy.mockRestore();
    const stored = (await rows(db, "handoffs"))[0];
    expect(stored).toBeDefined();
    const fresh = context(await connect());
    expect(await fresh.p.recover(stored.id, null)).toEqual(stored);
    const retry = await fresh.p.capture(port(), "t");
    expect(retry.id).toBe(stored.id);
  });
  it("lost binding acknowledgment keeps immutable destination on restart", async () => {
    const { db, c, h } = await setup();
    c.switch("user:alice");
    const spy = instrument(db, {
      commit(wrote) {
        if (wrote) c.dispose();
      },
    });
    await expect(c.p.bind(h.id, 0, "alice", "transition")).rejects.toMatchObject({
      reason: "identity_changed",
    });
    spy.mockRestore();
    const fresh = context(await connect(), "user:alice");
    const recovered = await fresh.p.recover(h.id, null);
    expect(recovered.target?.uid).toBe("alice");
    expect(recovered.phase).toBe("awaiting_consent");
    expect(recovered.consent).toBeNull();
  });
  it("closed IndexedDB reports unresolved, never an empty journal", async () => {
    const { db, c, h } = await setup();
    db.close();
    await expect(c.p.recover(h.id, null)).rejects.toMatchObject({ reason: "storage_unresolved" });
  });
  it.each(["phase", "snapshot", "history", "binding"])(
    "corruption in %s is preserved and cannot be repaired by overwriting",
    async (kind) => {
      const { db, c, h } = await setup();
      if (kind === "binding") await mutate(db, "sources", (s) => ({ ...s, boundUid: "other" }));
      else
        await mutate(db, "handoffs", (v) =>
          kind === "phase"
            ? { ...v, phase: "confirmed" }
            : kind === "snapshot"
              ? { ...v, snapshot: raw.replace("20", "21") }
              : { ...v, attempts: [] },
        );
      const before = await rows(db, "handoffs");
      await expect(c.p.recover(h.id, null)).rejects.toMatchObject({ reason: "corrupt" });
      expect(await rows(db, "handoffs")).toEqual(before);
    },
  );
  it("missing journal is not reconstructed from current login", async () => {
    const empty = await openHandoffJournal(factory, "irth-guest-handoff-synthetic:empty");
    connections.push(empty);
    const c = context(empty, "user:alice");
    await expect(c.p.recover("prior-id", "transition")).rejects.toMatchObject({
      reason: "not_found",
    });
    expect(await rows(empty, "sources")).toEqual([]);
  });
  it("source row loss cannot remint another source or erase prior history", async () => {
    const { db, c, h } = await setup();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sources", "readwrite");
      tx.objectStore("sources").delete(h.sourceId);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    await expect(c.p.capture(port(), "transition")).rejects.toMatchObject({ reason: "corrupt" });
    expect((await rows(db, "handoffs"))[0]).toEqual(h);
    expect(await rows(db, "sources")).toEqual([]);
  });
  it("source claimed by Alice cannot be recaptured as a fresh handoff after logout", async () => {
    const { db, c, h } = await bound();
    c.switch("guest:d");
    await expect(c.p.capture(port(), "other-transition")).rejects.toMatchObject({
      reason: "target_conflict",
    });
    expect((await rows(db, "handoffs"))[0]).toEqual(h);
  });
  it("loss of approval acknowledgment recovers approval without creating transfer success", async () => {
    const { db, c, h } = await bound();
    const spy = instrument(db, {
      commit(wrote) {
        if (wrote) c.dispose();
      },
    });
    await expect(c.p.decide(h.id, h.revision, h.snapshotHash, "approve")).rejects.toMatchObject({
      reason: "identity_changed",
    });
    spy.mockRestore();
    const fresh = context(await connect(), "user:alice");
    const recovered = await fresh.p.recover(h.id, null);
    expect(recovered).toMatchObject({
      phase: "approved",
      mode: "foundation_only",
      consent: { decision: "approve" },
    });
    expect(recovered.attempts).toHaveLength(3);
    await expect(fresh.p.decide(h.id, h.revision, h.snapshotHash, "approve")).rejects.toMatchObject(
      { reason: "revision_conflict" },
    );
  });
  it("verification with a foreign persisted device is never used as guest provenance", async () => {
    const db = await connect();
    const c = context(db);
    const p = port();
    p.address.sourceGuestOwner = "guest:foreign";
    await expect(c.p.capture(p, "t")).rejects.toMatchObject({ reason: "invalid_input" });
    expect(p.withSnapshot).not.toHaveBeenCalled();
  });
  it("waiting for a snapshot lock cannot follow a new account", async () => {
    const db = await connect();
    const c = context(db);
    const p = port();
    const lock = deferred<void>();
    p.withSnapshot = async (work) => {
      await lock.promise;
      return work(raw);
    };
    const pending = c.p.capture(p, "t");
    c.switch("user:bob");
    lock.resolve();
    await expect(pending).rejects.toMatchObject({ reason: "identity_changed" });
    expect(await rows(db, "handoffs")).toEqual([]);
  });
  it("read failure never overwrites or empties an existing journal", async () => {
    const { db, c, h } = await setup();
    const spy = vi.spyOn(db, "transaction").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    await expect(c.p.recover(h.id, null)).rejects.toMatchObject({ reason: "storage_unresolved" });
    spy.mockRestore();
    expect((await rows(db, "handoffs"))[0]).toEqual(h);
  });
  it("same-target bind retry keeps the original handoff and appends a separate attempt", async () => {
    const { c, h } = await bound();
    const retried = await c.p.bind(h.id, h.revision, "alice", "transition");
    expect(retried.id).toBe(h.id);
    expect(retried.target).toEqual(h.target);
    expect(retried.attempts).toHaveLength(3);
    expect(retried.consent).toBeNull();
  });
  it("factory explicitly refuses a production database name", async () => {
    expect(() => openHandoffJournal(factory, "irth-production")).toThrow("invalid_input");
  });
  it("no production caller activates the foundation", () => {
    function scan(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? scan(`${directory}/${e.name}`)
          : /\.tsx?$/.test(e.name)
            ? [`${directory}/${e.name}`]
            : [],
      );
    }
    const callers = scan("src").filter((p) => !p.startsWith("src/lib/campaigns/guest-handoff/"));
    expect(callers.length).toBeGreaterThan(100);
    for (const path of callers)
      expect(readFileSync(path, "utf8"), path).not.toMatch(
        /(?:guest-handoff|createHandoffFoundation|openHandoffJournal)/,
      );
  });
  it("inactive package has no application imports, transport, deletion or grants", () => {
    const directory = "src/lib/campaigns/guest-handoff";
    const code = readdirSync(directory)
      .filter((n) => n.endsWith(".ts"))
      .map((n) => readFileSync(`${directory}/${n}`, "utf8"))
      .join("\n");
    expect(code).not.toMatch(/from\s+["']@\//);
    expect(code).not.toMatch(
      /\b(recordChapterProgress|supabase|fetch|localStorage|sessionStorage|addPoints|addDinars|entitlement|deleteDatabase)\s*[.(]/,
    );
    expect(code).not.toMatch(/\.delete\s*\(/);
    expect(code).not.toMatch(/\.clear\s*\(/);
  });
});
