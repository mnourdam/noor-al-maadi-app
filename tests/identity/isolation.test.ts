import { describe, it, expect, beforeEach } from "bun:test";

// ------------------------------------------------------------
// Minimal DOM storage harness (bun has no window/Storage).
// ------------------------------------------------------------
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  raw() { return this.map; }
}

const listeners: Record<string, Array<(e: unknown) => void>> = {};

function installDom() {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const win = {
    localStorage,
    sessionStorage,
    Storage: MemoryStorage,
    addEventListener: (t: string, f: (e: unknown) => void) => {
      (listeners[t] ??= []).push(f);
    },
    removeEventListener: (t: string, f: (e: unknown) => void) => {
      listeners[t] = (listeners[t] ?? []).filter((x) => x !== f);
    },
    dispatchEvent: (e: { type: string }) => {
      for (const f of listeners[e.type] ?? []) f(e);
      return true;
    },
  };
  (globalThis as any).window = win;
  (globalThis as any).localStorage = localStorage;
  (globalThis as any).Storage = MemoryStorage;
  return win;
}

async function freshIdentity() {
  for (const k of Object.keys(listeners)) delete listeners[k];
  installDom();
  const owner = await import("@/lib/identity/owner");
  const partition = await import("@/lib/identity/partition");
  owner.__resetIdentityForTests();
  partition.__uninstallPartitionForTests();
  partition.installIdentityPartition();
  return { owner, partition };
}

/** The personal keys the app actually uses, one per audited data domain. */
const PERSONAL_KEYS = [
  "hakaya.profile.v2",              // xp / dinars / hearts / level / streak / profile
  "irth_campaign_progress",         // campaigns + chapters
  "irth.campaign_completions.v1",   // campaign completion ledger
  "campaign-unlocks",               // unlocks
  "irth_reflections_v1",            // reflections
  "irth.achievements.v2.notified",  // achievements
  "irth.game-completions.guest.v1", // games / daily challenges
  "irth.guest.storyCompletions.v1", // stories
  "irth.entityDiscoveries.x",       // encyclopedia discoveries
  "irth.user_collection.v1",        // museum
  "irth.notifications.inbox.v1",    // notifications
  "irth.lastActive.v1",             // continue-your-journey
  "irth.hero.recent.v1",            // last activity
  "irth.profile.avatar.pending.v1", // pending mutation / draft
];

const SHARED_KEYS = [
  "irth.device.id.v1",
  "irth_audio_settings",
  "irth.crash.reports",
  "irth_admin_campaigns",
  "irth.offline.snapshot.v2",
];

function writeAll(prefix: string) {
  for (const k of PERSONAL_KEYS) localStorage.setItem(k, `${prefix}:${k}`);
}

function readAll(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of PERSONAL_KEYS) out[k] = localStorage.getItem(k);
  return out;
}

function noneContain(prefix: string) {
  return Object.values(readAll()).every((v) => v === null || !v.startsWith(`${prefix}:`));
}

