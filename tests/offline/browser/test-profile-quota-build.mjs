import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateOutput } from "./build-profile-quota.mjs";
for (const output of [
  "",
  "relative",
  "/tmp/not-approved/assets",
  "/tmp/irth-profile-quota-x/../../unsafe",
  "/tmp/irth-profile-quota-x/assets/sub",
  "/tmp/irth-profile-quota-x",
])
  test(`reject ${JSON.stringify(output)}`, () => assert.throws(() => validateOutput(output)));
test("empty valid output only; symlinks/nonempty fail closed", () => {
  const root = fs.mkdtempSync("/tmp/irth-profile-quota-");
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
test('narrow own-workflow push read-only branch lane, quota bounds and actual module guards',()=>{
 const workflow=fs.readFileSync('.github/workflows/v18-profile-quota-browser.yml','utf8');
 assert.match(workflow,/on:\n  push:\n    branches: \[v18-01a-outbox-recovery\]\n    paths:\n      - '\.github\/workflows\/v18-profile-quota-browser\.yml'\n  workflow_dispatch:\npermissions:\n  contents: read/);
 assert.match(workflow,/persist-credentials: false/);assert.doesNotMatch(workflow,/pull_request:|secrets\./);
 const builder=fs.readFileSync('tests/offline/browser/build-profile-quota.mjs','utf8');
 for(const actual of ['src/lib/profile.tsx','src/lib/profile-writer.ts','src/components/ProfileStorageWarning.tsx'])assert.ok(builder.includes('"'+actual+'"'));
 assert.doesNotMatch(builder,/add\("src\/lib\/profile\.tsx"/);
 assert.match(builder,/backend module prohibited/);
 const fixture=fs.readFileSync('tests/offline/browser/profile-quota-fixture.tsx','utf8');
 assert.match(fixture,/fillAttempts>40/);assert.match(fixture,/performance\.now\(\)-start>5000/);assert.match(fixture,/8\*1024\*1024/);
 assert.doesNotMatch(fixture,/new DOMException/);
});
