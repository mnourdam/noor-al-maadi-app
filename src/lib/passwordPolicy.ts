// ============================================================
// Canonical password policy for Irth.
//
// SINGLE SOURCE OF TRUTH. Every password field, strength meter,
// submit-button gate, and pre-submit validation MUST call
// evaluatePassword() / checkPasswordAsync() from this file.
// Do not duplicate password rules elsewhere.
//
// The policy intentionally mirrors — and is at least as strict as —
// the Supabase Auth server rules configured for this project:
//
//   • Minimum length: 8 characters
//   • Must contain a lowercase letter (a-z)
//   • Must contain an uppercase letter (A-Z)
//   • Must contain a digit (0-9)
//   • Must NOT be a well-known/common password
//   • Must NOT appear in the Have-I-Been-Pwned breach corpus
//     (HIBP leaked-password protection — checked via k-anonymity
//      range API so the plaintext never leaves the device)
//
// If Supabase policy is tightened, update this file only and the
// entire app follows.
// ============================================================

/** Static "obvious" list — surfaced before we hit the network. */
const COMMON_PASSWORDS = new Set<string>([
  "password", "password1", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "qwerty", "qwerty123", "qwertyuiop",
  "abc123", "abcd1234", "letmein", "welcome", "welcome1", "iloveyou",
  "admin", "administrator", "root", "toor", "user", "guest",
  "monkey", "dragon", "master", "shadow", "sunshine", "princess",
  "football", "baseball", "michael", "michelle",
  "azerty", "zaq12wsx", "trustno1", "starwars", "solo",
  "irth", "irth123", "irth1234", "tarikh", "history",
]);

export interface PasswordEvaluation {
  /** 0-4 strength score used by the meter. */
  score: 0 | 1 | 2 | 3 | 4;
  /** Human-readable Arabic guidance for anything still missing. */
  problems: string[];
  /** True iff EVERY sync rule passes. Async HIBP is separate. */
  syncOk: boolean;
}

/** Synchronous evaluation — safe to call on every keystroke. */
export function evaluatePassword(pwd: string): PasswordEvaluation {
  const problems: string[] = [];

  if (pwd.length < 8) problems.push("٨ أحرف على الأقل");
  if (!/[a-z]/.test(pwd)) problems.push("حرف صغير (a-z)");
  if (!/[A-Z]/.test(pwd)) problems.push("حرف كبير (A-Z)");
  if (!/\d/.test(pwd)) problems.push("رقم واحد على الأقل");

  const lower = pwd.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    problems.push("كلمة مرور شائعة جداً — اختر كلمة مختلفة");
  }
  // Trivial sequences like 12345678, abcdefgh
  if (/^(?:0123456789|1234567890|12345678|abcdefgh|qwertyui|asdfghjk)$/i.test(pwd)) {
    problems.push("تسلسل بسيط جداً");
  }

  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd) || pwd.length >= 12) score++;
  const clamped = Math.min(4, score) as PasswordEvaluation["score"];

  return {
    score: clamped,
    problems,
    syncOk: problems.length === 0,
  };
}

// ---- Async HIBP k-anonymity check ---------------------------------
// https://haveibeenpwned.com/API/v3#PwnedPasswords
// We send only the first 5 chars of the SHA-1 hash. The plaintext
// password never leaves the device.

async function sha1Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export type HibpResult =
  | { status: "safe" }
  | { status: "pwned"; count: number }
  | { status: "skipped"; reason: string };

// Per-hash result cache (definitive answer for a given password).
const hibpCache = new Map<string, HibpResult>();
// Per-prefix range-response cache — the HIBP range API returns the same
// ~800 suffix lines for every password sharing the SHA-1 prefix, so we
// keep that response for the whole session and reuse it for any other
// password that hashes to the same prefix. This means editing a password
// and returning to a previous value never re-hits the network, and even
// unrelated passwords that happen to share a prefix skip the request.
const hibpPrefixCache = new Map<string, Map<string, number>>();
// De-duplicate concurrent range fetches for the same prefix.
const hibpPrefixInflight = new Map<string, Promise<Map<string, number> | null>>();

