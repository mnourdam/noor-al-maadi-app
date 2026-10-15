import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { OutboxItem } from "@/lib/offline/outbox";
import type { DeadLetter } from "@/lib/offline/dead-letter";

vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error("Acceptance tests must not contact a server");
      },
    },
  ),
}));

const KEY = "irth.outbox.dead-letter.v1";
const PREFIX = `${KEY}:entry:`;
const originals = {
  getItem: Storage.prototype.getItem,
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
};
let connections: IDBDatabase[];
let owner: typeof import("@/lib/identity/owner");
let partition: typeof import("@/lib/identity/partition");

function restoreStorage() {
  Object.assign(Storage.prototype, originals);
  for (const key of ["__originalGetItem", "__originalSetItem", "__originalRemoveItem"]) {
    delete (Storage.prototype as unknown as Record<string, unknown>)[key];
  }
}
function lockService() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: (name: string, _options: unknown, run: () => unknown) => {
      const next = (tails.get(name) ?? Promise.resolve()).then(run);
      tails.set(
        name,
        next.catch(() => {}),
      );
      return next;
    },
  };
}
async function install(userId = "alice") {
  owner = await import("@/lib/identity/owner");
  owner.setActiveOwnerInternal(`user:${userId}`);
  partition = await import("@/lib/identity/partition");
  partition.installIdentityPartition();
}
async function restart() {
  connections.forEach((db) => db.close());
  connections = [];
  restoreStorage();
  vi.resetModules();
  await install();
  return api();
}
async function api() {
  return {
    outbox: await import("@/lib/offline/outbox"),
    dead: await import("@/lib/offline/dead-letter"),
  };
}
const physical = (key: string, userId = "alice") => partition.physicalKey(key, `user:${userId}`);
const raw = (key: string) => originals.getItem.call(localStorage, key);
const seed = (key: string, value: string) => originals.setItem.call(localStorage, key, value);
const row = (id: string, userId = "alice"): OutboxItem => ({
  id,
  userId,
  kind: "story_completion",
  payload: { storyId: id },
  createdAt: 1,
  attempts: 0,
});
const letter = (id: string, userId = "alice"): DeadLetter => ({
  id,
  userId,
  kind: "story_completion",
  payload: { storyId: id },
  reason: "story_not_found",
  createdAt: 2,
  originalCreatedAt: 1,
  attempts: 0,
});
// Reconstruct the PRE-FIX on-disk format, independently of the archive API.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function historicalEntry(id: string, source?: OutboxItem) {
  const saved = letter(id);
  if (source?.revision) saved.revision = source.revision;
  const identity = source ? { source, reason: saved.reason } : saved;
  const key = `${PREFIX}${source ? "item:" : "legacy:"}${encodeURIComponent(canonical(identity))}`;
  return {
    key: physical(key),
    value: JSON.stringify({ version: 1, letter: saved, ...(source ? { source } : {}) }),
  };
}

beforeEach(async () => {
  vi.resetModules();
  restoreStorage();
  localStorage.clear();
  connections = [];
  const factory = new IDBFactory();
  const open = factory.open.bind(factory);
  vi.spyOn(factory, "open").mockImplementation((...args) => {
    const request = open(...args);
    request.addEventListener("success", () => connections.push(request.result));
    return request;
  });
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Network forbidden");
    }),
  );
  vi.stubGlobal("navigator", { locks: lockService() });
  await install();
});
afterEach(() => {
  connections.forEach((db) => db.close());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreStorage();
});

