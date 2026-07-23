// ============================================================
// Stories P2 — SHA-256 helpers
// ------------------------------------------------------------
// Deterministic content addressing for story media. The same
// hash function runs client-side (before upload) and server-side
// (after re-download) so the verification RPC can prove the
// bytes at rest match the bytes the client claims to have
// uploaded.
// ============================================================

/** Lowercase 64-char hex SHA-256 of the given bytes. */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array | Blob): Promise<string> {
  const buf =
    bytes instanceof Blob
      ? await bytes.arrayBuffer()
      : bytes instanceof Uint8Array
        ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        : bytes;
  const digest = await crypto.subtle.digest("SHA-256", buf as ArrayBuffer);
  return bufferToHex(new Uint8Array(digest));
}

export function bufferToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

const HEX_64 = /^[0-9a-f]{64}$/;

/** True when `s` is a lowercase 64-char SHA-256 hex string. */
export function isSha256Hex(s: unknown): s is string {
  return typeof s === "string" && HEX_64.test(s);
}
