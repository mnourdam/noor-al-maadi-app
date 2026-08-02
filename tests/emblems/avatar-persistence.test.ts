// ============================================================
// Premium Emblem Persistence v1 — durable write contract tests
// ------------------------------------------------------------
// Verifies the acceptance matrix without a device:
//  1. online pick            → "synced" + server received the id
//  2. offline pick           → "queued" (durable outbox) + pending marker
//  3. no queue + failed RPC  → "failed" (caller must revert)
//  4. guest                  → "local" (no server write at all)
//  5. rapid picks            → collapse onto ONE stable outbox id
//  6. account isolation      → pending marker never leaks across uids
//  7. hydration precedence   → local pending > profiles.avatar_id > blob
// ============================================================

import { describe, it, expect, beforeEach, mock } from "bun:test";

// ---- localStorage stub (bun has no DOM) ----
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
(globalThis as any).window = (globalThis as any).window ?? { dispatchEvent: () => true };
(globalThis as any).CustomEvent = (globalThis as any).CustomEvent ?? class { constructor(public type: string) {} };

// ---- controllable fakes ----
const state = {
  uid: "user-A" as string | null,
  rpcCalls: [] as Array<{ fn: string; args: any }>,
  rpcOk: true,
  enqueueOk: true,
  flushSyncs: true,
  enqueued: [] as Array<{ uid: string; id: string; payload: any }>,
  serverAvatar: null as string | null,
};

const PENDING_KEY = "irth.profile.avatar.pending.v1";

mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: state.uid ? { user: { id: state.uid } } : null } }),
    },
    rpc: async (fn: string, args: any) => {
      state.rpcCalls.push({ fn, args });
      if (fn === "get_my_profile") {
        return { data: { avatar_id: state.serverAvatar }, error: null };
      }
      if (!state.rpcOk) return { data: null, error: { message: "network" } };
      if (fn === "sync_my_public_stats") {
        state.serverAvatar = args?.p_stats?.avatar_id ?? state.serverAvatar;
      }
      return { data: null, error: null };
    },
  },
}));

mock.module("@/lib/offline/outbox", () => ({
  enqueue: async () => ({ id: "noop" }),
  enqueueWithId: async (uid: string, id: string, _kind: string, payload: any) => {
    if (!state.enqueueOk) throw new Error("quota");
    state.enqueued = state.enqueued.filter((e) => e.id !== id);
    state.enqueued.push({ uid, id, payload });
    return { id };
  },
  remove: async () => {},
  peekAll: async () => [],
  countAll: async () => 0,
  bumpAttempt: async () => {},
  stats: async () => ({ pending: 0, failed: 0 }),
}));

mock.module("@/lib/offline/flush", () => ({
  flushOutbox: async (uid: string) => {
    if (!state.flushSyncs || !state.rpcOk) return { flushed: 0, failed: 1 };
    const mine = state.enqueued.filter((e) => e.uid === uid);
    for (const e of mine) state.serverAvatar = e.payload.avatarId;
    if (mine.length) {
      state.enqueued = state.enqueued.filter((e) => e.uid !== uid);
      localStorage.removeItem(PENDING_KEY);
    }
    return { flushed: mine.length, failed: 0 };
  },
}));

mock.module("@/lib/profile", () => ({ readPersistedProfileState: () => ({ avatarId: "x" }) }));
mock.module("@/lib/social", () => ({ derivePublicStats: () => ({ level: 1, xp: 0 }) }));

const {
  persistAvatarSelection,
  readPendingAvatar,
  reconcileAvatarOnHydrate,
  fetchServerAvatarId,
} = await import("../../src/lib/emblems/avatar-persistence");

beforeEach(() => {
  store.clear();
  state.uid = "user-A";
  state.rpcCalls = [];
  state.rpcOk = true;
  state.enqueueOk = true;
  state.flushSyncs = true;
  state.enqueued = [];
  state.serverAvatar = "crescent_star";
});

