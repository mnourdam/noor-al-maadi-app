import { createHash } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  createDurableAnchorPort,
  enrollSyntheticAnchor,
} from "@/lib/campaigns/guest-handoff/anchor-adapter";
import { createExactSourceRecovery } from "@/lib/campaigns/guest-handoff/recovery-adapter";
import { createGuestTransitionCoordinator } from "@/lib/campaigns/guest-handoff/transition-coordinator";
import { createGuestSourceCapturePort } from "@/lib/campaigns/guest-handoff/source-adapter";
import { openHandoffJournal } from "@/lib/campaigns/guest-handoff/journal";
import { addressKey } from "@/lib/campaigns/guest-handoff/codec";
import type {
  Anchor,
  AuthProof,
  TransitionDependencies,
  TransitionEvidence,
} from "@/lib/campaigns/guest-handoff/transition-contract";
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
const ns = "irth-guest-handoff-synthetic:anchor-recovery",
  device = "adapter-device",
  guest = `guest:${device}`,
  physical = physicalKey(GUEST_BUFFER_KEY, guest);
const anchorKey = `test-only:guest-handoff-anchor:${encodeURIComponent(ns)}:${encodeURIComponent(device)}`;
const snapshot =
  ' {"boundUid":null,"entries":{"c::a":{"campaignId":"c","chapterId":"a","status":"completed","bufferedAt":"2026-11-05T00:00:00Z","xpEarned":8}}} ';
const hash = async (s: string) => createHash("sha256").update(s).digest("hex");
let factory: IDBFactory,
  contextId: string,
  serial = 0;
