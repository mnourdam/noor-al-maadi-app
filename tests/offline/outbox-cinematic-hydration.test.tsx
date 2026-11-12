import React, { StrictMode, act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { markCompleted } from "@/lib/cinematic-opening/persistence";

const state = vi.hoisted(() => ({
  config: { version: "hydration-test", replayForAllUsers: false,
    scenes: [{ id: "one", image: "/scene.webp", durationMs: 60000 }] },
  permission: vi.fn(),
}));
vi.mock("@/lib/cinematic-opening/data", () => ({
  CINEMATIC_OPENING_DATA: state.config, CINEMATIC_LOGO_URL: "/logo.webp",
}));
vi.mock("@/lib/audioManager", () => ({ audioManager: {
  getSettings: () => ({ soundEnabled: false, ambienceEnabled: false }),
} }));
vi.mock("@/lib/navigation", () => ({ useOverlayDismiss: vi.fn() }));
vi.mock("@/lib/navigation/engine", () => ({ useOverlayDismiss: vi.fn() }));
vi.mock("@/components/cinematic/SceneRenderer", () => ({ SceneRenderer: () => <span data-scene /> }));
vi.mock("@/components/cinematic/AmbientAudio", () => ({ AmbientAudio: () => null }));
vi.mock("@capacitor/app", () => ({ App: { addListener: async () => ({ remove() {} }) } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: {
  checkPermissions: async () => ({ display: "prompt" }), requestPermissions: () => state.permission(),
} }));
import { CinematicOpening, OPENING_COMPLETED_EVENT } from "@/components/cinematic/CinematicOpening";

let root: Root | undefined;
let images: HTMLImageElement[];
let completion = vi.fn<() => void>();
let errors: ReturnType<typeof vi.spyOn>;
const recoverable = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  state.config.replayForAllUsers = false;
  state.permission.mockReset();
  images = [];
  completion = vi.fn<() => void>();
  recoverable.mockReset();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Image", class { constructor() {
    const image = document.createElement("img"); images.push(image); return image;
  } });
  window.addEventListener(OPENING_COMPLETED_EVENT, completion);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  window.removeEventListener(OPENING_COMPLETED_EVENT, completion);
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  errors.mockRestore();
});
async function hydrate() {
  const tree = <StrictMode><main>Home</main><CinematicOpening /></StrictMode>;
  // Exercise the real SSR boundary: no window/document, then restore the
  // browser for hydrateRoot rather than comparing two client renders.
  const browserWindow = window;
  const browserDocument = document;
  let html: string;
  vi.stubGlobal("window", undefined);
  vi.stubGlobal("document", undefined);
  try { html = renderToString(tree); }
  finally {
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("document", browserDocument);
  }
  expect(html).toBe("<main>Home</main>");
  expect(images).toHaveLength(0);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  await act(async () => { root = hydrateRoot(container, tree, { onRecoverableError: recoverable }); });
  expect(recoverable).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
}
function opening() { return document.querySelector("[data-irth-cinematic-opening]"); }

it("hydrates first launch without a mismatch and keeps the gate until images load", async () => {
  await hydrate();
  expect(opening()?.getAttribute("data-phase")).toBe("gate");
  expect(completion).not.toHaveBeenCalled();
  expect(document.querySelector("[data-scene]")).toBeNull();
  await act(async () => { for (const image of images) image.dispatchEvent(new Event("load")); });
  expect(opening()?.getAttribute("data-phase")).toBe("playing");
  expect(document.querySelector("[data-scene]")).not.toBeNull();
});

it("hydrates a returning user without a portal and emits completion once in StrictMode", async () => {
  markCompleted(state.config.version);
  await hydrate();
  expect(opening()).toBeNull();
  expect(images).toHaveLength(0);
  expect(completion).toHaveBeenCalledTimes(1);
  expect(document.body.style.overflow).not.toBe("hidden");
});

it("honors replay-for-all even when this version was completed", async () => {
  markCompleted(state.config.version);
  state.config.replayForAllUsers = true;
  await hydrate();
  expect(opening()?.getAttribute("data-phase")).toBe("gate");
  expect(completion).not.toHaveBeenCalled();
});

it("keeps the gate while native permission is pending, then preloads", async () => {
  vi.stubGlobal("Capacitor", { isNativePlatform: () => true, getPlatform: () => "android" });
  let resolve!: () => void;
  state.permission.mockImplementation(() => new Promise<void>(r => { resolve = r; }));
  await hydrate();
  expect(state.permission).toHaveBeenCalledTimes(1);
  expect(images).toHaveLength(0);
  expect(opening()?.getAttribute("data-phase")).toBe("gate");
  await act(async () => resolve());
  expect(images.length).toBeGreaterThan(0);
  expect(completion).not.toHaveBeenCalled();
});

it("finishes once after a confirmed skip and persists completion", async () => {
  await hydrate();
  await act(async () => { for (const image of images) image.dispatchEvent(new Event("load")); });
  await act(async () => {
    (document.querySelector('[aria-label="تخطّي المقدمة"]') as HTMLButtonElement).click();
  });
  const confirm = Array.from(document.querySelectorAll("button")).find(
    button => button.textContent?.trim() === "تخطّي" && !button.hasAttribute("aria-label"),
  );
  expect(confirm).toBeDefined();
  await act(async () => confirm!.click());
  await act(async () => { vi.advanceTimersByTime(1500); });
  expect(opening()).toBeNull();
  expect(completion).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("irth.cinematic-opening.completed-version.v1")).toBe(state.config.version);
  await act(async () => { vi.advanceTimersByTime(60000); });
  expect(completion).toHaveBeenCalledTimes(1);
});
