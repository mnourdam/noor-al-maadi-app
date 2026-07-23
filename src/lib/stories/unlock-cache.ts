// ============================================================
// Stories — offline unlock cache (P5 UX guarantee)
// ------------------------------------------------------------
// While online, `list_stories_v2` authoritatively tells us which
// stories the current user has unlocked. We persist that set to
// localStorage, HMAC-signed with a per-install secret, so that
// when the app goes offline we can:
//
//   * keep previously-unlocked stories unlocked, and
//   * keep previously-locked stories locked
//
// We NEVER newly unlock a story offline — server remains the sole
// source of truth for unlock evaluation, and the outbox already
// re-validates completion/progress writes on reconnect.
//
// Tampering resistance: the payload is HMAC-SHA256 signed with a
// per-install random key generated on first use. Editing the JSON
// blob directly invalidates the signature and the cache is treated
// as empty — the app falls back to the conservative "only
// unlock_spec.type === 'always'" rule.
// ============================================================

const SECRET_KEY = "irth.stories.unlock.secret";
const CACHE_KEY_PREFIX = "irth.stories.unlock.v1:";

interface UnlockPayload {
  uid: string;
  ids: string[];
  savedAt: number;
}

interface SignedBlob {
  p: UnlockPayload;
  sig: string;
}

function safeLs(): Storage | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

function getOrCreateSecret(): string {
  const ls = safeLs();
  if (!ls) return "irth-default-unlock-secret";
  try {
    let s = ls.getItem(SECRET_KEY);
    if (s && s.length >= 32) return s;
    const bytes = new Uint8Array(32);
    if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    s = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    ls.setItem(SECRET_KEY, s);
    return s;
  } catch { return "irth-default-unlock-secret"; }
}

async function hmacSign(payload: UnlockPayload): Promise<string> {
  const secret = getOrCreateSecret();
  const message = JSON.stringify({
    uid: payload.uid,
    ids: [...payload.ids].sort(),
    savedAt: payload.savedAt,
  });
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch { /* fall through */ }
  // Fallback: non-cryptographic checksum. Still detects casual edits.
  let h = 0;
  const combined = secret + "|" + message;
  for (let i = 0; i < combined.length; i++) {
    h = ((h << 5) - h + combined.charCodeAt(i)) | 0;
  }
  return `fb${(h >>> 0).toString(16)}`;
}

function cacheKey(uid: string): string {
  return `${CACHE_KEY_PREFIX}${uid}`;
}

/** Overwrite the local unlock set for a user with the authoritative online view. */
export async function persistUnlockedIds(uid: string, ids: Iterable<string>): Promise<void> {
  const ls = safeLs();
  if (!ls || !uid) return;
  const payload: UnlockPayload = {
    uid,
    ids: [...new Set([...ids].filter(Boolean))],
    savedAt: Date.now(),
  };
  try {
    const sig = await hmacSign(payload);
    const blob: SignedBlob = { p: payload, sig };
    ls.setItem(cacheKey(uid), JSON.stringify(blob));
  } catch { /* ignore */ }
}

/** Read the last-known online unlock set for a user. Returns empty on tamper. */
export async function loadUnlockedIds(uid: string): Promise<Set<string>> {
  const ls = safeLs();
  if (!ls || !uid) return new Set();
  try {
    const raw = ls.getItem(cacheKey(uid));
    if (!raw) return new Set();
    const blob = JSON.parse(raw) as SignedBlob;
    if (!blob?.p || blob.p.uid !== uid || !Array.isArray(blob.p.ids)) return new Set();
    const expected = await hmacSign(blob.p);
    if (expected !== blob.sig) return new Set();
    return new Set(blob.p.ids);
  } catch { return new Set(); }
}

/** Clear on sign-out so a next signed-in session can't see the previous user's set. */
export function clearUnlockCache(uid?: string | null): void {
  const ls = safeLs();
  if (!ls) return;
  try {
    if (uid) { ls.removeItem(cacheKey(uid)); return; }
    // Bulk clear.
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(CACHE_KEY_PREFIX)) keys.push(k);
    }
    for (const k of keys) ls.removeItem(k);
  } catch { /* ignore */ }
}
