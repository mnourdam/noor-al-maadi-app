import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const env = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: any) => void),
  owner: "guest:fixture",
  trace: [] as string[],
  signIn: vi.fn(),
  signUp: vi.fn(),
  getSession: vi.fn(),
  reset: vi.fn(),
  oauth: vi.fn(),
  native: vi.fn(),
  nativeMode: false,
  profile: {
    points: 1,
    dinars: 2,
    hearts: 3,
    streak: 0,
    campaignsCompleted: [],
    artifactsFound: [],
    name: "fixture",
    loggedIn: false,
  },
  grant: vi.fn(),
  stats: vi.fn(),
  merge: vi.fn(),
  profileLogin: vi.fn(),
  pushSave: vi.fn(),
  pushStats: vi.fn(),
  display: vi.fn(),
  flush: vi.fn(),
  rpc: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  resetNative: vi.fn(),
  intent: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => env.getSession(...a),
      onAuthStateChange: (cb: any) => {
        env.subscribe();
        env.listener = cb;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                env.unsubscribe();
                env.listener = null;
              },
            },
          },
        };
      },
      signInWithOAuth: (...a: unknown[]) => env.oauth(...a),
    },
    rpc: (...a: unknown[]) => env.rpc(...a),
    channel: () => {
      const c = { on: () => c, subscribe: () => c };
      return c;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/lib/cloud-save", () => ({
  signInWithEmail: (...a: unknown[]) => env.signIn(...a),
  signUpWithEmail: (...a: unknown[]) => env.signUp(...a),
  fetchAccountProfile: vi.fn(),
  fetchCloudSave: vi.fn(),
  pushSave: (...a: unknown[]) => env.pushSave(...a),
  signOut: vi.fn(),
  touchLastActive: vi.fn(),
  updateDisplayName: (...a: unknown[]) => env.display(...a),
  updateUsername: vi.fn(),
  isUsernameAvailable: vi.fn(),
}));
vi.mock("@/lib/profile", () => ({
  useProfile: () => ({
    profile: env.profile,
    mergeCloudSave: env.merge,
    applyServerStats: env.stats,
    addDinars: env.grant,
    awardBadge: env.grant,
    login: env.profileLogin,
    resetProfile: vi.fn(),
    hydrateClaimedStreakRewards: vi.fn(),
    adoptServerAvatar: vi.fn(),
  }),
}));
vi.mock("@/lib/social", () => ({ pushPublicStats: (...a: unknown[]) => env.pushStats(...a) }));
vi.mock("@/lib/identity/reset", () => ({
  resetForIdentityChange: (...a: unknown[]) => env.reset(...a),
}));
vi.mock("@/lib/identity/owner", () => ({
  getActiveOwner: () => env.owner,
  getActiveUserId: () => (env.owner.startsWith("user:") ? env.owner.slice(5) : null),
  guestOwnerKey: () => "guest:fixture",
  userOwnerKey: (uid: string) => `user:${uid}`,
}));
vi.mock("@/lib/identity/guard", () => ({ waitForAuthReady: () => new Promise<void>(() => {}) }));
vi.mock("@/lib/native-auth", () => ({
  resetNativePkceClient: () => env.resetNative(),
  isCapacitorNative: () => env.nativeMode,
  signInWithGoogleNative: () => env.native(),
}));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({
  isAndroidUltraStableMode: () => true,
  androidMark: vi.fn(),
  androidMeasure: vi.fn(),
  recordAndroidAction: vi.fn(),
}));
vi.mock("@/lib/diag-trace", () => ({ recordTrace: vi.fn() }));
vi.mock("@/lib/offline/flush", () => ({ flushOutbox: (...a: unknown[]) => env.flush(...a) }));
vi.mock("@/lib/boot/reconciliation", () => ({
  getReconciliationState: () => "offline-local",
  setReconciliationState: vi.fn(),
}));
vi.mock("@/lib/boot/startup-timeline", () => ({ recordStartupMark: vi.fn() }));
vi.mock("@/lib/authOrigin", () => ({ peekAuthOrigin: () => null }));
vi.mock("@/lib/googleAuthResult", () => ({
  setGoogleAuthIntent: (...a: unknown[]) => env.intent(...a),
}));
import { AccountProvider, useAccount } from "@/lib/account";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import {
  beginEmailObservation,
  endEmailObservation,
  failEmailObservation,
  selectTestEmailObserver,
  type EmailAuthObserver,
  type EmailAuthObservationEvent,
} from "@/lib/auth/transition-observation";
let api: ReturnType<typeof useAccount>;
function Probe() {
  api = useAccount();
  return <div data-testid="user">{api.user?.id ?? "guest"}</div>;
}
const signup = {
  email: "synthetic@example.invalid",
  password: "synthetic-password",
  username: "  fixture-name  ",
  displayName: "Fixture",
};
const session = {
  user: { id: "alice", user_metadata: {} },
  access_token: "synthetic-access-only",
  refresh_token: "synthetic-refresh-only",
};
function ok(hasSession = true) {
  return {
    data: { session: hasSession ? session : null, user: hasSession ? session.user : null },
    error: null,
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
async function mount(observer?: EmailAuthObserver, extra?: React.ReactNode) {
  let tree!: ReturnType<typeof render>;
  await act(async () => {
    tree = render(
      <AccountProvider emailAuthObserverForTests={observer}>
        <Probe />
        {extra}
      </AccountProvider>,
    );
  });
  return tree;
}
async function call<T>(work: () => Promise<T>): Promise<T> {
  let value!: T;
  await act(async () => {
    value = await work();
  });
  return value;
}
function events() {
  const captured: EmailAuthObservationEvent[] = [];
  const sink = vi.fn((event: EmailAuthObservationEvent) => {
    captured.push(event);
  });
  return { captured, sink };
}
function emit(event: string, uid: string | null = "alice") {
  env.listener!(event, uid ? { user: { id: uid, user_metadata: {} } } : null);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MODE", "test");
  vi.stubEnv("PROD", false);
  vi.stubEnv("VITE_BETA_AUTO_CONFIRM_USERS", "false");
  env.owner = "guest:fixture";
  env.listener = null;
  env.nativeMode = false;
  env.trace = [];
  localStorage.clear();
  env.signIn.mockReset().mockResolvedValue(ok());
  env.signUp.mockReset().mockResolvedValue(ok(false));
  env.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  env.reset.mockReset().mockImplementation(() => new Promise(() => {}));
  env.display.mockReset().mockImplementation(async () => {
    env.trace.push("display-name");
    return { ok: true };
  });
  env.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  env.flush.mockReset().mockResolvedValue(undefined);
  env.oauth.mockReset().mockResolvedValue({ error: null });
  env.native.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw Error("network forbidden");
    }),
  );
  vi.stubGlobal("indexedDB", {
    open: vi.fn(() => {
      throw Error("persistent observation forbidden");
    }),
  });
});
afterEach(() => {
  cleanup();
  expect(fetch).not.toHaveBeenCalled();
  expect(indexedDB.open).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("default provider has no observer and preserves successful sign-in", async () => {
  await mount();
  expect(await call(() => api.signIn(signup.email, signup.password))).toEqual({ ok: true });
  expect(env.signIn).toHaveBeenCalledExactlyOnceWith(signup.email, signup.password);
  expect(env.getSession).toHaveBeenCalledTimes(1);
});
it.each([
  ["development", false],
  ["production", true],
  ["test", true],
])("%s / PROD=%s ignores injection even with arbitrary enable env", async (mode, prod) => {
  vi.stubEnv("MODE", mode);
  vi.stubEnv("PROD", prod);
  vi.stubEnv("VITE_GUEST_TRANSITION_OBSERVE", "true");
  const { sink } = events();
  await mount(sink);
  expect(await call(() => api.signIn(signup.email, signup.password))).toEqual({ ok: true });
  expect(await call(() => api.signUp(signup))).toEqual({
    ok: true,
    error: "تحقق من بريدك لتأكيد الحساب.",
  });
  expect(sink).not.toHaveBeenCalled();
});
it("test injection records invoked/resolved with generic fields only", async () => {
  const { sink, captured } = events();
  await mount(sink);
  expect(await call(() => api.signIn(signup.email, signup.password))).toEqual({ ok: true });
  expect(captured).toEqual([
    { operation: "sign_in", attemptId: expect.any(Number), phase: "invoked" },
    {
      operation: "sign_in",
      attemptId: captured[0].attemptId,
      phase: "resolved",
      returned_session: true,
    },
  ]);
  expect(screen.getByTestId("user").textContent).toBe("guest");
});
it("returned sign-in error preserves exact message and no retry", async () => {
  env.signIn.mockResolvedValueOnce({
    data: { session: null },
    error: { message: "original synthetic message" },
  });
  const { sink, captured } = events();
  await mount(sink);
  expect(await call(() => api.signIn(signup.email, signup.password))).toEqual({
    ok: false,
    error: "original synthetic message",
  });
  expect(captured[1]).toMatchObject({ phase: "rejected", returned_session: false });
  expect(env.signIn).toHaveBeenCalledTimes(1);
});
it("sign-up session preserves display-name side effect and original result ordering", async () => {
  env.signUp.mockImplementationOnce(async () => {
    env.trace.push("sdk:signup");
    return ok();
  });
  const sink: EmailAuthObserver = (e) => {
    env.trace.push(`observe:${e.phase}`);
  };
  await mount(sink);
  expect(await call(() => api.signUp(signup))).toEqual({ ok: true });
  expect(env.signUp).toHaveBeenCalledExactlyOnceWith({ ...signup, username: "fixture-name" });
  expect(env.trace).toEqual(["observe:invoked", "sdk:signup", "observe:resolved", "display-name"]);
  expect(env.display).toHaveBeenCalledExactlyOnceWith("Fixture");
});
it("sign-up without session is resolved request, not authenticated/reset completed", async () => {
  const { sink, captured } = events();
  await mount(sink);
  expect(await call(() => api.signUp(signup))).toEqual({
    ok: true,
    error: "تحقق من بريدك لتأكيد الحساب.",
  });
  expect(captured).toHaveLength(2);
  expect(captured[1]).toMatchObject({
    operation: "sign_up",
    phase: "resolved",
    returned_session: false,
  });
  expect(api.user).toBeNull();
  expect(env.reset).not.toHaveBeenCalled();
  expect(env.display).not.toHaveBeenCalled();
});
it.each([
  { username: "ab", error: "اسم المستخدم قصير جداً" },
  { password: "short", error: "كلمة المرور يجب أن تكون ٨ أحرف على الأقل" },
])("local sign-up validation does not start SDK or observation: %j", async (invalid) => {
  const { sink } = events();
  await mount(sink);
  const { error, ...args } = invalid;
  expect(await call(() => api.signUp({ ...signup, ...args }))).toEqual({ ok: false, error });
  expect(env.signUp).not.toHaveBeenCalled();
  expect(sink).not.toHaveBeenCalled();
});
it("sign-up returned error is unchanged", async () => {
  env.signUp.mockResolvedValueOnce({
    data: { session: null, user: null },
    error: { message: "original signup failure" },
  });
  const { sink, captured } = events();
  await mount(sink);
  expect(await call(() => api.signUp(signup))).toEqual({
    ok: false,
    error: "original signup failure",
  });
  expect(captured[1].phase).toBe("rejected");
  expect(env.display).not.toHaveBeenCalled();
});
it.each(["sign_in", "sign_up"] as const)(
  "SDK exception identity preserved for %s; session presence stays unknown",
  async (operation) => {
    const original = new Error("synthetic SDK exception"),
      { sink, captured } = events();
    env[operation === "sign_in" ? "signIn" : "signUp"].mockRejectedValueOnce(original);
    await mount(sink);
    let rejected: unknown;
    await act(async () => {
      try {
        await (operation === "sign_in"
          ? api.signIn(signup.email, signup.password)
          : api.signUp(signup));
      } catch (error) {
        rejected = error;
      }
    });
    expect(rejected).toBe(original);
    expect(captured[1]).toMatchObject({ phase: "rejected" });
    expect(captured[1]).not.toHaveProperty("returned_session");
  },
);
it.each(["sign_in", "sign_up"] as const)(
  "synchronous observer throw cannot change %s",
  async (operation) => {
    const sink = vi.fn(() => {
      throw Error("observer failed");
    });
    await mount(sink);
    const result = await call(() =>
      operation === "sign_in" ? api.signIn(signup.email, signup.password) : api.signUp(signup),
    );
    expect(result).toEqual(
      operation === "sign_in" ? { ok: true } : { ok: true, error: "تحقق من بريدك لتأكيد الحساب." },
    );
    expect(sink).toHaveBeenCalledTimes(2);
  },
);
it("observer throw cannot replace returned SDK error", async () => {
  env.signIn.mockResolvedValueOnce({
    data: { session: null },
    error: { message: "SDK's original error" },
  });
  await mount(() => {
    throw Error("observer failure");
  });
  expect(await call(() => api.signIn(signup.email, signup.password))).toEqual({
    ok: false,
    error: "SDK's original error",
  });
});
it("observer throw cannot replace thrown SDK exception", async () => {
  const original = { synthetic: "same rejection object" };
  env.signIn.mockRejectedValueOnce(original);
  await mount(() => {
    throw Error("observer failure");
  });
  await expect(api.signIn(signup.email, signup.password)).rejects.toBe(original);
});
it("rejected async observer work is absorbed, not awaited or published to app error handlers", async () => {
  const observer = vi.fn(async () => {
    throw Error("optional observer rejection");
  });
  await mount(observer);
  expect(await call(() => api.signIn(signup.email, signup.password))).toEqual({ ok: true });
  await Promise.resolve();
  expect(observer).toHaveBeenCalledTimes(2);
});
it("pending observer cannot delay SDK invocation or completion", async () => {
  const never = deferred<void>();
  const sink = vi.fn(() => never.promise);
  env.signIn.mockImplementationOnce(async () => {
    env.trace.push("sdk");
    return ok();
  });
  await mount(sink);
  expect(await call(() => api.signIn(signup.email, signup.password))).toEqual({ ok: true });
  expect(env.trace).toEqual(["sdk"]);
  expect(sink).toHaveBeenCalledTimes(2);
  never.resolve();
});
it("invoked -> one SDK call -> resolved with the original await boundary", async () => {
  const gate = deferred<ReturnType<typeof ok>>(),
    captured: EmailAuthObservationEvent[] = [];
  env.signIn.mockImplementationOnce(() => {
    env.trace.push("sdk");
    return gate.promise;
  });
  await mount((e) => {
    captured.push(e);
    env.trace.push(e.phase);
  });
  let pending!: Promise<unknown>;
  act(() => {
    pending = api.signIn(signup.email, signup.password);
  });
  expect(env.trace).toEqual(["invoked", "sdk"]);
  await act(async () => {
    gate.resolve(ok());
    await pending;
  });
  expect(env.trace).toEqual(["invoked", "sdk", "resolved"]);
  expect(captured[0].attemptId).toBe(captured[1].attemptId);
});
it("auth event can precede SDK result without making result a reset acknowledgment", async () => {
  const gate = deferred<ReturnType<typeof ok>>(),
    { sink, captured } = events();
  env.signIn.mockReturnValueOnce(gate.promise);
  await mount(sink);
  let pending!: Promise<unknown>;
  act(() => {
    pending = api.signIn(signup.email, signup.password);
    emit("SIGNED_IN");
  });
  expect(env.reset).toHaveBeenCalledTimes(1);
  expect(captured).toHaveLength(1);
  expect(env.owner).toBe("guest:fixture");
  expect(api.user?.id).toBe("alice");
  await act(async () => {
    gate.resolve(ok());
    expect(await pending).toEqual({ ok: true });
  });
  expect(captured[1]).toMatchObject({ phase: "resolved", returned_session: true });
  expect(env.owner).toBe("guest:fixture");
  expect(env.getSession).toHaveBeenCalledTimes(1);
});
it.each(["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "SIGNED_OUT"])(
  "%s does not itself create an observation",
  async (event) => {
    const { sink } = events();
    await mount(sink);
    await act(async () => {
      emit(event, event === "SIGNED_OUT" ? null : "alice");
      if (event === "SIGNED_IN") emit(event);
    });
    expect(sink).not.toHaveBeenCalled();
    expect(env.signIn).not.toHaveBeenCalled();
    expect(env.signUp).not.toHaveBeenCalled();
  },
);
it("Guest/User and Alice/Bob events preserve synthetic progress bytes without observer economic effects", async () => {
  const { sink, captured } = events();
  localStorage.setItem(
    "irth.campaign_progress_buffer.v1::owner=guest:fixture",
    "synthetic-original-buffer",
  );
  localStorage.setItem("test-only:existing-journal", "synthetic-existing-evidence");
  const before = JSON.stringify({ ...localStorage });
  await mount(sink);
  await act(async () => {
    emit("SIGNED_IN", "alice");
    env.owner = "user:alice";
    emit("SIGNED_IN", "bob");
    env.owner = "user:bob";
  });
  expect(captured).toEqual([]);
  expect(JSON.stringify({ ...localStorage })).toBe(before);
  expect(env.grant).not.toHaveBeenCalled();
  expect(env.merge).not.toHaveBeenCalled();
  expect(env.stats).not.toHaveBeenCalled();
});
it("late Alice attempt stays with its original injected sink after Bob starts", async () => {
  const alice = events(),
    bob = events(),
    gateA = deferred<ReturnType<typeof ok>>(),
    gateB = deferred<ReturnType<typeof ok>>();
  env.signIn.mockReturnValueOnce(gateA.promise).mockReturnValueOnce(gateB.promise);
  const tree = await mount(alice.sink);
  let a!: Promise<unknown>, b!: Promise<unknown>;
  act(() => {
    a = api.signIn("alice@example.invalid", signup.password);
  });
  await act(async () => {
    tree.rerender(
      <AccountProvider emailAuthObserverForTests={bob.sink}>
        <Probe />
      </AccountProvider>,
    );
  });
  act(() => {
    b = api.signIn("bob@example.invalid", signup.password);
  });
  await act(async () => {
    gateA.resolve(ok());
    await a;
  });
  expect(alice.captured.map((e) => e.phase)).toEqual(["invoked", "resolved"]);
  expect(bob.captured.map((e) => e.phase)).toEqual(["invoked"]);
  expect(alice.captured[0].attemptId).not.toBe(bob.captured[0].attemptId);
  await act(async () => {
    gateB.resolve(ok());
    await b;
  });
  expect(bob.captured.map((e) => e.phase)).toEqual(["invoked", "resolved"]);
});
it("unmount during SDK call does not cancel, retry, or change its result", async () => {
  const { sink, captured } = events(),
    gate = deferred<ReturnType<typeof ok>>();
  env.signIn.mockReturnValueOnce(gate.promise);
  const tree = await mount(sink);
  const originalApi = api;
  let pending!: Promise<unknown>;
  act(() => {
    pending = originalApi.signIn(signup.email, signup.password);
  });
  tree.unmount();
  gate.resolve(ok());
  expect(await pending).toEqual({ ok: true });
  expect(captured.map((e) => e.phase)).toEqual(["invoked", "resolved"]);
  expect(env.signIn).toHaveBeenCalledTimes(1);
});
it.each([false, true])(
  "real Google button native=%s bypasses email observation",
  async (native) => {
    env.nativeMode = native;
    const { sink } = events();
    vi.spyOn(console, "info").mockImplementation(() => {});
    await mount(sink, <GoogleSignInButton intent="signin" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(sink).not.toHaveBeenCalled();
    expect(env.signIn).not.toHaveBeenCalled();
    expect(env.signUp).not.toHaveBeenCalled();
    expect(native ? env.native : env.oauth).toHaveBeenCalledTimes(1);
    expect(native ? env.oauth : env.native).not.toHaveBeenCalled();
  },
);
it("observer module does not read storage, device, clock or network", () => {
  vi.stubGlobal(
    "localStorage",
    new Proxy(
      {},
      {
        get() {
          throw Error("storage forbidden");
        },
      },
    ),
  );
  vi.stubGlobal(
    "indexedDB",
    new Proxy(
      {},
      {
        get() {
          throw Error("database forbidden");
        },
      },
    ),
  );
  vi.spyOn(Date, "now").mockImplementation(() => {
    throw Error("clock forbidden");
  });
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
    throw Error("device identifier forbidden");
  });
  const { sink, captured } = events();
  const attempt = beginEmailObservation(sink, "sign_in");
  endEmailObservation(attempt, false, true);
  expect(captured).toHaveLength(2);
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("indexedDB", { open: vi.fn() });
});
it("no sensitive data/result objects or error messages enter observation", async () => {
  const { sink, captured } = events();
  await mount(sink);
  await call(() => api.signIn(signup.email, signup.password));
  env.signUp.mockResolvedValueOnce(ok());
  await call(() => api.signUp(signup));
  env.signIn.mockRejectedValueOnce(new Error("synthetic-secret-error"));
  await expect(api.signIn(signup.email, signup.password)).rejects.toThrow("synthetic-secret-error");
  const json = JSON.stringify(captured);
  for (const secret of [
    signup.email,
    signup.password,
    signup.username.trim(),
    signup.displayName,
    session.access_token,
    session.refresh_token,
    "alice",
    "synthetic-secret-error",
  ])
    expect(json).not.toContain(secret);
  for (const event of captured) {
    expect(Object.keys(event).sort()).toEqual(
      (event.phase === "invoked" || !("returned_session" in event)
        ? ["operation", "attemptId", "phase"]
        : ["operation", "attemptId", "phase", "returned_session"]
      ).sort(),
    );
    expect(Object.isFrozen(event)).toBe(true);
  }
});
it("production disabled path never reads sign-in data/session even if a caller injects a sink", async () => {
  vi.stubEnv("MODE", "production");
  vi.stubEnv("PROD", true);
  const sink = vi.fn();
  env.signIn.mockResolvedValueOnce({
    error: null,
    get data() {
      throw Error("disabled observation must not inspect data");
    },
  });
  await mount(sink);
  expect(await call(() => api.signIn(signup.email, signup.password))).toEqual({ ok: true });
  expect(sink).not.toHaveBeenCalled();
});
it("disabled injection changes cannot change the callbacks' identities", async () => {
  vi.stubEnv("MODE", "production");
  vi.stubEnv("PROD", true);
  const tree = await mount(vi.fn());
  const signin = api.signIn,
    signupFn = api.signUp;
  await act(async () => {
    tree.rerender(
      <AccountProvider emailAuthObserverForTests={vi.fn()}>
        <Probe />
      </AccountProvider>,
    );
  });
  expect(api.signIn).toBe(signin);
  expect(api.signUp).toBe(signupFn);
});
it("helper terminal observations are exactly one and attempts are ephemeral, unrelated counters", () => {
  const { sink, captured } = events();
  const a = beginEmailObservation(sink, "sign_in"),
    b = beginEmailObservation(sink, "sign_up");
  endEmailObservation(b, false, false);
  endEmailObservation(a, false, true);
  failEmailObservation(a);
  expect(captured).toHaveLength(4);
  expect(captured[0].attemptId).not.toBe(captured[1].attemptId);
});
it("changing to production mode suppresses even a previously injected attempt", () => {
  const { sink, captured } = events();
  const a = beginEmailObservation(sink, "sign_in");
  vi.stubEnv("MODE", "production");
  vi.stubEnv("PROD", true);
  endEmailObservation(a, false, true);
  failEmailObservation(a);
  expect(captured).toHaveLength(1);
  expect(selectTestEmailObserver(sink)).toBeUndefined();
});
it("profile/cloud counters and auth-request order match the disabled baseline", async () => {
  async function run(observer?: EmailAuthObserver) {
    cleanup();
    env.signIn.mockClear();
    env.signUp.mockClear();
    env.getSession.mockClear();
    env.reset.mockClear();
    env.grant.mockClear();
    env.stats.mockClear();
    env.merge.mockClear();
    env.pushSave.mockClear();
    env.pushStats.mockClear();
    env.flush.mockClear();
    env.rpc.mockClear();
    await mount(observer);
    await call(() => api.signIn(signup.email, signup.password));
    await call(() => api.signUp(signup));
    await act(async () => {
      emit("SIGNED_IN");
    });
    return {
      signin: env.signIn.mock.calls,
      signup: env.signUp.mock.calls,
      getSession: env.getSession.mock.calls,
      reset: env.reset.mock.calls,
      grant: env.grant.mock.calls,
      stats: env.stats.mock.calls,
      merge: env.merge.mock.calls,
      push: env.pushSave.mock.calls,
      publicStats: env.pushStats.mock.calls,
      flush: env.flush.mock.calls,
      rpc: env.rpc.mock.calls,
    };
  }
  const baseline = await run();
  const observed = await run(vi.fn());
  expect(observed).toEqual(baseline);
});
it("absent injection in test mode does not inspect an otherwise unused sign-in data field", async () => {
  env.signIn.mockResolvedValueOnce({
    error: null,
    get data() {
      throw Error("no observer should inspect data");
    },
  });
  await mount();
  expect(await call(() => api.signIn(signup.email, signup.password))).toEqual({ ok: true });
});
it("observer failures are never logged, including sensitive exception messages", () => {
  const logs = [
    vi.spyOn(console, "log").mockImplementation(() => {}),
    vi.spyOn(console, "info").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
  ];
  const attempt = beginEmailObservation(() => {
    throw Error("synthetic-private-exception@example.invalid");
  }, "sign_in");
  endEmailObservation(attempt, false, true);
  for (const log of logs) expect(log).not.toHaveBeenCalled();
});
