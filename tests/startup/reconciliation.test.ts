// ============================================================
// Startup stabilization tests
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import { withBoundedTimeout } from "@/lib/boot/withTimeout";
import {
  __resetReconciliationForTests,
  getReconciliationState,
  setReconciliationState,
  awaitReconciliationReady,
} from "@/lib/boot/reconciliation";

describe("withBoundedTimeout", () => {
  it("returns success synchronously when work resolves fast", async () => {
    const out = await withBoundedTimeout(Promise.resolve(42), 1000);
    expect(out).toEqual({ kind: "success", value: 42 });
  });

  it("returns timeout when work exceeds deadline and invokes onLate later", async () => {
    let late: any = null;
    let resolveWork!: (v: string) => void;
    const work = new Promise<string>((r) => { resolveWork = r; });
    const out = await withBoundedTimeout(work, 20, (l) => { late = l; });
    expect(out.kind).toBe("timeout");
    resolveWork("done");
    await new Promise((r) => setTimeout(r, 5));
    expect(late).toEqual({ kind: "success", value: "done" });
  });

  it("classifies network rejections as offline", async () => {
    const out = await withBoundedTimeout(
      Promise.reject(new TypeError("Failed to fetch")),
      1000,
    );
    expect(out.kind).toBe("offline");
  });

  it("classifies non-network errors as failed", async () => {
    const out = await withBoundedTimeout(
      Promise.reject(new Error("boom")),
      1000,
    );
    expect(out.kind).toBe("failed");
  });
});

describe("reconciliation state machine", () => {
  beforeEach(() => __resetReconciliationForTests());

  it("resolves awaitReconciliationReady on offline-local transition", async () => {
    const p = awaitReconciliationReady(500);
    setTimeout(() => setReconciliationState("offline-local"), 5);
    const s = await p;
    expect(s).toBe("offline-local");
  });

  it("returns current state on bounded wait exhaustion without flipping", async () => {
    setReconciliationState("loading-server");
    const s = await awaitReconciliationReady(30);
    expect(s).toBe("loading-server");
    expect(getReconciliationState()).toBe("loading-server");
  });
});