function parseRangeBody(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const s = line.slice(0, idx).trim().toUpperCase();
    const c = parseInt(line.slice(idx + 1).trim(), 10) || 0;
    if (s) map.set(s, c);
  }
  return map;
}

async function fetchRange(prefix: string, signal?: AbortSignal): Promise<Map<string, number> | null> {
  const cached = hibpPrefixCache.get(prefix);
  if (cached) return cached;
  const inflight = hibpPrefixInflight.get(prefix);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        method: "GET",
        signal,
        headers: { "Add-Padding": "true" },
      });
      if (!res.ok) return null;
      const map = parseRangeBody(await res.text());
      hibpPrefixCache.set(prefix, map);
      return map;
    } catch {
      return null;
    } finally {
      hibpPrefixInflight.delete(prefix);
    }
  })();
  hibpPrefixInflight.set(prefix, p);
  return p;
}

export async function checkHibp(pwd: string, signal?: AbortSignal): Promise<HibpResult> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return { status: "skipped", reason: "no-subtle-crypto" };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { status: "skipped", reason: "offline" };
  }
  const hash = await sha1Hex(pwd);
  const cached = hibpCache.get(hash);
  if (cached) return cached;
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const range = await fetchRange(prefix, signal);
  if (signal?.aborted) return { status: "skipped", reason: "aborted" };
  if (!range) {
    // Do not cache network failures — retry next time the user pauses.
    return { status: "skipped", reason: "unavailable" };
  }
  const count = range.get(suffix) ?? 0;
  const r: HibpResult = count > 0 ? { status: "pwned", count } : { status: "safe" };
  hibpCache.set(hash, r);
  return r;
}

// ---- Combined full-policy check ------------------------------------

export interface FullPasswordCheck extends PasswordEvaluation {
  /** Result of the HIBP async check. `null` while pending. */
  hibp: HibpResult | null;
  /** True iff sync AND (hibp safe OR hibp skipped due to offline / API down). */
  ok: boolean;
}

/**
 * Full policy check used for the final submit gate.
 * A password is accepted iff every sync rule passes AND HIBP either
 * confirmed safe or was skipped for a benign reason (offline, API down).
 * A confirmed pwned password is ALWAYS rejected.
 */
export async function fullyValidatePassword(pwd: string, signal?: AbortSignal): Promise<FullPasswordCheck> {
  const sync = evaluatePassword(pwd);
  if (!sync.syncOk) {
    return { ...sync, hibp: null, ok: false };
  }
  const hibp = await checkHibp(pwd, signal);
  const problems = [...sync.problems];
  let ok = true;
  if (hibp.status === "pwned") {
    problems.push("هذه الكلمة ظهرت في تسريبات معروفة — اختر كلمة مختلفة");
    ok = false;
  }
  return {
    ...sync,
    problems,
    hibp,
    ok,
  };
}

/** Map raw Supabase auth errors to a canonical policy-violation message. */
export function isWeakPasswordError(msg: string | null | undefined): boolean {
  const m = (msg ?? "").toLowerCase();
  return (
    (m.includes("password") && (m.includes("weak") || m.includes("short") || m.includes("length"))) ||
    m.includes("pwned") ||
    m.includes("easy to guess") ||
    m.includes("compromised")
  );
}

/** Canonical Arabic error copy for a policy-rejected password. */
export const WEAK_PASSWORD_COPY = {
  title: "كلمة المرور ضعيفة",
  body: "اختر كلمة مرور أطول وأقوى — ٨ أحرف على الأقل مع مزج الأحرف الكبيرة والصغيرة والأرقام، وتجنّب الكلمات الشائعة أو المسرّبة.",
} as const;
