import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createGuestSourceCapturePort } from "@/lib/campaigns/guest-handoff/source-adapter";
import { createHandoffFoundation, openHandoffJournal } from "@/lib/campaigns/guest-handoff/journal";
import { GUEST_BUFFER_KEY, bufferChapterProgress } from "@/lib/campaigns/guest-progress-buffer";
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
const raw =
  ' { "boundUid": null, "entries": {"c::ch":{"campaignId":"c","chapterId":"ch","status":"completed","bufferedAt":"2026-11-05T00:00:00Z","xpEarned":4}} } ';
const device = "source-fixture",
  owner = `guest:${device}`;
let factory: IDBFactory,
  serial = 0;
const connections: IDBDatabase[] = [];
function seed(key: string, value: string) {
  methods.setItem.call(localStorage, key, value);
}
function read(key: string) {
  return methods.getItem.call(localStorage, key);
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
function lockService() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: vi.fn((key: string, _options: unknown, work: () => unknown) => {
      const next = (tails.get(key) ?? Promise.resolve()).then(work);
      tails.set(
        key,
        next.catch(() => {}),
      );
      return next;
    }),
  };
}
async function foundation(db?: IDBDatabase) {
  db ??= await openHandoffJournal(factory, "irth-guest-handoff-synthetic:source");
  connections.push(db);
  const hash = vi.fn(async (s: string) => createHash("sha256").update(s).digest("hex"));
  const instance = `instance-${++serial}`;
  const p = createHandoffFoundation({
    db,
    identity: () => ({
      owner: getActiveOwner(),
      epoch: getIdentityEpoch(),
      contextId: instance,
      ready: true,
    }),
    subscribeInvalidation: (cb) => onOwnerChange(() => cb()),
    verifyTarget: async () => {
      throw new Error("target forbidden");
    },
    hash,
    newId: () => `id-${++serial}`,
    now: () => 1000,
  });
  return { p, db, hash };
}
beforeEach(() => {
  __uninstallPartitionForTests();
  Object.assign(Storage.prototype, methods);
  localStorage.clear();
  __resetIdentityForTests();
  seed(IDENTITY_DEVICE_ID_KEY, device);
  setActiveOwnerInternal(owner);
  installIdentityPartition();
  seed(physicalKey(GUEST_BUFFER_KEY, owner), raw);
  Object.defineProperty(navigator, "locks", { configurable: true, value: lockService() });
  factory = new IDBFactory();
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
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
  Object.assign(Storage.prototype, methods);
  vi.unstubAllGlobals();
});
it("reads the exact raw physical snapshot with installed real Partition", async () => {
  const p = createGuestSourceCapturePort();
  expect(p.address).toEqual({
    deviceId: device,
    sourceGuestOwner: owner,
    physicalKey: physicalKey(GUEST_BUFFER_KEY, owner),
    schema: "buffer-v1",
    generation: 1,
  });
  expect(p.persistedDeviceId).toBe(device);
  expect(p.provenance).toBe("legacy_captured_now");
  const writes = vi.spyOn(Storage.prototype, "setItem"),
    removes = vi.spyOn(Storage.prototype, "removeItem");
  expect(await p.withSnapshot(async (s) => s)).toBe(raw);
  expect(writes).not.toHaveBeenCalled();
  expect(removes).not.toHaveBeenCalled();
});
it("uses exactly the cooperating buffer writer lock name and exclusive mode", async () => {
  const p = createGuestSourceCapturePort();
  await p.withSnapshot(async () => {});
  expect(navigator.locks.request).toHaveBeenCalledWith(
    `irth:guest-storage:${physicalKey(GUEST_BUFFER_KEY, owner)}:write`,
    { mode: "exclusive" },
    expect.any(Function),
  );
});
it("reads via the physical original method, not a mapped/legacy fallback", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("mapped read forbidden");
  });
  const p = createGuestSourceCapturePort();
  expect(await p.withSnapshot(async (s) => s)).toBe(raw);
});
it("does not invoke migration or enumerate storage even when global V17 bytes exist", async () => {
  seed(GUEST_BUFFER_KEY, "global-legacy-bytes");
  seed(physicalKey(GUEST_BUFFER_KEY, "user:alice"), "user-bytes");
  const keys = vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
    throw Error("enumeration forbidden");
  });
  const set = vi.spyOn(Storage.prototype, "setItem"),
    remove = vi.spyOn(Storage.prototype, "removeItem");
  expect(await createGuestSourceCapturePort().withSnapshot(async (s) => s)).toBe(raw);
  expect(keys).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(read(GUEST_BUFFER_KEY)).toBe("global-legacy-bytes");
  expect(read(physicalKey(GUEST_BUFFER_KEY, "user:alice"))).toBe("user-bytes");
});
it("missing device ID fails without creating one", () => {
  methods.removeItem.call(localStorage, IDENTITY_DEVICE_ID_KEY);
  const writes = vi.spyOn(Storage.prototype, "setItem");
  expect(() => createGuestSourceCapturePort()).toThrow("source_conflict");
  expect(read(IDENTITY_DEVICE_ID_KEY)).toBeNull();
  expect(writes).not.toHaveBeenCalled();
});
it("does not call boot identity resolution when partition is absent", () => {
  Object.assign(Storage.prototype, methods);
  __resetIdentityForTests();
  methods.removeItem.call(localStorage, IDENTITY_DEVICE_ID_KEY);
  const writes = vi.spyOn(Storage.prototype, "setItem");
  expect(() => createGuestSourceCapturePort()).toThrow("partition_unavailable");
  expect(writes).not.toHaveBeenCalled();
  expect(read(IDENTITY_DEVICE_ID_KEY)).toBeNull();
});
it("persisted device mismatch fails without using a cached device ID", () => {
  seed(IDENTITY_DEVICE_ID_KEY, "different");
  expect(() => createGuestSourceCapturePort()).toThrow("source_conflict");
});
it("device ID mutation invalidates an existing port", async () => {
  const p = createGuestSourceCapturePort();
  seed(IDENTITY_DEVICE_ID_KEY, "different");
  await expect(p.withSnapshot(async () => true)).rejects.toThrow("source_conflict");
});
it("missing buffer is unknown, never a trusted empty snapshot or global fallback", async () => {
  methods.removeItem.call(localStorage, physicalKey(GUEST_BUFFER_KEY, owner));
  seed(GUEST_BUFFER_KEY, raw);
  const callback = vi.fn();
  await expect(createGuestSourceCapturePort().withSnapshot(callback)).rejects.toThrow("not_found");
  expect(callback).not.toHaveBeenCalled();
  expect(read(GUEST_BUFFER_KEY)).toBe(raw);
});
it.each([
  "",
  "{broken",
  '{"boundUid":null,"entries":[]}',
  raw.replace('"boundUid": null', '"boundUid": "alice"'),
])("rejects corrupt or bound buffer without changing it: %s", async (value) => {
  seed(physicalKey(GUEST_BUFFER_KEY, owner), value);
  const callback = vi.fn();
  await expect(createGuestSourceCapturePort().withSnapshot(callback)).rejects.toThrow("corrupt");
  expect(callback).not.toHaveBeenCalled();
  expect(read(physicalKey(GUEST_BUFFER_KEY, owner))).toBe(value);
});
it("SecurityError reading device ID is explicit and cannot create an identity", () => {
  const spy = vi.spyOn(Storage.prototype as any, "__originalGetItem").mockImplementation(() => {
    throw new DOMException("denied", "SecurityError");
  });
  expect(() => createGuestSourceCapturePort()).toThrow("read_failed");
  spy.mockRestore();
  expect(read(IDENTITY_DEVICE_ID_KEY)).toBe(device);
});
it("SecurityError reading physical buffer is explicit", async () => {
  const original = (Storage.prototype as any).__originalGetItem;
  vi.spyOn(Storage.prototype as any, "__originalGetItem").mockImplementation(function (
    this: Storage,
    key: unknown,
  ) {
    if (key === physicalKey(GUEST_BUFFER_KEY, owner))
      throw new DOMException("denied", "SecurityError");
    return original.call(this, key);
  });
  await expect(createGuestSourceCapturePort().withSnapshot(async () => true)).rejects.toThrow(
    "read_failed",
  );
  expect(read(physicalKey(GUEST_BUFFER_KEY, owner))).toBe(raw);
});
it("absent Web Locks refuses the callback without fallback", async () => {
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  const callback = vi.fn();
  await expect(createGuestSourceCapturePort().withSnapshot(callback)).rejects.toThrow(
    "coordination_unavailable",
  );
  expect(callback).not.toHaveBeenCalled();
  expect(read(physicalKey(GUEST_BUFFER_KEY, owner))).toBe(raw);
});
it("cooperating real buffer writer waits until the full async snapshot callback finishes", async () => {
  const p = createGuestSourceCapturePort(),
    entered = deferred<void>(),
    release = deferred<void>();
  const capture = p.withSnapshot(async (snapshot) => {
    entered.resolve();
    await release.promise;
    expect(read(p.address.physicalKey)).toBe(snapshot);
    return snapshot;
  });
  await entered.promise;
  let writerDone = false;
  const writer = bufferChapterProgress({
    campaignId: "c",
    chapterId: "later",
    status: "completed",
  }).then((v) => {
    writerDone = true;
    return v;
  });
  await Promise.resolve();
  expect(writerDone).toBe(false);
  expect(read(p.address.physicalKey)).toBe(raw);
  release.resolve();
  expect(await capture).toBe(raw);
  expect(await writer).toEqual({ saved: true });
  expect(read(p.address.physicalKey)).toContain("later");
});
it("callback rejection releases the source lock for the real writer", async () => {
  const p = createGuestSourceCapturePort();
  await expect(
    p.withSnapshot(async () => {
      throw Error("callback failed");
    }),
  ).rejects.toThrow("callback failed");
  expect(
    await bufferChapterProgress({ campaignId: "c", chapterId: "later", status: "completed" }),
  ).toEqual({ saved: true });
});
it("Guest to User while waiting for lock refuses before invoking callback", async () => {
  const gate = deferred<void>(),
    entered = deferred<void>();
  const blocker = navigator.locks.request(
    `irth:guest-storage:${physicalKey(GUEST_BUFFER_KEY, owner)}:write`,
    { mode: "exclusive" },
    async () => {
      entered.resolve();
      await gate.promise;
    },
  );
  await entered.promise;
  const callback = vi.fn();
  const pending = createGuestSourceCapturePort().withSnapshot(callback);
  setActiveOwnerInternal("user:alice");
  gate.resolve();
  await blocker;
  await expect(pending).rejects.toThrow("identity_changed");
  expect(callback).not.toHaveBeenCalled();
});
it("old port cannot read after login or Alice to Bob", async () => {
  const p = createGuestSourceCapturePort();
  setActiveOwnerInternal("user:alice");
  await expect(p.withSnapshot(async () => true)).rejects.toThrow("identity_changed");
  expect(() => createGuestSourceCapturePort()).toThrow("not_guest");
  setActiveOwnerInternal("user:bob");
  await expect(p.withSnapshot(async () => true)).rejects.toThrow("identity_changed");
});
it("Guest to User to Guest cannot reuse the old epoch", async () => {
  const p = createGuestSourceCapturePort();
  setActiveOwnerInternal("user:alice");
  setActiveOwnerInternal(owner);
  await expect(p.withSnapshot(async () => true)).rejects.toThrow("identity_changed");
});
it("identity change during callback suppresses its successful result", async () => {
  const p = createGuestSourceCapturePort();
  await expect(
    p.withSnapshot(async () => {
      setActiveOwnerInternal("user:alice");
      return "stale";
    }),
  ).rejects.toThrow("identity_changed");
  expect(read(p.address.physicalKey)).toBe(raw);
});
it("captures through the real adapter into synthetic journal with no binding or source mutation", async () => {
  const { p } = await foundation();
  const h = await p.capture(createGuestSourceCapturePort(), "transition");
  expect(h).toMatchObject({
    snapshot: raw,
    phase: "awaiting_target",
    target: null,
    consent: null,
    mode: "foundation_only",
    provenance: "legacy_captured_now",
  });
  expect(read(physicalKey(GUEST_BUFFER_KEY, owner))).toBe(raw);
});
it("Guest to User during Foundation hash creates no intent", async () => {
  const { p, db, hash } = await foundation(),
    gate = deferred<string>(),
    entered = deferred<void>();
  hash.mockImplementationOnce(() => {
    entered.resolve();
    return gate.promise;
  });
  const pending = p.capture(createGuestSourceCapturePort(), "transition");
  await entered.promise;
  setActiveOwnerInternal("user:alice");
  gate.resolve(createHash("sha256").update(raw).digest("hex"));
  await expect(pending).rejects.toThrow("identity_changed");
  expect(await count(db)).toBe(0);
  expect(read(physicalKey(GUEST_BUFFER_KEY, owner))).toBe(raw);
});
it("Guest to User before IDB commit aborts journal and preserves original buffer", async () => {
  const { p, db } = await foundation();
  const original = db.transaction.bind(db);
  vi.spyOn(db, "transaction").mockImplementation(((...args: any[]) => {
    const tx = (original as any)(...args) as IDBTransaction;
    const objectStore = tx.objectStore.bind(tx);
    tx.objectStore = (name: string) => {
      const store = objectStore(name);
      if (name === "handoffs") {
        const add = store.add.bind(store);
        store.add = ((...a: any[]) => {
          const req = (add as any)(...a) as IDBRequest;
          req.addEventListener("success", () => setActiveOwnerInternal("user:alice"));
          return req;
        }) as typeof store.add;
      }
      return store;
    };
    return tx;
  }) as typeof db.transaction);
  await expect(p.capture(createGuestSourceCapturePort(), "transition")).rejects.toThrow(
    "identity_changed",
  );
  vi.restoreAllMocks();
  expect(await count(db)).toBe(0);
  expect(read(physicalKey(GUEST_BUFFER_KEY, owner))).toBe(raw);
});
it("changed snapshot between attempts is retained without overwriting journal", async () => {
  const { p } = await foundation();
  const first = await p.capture(createGuestSourceCapturePort(), "transition");
  seed(physicalKey(GUEST_BUFFER_KEY, owner), raw.replace('"xpEarned":4', '"xpEarned":5'));
  await expect(p.capture(createGuestSourceCapturePort(), "transition")).rejects.toThrow(
    "snapshot_conflict",
  );
  expect((await p.recover(first.id, null)).snapshot).toBe(raw);
  expect(read(physicalKey(GUEST_BUFFER_KEY, owner))).toContain('"xpEarned":5');
});
it("reopening synthetic journal restores the exact snapshot and stable handoff", async () => {
  const { p, db } = await foundation();
  const h = await p.capture(createGuestSourceCapturePort(), "transition");
  db.close();
  const next = await foundation();
  expect(await next.p.recover(h.id, null)).toEqual(h);
  expect(read(physicalKey(GUEST_BUFFER_KEY, owner))).toBe(raw);
});
it("does not accept relocated user data when guest key is missing", async () => {
  methods.removeItem.call(localStorage, physicalKey(GUEST_BUFFER_KEY, owner));
  seed(physicalKey(GUEST_BUFFER_KEY, "user:alice"), raw);
  await expect(createGuestSourceCapturePort().withSnapshot(async () => true)).rejects.toThrow(
    "not_found",
  );
  expect(read(physicalKey(GUEST_BUFFER_KEY, "user:alice"))).toBe(raw);
});
it("source adapter has no identity creation, migration, transport or mutation calls", () => {
  const code = readFileSync("src/lib/campaigns/guest-handoff/source-adapter.ts", "utf8");
  expect(code).not.toMatch(
    /\b(getDeviceId|guestOwnerKey|installIdentityPartition|migrateLegacyKeys|recordChapterProgress|setActiveOwnerInternal|supabase|console|fetch)\s*[.(]/,
  );
  expect(code).not.toMatch(/\.(setItem|removeItem|clear|key)\s*\(/);
});
async function count(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("handoffs");
    const r = tx.objectStore("handoffs").count();
    tx.oncomplete = () => resolve(r.result);
    tx.onabort = () => reject(tx.error);
  });
}
