import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
const env = vi.hoisted(() => ({ ready: true, session: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => env.session() },
    rpc: (...args: unknown[]) => env.rpc(...args),
  },
}));
vi.mock("@/lib/identity/guard", () => ({ isAuthReady: () => env.ready }));
import {
  DISABLED_PROTOCOL_GATE,
  parseProtocolGate,
  readProtocolGate,
  PROTOCOL_GATE_RPC,
  PROTOCOL_GATE_TIMEOUT_MS,
} from "@/lib/economy/compatibility-gate";

function payload(diagnostic = "absent") {
  return {
    schema_version: 1,
    protocol_state: diagnostic === "incomplete" ? "unresolved" : "legacy",
    diagnostic_state: diagnostic,
    economic_authority_enabled: false,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  env.ready = true;
  env.session.mockResolvedValue({ data: { session: { user: { id: "alice" } } } });
  env.rpc.mockResolvedValue({ data: payload(), error: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("default observation is legacy and off, without implying a completed server read", () => {
  expect(DISABLED_PROTOCOL_GATE).toEqual({
    protocolState: "legacy",
    economicAuthorityEnabled: false,
    diagnosticState: "not_read",
    readState: "disabled",
  });
  expect(Object.isFrozen(DISABLED_PROTOCOL_GATE)).toBe(true);
});
for (const diagnostic of ["absent", "candidate", "incomplete"])
  it("parses only inert diagnostic " + diagnostic, () => {
    const result = parseProtocolGate(payload(diagnostic));
    expect(result.economicAuthorityEnabled).toBe(false);
    expect(result.protocolState).toBe(diagnostic === "incomplete" ? "unresolved" : "legacy");
    expect(Object.isFrozen(result)).toBe(true);
  });
for (const bad of [
  null,
  [],
  {},
  { ...payload(), economic_authority_enabled: true },
  { ...payload(), protocol_state: "authoritative" },
  { ...payload(), diagnostic_state: "active" },
  { ...payload(), schema_version: 2 },
  { ...payload("incomplete"), protocol_state: "legacy" },
])
  it("invalid or authority-bearing response never grants authority: " + JSON.stringify(bad), () => {
    expect(parseProtocolGate(bad)).toMatchObject({
      protocolState: "unresolved",
      economicAuthorityEnabled: false,
      reason: "invalid_response",
    });
  });
it("reads only the current account with zero RPC arguments", async () => {
  expect(await readProtocolGate("alice", () => true)).toMatchObject({
    protocolState: "legacy",
    economicAuthorityEnabled: false,
  });
  expect(env.rpc).toHaveBeenCalledExactlyOnceWith(PROTOCOL_GATE_RPC);
});
it("guest context never starts an authority request", async () => {
  setActiveOwnerInternal("guest:synthetic");
  expect(await readProtocolGate("alice", () => true)).toBeUndefined();
  expect(env.session).not.toHaveBeenCalled();
  expect(env.rpc).not.toHaveBeenCalled();
});
it("waits for readiness before checking the SDK session or reading RPC", async () => {
  env.ready = false;
  const result = readProtocolGate("alice", () => true);
  await vi.advanceTimersByTimeAsync(50);
  expect(env.session).not.toHaveBeenCalled();
  expect(env.rpc).not.toHaveBeenCalled();
  env.ready = true;
  await vi.advanceTimersByTimeAsync(25);
  expect((await result)?.economicAuthorityEnabled).toBe(false);
  expect(env.rpc).toHaveBeenCalledTimes(1);
});
it("readiness timeout leaves no poll or late RPC after readiness eventually arrives", async () => {
  env.ready = false;
  const pending = readProtocolGate("alice", () => true);
  await vi.advanceTimersByTimeAsync(PROTOCOL_GATE_TIMEOUT_MS);
  expect(await pending).toMatchObject({ economicAuthorityEnabled: false, reason: "timeout" });
  env.ready = true;
  await vi.advanceTimersByTimeAsync(100);
  expect(env.rpc).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("SDK-session timeout cannot start a new RPC when the old session read finishes", async () => {
  const gate = deferred<any>();
  env.session.mockReturnValueOnce(gate.promise);
  const result = readProtocolGate("alice", () => true);
  await vi.advanceTimersByTimeAsync(PROTOCOL_GATE_TIMEOUT_MS);
  expect((await result)?.reason).toBe("timeout");
  gate.resolve({ data: { session: { user: { id: "alice" } } } });
  await Promise.resolve();
  await Promise.resolve();
  expect(env.rpc).not.toHaveBeenCalled();
});
it("already-started RPC can finish after timeout without changing the returned observation", async () => {
  const gate = deferred<any>();
  env.rpc.mockReturnValueOnce(gate.promise);
  const result = readProtocolGate("alice", () => true);
  await vi.advanceTimersByTimeAsync(PROTOCOL_GATE_TIMEOUT_MS);
  expect(env.rpc).toHaveBeenCalledTimes(1);
  const observed = await result;
  expect(observed?.reason).toBe("timeout");
  gate.resolve({ data: { ...payload(), economic_authority_enabled: true }, error: null });
  await Promise.resolve();
  await Promise.resolve();
  expect(observed?.economicAuthorityEnabled).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
for (const aba of [false, true])
  it("rejects a late RPC across identity " + (aba ? "ABA" : "Alice/Bob"), async () => {
    const gate = deferred<any>();
    env.rpc.mockReturnValueOnce(gate.promise);
    const result = readProtocolGate("alice", () => true);
    await vi.advanceTimersByTimeAsync(0);
    expect(env.rpc).toHaveBeenCalledTimes(1);
    setActiveOwnerInternal("user:bob");
    if (aba) setActiveOwnerInternal("user:alice");
    gate.resolve({ data: payload("candidate"), error: null });
    expect(await result).toBeUndefined();
  });
it("SDK identity lag never uses Alice's UID with Bob's session", async () => {
  env.session.mockResolvedValueOnce({ data: { session: { user: { id: "bob" } } } });
  expect(await readProtocolGate("alice", () => true)).toMatchObject({
    economicAuthorityEnabled: false,
    reason: "session_mismatch",
  });
  expect(env.rpc).not.toHaveBeenCalled();
});
it("RPC read failure is unresolved and never authority", async () => {
  env.rpc.mockRejectedValueOnce(new Error("offline"));
  expect(await readProtocolGate("alice", () => true)).toMatchObject({
    protocolState: "unresolved",
    economicAuthorityEnabled: false,
  });
});
it("RPC permission failure is not a legacy enrollment or active state", async () => {
  env.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
  expect(await readProtocolGate("alice", () => true)).toMatchObject({
    reason: "rpc_error",
    economicAuthorityEnabled: false,
  });
});
it("unmount during readiness releases the local poll and cannot begin new work", async () => {
  env.ready = false;
  let alive = true;
  const result = readProtocolGate("alice", () => alive);
  alive = false;
  await vi.advanceTimersByTimeAsync(25);
  expect(await result).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  expect(env.rpc).not.toHaveBeenCalled();
});
it("observation performs no storage, Settlement or economic writes", async () => {
  const write = vi.spyOn(Storage.prototype, "setItem");
  const open = vi.fn();
  vi.stubGlobal("indexedDB", { open });
  const result = await readProtocolGate("alice", () => true);
  expect(result?.economicAuthorityEnabled).toBe(false);
  expect(write).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  expect(env.rpc.mock.calls.map((c) => c[0])).toEqual([PROTOCOL_GATE_RPC]);
});
