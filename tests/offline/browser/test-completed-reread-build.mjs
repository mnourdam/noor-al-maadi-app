import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateOutput } from "./build-completed-reread.mjs";
for (const output of [
  "",
  "relative",
  "/tmp/not-approved/assets",
  "/tmp/irth-completed-reread-x/../../unsafe",
  "/tmp/irth-completed-reread-x/assets/sub",
  "/tmp/irth-completed-reread-x",
])
  test(`reject ${JSON.stringify(output)}`, () => assert.throws(() => validateOutput(output)));
test("empty valid output only; symlinks/nonempty fail closed", () => {
  const root = fs.mkdtempSync("/tmp/irth-completed-reread-");
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
  const workflow = fs.readFileSync(".github/workflows/v18-completed-reread-browser.yml", "utf8");
  const required = "on:\n  push:\n    branches: [v18-01a-outbox-recovery]\n    paths:\n      - '.github/workflows/v18-completed-reread-browser.yml'\n      - 'tests/offline/browser/*completed-reread*'\n      - 'src/routes/campaigns.imported.$id.index.tsx'\n      - 'src/routes/campaigns.imported.$id.chapter.$chapter.tsx'\n      - 'src/components/imported-campaign/**'\n      - 'src/components/AndroidSafeTextInput.tsx'\n      - 'src/lib/identity/**'\n      - 'src/lib/importedCampaignProgress.ts'\n      - 'src/lib/campaignLedger.ts'\n      - 'src/lib/ui-language/**'\n      - 'src/styles.css'\n      - 'package.json'\n      - 'package-lock.json'\n  workflow_dispatch:\npermissions:\n  contents: read\n";
  const valid = (text) =>
    text.slice(text.indexOf("on:\n"), text.indexOf("jobs:\n")) === required &&
    text.includes("    if: github.ref == 'refs/heads/v18-01a-outbox-recovery'\n") &&
    text.includes("          persist-credentials: false\n");
  assert.ok(valid(workflow));
  for (const bad of [
    workflow.replace("contents: read", "contents: write"),
    workflow.replace("branches: [v18-01a-outbox-recovery]", "branches: [main]"),
    workflow.replace("'src/components/imported-campaign/**'", "'**'"),
    workflow.replace("  workflow_dispatch:", "  pull_request:\n  workflow_dispatch:"),
  ])
    assert.ok(!valid(bad));
});
