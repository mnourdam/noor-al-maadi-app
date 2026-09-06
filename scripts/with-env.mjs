#!/usr/bin/env node
// ============================================================
// Cross-platform environment wrapper.
// ------------------------------------------------------------
// Windows PowerShell does not support `FOO=1 command`, so every
// release script routes env-prefixed commands through here:
//
//   node scripts/with-env.mjs FOO=1 BAR=2 -- npm run build
// ============================================================
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep === -1) {
  console.error("[with-env] usage: node scripts/with-env.mjs KEY=VALUE... -- <command> [args]");
  process.exit(1);
}

const env = { ...process.env };
for (const pair of argv.slice(0, sep)) {
  const i = pair.indexOf("=");
  if (i < 1) {
    console.error(`[with-env] invalid assignment: ${pair}`);
    process.exit(1);
  }
  env[pair.slice(0, i)] = pair.slice(i + 1);
}

const [cmd, ...args] = argv.slice(sep + 1);
if (!cmd) {
  console.error("[with-env] no command given");
  process.exit(1);
}

const res = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(res.status ?? 1);
