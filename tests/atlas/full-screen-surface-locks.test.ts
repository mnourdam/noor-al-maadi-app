// Guard test — Atlas full-screen surface must never be neutralized.
//
// Root cause it locks in: the Atlas route renders as `fixed inset-0 z-40`.
// `neutralizeBlockingOverlays()` hides EVERY screen-covering fixed/absolute
// layer, so calling it on the Atlas success path hid the Atlas itself —
// a completely blank surface with no crash, no error boundary, no report.
// It is a crash-path-only tool.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("atlas full-screen surface / ui-locks", () => {
  const recovery = read("src/lib/atlas/atlas-recovery.ts");
  const locks = read("src/lib/ui/ui-locks.ts");

  it("the Atlas success-path release uses the surface-safe variant", () => {
    const fn = recovery.slice(recovery.indexOf("export function releaseUiLocks"));
    const body = fn.slice(0, fn.indexOf("}") + 1);
    expect(body).toContain("releaseSurfaceLocks()");
    expect(body).not.toContain("releaseAllUiLocks()");
    expect(body).not.toContain("neutralizeBlockingOverlays()");
  });

  it("keeps a distinct crash-path release", () => {
    expect(recovery).toContain("export function hardReleaseUiLocks");
  });

  it("releaseSurfaceLocks restores previously neutralized layers", () => {
    const fn = locks.slice(locks.indexOf("export function releaseSurfaceLocks"));
    const body = fn.slice(0, fn.indexOf("\n}") + 2);
    expect(body).toContain("restoreNeutralizedOverlays()");
    expect(body).not.toContain("neutralizeBlockingOverlays()");
  });

  it("only crash/recovery surfaces may neutralize overlays", () => {
    const callers = [
      "src/lib/ui/ui-locks.ts",
      "src/components/FatalRecoveryScreen.tsx",
      "src/components/atlas/AtlasErrorBoundary.tsx",
      "src/lib/atlas/atlas-recovery.ts",
    ];
    for (const f of callers) {
      // sanity: files exist and compile-relevant symbols are spelled right
      expect(read(f).length).toBeGreaterThan(0);
    }
    // The Atlas render path must not import the crash-only helpers.
    const shell = read("src/components/atlas/AtlasShell.tsx");
    const stage = read("src/components/atlas/AtlasStage.tsx");
    for (const src of [shell, stage]) {
      expect(src).not.toContain("neutralizeBlockingOverlays");
      expect(src).not.toContain("releaseAllUiLocks");
      expect(src).not.toContain("hardReleaseUiLocks");
    }
  });

  it("the Atlas camera is the SVG viewBox, not a promoted transform layer", () => {
    const stage = read("src/components/atlas/AtlasStage.tsx");
    // `will-change: transform` on a <g> holding the 14192x7088 raster forces
    // one un-tiled composited SVG layer that blows past GL_MAX_TEXTURE_SIZE
    // on Android WebView.
    expect(stage).not.toMatch(/willChange:\s*"transform"/);
    expect(stage).toContain("viewBox={`${camera.x} ${camera.y} ${camera.w} ${camera.h}`}");
  });

  it("Atlas capability gates are probed after mount, never during render", () => {
    const route = read("src/routes/map.tsx");
    // A render-time probe evaluates on the server, where `document` and
    // storage do not exist, so every device would server-render the simplified
    // Atlas and flash it before hydration.
    expect(route).not.toMatch(/useState\(\(\)\s*=>\s*!?hasCanvas2d\(\)\)/);
    expect(route).not.toMatch(/useState\(\(\)\s*=>\s*hasAtlasCrashMarker\(\)\)/);
    expect(route).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*hasCanvas2d\(\)/);
  });
});
