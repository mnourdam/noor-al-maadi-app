// ============================================================
// Stories P2 — Checksum helpers
// ------------------------------------------------------------
// Every media row is content-addressed by SHA-256(processed
// bytes). The server verifier runs the same hash on downloaded
// bytes; these tests pin the format so a future refactor cannot
// silently produce non-matching hashes.
// ============================================================
import { describe, it, expect } from "bun:test";
import { isSha256Hex, sha256Hex } from "@/lib/stories/media/checksum";

describe("stories P2 — checksum", () => {
  it("known-vector: SHA-256('') = e3b0c442...", async () => {
    const hex = await sha256Hex(new Uint8Array());
    expect(hex).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(isSha256Hex(hex)).toBe(true);
  });

  it("known-vector: SHA-256('abc') = ba7816bf...", async () => {
    const hex = await sha256Hex(new TextEncoder().encode("abc"));
    expect(hex).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("accepts Blob and Uint8Array inputs equivalently", async () => {
    const bytes = new TextEncoder().encode("story-media");
    const asBlob = await sha256Hex(new Blob([bytes]));
    const asBuf = await sha256Hex(bytes);
    expect(asBlob).toBe(asBuf);
  });

  it("isSha256Hex rejects wrong length, case, and non-hex", () => {
    expect(isSha256Hex("abcd")).toBe(false);
    expect(isSha256Hex("A".repeat(64))).toBe(false); // uppercase
    expect(isSha256Hex("z".repeat(64))).toBe(false); // non-hex
    expect(isSha256Hex("0".repeat(64))).toBe(true);
  });
});
