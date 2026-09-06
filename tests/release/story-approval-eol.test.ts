import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Mirrors the hashing used by scripts/lib/story-artifact-approval.mjs.
 * A Windows checkout with core.autocrlf=true rewrites LF -> CRLF, which must
 * NOT invalidate an approved artifact, while any content edit still must.
 */
function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path, "utf8").replace(/\r\n?/g, "\n"), "utf8").digest("hex");
}

describe("story artifact approval hashing", () => {
  const dir = mkdtempSync(join(tmpdir(), "approval-eol-"));
  const lf = join(dir, "manifest-lf.json");
  const crlf = join(dir, "manifest-crlf.json");
  const edited = join(dir, "manifest-edited.json");
  const content = '{\n  "count": 1785\n}\n';

  writeFileSync(lf, content, "utf8");
  writeFileSync(crlf, content.replace(/\n/g, "\r\n"), "utf8");
  writeFileSync(edited, content.replace("1785", "1784"), "utf8");

  it("treats a CRLF checkout as the same approved artifact", () => {
    expect(sha256File(crlf)).toBe(sha256File(lf));
  });

  it("still rejects any content change", () => {
    expect(sha256File(edited)).not.toBe(sha256File(lf));
  });
});
