import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
import type { ProfileState } from "@/lib/profile";
const env = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn(), union: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: (...args: unknown[]) => env.session(...args) },
  rpc: (...args: unknown[]) => env.rpc(...args),
} }));
vi.mock("@/lib/campaigns/completions", () => ({ unionCompletedIds: (...args: unknown[]) => env.union(...args) }));
import { pushPublicStats } from "@/lib/social";
const profile = () => ({ points: 100, dinars: 50, hearts: 3, charactersUnlocked: [], artifactsFound: [], titlesEarned: [], campaignsCompleted: ["local"] }) as unknown as ProfileState;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); __resetIdentityForTests(); setActiveOwnerInternal("user:alice");
  env.session.mockResolvedValue({ data: { session: { user: { id: "alice" } } }, error: null });
  env.rpc.mockResolvedValue({ data: null, error: null });
  env.union.mockResolvedValue(new Set(["local", "server"]));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });
it("acknowledges an error-free void response only and keeps canonical count", async () => {
  expect(await pushPublicStats("alice", profile())).toBe(true);
  expect(env.rpc).toHaveBeenCalledExactlyOnceWith("sync_my_public_stats", { p_stats: expect.objectContaining({ xp: 100, dinars: 50, campaigns_completed: 2 }) });
  // Existing preflight count is unchanged: no additional auth request for acknowledgment.
  expect(env.session).toHaveBeenCalledTimes(4);
});
it.each([
  null, undefined, [], "success", {}, { data: null }, { error: null },
  { data: null, error: false }, { data: null, error: { message: "denied" } },
  { data: {}, error: null }, { data: true, error: null },
])("does not acknowledge malformed/error response %j", async response => {
  env.rpc.mockResolvedValue(response);
  expect(await pushPublicStats("alice", profile())).toBe(false);
  expect(env.rpc).toHaveBeenCalledTimes(1);
});
it.each(["foreign", "revoked", "no-session", "auth-error"])("skipped %s work returns false without RPC", async mode => {
  if (mode === "no-session") env.session.mockResolvedValue({ data: { session: null }, error: null });
  if (mode === "auth-error") env.session.mockResolvedValue({ data: { session: { user: { id: "alice" } } }, error: { message: "auth" } });
  expect(await pushPublicStats(mode === "foreign" ? "bob" : "alice", profile(), () => mode !== "revoked")).toBe(false);
  expect(env.rpc).not.toHaveBeenCalled();
});
it.each(["owner", "aba", "caller"])("does not acknowledge a response after %s revocation", async mode => {
  const gate = deferred<{ data: null; error: null }>();
  env.rpc.mockReturnValue(gate.promise);
  let alive = true;
  const result = pushPublicStats("alice", profile(), () => alive);
  await vi.waitFor(() => expect(env.rpc).toHaveBeenCalledTimes(1));
  if (mode === "caller") alive = false;
  else { setActiveOwnerInternal("user:bob"); if (mode === "aba") setActiveOwnerInternal("user:alice"); }
  gate.resolve({ data: null, error: null });
  expect(await result).toBe(false);
  expect(env.rpc).toHaveBeenCalledTimes(1);
});
it("keeps canonical-count rejection fallback and captured profile", async () => {
  const gate = deferred<Set<string>>(); env.union.mockReturnValue(gate.promise);
  const p = profile(), result = pushPublicStats("alice", p);
  await vi.waitFor(() => expect(env.union).toHaveBeenCalled());
  p.points = 999; p.campaignsCompleted.push("mutated");
  gate.resolve(new Set());
  expect(await result).toBe(true);
  expect(env.rpc.mock.calls[0][1].p_stats).toMatchObject({ xp: 100, campaigns_completed: 1 });
});
it("keeps canonical lookup failure fallback and RPC exception rejection", async () => {
  env.union.mockRejectedValue(new Error("lookup-failed"));
  expect(await pushPublicStats("alice", profile())).toBe(true);
  expect(env.rpc.mock.calls[0][1].p_stats.campaigns_completed).toBe(1);
  env.rpc.mockRejectedValue(new Error("transport"));
  await expect(pushPublicStats("alice", profile())).rejects.toThrow("transport");
});
it("reads receipt fields once and rechecks caller scope after reentrant getters", async () => {
  let alive = true, errors = 0, values = 0;
  env.rpc.mockResolvedValue({
    get error() { errors++; alive = false; return null; },
    get data() { values++; return null; },
  });
  expect(await pushPublicStats("alice", profile(), () => alive)).toBe(false);
  expect(errors).toBe(1);
  expect(values).toBe(1);
});
