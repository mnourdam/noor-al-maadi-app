import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateOutput } from "./build-profile-achievement.mjs";
for (const output of [
  "",
  "relative",
  "/tmp/not-approved/assets",
  "/tmp/irth-profile-achievement-x/../../unsafe",
  "/tmp/irth-profile-achievement-x/assets/sub",
  "/tmp/irth-profile-achievement-x",
])
  test(`reject ${JSON.stringify(output)}`, () => assert.throws(() => validateOutput(output)));
test("empty valid output only; symlinks/nonempty fail closed", () => {
  const root = fs.mkdtempSync("/tmp/irth-profile-achievement-");
  try {
    const out = path.join(root, "assets");
    fs.mkdirSync(out);
    assert.equal(validateOutput(out), out);
    fs.writeFileSync(path.join(out, "file"), "x");
    assert.throws(() => validateOutput(out));
    fs.unlinkSync(path.join(out, "file"));
    fs.rmdirSync(out);
    fs.symlinkSync(os.tmpdir(), out);
    assert.throws(() => validateOutput(out));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("workflow admits only narrow repair branch events with read-only permissions", () => {
  const workflow = fs.readFileSync(".github/workflows/v18-profile-achievement-browser.yml", "utf8");
  const required = `on:
  push:
    branches: [v18-01a-outbox-recovery]
    paths:
      - '.github/workflows/v18-profile-achievement-browser.yml'
      - 'tests/offline/browser/*profile-achievement*'
      - 'src/routes/profile.tsx'
      - 'src/lib/achievements/v2/**'
      - 'src/lib/ui-language/**'
      - 'src/components/ModalPortal.tsx'
      - 'src/components/AppShell.tsx'
      - 'src/styles.css'
      - 'package.json'
      - 'package-lock.json'
  workflow_dispatch:
permissions:
  contents: read
`;
  const valid = (text) =>
    text.slice(text.indexOf("on:\n"), text.indexOf("jobs:\n")) === required &&
    text.includes("    if: github.ref == 'refs/heads/v18-01a-outbox-recovery'\n") &&
    text.includes("          persist-credentials: false\n");
  assert.ok(valid(workflow));
  for (const bad of [
    workflow.replace("contents: read", "contents: write"),
    workflow.replace("branches: [v18-01a-outbox-recovery]", "branches: [main]"),
    workflow.replace("'src/routes/profile.tsx'", "'**'"),
    workflow.replace("  workflow_dispatch:", "  pull_request:\n  workflow_dispatch:"),
  ])
    assert.ok(!valid(bad));
});
