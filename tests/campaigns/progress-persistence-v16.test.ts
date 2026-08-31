import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  GUEST_BUFFER_KEY,
  bufferChapterProgress,
  readGuestBuffer,
  clearGuestBuffer,
  promoteGuestProgress,
} from "@/lib/campaigns/guest-progress-buffer";

// ---------------------------------------------------------------
// Minimal localStorage stub (node env)
// ---------------------------------------------------------------
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  const storage = new MemStorage();
  (globalThis as any).window = { localStorage: storage, dispatchEvent: () => true };
  (globalThis as any).localStorage = storage;
});

describe("guest / no-session campaign progress buffer", () => {
  it("persists chapter progress locally when there is no session (survives restart)", () => {
    bufferChapterProgress({ campaignId: "c1", chapterId: "ch1", status: "completed", completed: true, xpEarned: 10 });
    const raw = (globalThis as any).window.localStorage.getItem(GUEST_BUFFER_KEY);
    expect(raw).toBeTruthy();
    // Simulate restart: fresh read from the same storage.
    const file = readGuestBuffer();
    expect(Object.keys(file.entries)).toHaveLength(1);
    expect(file.entries["c1::ch1"].completed).toBe(true);
  });

  it("merges monotonically — completed never regresses", () => {
    bufferChapterProgress({ campaignId: "c1", chapterId: "ch1", status: "completed", completed: true, xpEarned: 30 });
    bufferChapterProgress({ campaignId: "c1", chapterId: "ch1", status: "unlocked", completed: false, xpEarned: 5 });
    const e = readGuestBuffer().entries["c1::ch1"];
    expect(e.completed).toBe(true);
    expect(e.status).toBe("completed");
    expect(e.xpEarned).toBe(30);
  });

  it("promotes buffered progress to the signed-in account and clears it", async () => {
    bufferChapterProgress({ campaignId: "c1", chapterId: "ch1", status: "completed", completed: true });
    bufferChapterProgress({ campaignId: "c1", chapterId: "ch2", status: "completed", completed: true });
    const send = vi.fn(async () => ({ acknowledged: true }));
    const res = await promoteGuestProgress("user-a", send);
    expect(res.promoted).toBe(2);
    expect(res.remaining).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("never leaks buffered progress to another account", async () => {
    bufferChapterProgress({ campaignId: "c1", chapterId: "ch1", status: "completed", completed: true });
    const failing = vi.fn(async () => ({ acknowledged: false, reason: "queued" }));
    await promoteGuestProgress("user-a", failing);
    const send = vi.fn(async () => ({ acknowledged: true }));
    const res = await promoteGuestProgress("user-b", send);
    expect(res.reason).toBe("identity_conflict");
    expect(send).not.toHaveBeenCalled();
    expect(Object.keys(readGuestBuffer().entries)).toHaveLength(1);
  });

  it("keeps the buffer for retry when the network flush fails", async () => {
    bufferChapterProgress({ campaignId: "c1", chapterId: "ch1", status: "completed", completed: true });
    const res = await promoteGuestProgress("user-a", async () => { throw new Error("offline"); });
    expect(res.promoted).toBe(0);
    expect(res.remaining).toBe(1);
    const ok = await promoteGuestProgress("user-a", async () => ({ acknowledged: true }));
    expect(ok.promoted).toBe(1);
  });

  it("does nothing without an identity", async () => {
    bufferChapterProgress({ campaignId: "c1", chapterId: "ch1", status: "completed", completed: true });
    const send = vi.fn(async () => ({ acknowledged: true }));
    const res = await promoteGuestProgress(null, send);
    expect(res.reason).toBe("no_uid");
    expect(send).not.toHaveBeenCalled();
    clearGuestBuffer();
    expect(Object.keys(readGuestBuffer().entries)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------
// Hydration: completion ledger is authoritative
// ---------------------------------------------------------------
function makeCampaign(id: string, chapters: number) {
  return {
    id,
    chapters: Array.from({ length: chapters }, (_, i) => ({
      id: `ch${i + 1}`,
      order: i + 1,
      activities: [{ id: `${id}-a${i + 1}` }],
    })),
  };
}

const CONQUEST = makeCampaign("conquest-of-egypt", 10);

function mockSupabase(progressRows: any[], ledgerRows: any[]) {
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: "user-a" } } } }) },
    from(table: string) {
      const rows = table === "user_campaign_completions" ? ledgerRows : progressRows;
      return { select: () => ({ eq: async () => ({ data: rows, error: null }) }) };
    },
  };
}

