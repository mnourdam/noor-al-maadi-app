import { beforeEach, afterEach, expect, it, vi } from "vitest";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
let reset: typeof import("@/lib/identity/reset");
let owner: typeof import("@/lib/identity/owner");
let guard: typeof import("@/lib/identity/guard");
let removeChannels: ReturnType<typeof vi.fn>;
let sanitize: ReturnType<typeof vi.fn>;
let resets: ReturnType<typeof vi.fn>;
let sanitizerImport: ReturnType<typeof deferred> | undefined;
let sanitizerEntered: boolean;
let cacheImport: ReturnType<typeof deferred> | undefined;
let cacheEntered: boolean;
let events: string[];
let eventListener: EventListener;
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  removeChannels = vi.fn(async () => {});
  sanitize = vi.fn(); resets = vi.fn();
  sanitizerImport = undefined; cacheImport = undefined;
  sanitizerEntered = false; cacheEntered = false;
  vi.doMock("@/integrations/supabase/client", () => ({ supabase: { removeAllChannels: removeChannels } }));
  vi.doMock("@/lib/diag-trace", () => ({ recordTrace: vi.fn() }));
  vi.doMock("@/lib/stories/unlock-cache", async () => {
    cacheEntered = true;
    await cacheImport?.promise;
    return { clearUnlockCache: vi.fn() };
  });
  vi.doMock("@/lib/emblems/avatar-persistence", () => ({ clearPendingAvatar: vi.fn() }));
  vi.doMock("@/lib/tutorial/persistence", () => ({ invalidateOnboardingCache: vi.fn() }));
  vi.doMock("@/lib/campaigns/intro/content-store", () => ({ clearIntroLinkCache: vi.fn() }));
  vi.doMock("@/lib/profile", () => ({}));
  vi.doMock("@/lib/achievements/v2/engine", () => ({ resetAchievementEngine: resets }));
  vi.doMock("@/lib/campaigns/useCampaignProgression", () => ({ clearCampaignProgressionCache: vi.fn() }));
  vi.doMock("@/lib/investigations/progress", () => ({ resetInvestigationIdentity: vi.fn() }));
  vi.doMock("@/lib/campaigns/completions", async () => {
    sanitizerEntered = true;
    await sanitizerImport?.promise;
    return { sanitizeGuestCampaignCompletions: sanitize };
  });
  owner = await import("@/lib/identity/owner");
  guard = await import("@/lib/identity/guard");
  reset = await import("@/lib/identity/reset");
  events = [];
  eventListener = event => { events.push((event as CustomEvent).detail.owner); };
  window.addEventListener(reset.IDENTITY_CHANGED_EVENT, eventListener);
});
afterEach(() => { window.removeEventListener(reset.IDENTITY_CHANGED_EVENT, eventListener); });
const start = (nextUserId: string | null) => reset.resetForIdentityChange({ nextUserId, reason: "auth-listener" });

it("a late Alice teardown cannot replace completed Bob or publish stale readiness", async () => {
  const gate = deferred();
  removeChannels.mockImplementationOnce(() => gate.promise);
  const alice = start("alice");
  await vi.waitFor(() => expect(removeChannels).toHaveBeenCalledTimes(1));
  await start("bob");
  gate.resolve();
  expect(await alice).toMatchObject({ changed: false, owner: "user:bob" });
  expect(owner.getActiveOwner()).toBe("user:bob");
  expect(guard.isAuthReady()).toBe(true);
  expect(events).toEqual(["user:bob"]);
  expect(resets.mock.calls.map(c => c[0])).toEqual(["bob"]);
});

it("a guest request supersedes pending login even while guest is still active", async () => {
  const gate = deferred();
  removeChannels.mockImplementationOnce(() => gate.promise);
  const alice = start("alice");
  await vi.waitFor(() => expect(removeChannels).toHaveBeenCalledTimes(1));
  const guest = await start(null);
  expect(guest.owner).toBe(owner.guestOwnerKey());
  gate.resolve();
  expect((await alice).changed).toBe(false);
  expect(owner.getActiveOwner()).toBe(owner.guestOwnerKey());
  expect(guard.isAuthReady()).toBe(false);
  expect(events).toEqual([owner.guestOwnerKey()]);
});

it("coalesces identical pending targets before the owner swap and preserves initialized idempotence", async () => {
  const gate = deferred();
  removeChannels.mockImplementation(() => gate.promise);
  const first = start("alice");
  const duplicate = start("alice");
  await vi.waitFor(() => expect(removeChannels).toHaveBeenCalledTimes(1));
  gate.resolve();
  expect(await first).toEqual(await duplicate);
  expect(events).toEqual(["user:alice"]);
  expect((await start("alice")).changed).toBe(false);
  expect(removeChannels).toHaveBeenCalledTimes(1);
});

it("late query cancellation cannot clear the newer owner's cache", async () => {
  const gate = deferred();
  const cancelQueries = vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue(undefined);
  const cache = new Map<string, string>();
  const clear = vi.fn(() => cache.clear());
  reset.setQueryClientForReset({ cancelQueries, clear });
  const alice = start("alice");
  await vi.waitFor(() => expect(cancelQueries).toHaveBeenCalledTimes(1));
  await start("bob");
  expect(clear).toHaveBeenCalledTimes(1);
  const bobBytes = '{"owner":"bob","progress":[3,8]}';
  cache.set("user:bob", bobBytes);
  gate.resolve(); await alice;
  expect(cache.get("user:bob")).toBe(bobBytes);
  expect(clear).toHaveBeenCalledTimes(1);
  expect(owner.getActiveOwner()).toBe("user:bob");
});