describe("identity isolation — owner-partitioned storage", () => {
  beforeEach(async () => { await freshIdentity(); });

  it("classifies personal vs shared keys correctly", async () => {
    const { partition } = await freshIdentity();
    for (const k of PERSONAL_KEYS) expect(partition.isPersonalKey(k)).toBe(true);
    for (const k of SHARED_KEYS) expect(partition.isPersonalKey(k)).toBe(false);
    expect(partition.isPersonalKey("sb-abc-auth-token")).toBe(false);
  });

  it("writes every personal key under the active owner namespace", async () => {
    const { owner } = await freshIdentity();
    writeAll("guest");
    const physical = Array.from((window.localStorage as any).raw().keys()) as string[];
    for (const k of PERSONAL_KEYS) {
      expect(physical).toContain(`${k}::owner=${owner.getActiveOwner()}`);
      expect(physical).not.toContain(k);
    }
  });

  // Scenario 1 — A → logout → guest space (empty when guest never played)
  it("scenario 1: logout leaves zero bytes of account A visible", async () => {
    const { owner } = await freshIdentity();
    owner.setActiveOwnerInternal(owner.userOwnerKey("A"));
    writeAll("A");
    owner.setActiveOwnerInternal(owner.guestOwnerKey());
    expect(Object.values(readAll()).every((v) => v === null)).toBe(true);
    expect(noneContain("A")).toBe(true);
  });

  // Scenario 2 — A → logout → B sees only B
  it("scenario 2: account B never sees account A data", async () => {
    const { owner } = await freshIdentity();
    owner.setActiveOwnerInternal(owner.userOwnerKey("A"));
    writeAll("A");
    owner.setActiveOwnerInternal(owner.guestOwnerKey());
    owner.setActiveOwnerInternal(owner.userOwnerKey("B"));
    expect(Object.values(readAll()).every((v) => v === null)).toBe(true);
    writeAll("B");
    expect(noneContain("A")).toBe(true);
    expect(localStorage.getItem("hakaya.profile.v2")).toBe("B:hakaya.profile.v2");
  });

  // Scenario 3 — guest progress survives an account round-trip
  it("scenario 3: guest progress is restored after login+logout", async () => {
    const { owner } = await freshIdentity();
    writeAll("guest");
    owner.setActiveOwnerInternal(owner.userOwnerKey("A"));
    writeAll("A");
    owner.setActiveOwnerInternal(owner.guestOwnerKey());
    for (const k of PERSONAL_KEYS) expect(localStorage.getItem(k)).toBe(`guest:${k}`);
  });

  // Scenario 4 — A → logout → B → logout → guest → A
  it("scenario 4: all three spaces stay independent across a full cycle", async () => {
    const { owner } = await freshIdentity();
    const guest = owner.guestOwnerKey();
    writeAll("guest");
    owner.setActiveOwnerInternal(owner.userOwnerKey("A"));
    writeAll("A");
    owner.setActiveOwnerInternal(guest);
    owner.setActiveOwnerInternal(owner.userOwnerKey("B"));
    writeAll("B");
    owner.setActiveOwnerInternal(guest);
    for (const k of PERSONAL_KEYS) expect(localStorage.getItem(k)).toBe(`guest:${k}`);
    owner.setActiveOwnerInternal(owner.userOwnerKey("A"));
    for (const k of PERSONAL_KEYS) expect(localStorage.getItem(k)).toBe(`A:${k}`);
    owner.setActiveOwnerInternal(owner.userOwnerKey("B"));
    for (const k of PERSONAL_KEYS) expect(localStorage.getItem(k)).toBe(`B:${k}`);
  });

  // Scenario 5 — slow response from the previous identity
  it("scenario 5: a late response from the previous account is rejected", async () => {
    const { owner } = await freshIdentity();
    const { captureIdentity, isIdentityCurrent, belongsToActiveUser } = await import("@/lib/identity/guard");
    owner.setActiveOwnerInternal(owner.userOwnerKey("A"));
    const token = captureIdentity();
    expect(isIdentityCurrent(token)).toBe(true);
    owner.setActiveOwnerInternal(owner.userOwnerKey("B"));
    expect(isIdentityCurrent(token)).toBe(false);   // A's in-flight work is dropped
    expect(belongsToActiveUser("A")).toBe(false);
    expect(belongsToActiveUser("B")).toBe(true);
  });

  // Scenario 6 — cold start after logout
  it("scenario 6: relaunch after logout boots into guest with no account data", async () => {
    const first = await freshIdentity();
    first.owner.setActiveOwnerInternal(first.owner.userOwnerKey("A"));
    writeAll("A");
    first.owner.setActiveOwnerInternal(first.owner.guestOwnerKey());
    writeAll("guest");

    // Cold start: keep the physical store, reset in-memory identity state.
    const snapshot = new Map((window.localStorage as any).raw());
    first.owner.__resetIdentityForTests();
    first.partition.__uninstallPartitionForTests();
    (window.localStorage as any).raw().clear();
    for (const [k, v] of snapshot) (window.localStorage as any).raw().set(k, v);
    first.partition.installIdentityPartition();

    expect(first.owner.getActiveOwner().startsWith("guest:")).toBe(true);
    for (const k of PERSONAL_KEYS) expect(localStorage.getItem(k)).toBe(`guest:${k}`);
    expect(noneContain("A")).toBe(true);
  });

  it("migrates pre-partition legacy keys into the booting owner's space", async () => {
    for (const k of Object.keys(listeners)) delete listeners[k];
    installDom();
    const owner = await import("@/lib/identity/owner");
    const partition = await import("@/lib/identity/partition");
    owner.__resetIdentityForTests();
    partition.__uninstallPartitionForTests();
    // Legacy global writes made before the upgrade.
    (window.localStorage as any).raw().set("hakaya.profile.v2", "legacy");
    (window.localStorage as any).raw().set("irth_audio_settings", "device");
    partition.installIdentityPartition();
    expect(localStorage.getItem("hakaya.profile.v2")).toBe("legacy");
    expect((window.localStorage as any).raw().has("hakaya.profile.v2")).toBe(false);
    expect((window.localStorage as any).raw().get("irth_audio_settings")).toBe("device");
    // …and it belongs to the guest space only.
    owner.setActiveOwnerInternal(owner.userOwnerKey("A"));
    expect(localStorage.getItem("hakaya.profile.v2")).toBe(null);
  });

  it("purges one owner's data without touching the others", async () => {
    const { owner, partition } = await freshIdentity();
    writeAll("guest");
    owner.setActiveOwnerInternal(owner.userOwnerKey("A"));
    writeAll("A");
    const removed = partition.purgeOwnerData(owner.userOwnerKey("A"));
    expect(removed).toBe(PERSONAL_KEYS.length);
    expect(Object.values(readAll()).every((v) => v === null)).toBe(true);
    owner.setActiveOwnerInternal(owner.guestOwnerKey());
    for (const k of PERSONAL_KEYS) expect(localStorage.getItem(k)).toBe(`guest:${k}`);
  });
});
