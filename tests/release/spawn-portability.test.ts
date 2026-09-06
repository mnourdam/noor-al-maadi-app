import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error — plain .mjs release helper, no type declarations
import { resolveSpawn, needsShell, npmBin, npxBin, quoteForCmd, runNodeScript } from "../../scripts/lib/spawn.mjs";

/**
 * Regression guard for the Windows release blocker:
 *   'C:\Program' is not recognized as an internal or external command
 * caused by handing an executable path with spaces to cmd.exe as a
 * command STRING (shell: true).
 */
describe("release script process launching", () => {
  const winNode = "C:\\Program Files\\nodejs\\node.exe";

  it("never shells out an executable path containing spaces (win32)", () => {
    const plan = resolveSpawn(winNode, ["scripts/build-campaign-art-pack.mjs"], "win32");
    expect(plan.shell).toBe(false);
    expect(plan.command).toBe(winNode);
    expect(plan.args).toEqual(["scripts/build-campaign-art-pack.mjs"]);
  });

  it("never shells out an absolute posix path", () => {
    const plan = resolveSpawn("/usr/local/bin/node", ["a.mjs"], "linux");
    expect(plan.shell).toBe(false);
    expect(plan.command).toBe("/usr/local/bin/node");
  });

  it("shells only bare Windows .cmd shims, whose names have no spaces", () => {
    const plan = resolveSpawn("npm.cmd", ["run", "build:android:web"], "win32");
    expect(plan.shell).toBe(true);
    expect(plan.command).toBe("npm.cmd");
    expect(plan.command).not.toContain(" ");
  });

  it("does not shell npm on posix", () => {
    expect(resolveSpawn("npm", ["run", "x"], "linux").shell).toBe(false);
    expect(needsShell("npm.cmd", "linux")).toBe(false);
  });

  it("treats a .cmd living under a spaced directory as a real path, not a shim", () => {
    expect(needsShell("C:\\Program Files\\nodejs\\npm.cmd", "win32")).toBe(false);
    expect(resolveSpawn("C:\\Program Files\\nodejs\\npm.cmd", ["run", "x"], "win32").shell).toBe(false);
  });

  it("quotes shim arguments that contain spaces", () => {
    expect(quoteForCmd("run")).toBe("run");
    expect(quoteForCmd("C:\\My Dir\\x.mjs")).toBe('"C:\\My Dir\\x.mjs"');
  });

  it("picks the platform launcher name", () => {
    expect(npmBin("win32")).toBe("npm.cmd");
    expect(npmBin("linux")).toBe("npm");
    expect(npxBin("win32")).toBe("npx.cmd");
    expect(npxBin("darwin")).toBe("npx");
  });

  it("actually runs a Node binary whose path contains a space", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "spawn-space-")), "Program Files");
    mkdirSync(dir, { recursive: true });
    const bin = join(dir, "node");
    copyFileSync(process.execPath, bin);
    const out = execFileSync(bin, ["-e", "process.stdout.write('ok')"]).toString();
    expect(out).toBe("ok");
  });

  it("runs a Node script through the current interpreter without a shell", () => {
    const status = runNodeScript("-e", ["process.exit(0)"]);
    expect(status).toBe(0);
  });

  it("reports a launch failure instead of throwing", () => {
    expect(runNodeScript("./definitely-missing-release-script.mjs")).not.toBe(0);
  });
});
