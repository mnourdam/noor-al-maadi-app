import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startForegroundPoller } from "../../src/lib/foreground-poller";
let doc: EventTarget & { visibilityState: string };
let win: EventTarget;
let net: { onLine: boolean };
beforeEach(() => {
  vi.useFakeTimers();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  win = Object.assign(new EventTarget(), { setTimeout, clearTimeout, setInterval, clearInterval });
  net = { onLine: true };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", net);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("foreground polling", () => {
  it("keeps normal cadence, pauses hidden/offline, resumes and cleans up", async () => {
    const task = vi.fn(async () => {});
    const stop = startForegroundPoller(task, 60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(2);
    doc.visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(600_000);
    expect(task).toHaveBeenCalledTimes(2);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(3);
    net.onLine = false;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(task).toHaveBeenCalledTimes(3);
    net.onLine = true;
    win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(4);
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    win.dispatchEvent(new Event("focus"));
    expect(task).toHaveBeenCalledTimes(4);
  });
  it("never overlaps slow requests and recovers after failures", async () => {
    let finish!: () => void;
    const task = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            finish = r;
          }),
      )
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(undefined);
    const stop = startForegroundPoller(task, 60_000);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(task).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(task).toHaveBeenCalledTimes(3);
    stop();
  });
  it("preserves encyclopedia bootstrap grace and focus opt-out", async () => {
    const task = vi.fn(async () => {});
    const stop = startForegroundPoller(task, 180_000, { initialDelayMs: 60_000, focus: false });
    win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(59_000);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    win.dispatchEvent(new Event("focus"));
    expect(task).toHaveBeenCalledTimes(1);
    stop();
  });
});

it("preserves polling for authorized background browser alerts", async () => {
  doc.visibilityState = "hidden";
  const task = vi.fn(async () => {});
  const stop = startForegroundPoller(task, 60_000, { allowBackground: () => true });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(task).toHaveBeenCalledTimes(2);
  net.onLine = false;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(task).toHaveBeenCalledTimes(2);
  stop();
});
