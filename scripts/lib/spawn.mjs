// ============================================================
// Cross-platform child-process launching for the release scripts.
// ------------------------------------------------------------
// WINDOWS BLOCKER (root cause of `'C:\Program' is not recognized`):
// spawning with `shell: true` hands the executable path to cmd.exe as
// the first token of a command STRING. `C:\Program Files\nodejs\node.exe`
// then splits at the space and cmd.exe tries to run `C:\Program`.
//
// Rules enforced here:
//   * a real executable path (process.execPath, anything absolute, or
//     any token containing a space) is ALWAYS launched with shell:false
//     so the OS receives the executable and its arguments separately.
//   * only bare `.cmd`/`.bat` shims resolved from PATH (npm.cmd, npx.cmd)
//     need a shell on Windows — Node refuses to exec them otherwise —
//     and those names never contain spaces. Their arguments are quoted.
//   * never build a command string by concatenation anywhere else.
// ============================================================
import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";

const isWin = (platform = process.platform) => platform === "win32";

/** A Windows batch shim can only be exec'd through cmd.exe. */
export function needsShell(command, platform = process.platform) {
  if (!isWin(platform)) return false;
  if (isAbsolute(command) || command.includes(" ") || command.includes("/") || command.includes("\\")) return false;
  return /\.(cmd|bat)$/i.test(command);
}

/** Quote a cmd.exe token; only ever applied to shim arguments. */
export function quoteForCmd(token) {
  return /[\s&|<>^()"]/.test(token) ? `"${token.replace(/"/g, '""')}"` : token;
}

/**
 * Decide exactly how a command is handed to the OS.
 * @returns {{command:string,args:string[],shell:boolean}}
 */
export function resolveSpawn(command, args = [], platform = process.platform) {
  if (needsShell(command, platform)) {
    return { command, args: args.map(quoteForCmd), shell: true };
  }
  return { command, args: [...args], shell: false };
}

/** The npm / npx launcher for the current platform (bare shim name, no spaces). */
export const npmBin = (platform = process.platform) => (isWin(platform) ? "npm.cmd" : "npm");
export const npxBin = (platform = process.platform) => (isWin(platform) ? "npx.cmd" : "npx");

/** Run a child process safely on every platform. Returns its exit status. */
export function runProcess(command, args = [], { env = {}, cwd } = {}) {
  const plan = resolveSpawn(command, args);
  const res = spawnSync(plan.command, plan.args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
    cwd,
    shell: plan.shell,
    windowsHide: true,
  });
  if (res.error) {
    console.error(`[spawn] failed to launch ${plan.command}: ${res.error.message}`);
    return 1;
  }
  return res.status ?? 1;
}

/** Run a Node script with the CURRENT Node binary — never a shell, never a hardcoded path. */
export function runNodeScript(script, args = [], opts = {}) {
  return runProcess(process.execPath, [script, ...args], opts);
}