describe("Premium Emblem Persistence v1", () => {
  it("1. online pick syncs to the server and clears the pending marker", async () => {
    const result = await persistAvatarSelection("kaaba");
    expect(result).toBe("synced");
    expect(state.serverAvatar).toBe("kaaba");
    expect(readPendingAvatar("user-A")).toBeNull();
  });

  it("2. offline pick stays durable and reports queued (never success)", async () => {
    state.flushSyncs = false;
    state.rpcOk = false;
    const result = await persistAvatarSelection("sword");
    expect(result).toBe("queued");
    expect(readPendingAvatar("user-A")).toBe("sword");
    expect(state.enqueued.length).toBe(1);

    // reconnect → the durable queue replays and the server converges
    state.flushSyncs = true;
    state.rpcOk = true;
    const { flushOutbox } = await import("@/lib/offline/flush");
    await flushOutbox("user-A");
    expect(state.serverAvatar).toBe("sword");
    expect(readPendingAvatar("user-A")).toBeNull();
  });

  it("3. reports failed when neither the queue nor the direct write survives", async () => {
    state.enqueueOk = false;
    state.flushSyncs = false;
    state.rpcOk = false;
    const result = await persistAvatarSelection("helm_conical");
    expect(result).toBe("failed");
    // no phantom durable state left behind → caller reverts deterministically
    expect(readPendingAvatar("user-A")).toBeNull();
    expect(state.enqueued.length).toBe(0);
  });

  it("3b. direct write rescues the pick when the queue is unavailable", async () => {
    state.enqueueOk = false;
    state.flushSyncs = false;
    const result = await persistAvatarSelection("helm_conical");
    expect(result).toBe("synced");
    expect(state.serverAvatar).toBe("helm_conical");
  });

  it("4. guest stays local and never touches the server", async () => {
    state.uid = null;
    const result = await persistAvatarSelection("kaaba");
    expect(result).toBe("local");
    expect(state.rpcCalls.filter((c) => c.fn === "sync_my_public_stats").length).toBe(0);
    expect(state.serverAvatar).toBe("crescent_star");
  });

  it("5. rapid picks collapse onto one stable outbox id, last write wins", async () => {
    state.flushSyncs = false;
    state.rpcOk = false;
    await persistAvatarSelection("a1");
    await persistAvatarSelection("a2");
    await persistAvatarSelection("a3");
    expect(state.enqueued.length).toBe(1);
    expect(state.enqueued[0].id).toBe("avatar_select:user-A");
    expect(state.enqueued[0].payload.avatarId).toBe("a3");
    expect(readPendingAvatar("user-A")).toBe("a3");
  });

  it("6. pending marker is scoped to its account", async () => {
    state.flushSyncs = false;
    state.rpcOk = false;
    await persistAvatarSelection("a-pick");
    expect(readPendingAvatar("user-A")).toBe("a-pick");
    expect(readPendingAvatar("user-B")).toBeNull();
  });

  it("7. hydration: server value wins over a stale cloud blob", async () => {
    state.serverAvatar = "kaaba";
    const resolved = await reconcileAvatarOnHydrate("user-A", "stale_blob_value");
    expect(resolved).toBe("kaaba");
    expect(await fetchServerAvatarId()).toBe("kaaba");
  });

  it("7b. hydration: an un-flushed local pick beats the server value", async () => {
    state.flushSyncs = false;
    state.rpcOk = false;
    await persistAvatarSelection("local_newer");
    state.rpcOk = true;
    state.flushSyncs = true;
    state.serverAvatar = "kaaba";
    const resolved = await reconcileAvatarOnHydrate("user-A", "stale_blob_value");
    expect(resolved).toBe("local_newer");
  });

  it("7c. hydration falls back to the merged blob when the server has nothing", async () => {
    state.serverAvatar = null;
    const resolved = await reconcileAvatarOnHydrate("user-A", "blob_value");
    expect(resolved).toBe("blob_value");
  });
});