describe("E-FIX-01 acceptance: Dead-Letter with the real identity partition", () => {
  it("archives two consecutive operations and reads both physical entries", async () => {
    const { outbox, dead } = await api();
    for (const id of ["one", "two"]) {
      const receipt = await outbox.enqueueWithId("alice", id, "story_completion", { storyId: id });
      expect(await dead.archiveRejected(receipt, "story_not_found")).toBe(true);
    }
    expect(
      dead
        .listDeadLetters("alice")
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(["one", "two"]);
    expect(await outbox.peekAll("alice")).toEqual([]);
  });

  it("closes database connections and reloads modules without losing the archive", async () => {
    const { outbox, dead } = await api();
    const receipt = await outbox.enqueueWithId("alice", "one", "story_completion", {});
    await dead.archiveRejected(receipt, "story_not_found");
    const before = dead.listDeadLetters("alice");
    const after = await restart();
    expect(after.dead.listDeadLetters("alice")).toEqual(before);
    expect(await after.outbox.peekAll("alice")).toEqual([]);
  });

  it("switches owners and clears only the current account's archive", async () => {
    const { dead } = await api();
    await dead.recordDeadLetter(row("shared"), "story_not_found");
    owner.setActiveOwnerInternal("user:bob");
    const bob = await dead.recordDeadLetter(row("shared", "bob"), "story_not_found");
    expect(dead.listDeadLetters("bob").map((entry) => entry.userId)).toEqual(["bob"]);
    const storedBobKey = bob.key;
    expect(partition.ownerOfPhysicalKey(storedBobKey)).toBe("user:bob");
    const untouched = raw(storedBobKey);
    expect(untouched).not.toBeNull();
    owner.setActiveOwnerInternal("user:alice");
    await dead.clearDeadLetters("alice");
    expect(dead.listDeadLetters("alice")).toEqual([]);
    expect(raw(storedBobKey)).toBe(untouched);
    owner.setActiveOwnerInternal("user:bob");
    expect(dead.listDeadLetters("bob")).toHaveLength(1);
  });

  it("never reads, migrates or clears Bob's physical data during Alice operations", async () => {
    const { dead } = await api();
    const bobBad = physical(`${PREFIX}corrupt`, "bob");
    const bobLegacy = physical(KEY, "bob");
    seed(bobBad, "{broken");
    seed(bobLegacy, JSON.stringify([letter("old-bob", "bob")]));
    const reads = vi.spyOn(Storage.prototype, "getItem");
    await dead.recordDeadLetter(row("alice-entry"), "story_not_found");
    expect(dead.listDeadLetters("alice")).toHaveLength(1);
    await dead.migrateDeadLetters();
    await dead.clearDeadLetters("alice");
    expect(reads.mock.calls.some(([key]) => key.endsWith("::owner=user:bob"))).toBe(false);
    expect(raw(bobBad)).toBe("{broken");
    expect(raw(bobLegacy)).toBe(JSON.stringify([letter("old-bob", "bob")]));
  });

  it("rejects an explicit foreign owner request before reading or writing their namespace", async () => {
    const { dead } = await api();
    const reads = vi.spyOn(Storage.prototype, "getItem");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const removes = vi.spyOn(Storage.prototype, "removeItem");
    expect(() => dead.listDeadLetters("bob")).toThrow("owner");
    await expect(dead.recordDeadLetter(row("bob", "bob"), "story_not_found")).rejects.toThrow(
      "owner",
    );
    await expect(dead.clearDeadLetters("bob")).rejects.toThrow("owner");
    expect(reads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(removes).not.toHaveBeenCalled();
  });

  it("migrates revisionless V17 rows without moving another user's legacy snapshots", async () => {
    const { dead } = await api();
    const own = letter("old-alice");
    const foreign = letter("old-bob", "bob");
    localStorage.setItem(KEY, JSON.stringify([own, foreign]));
    expect(dead.listDeadLetters("alice")).toEqual([own]);
    await dead.migrateDeadLetters();
    expect(dead.listDeadLetters("alice")).toEqual([own]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([foreign]);
    const after = await restart();
    expect(after.dead.listDeadLetters("alice")).toEqual([own]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([foreign]);
    await after.dead.clearDeadLetters("alice");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([foreign]);
  });

  it("reads source and legacy entry keys already written with owner suffix before the fix", async () => {
    const { dead } = await api();
    const first = historicalEntry("source", { ...row("source"), revision: "previous-revision" });
    const second = historicalEntry("legacy");
    seed(first.key, first.value);
    seed(second.key, second.value);
    expect(
      dead
        .listDeadLetters("alice")
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(["legacy", "source"]);
    await dead.recordDeadLetter(row("new"), "story_not_found");
    expect(raw(first.key)).toBe(first.value);
    expect(raw(second.key)).toBe(second.value);
    expect(dead.listDeadLetters("alice")).toHaveLength(3);
    await dead.clearDeadLetters("alice");
    expect(raw(first.key)).toBeNull();
    expect(raw(second.key)).toBeNull();
  });

  it.each(["quota", "silent-write", "confirmation-read"])(
    "retains the original operation on %s failure",
    async (failure) => {
      const { outbox, dead } = await api();
      const queued = await outbox.enqueueWithId("alice", "one", "story_completion", {});
      const remove = vi.spyOn(outbox, "remove");
      const set = Storage.prototype.setItem;
      const get = Storage.prototype.getItem;
      let written: string | undefined;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key,
        value,
      ) {
        if (key.startsWith(PREFIX)) {
          if (failure === "quota") throw new DOMException("full", "QuotaExceededError");
          if (failure === "silent-write") return;
          written = key;
        }
        set.call(this, key, value);
      });
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
        if (failure === "confirmation-read" && key === written)
          throw new Error("confirmation denied");
        return get.call(this, key);
      });
      await expect(dead.archiveRejected(queued, "story_not_found")).rejects.toThrow();
      expect(remove).not.toHaveBeenCalled();
      expect(await outbox.peekAll("alice")).toEqual([queued]);
    },
  );

  it.each(["wrong-key", "wrong-owner", "invalid-json", "source-mismatch"])(
    "does not weaken validation for %s entries",
    async (failure) => {
      const { outbox, dead } = await api();
      const queued = await outbox.enqueueWithId("alice", "one", "story_completion", {});
      const old = historicalEntry("old", row("old"));
      const entry = JSON.parse(old.value);
      let key = old.key;
      if (failure === "wrong-key") key = physical(`${PREFIX}wrong`);
      if (failure === "wrong-owner") entry.letter.userId = "bob";
      if (failure === "source-mismatch") entry.source.payload = { changed: true };
      const value = failure === "invalid-json" ? "{" : JSON.stringify(entry);
      seed(key, value);
      await expect(dead.archiveRejected(queued, "story_not_found")).rejects.toThrow();
      await expect(dead.clearDeadLetters("alice")).rejects.toThrow();
      expect(raw(key)).toBe(value);
      expect(await outbox.peekAll("alice")).toEqual([queued]);
    },
  );

  it("confirms the physical archive entry before conditional dequeue", async () => {
    const { outbox, dead } = await api();
    const queued = await outbox.enqueueWithId("alice", "one", "story_completion", {});
    const originalRemove = outbox.remove;
    const remove = vi.spyOn(outbox, "remove").mockImplementation(async (id, expected) => {
      expect(dead.listDeadLetters("alice")).toEqual([
        expect.objectContaining({ id, revision: queued.revision }),
      ]);
      expect(expected).toEqual(queued);
      return originalRemove(id, expected);
    });
    expect(await dead.archiveRejected(queued, "story_not_found")).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("archives the rejected revision without deleting its newer replacement", async () => {
    const { outbox, dead } = await api();
    const old = await outbox.enqueueWithId("alice", "one", "story_completion", { score: 1 });
    const latest = await outbox.enqueueWithId("alice", "one", "story_completion", { score: 2 });
    expect(await dead.archiveRejected(old, "story_not_found")).toBe(false);
    expect(await outbox.peekAll("alice")).toEqual([latest]);
    expect(dead.listDeadLetters("alice")[0].revision).toBe(old.revision);
  });

  it("resumes after archive succeeds but dequeue is interrupted", async () => {
    const { outbox, dead } = await api();
    const queued = await outbox.enqueueWithId("alice", "one", "story_completion", {});
    vi.spyOn(outbox, "remove").mockRejectedValueOnce(new Error("interrupted"));
    await expect(dead.archiveRejected(queued, "story_not_found")).rejects.toThrow("interrupted");
    expect(await outbox.peekAll("alice")).toEqual([queued]);
    const after = await restart();
    expect(after.dead.listDeadLetters("alice")).toHaveLength(1);
    expect(await after.dead.archiveRejected(queued, "story_not_found")).toBe(true);
    expect(after.dead.listDeadLetters("alice")).toHaveLength(1);
    expect(await after.outbox.peekAll("alice")).toEqual([]);
  });

  it("preserves the V17 array through interrupted copy and resumes migration after restart", async () => {
    const { dead } = await api();
    const legacy = [letter("old-one"), letter("old-two")];
    const original = JSON.stringify(legacy);
    localStorage.setItem(KEY, original);
    const set = Storage.prototype.setItem;
    let copies = 0;
    const writing = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key.startsWith(PREFIX) && ++copies === 2)
        throw new DOMException("full", "QuotaExceededError");
      set.call(this, key, value);
    });
    await expect(dead.migrateDeadLetters()).rejects.toThrow();
    expect(localStorage.getItem(KEY)).toBe(original);
    expect(dead.listDeadLetters("alice")).toEqual(legacy);
    writing.mockRestore();
    const after = await restart();
    await after.dead.migrateDeadLetters();
    expect(localStorage.getItem(KEY)).toBe("[]");
    expect(after.dead.listDeadLetters("alice")).toEqual(legacy);
  });

  it("retains the operation when its owner's archive has 500 entries", async () => {
    const { outbox, dead } = await api();
    const legacy = Array.from({ length: 500 }, (_, i) => letter(`old-${i}`));
    localStorage.setItem(KEY, JSON.stringify(legacy));
    const queued = await outbox.enqueueWithId("alice", "new", "story_completion", {});
    await expect(dead.archiveRejected(queued, "story_not_found")).rejects.toThrow(
      "dead-letter-full",
    );
    expect(dead.listDeadLetters("alice")).toHaveLength(500);
    expect(await outbox.peekAll("alice")).toEqual([queued]);
  });

  it("does not dequeue if identity changes during confirmation of the archive write", async () => {
    const { outbox, dead } = await api();
    const queued = await outbox.enqueueWithId("alice", "one", "story_completion", {});
    const get = Storage.prototype.getItem;
    let switched = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = get.call(this, key);
      if (!switched && key.startsWith(PREFIX) && value !== null) {
        switched = true;
        owner.setActiveOwnerInternal("user:bob");
      }
      return value;
    });
    await expect(dead.archiveRejected(queued, "story_not_found")).rejects.toThrow("owner");
    owner.setActiveOwnerInternal("user:alice");
    expect(await outbox.peekAll("alice")).toEqual([queued]);
    expect(dead.listDeadLetters("alice")).toHaveLength(1);
    expect(raw(physical(KEY, "bob"))).toBeNull();
  });

  it("fails closed if the owner changes while archival waits for its lock", async () => {
    const { outbox, dead } = await api();
    const queued = await outbox.enqueueWithId("alice", "one", "story_completion", {});
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("navigator", {
      locks: { request: (_name: string, _options: unknown, run: () => unknown) => gate.then(run) },
    });
    const archival = dead.archiveRejected(queued, "story_not_found");
    owner.setActiveOwnerInternal("user:bob");
    release();
    await expect(archival).rejects.toThrow("owner");
    expect(raw(physical(KEY, "bob"))).toBeNull();
    owner.setActiveOwnerInternal("user:alice");
    expect(await outbox.peekAll("alice")).toEqual([queued]);
    expect(dead.listDeadLetters("alice")).toEqual([]);
  });
});
