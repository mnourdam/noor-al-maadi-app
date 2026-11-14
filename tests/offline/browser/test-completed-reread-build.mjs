import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateOutput, verifiedArt, ART_PATH, ART_SHA } from "./build-completed-reread.mjs";
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
  const required = "on:\n  push:\n    branches: [v18-01a-outbox-recovery]\n    paths:\n      - '.github/workflows/v18-completed-reread-browser.yml'\n      - 'tests/offline/browser/*completed-reread*'\n      - 'src/routes/campaigns.imported.$id.index.tsx'\n      - 'src/routes/campaigns.imported.$id.chapter.$chapter.tsx'\n      - 'src/components/imported-campaign/**'\n      - 'src/components/AndroidSafeTextInput.tsx'\n      - 'src/components/CachedImage.tsx'\n      - 'src/lib/image-cache.ts'\n      - 'src/lib/campaign-art/interpretive-chapters.ts'\n      - 'src/lib/campaign-art/offline-pack.ts'\n      - 'src/lib/campaign-art/chapter-pack.generated.ts'\n      - 'public/campaign-key-art/chapters/cordoba-golden-age/ch5/interpretive-v1.webp'\n      - 'src/lib/identity/**'\n      - 'src/lib/importedCampaignProgress.ts'\n      - 'src/lib/campaignLedger.ts'\n      - 'src/lib/ui-language/**'\n      - 'src/styles.css'\n      - 'package.json'\n      - 'package-lock.json'\n  workflow_dispatch:\npermissions:\n  contents: read\n";
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

test("exact reviewed WebP only; missing, changed and symlink inputs reject",()=>{
 const bytes=verifiedArt(process.cwd());assert.equal(bytes.length,167780);
 const root=fs.mkdtempSync("/tmp/irth-completed-reread-");
 try{assert.throws(()=>verifiedArt(root));const file=path.join(root,"public",ART_PATH);fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,bytes);assert.deepEqual(verifiedArt(root),bytes);
  fs.writeFileSync(file,Buffer.from("not WebP"));assert.throws(()=>verifiedArt(root),/WebP/);
  const changed=Buffer.from(bytes);changed[changed.length-1]^=1;fs.writeFileSync(file,changed);assert.throws(()=>verifiedArt(root),/changed/);
  fs.unlinkSync(file);fs.symlinkSync(path.resolve("public",ART_PATH),file);assert.throws(()=>verifiedArt(root),/symlink/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