const dbs: IDBDatabase[] = [];
const identity = () => ({
  owner: getActiveOwner(),
  epoch: getIdentityEpoch(),
  contextId,
  ready: true,
});
const raw = (key = physical) => methods.getItem.call(localStorage, key);
const seed = (key: string, value: string) => methods.setItem.call(localStorage, key, value);
function locks() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: vi.fn((key: string, _opts: unknown, work: () => unknown) => {
      const p = (tails.get(key) ?? Promise.resolve()).then(work);
      tails.set(
        key,
        p.catch(() => {}),
      );
      return p;
    }),
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
async function rows(db: IDBDatabase): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("handoffs"),
      req = tx.objectStore("handoffs").getAll();
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = () => reject(tx.error);
  });
}
async function fixture(enroll = true) {
  const faults = {
    readAnchor: false,
    readSource: false,
    quota: false,
    loseAck: false,
    overwrite: false,
    reads: [] as string[],
    anchorWrites: 0,
  };
  const proto = Storage.prototype as any;
  proto.__originalGetItem = function (this: Storage, key: string) {
    faults.reads.push(key);
    if ((key === anchorKey && faults.readAnchor) || (key === physical && faults.readSource))
      throw new DOMException("denied", "SecurityError");
    return methods.getItem.call(this, key);
  };
  proto.__originalSetItem = function (this: Storage, key: string, value: string) {
    if (key === anchorKey) faults.anchorWrites++;
    if (key === anchorKey && faults.quota) throw new DOMException("full", "QuotaExceededError");
    methods.setItem.call(this, key, value);
    if (key === anchorKey && faults.overwrite) methods.setItem.call(this, key, '{"corrupt":true}');
    if (key === anchorKey && faults.loseAck) {
      faults.loseAck = false;
      throw Error("lost acknowledgment after write");
    }
  };
  const anchor = createDurableAnchorPort(ns);
  let grantConsumed = false;
  const authority = {
    consumeFreshFixtureGrant: vi.fn(async (source: any, namespace: string) => {
      if (grantConsumed) throw Error("enrollment_grant_consumed");
      grantConsumed = true;
      return {
        kind: "isolated_synthetic_fixture" as const,
        receiptId: "new-isolated-fixture-authority",
        sourceAddress: addressKey(source),
        namespace,
      };
    }),
  };
  if (enroll) await enrollSyntheticAnchor(anchor, authority);
  const db = await openHandoffJournal(factory, ns);
  dbs.push(db);
  let receipt: AuthProof | null = null;
  const d: TransitionDependencies = {
    foundation: {
      db,
      identity,
      subscribeInvalidation: (cb) => onOwnerChange(() => cb()),
      verifyTarget: async () => {
        throw Error("transition verifier required");
      },
      hash: vi.fn(hash),
      newId: () => `id-${++serial}`,
      now: () => 1000,
    },
    anchor,
    source: createGuestSourceCapturePort,
    auth: {
      authenticate: vi.fn(async (e) => {
        setActiveOwnerInternal("user:alice");
        if (e)
          receipt = {
            transitionId: e.transitionId,
            attemptId: "auth-a",
            sourceOwner: e.source.sourceGuestOwner,
            sourceEpoch: e.capturedIdentity.epoch,
            sourceContextId: e.capturedIdentity.contextId,
            snapshotHash: e.snapshotHash,
            uid: "alice",
            sessionUid: "alice",
            switchedIdentity: identity(),
            currentIdentity: identity(),
            sessionContinuity: true,
          };
      }),
      verify: vi.fn(async () => (receipt ? { ...receipt, currentIdentity: identity() } : null)),
    },
    recoveredSnapshot: async () => {
      throw Error("not configured");
    },
  };
  const recovery = createExactSourceRecovery(d);
  d.recoveredSnapshot = recovery;
  return {
    d,
    db,
    anchor,
    authority,
    faults,
    recovery,
    coordinator: () => createGuestTransitionCoordinator(d),
    async evidence() {
      return ((await anchor.read()) as Anchor).evidence!;
    },
    get receipt(): AuthProof | null {
      return receipt;
    },
    set receipt(v: AuthProof | null) {
      receipt = v;
    },
  };
}
async function bound() {
  const f = await fixture();
  expect((await f.coordinator().start("t").result).state).toBe("awaiting_consent");
  return f;
}
beforeEach(() => {
  __uninstallPartitionForTests();
  Object.assign(Storage.prototype, methods);
  localStorage.clear();
  __resetIdentityForTests();
  seed(IDENTITY_DEVICE_ID_KEY, device);
  setActiveOwnerInternal(guest);
  installIdentityPartition();
  seed(physical, snapshot);
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
  for (const db of dbs.splice(0)) db.close();
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
  Object.assign(Storage.prototype, methods);
  vi.unstubAllGlobals();
});
it("real browser ports work with the unmodified coordinator and exact source adapter", async () => {
  const f = await bound();
  expect(raw()).toBe(snapshot);
  expect(((await f.anchor.read()) as Anchor).target?.uid).toBe("alice");
  expect((await rows(f.db))[0]).toMatchObject({
    consent: null,
    phase: "awaiting_consent",
    target: { uid: "alice" },
  });
  expect(await f.recovery(await f.evidence(), async (s) => s)).toBe(snapshot);
});
it("missing anchor never creates enrolled data from absence", async () => {
  const f = await fixture(false);
  await expect(f.anchor.read()).rejects.toThrow("anchor_missing");
  expect((await f.coordinator().start("t").result).state).toBe("blocked");
  expect(raw(anchorKey)).toBeNull();
  expect(await rows(f.db)).toEqual([]);
});
it("positive enrollment authority is checked, not inferred from missing keys", async () => {
  const f = await fixture(false);
  f.authority.consumeFreshFixtureGrant.mockRejectedValueOnce(
    Error("no positive installation evidence"),
  );
  await expect(enrollSyntheticAnchor(f.anchor, f.authority)).rejects.toThrow(
    "no positive installation evidence",
  );
  expect(raw(anchorKey)).toBeNull();
});
it("foreign positive enrollment receipt does not initialize the slot", async () => {
  const f = await fixture(false);
  f.authority.consumeFreshFixtureGrant.mockResolvedValueOnce({
    kind: "isolated_synthetic_fixture",
    receiptId: "x",
    sourceAddress: "other",
    namespace: ns,
  });
  await expect(enrollSyntheticAnchor(f.anchor, f.authority)).rejects.toThrow(
    "positive_enrollment_required",
  );
  expect(raw(anchorKey)).toBeNull();
});
it("enrollment refuses to overwrite any existing anchor", async () => {
  const f = await fixture();
  const before = raw(anchorKey);
  await expect(enrollSyntheticAnchor(f.anchor, f.authority)).rejects.toThrow(
    "anchor_already_exists",
  );
  expect(raw(anchorKey)).toBe(before);
});
it("enrollment cannot be performed from an authenticated owner", async () => {
  const f = await fixture(false);
  setActiveOwnerInternal("user:alice");
  await expect(enrollSyntheticAnchor(f.anchor, f.authority)).rejects.toThrow("not_guest");
  expect(raw(anchorKey)).toBeNull();
});
it("factory refuses a production namespace", () => {
  expect(() => createDurableAnchorPort("irth-production")).toThrow("synthetic_namespace_required");
});
it("missing device ID does not cause generation or source guessing", () => {
  methods.removeItem.call(localStorage, IDENTITY_DEVICE_ID_KEY);
  expect(() => createDurableAnchorPort(ns)).toThrow("source_conflict");
  expect(raw(IDENTITY_DEVICE_ID_KEY)).toBeNull();
});
it("no partition is installed as a side effect", () => {
  Object.assign(Storage.prototype, methods);
  expect(() => createDurableAnchorPort(ns)).toThrow("partition_unavailable");
  expect(raw()).toBe(snapshot);
});
it.each([
  "",
  "{",
  '{"schema":9}',
  '{"schema":1,"address":"foreign","phase":"enrolled","revision":0,"target":null,"evidence":null}',
])("corrupt anchor stays unchanged: %s", async (corrupt) => {
  const f = await fixture();
  seed(anchorKey, corrupt);
  await expect(f.anchor.read()).rejects.toThrow();
  expect((await f.coordinator().prepare("t").result).state).toBe("blocked");
  expect(raw(anchorKey)).toBe(corrupt);
  expect(await rows(f.db)).toEqual([]);
});
it("SecurityError reading anchor remains unknown, without replacement", async () => {
  const f = await fixture();
  const before = raw(anchorKey);
  f.faults.readAnchor = true;
  await expect(f.anchor.read()).rejects.toThrow("anchor_unreadable");
  expect((await f.coordinator().prepare("t").result).state).toBe("blocked");
  expect(raw(anchorKey)).toBe(before);
});
it("quota before anchor write cannot create a journal intent", async () => {
  const f = await fixture();
  const before = raw(anchorKey);
  f.faults.quota = true;
  expect((await f.coordinator().prepare("t").result).reason).toBe("anchor_write_unresolved");
  expect(raw(anchorKey)).toBe(before);
  expect(await rows(f.db)).toEqual([]);
});
it("read-after-write detects an old noncooperating anchor writer and never repairs it", async () => {
  const f = await fixture();
  f.faults.overwrite = true;
  expect((await f.coordinator().prepare("t").result).reason).toBe("anchor_write_unresolved");
  expect(raw(anchorKey)).toBe('{"corrupt":true}');
  expect(await rows(f.db)).toEqual([]);
});
it("lost anchor acknowledgment recovers the same reserved source/handoff", async () => {
  const f = await fixture();
  f.faults.loseAck = true;
  expect((await f.coordinator().prepare("t").result).state).toBe("blocked");
  const first = ((await f.anchor.read()) as Anchor).evidence;
  expect(first).not.toBeNull();
  expect((await f.coordinator().prepare("t").result).state).toBe("awaiting_auth");
  const h = (await rows(f.db))[0];
  expect(h.id).toBe(first!.handoffId);
  expect(h.sourceId).toBe(first!.sourceId);
});
it("anchor writes require the port's exclusive lock", async () => {
  const f = await fixture();
  const a = (await f.anchor.read()) as Anchor;
  await expect(f.anchor.write({ ...a, revision: 1 }, 0)).rejects.toThrow("anchor_lock_required");
});
it("revision mismatch never overwrites an existing valid anchor", async () => {
  const f = await fixture();
  await f.coordinator().prepare("t").result;
  const a = (await f.anchor.read()) as Anchor,
    before = raw(anchorKey);
  await expect(
    f.anchor.exclusive(() =>
      f.anchor.write({ ...a, phase: "auth_started", revision: a.revision }, a.revision - 1),
    ),
  ).rejects.toThrow("anchor_revision_conflict");
  expect(raw(anchorKey)).toBe(before);
});
it("idempotent acknowledgment retry is read-only and does not advance revision", async () => {
  const f = await fixture();
  await f.coordinator().prepare("t").result;
  const a = (await f.anchor.read()) as Anchor;
  const next = { ...a, phase: "auth_started" as const, revision: a.revision + 1 };
  await f.anchor.exclusive(() => f.anchor.write(next, a.revision));
  const writes = f.faults.anchorWrites;
  await f.anchor.exclusive(() => f.anchor.write(next, a.revision));
  expect(f.faults.anchorWrites).toBe(writes);
  expect(await f.anchor.read()).toEqual(next);
});
it("two ports serialize conflicting writes with one revision winner", async () => {
  const f = await fixture();
  await f.coordinator().prepare("t").result;
  const a = (await f.anchor.read()) as Anchor,
    second = createDurableAnchorPort(ns);
  const left = { ...a, phase: "auth_started" as const, revision: a.revision + 1 },
    right = {
      ...a,
      phase: "target_claimed" as const,
      target: { uid: "bob", attemptId: "b" },
      revision: a.revision + 1,
    };
  const results = await Promise.allSettled([
    f.anchor.exclusive(() => f.anchor.write(left, a.revision)),
    second.exclusive(() => second.write(right, a.revision)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(((await f.anchor.read()) as Anchor).phase).toBe("auth_started");
});
it("anchor cannot rebind Alice or remove her target with a valid newer revision", async () => {
  const f = await bound(),
    a = (await f.anchor.read()) as Anchor,
    before = raw(anchorKey);
  await expect(
    f.anchor.exclusive(() =>
      f.anchor.write(
        { ...a, target: { uid: "bob", attemptId: "b" }, revision: a.revision + 1 },
        a.revision,
      ),
    ),
  ).rejects.toThrow("target_conflict");
  expect(raw(anchorKey)).toBe(before);
});
it("anchor cannot change source/transition/hash/IDs after preparation", async () => {
  const f = await fixture();
  await f.coordinator().prepare("t").result;
  const a = (await f.anchor.read()) as Anchor,
    before = raw(anchorKey);
  await expect(
    f.anchor.exclusive(() =>
      f.anchor.write(
        { ...a, evidence: { ...a.evidence!, transitionId: "new" }, revision: a.revision + 1 },
        a.revision,
      ),
    ),
  ).rejects.toThrow("anchor_evidence_conflict");
  expect(raw(anchorKey)).toBe(before);
});
it("missing anchor with intact journal blocks recovery without source access", async () => {
  const f = await bound(),
    e = await f.evidence();
  methods.removeItem.call(localStorage, anchorKey);
  f.faults.reads = [];
  await expect(f.recovery(e, async () => true)).rejects.toThrow("anchor_missing");
  expect(f.faults.reads).not.toContain(physical);
  expect((await rows(f.db))[0].target.uid).toBe("alice");
});
it("missing journal with intact anchor blocks instead of creating a new intent", async () => {
  const f = await bound(),
    e = await f.evidence(),
    before = raw(anchorKey);
  const empty = new IDBFactory();
  f.d.foundation.db = await openHandoffJournal(empty, ns);
  dbs.push(f.d.foundation.db);
  const recovery = createExactSourceRecovery(f.d);
  await expect(recovery(e, async () => true)).rejects.toThrow("not_found");
  expect(await rows(f.d.foundation.db)).toEqual([]);
  expect(raw(anchorKey)).toBe(before);
});
it("corrupt journal is never accepted as anchor/source proof", async () => {
  const f = await bound(),
    e = await f.evidence();
  const h = (await rows(f.db))[0];
  await new Promise<void>((r) => {
    const tx = f.db.transaction("handoffs", "readwrite");
    tx.objectStore("handoffs").put({ ...h, snapshotHash: "damaged" });
    tx.oncomplete = () => r();
  });
  await expect(f.recovery(e, async () => true)).rejects.toThrow("corrupt");
  expect(raw()).toBe(snapshot);
});
it("changed source bytes are retained and not treated as the captured snapshot", async () => {
  const f = await bound();
  seed(physical, snapshot.replace("8", "9"));
  await expect(f.recovery(await f.evidence(), async () => true)).rejects.toThrow(
    "snapshot_conflict",
  );
  expect(raw()).toContain('"xpEarned":9');
});
it.each(["sourceGuestOwner", "physicalKey", "handoffId", "transitionId", "snapshotHash"])(
  "correct handoff cannot authorize a mismatched %s",
  async (field) => {
    const f = await bound(),
      e = await f.evidence();
    const forged = structuredClone(e);
    if (field === "sourceGuestOwner") forged.source.sourceGuestOwner = "guest:other";
    else if (field === "physicalKey")
      forged.source.physicalKey = physicalKey(GUEST_BUFFER_KEY, "guest:other");
    else (forged as any)[field] = "other";
    f.faults.reads = [];
    await expect(f.recovery(forged, async () => true)).rejects.toThrow();
    expect(f.faults.reads).not.toContain(physical);
  },
);
it("a shared-device caller cannot select another guest or current user's namespace", async () => {
  const f = await bound();
  const other = physicalKey(GUEST_BUFFER_KEY, "guest:other");
  seed(other, "other-owner-sentinel");
  const e = await f.evidence();
  e.source = {
    ...e.source,
    deviceId: "other",
    sourceGuestOwner: "guest:other",
    physicalKey: other,
  };
  f.faults.reads = [];
  await expect(f.recovery(e, async () => true)).rejects.toThrow("source_conflict");
  expect(f.faults.reads).not.toContain(other);
  expect(raw(other)).toBe("other-owner-sentinel");
});
it("Bob cannot recover Alice's valid handoff or read its source bytes", async () => {
  const f = await bound(),
    e = await f.evidence();
  setActiveOwnerInternal("user:bob");
  f.faults.reads = [];
  await expect(f.recovery(e, async () => true)).rejects.toThrow();
  expect(f.faults.reads).not.toContain(physical);
  expect((await rows(f.db))[0].target.uid).toBe("alice");
});
it("same-context Alice to Bob to Alice with another epoch rejects old evidence", async () => {
  const f = await bound(),
    e = await f.evidence();
  setActiveOwnerInternal("user:bob");
  setActiveOwnerInternal("user:alice");
  await expect(f.recovery(e, async () => true)).rejects.toThrow("identity_changed");
});
it("fresh context requires actual session verification and restores original fixed source", async () => {
  const f = await bound();
  f.db.close();
  const db = await openHandoffJournal(factory, ns);
  dbs.push(db);
  f.d.foundation.db = db;
  f.d.anchor = createDurableAnchorPort(ns);
  f.d.recoveredSnapshot = createExactSourceRecovery(f.d);
  contextId = "cold-runtime";
  expect((await f.coordinator().resume("t").result).state).toBe("awaiting_consent");
  expect(raw()).toBe(snapshot);
});
it("session UID mismatch is not repaired by a matching caller UID", async () => {
  const f = await bound();
  f.receipt = { ...f.receipt!, sessionUid: "bob" };
  await expect(f.recovery(await f.evidence(), async () => true)).rejects.toThrow("auth_unverified");
});
it("SecurityError reading the source preserves bytes and blocks", async () => {
  const f = await bound();
  f.faults.readSource = true;
  await expect(f.recovery(await f.evidence(), async () => true)).rejects.toThrow(
    "source_unreadable",
  );
  expect(raw()).toBe(snapshot);
});
it("absence of Web Locks has no unsafe recovery fallback", async () => {
  const f = await bound(),
    e = await f.evidence();
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  await expect(f.recovery(e, async () => true)).rejects.toThrow("coordination_unavailable");
  expect(raw()).toBe(snapshot);
});
it("the original Guest-only source adapter remains closed after login", async () => {
  await bound();
  expect(() => createGuestSourceCapturePort()).toThrow("not_guest");
});
it("cooperating writer in another Guest context waits for full recovery callback", async () => {
  const f = await bound(),
    e = await f.evidence(),
    entered = deferred<void>(),
    release = deferred<void>();
  const reading = f.recovery(e, async (raw) => {
    entered.resolve();
    await release.promise;
    return raw;
  });
  await entered.promise;
  // Same JS owner switch would invalidate Alice; emulate a second tab with the shared original write lock.
  let done = false;
  const writer = navigator.locks.request(
    `irth:guest-storage:${physical}:write`,
    { mode: "exclusive" },
    () => {
      done = true;
      seed(physical, snapshot);
    },
  );
  await Promise.resolve();
  expect(done).toBe(false);
  release.resolve();
  expect(await reading).toBe(snapshot);
  await writer;
  expect(done).toBe(true);
});
it("an old writer outside Web Locks is detected after callback, without pretending exclusion", async () => {
  const f = await bound();
  await expect(
    f.recovery(await f.evidence(), async () => {
      seed(physical, snapshot.replace("8", "9"));
      return "old-success";
    }),
  ).rejects.toThrow("snapshot_conflict");
  expect(raw()).toContain('"xpEarned":9');
});
it("account switch during callback suppresses stale publication", async () => {
  const f = await bound();
  await expect(
    f.recovery(await f.evidence(), async () => {
      setActiveOwnerInternal("user:bob");
      return true;
    }),
  ).rejects.toThrow("identity_changed");
  expect(raw()).toBe(snapshot);
});
it("suspended capability after coordinator deadline cannot start a late bind", async () => {
  const f = await bound();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const original = f.d.recoveredSnapshot,
    entered = deferred<void>(),
    release = deferred<void>();
  f.d.recoveredSnapshot = async (e, work) =>
    original(e, async (raw) => {
      entered.resolve();
      await release.promise;
      return work(raw);
    });
  const handle = f.coordinator().resume("t", 1000);
  await entered.promise;
  await vi.advanceTimersByTimeAsync(1000);
  expect((await handle.result).state).toBe("timed_out");
  release.resolve();
  expect((await handle.settled).state).toBe("timed_out");
  expect((await rows(f.db))[0].consent).toBeNull();
  expect(raw()).toBe(snapshot);
});
it("changed auth during a delayed fresh proof blocks before reading source", async () => {
  const f = await bound(),
    e = await f.evidence(),
    verify = vi.mocked(f.d.auth.verify).getMockImplementation()!,
    gate = deferred<void>(),
    entered = deferred<void>();
  vi.mocked(f.d.auth.verify).mockImplementationOnce(async (evidence) => {
    const p = await verify(evidence);
    entered.resolve();
    await gate.promise;
    return p;
  });
  f.faults.reads = [];
  const pending = f.recovery(e, async () => true);
  await entered.promise;
  setActiveOwnerInternal("user:bob");
  gate.resolve();
  await expect(pending).rejects.toThrow("identity_changed");
  expect(f.faults.reads).not.toContain(physical);
});
it("a consumed enrollment grant cannot remint an anchor after its loss", async () => {
  const f = await fixture();
  await f.coordinator().prepare("t").result;
  const before = await rows(f.db);
  methods.removeItem.call(localStorage, anchorKey);
  await expect(enrollSyntheticAnchor(f.anchor, f.authority)).rejects.toThrow(
    "enrollment_grant_consumed",
  );
  expect(raw(anchorKey)).toBeNull();
  expect(await rows(f.db)).toEqual(before);
});
it("same UID with a changed attempt during unbound recovery is insufficient", async () => {
  const f = await fixture();
  await f.coordinator().prepare("t").result;
  const e = await f.evidence();
  await f.d.auth.authenticate(e);
  const verify = vi.mocked(f.d.auth.verify).getMockImplementation()!;
  let calls = 0;
  vi.mocked(f.d.auth.verify).mockImplementation(async (evidence) => {
    const p = await verify(evidence);
    return { ...p!, attemptId: ++calls === 1 ? "auth-a" : "different-attempt" };
  });
  const callback = vi.fn(async () => true);
  await expect(f.recovery(e, callback)).rejects.toThrow("auth_unverified");
  expect(callback).not.toHaveBeenCalled();
  expect((await rows(f.db))[0].target).toBeNull();
});