it("guest sanitation waiting on its import cannot delete from Bob's partition", async () => {
  owner.setActiveOwnerInternal("user:alice");
  const aliceBytes = '{"progress":[1,2]}';
  const bobBytes = '{"progress":[3,8]}';
  const guestBytes = '{"progress":[9]}';
  const key = (id: string) => `fixture:campaign:${id}`;
  localStorage.setItem(key("user:alice"), aliceBytes);
  localStorage.setItem(key("user:bob"), bobBytes);
  localStorage.setItem(key(owner.guestOwnerKey()), guestBytes);
  // Model the sanitizer's owner-relative storage deletion, not a harmless spy.
  sanitize.mockImplementation(() => localStorage.removeItem(key(owner.getActiveOwner())));
  sanitizerImport = deferred();
  const guest = start(null);
  await vi.waitFor(() => expect(sanitizerEntered).toBe(true));
  await start("bob");
  sanitizerImport.resolve();
  const result = await guest;
  expect(localStorage.getItem(key("user:bob"))).toBe(bobBytes);
  expect(result).toMatchObject({ changed: false, owner: "user:bob" });
  expect(sanitize).not.toHaveBeenCalled();
  expect(localStorage.getItem(key("user:alice"))).toBe(aliceBytes);
  expect(localStorage.getItem(key(owner.guestOwnerKey()))).toBe(guestBytes);
  expect(events).toEqual(["user:bob"]);
  expect(guard.isAuthReady()).toBe(true);
});

it("stale finally cannot release its successor's pending coalescing slot", async () => {
  const a = deferred(), b = deferred();
  removeChannels.mockImplementationOnce(() => a.promise).mockImplementation(() => b.promise);
  const alice = start("alice");
  await vi.waitFor(() => expect(removeChannels).toHaveBeenCalledTimes(1));
  const bob = start("bob");
  await vi.waitFor(() => expect(removeChannels).toHaveBeenCalledTimes(2));
  a.resolve(); await alice;
  const duplicateBob = start("bob");
  b.resolve();
  await Promise.all([bob, duplicateBob]);
  expect(removeChannels).toHaveBeenCalledTimes(2);
  expect(events).toEqual(["user:bob"]);
});

it("pending cache imports cannot run stale identity resets", async () => {
  cacheImport = deferred();
  const alice = start("alice");
  await vi.waitFor(() => expect(cacheEntered).toBe(true));
  const bob = start("bob");
  await vi.waitFor(() => expect(owner.getActiveOwner()).toBe("user:bob"));
  cacheImport.resolve();
  await Promise.all([alice, bob]);
  expect(resets.mock.calls.map(c => c[0])).toEqual(["bob"]);
  expect(events).toEqual(["user:bob"]);
});

it("owner-change reentrancy supersedes initialization before stale caches or events", async () => {
  let bob: ReturnType<typeof start> | undefined;
  const unsubscribe = owner.onOwnerChange(next => { if (next === "user:alice") bob = start("bob"); });
  expect((await start("alice")).changed).toBe(false);
  await bob;
  unsubscribe();
  expect(events).toEqual(["user:bob"]);
  expect(resets.mock.calls.map(c => c[0])).toEqual(["bob"]);
});

it("event reentrancy cannot mark a superseded identity ready", async () => {
  const bobGate = deferred();
  let bob: ReturnType<typeof start> | undefined;
  const listener = (event: Event) => {
    if ((event as CustomEvent).detail.owner === "user:alice") {
      removeChannels.mockImplementation(() => bobGate.promise);
      bob = start("bob");
    }
  };
  window.addEventListener(reset.IDENTITY_CHANGED_EVENT, listener);
  try {
    expect((await start("alice")).changed).toBe(false);
    expect(guard.isAuthReady()).toBe(false);
    bobGate.resolve(); await bob;
    expect(owner.getActiveOwner()).toBe("user:bob");
    expect(guard.isAuthReady()).toBe(true);
  } finally { window.removeEventListener(reset.IDENTITY_CHANGED_EVENT, listener); }
});

it("latest teardown failures keep the existing best-effort initialization policy", async () => {
  removeChannels.mockRejectedValue(new Error("offline"));
  reset.setQueryClientForReset({ cancelQueries: vi.fn().mockRejectedValue(new Error("cancel")), clear: vi.fn(() => { throw new Error("clear"); }) });
  expect(await start("alice")).toMatchObject({ changed: true, owner: "user:alice" });
  expect(guard.isAuthReady()).toBe(true);
  expect(events).toEqual(["user:alice"]);
});


it("Alice to Bob to Alice uses the latest generation, not owner equality", async () => {
  const oldAliceGate = deferred();
  removeChannels.mockImplementationOnce(() => oldAliceGate.promise);
  const oldAlice = start("alice");
  await vi.waitFor(() => expect(removeChannels).toHaveBeenCalledTimes(1));
  await start("bob");
  await start("alice");
  const epoch = owner.getIdentityEpoch();
  oldAliceGate.resolve();
  expect((await oldAlice).changed).toBe(false);
  expect(owner.getIdentityEpoch()).toBe(epoch);
  expect(events).toEqual(["user:bob", "user:alice"]);
  expect(resets.mock.calls.map(c => c[0])).toEqual(["bob", "alice"]);
});