async function runHydration(progressRows: any[], ledgerRows: any[], campaigns: any[]) {
  vi.resetModules();
  vi.doMock("@/integrations/supabase/client", () => ({ supabase: mockSupabase(progressRows, ledgerRows) }));
  vi.doMock("@/lib/campaignStorage", () => ({ listCampaigns: () => campaigns }));
  const mod = await import("@/lib/importedCampaignProgress");
  const result = await mod.hydrateLegacyProgressFromCloud();
  return { result, mod };
}

describe("hydrateLegacyProgressFromCloud — ledger authority (V16)", () => {
  it("renders a ledger-complete campaign as completed despite partial chapter rows (conquest-of-egypt 8/10)", async () => {
    const partial = [1, 2, 5, 6, 7, 8, 9, 10].map((n) => ({
      campaign_id: "conquest-of-egypt",
      chapter_id: `ch${n}`,
      completed_at: "2026-08-17T17:56:00Z",
      xp_earned: 0,
      coins_earned: 0,
      score: 0,
    }));
    const { mod } = await runHydration(partial, [{ campaign_id: "conquest-of-egypt" }], [CONQUEST]);
    const prog = mod.getCampaignProgress("conquest-of-egypt");
    expect(prog.completed).toBe(true);
    for (const c of CONQUEST.chapters) {
      expect(prog.chapters[c.id]?.completed).toBe(true);
    }
  });

  it("hydrates from the ledger even when there are no chapter rows at all", async () => {
    const { mod } = await runHydration([], [{ campaign_id: "conquest-of-egypt" }], [CONQUEST]);
    expect(mod.getCampaignProgress("conquest-of-egypt").completed).toBe(true);
  });

  it("does not fabricate completion for campaigns absent from the ledger", async () => {
    const other = makeCampaign("later-campaign", 3);
    const { mod } = await runHydration(
      [{ campaign_id: "later-campaign", chapter_id: "ch1", completed_at: null, xp_earned: 0, coins_earned: 0, score: 0 }],
      [{ campaign_id: "conquest-of-egypt" }],
      [CONQUEST, other],
    );
    expect(mod.getCampaignProgress("conquest-of-egypt").completed).toBe(true);
    expect(mod.getCampaignProgress("later-campaign").completed).toBe(false);
  });
});

// ---------------------------------------------------------------
// Legacy unverified completion write is deprecated on the client
// ---------------------------------------------------------------
describe("legacy record_campaign_completion deprecation", () => {
  it("does not call the unverified RPC for normal gameplay completions", async () => {
    vi.resetModules();
    const rpc = vi.fn(async () => ({ data: { ok: true }, error: null }));
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: "user-a" } } } }) } },
    }));
    const enqueueWithId = vi.fn(async () => {});
    vi.doMock("@/lib/offline/outbox", () => ({ enqueueWithId, remove: async () => {} }));
    vi.doMock("@/lib/offline/flush", () => ({ flushOutbox: async () => ({ flushed: 0, failed: 0 }) }));
    vi.doMock("@/lib/identity/owner", () => ({ getActiveOwner: () => "user-a", getActiveUserId: () => "user-a" }));

    const prevNav = (globalThis as any).navigator;
    Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
    const mod = await import("@/lib/campaigns/completions");
    await mod.recordCampaignCompletion({ campaignId: "c1", source: "gameplay" });
    expect(rpc).not.toHaveBeenCalled();
    expect(enqueueWithId).not.toHaveBeenCalled();
    // Local sticky fact still recorded so the UI stays consistent offline.
    expect(mod.localCompletedIds().has("c1")).toBe(true);

    // Explicit opt-in still works for the shared V15 backend path.
    await mod.recordCampaignCompletion({ campaignId: "c2", source: "legacy", allowUnverifiedServerWrite: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    Object.defineProperty(globalThis, "navigator", { value: prevNav, configurable: true, writable: true });
  });
});
