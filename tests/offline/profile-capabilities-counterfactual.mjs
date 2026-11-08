// Diagnostic only: the regression oracle must FAIL on the pre-A-03 source.
// No checkout, worktree, source replacement, mock changes or official config edits.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const baseline = "237a1c7928eb62fe52dec12963c5e35318a85dc0";
const files = ["src/lib/profile.tsx", "src/lib/profile-writer.ts"];
const historical = "tests/offline/outbox-real-profile-authority.test.tsx";
const currentSource = files.map((file) => fs.readFileSync(path.join(root, file)));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "irth-profile-counterfactual-"));
const config = path.join(directory, "vitest.config.mts");
// Read exactly two historical source blobs. Their resolved module IDs stay at
// the real paths, so relative dependencies and SDK mocks remain identical.
const blobs = await Promise.all(
  files.map(async (file) => [
    path.join(root, file),
    (
      await promisify(execFile)("git", ["show", `${baseline}:${file}`], {
        cwd: root,
        encoding: "utf8",
      })
    ).stdout,
  ]),
);
fs.writeFileSync(
  config,
  `
import base from ${JSON.stringify(path.join(root, "vitest.outbox.config.ts"))};
const historical = new Map(${JSON.stringify(blobs)});
export default {
  ...base, root: ${JSON.stringify(root)},
  plugins: [...(base.plugins ?? []), {
    name: "pre-A-03-profile-source", enforce: "pre",
    load(id) { return historical.get(id.split("?")[0]) ?? null; }
  }]
};
`,
);
console.log(
  `Counterfactual source: ${baseline}; expected exit 1: two regression assertions, twelve other cases pass.`,
);
try {
  const cli = fs.realpathSync(path.join(root, "node_modules/.bin/vitest"));
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "run", "--config", config, historical], {
      cwd: root,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  // Keep Vitest's real status: an expected diagnostic failure is not a green gate.
  process.exitCode = status ?? 1;
} finally {
  files.forEach((file, index) => {
    if (!fs.readFileSync(path.join(root, file)).equals(currentSource[index]))
      throw new Error(`Counterfactual changed working source: ${file}`);
  });
  fs.rmSync(directory, { recursive: true, force: true });
}
