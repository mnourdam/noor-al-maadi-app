// ============================================================
// Guest Story Completions — local, isolated, idempotent
// ------------------------------------------------------------
// Guests have no server profile, so Story completion (and its
// XP / Dinar reward) is tracked locally against the anonymous
// device profile. This module is the single source of truth for:
//   * whether a guest has already completed a given story
//     (used to make replay reward-silent);
//   * marking a completion so replay is silent forever after;
//   * surfacing local completions to StoryCard so the "جديدة"
//     pill flips to "اكتمل" immediately and on relaunch.
//
// Never used for authenticated users — server RPCs remain the
// authority there. Data lives in localStorage and follows the
// existing guest isolation policy (never merged into a signed
// account's server profile).
// ============================================================

const STORAGE_KEY = "irth.guest.storyCompletions.v1";

function read(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch { return new Set(); }
}

function write(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* quota / private mode — non-fatal */ }
}

export function guestHasCompleted(storyId: string): boolean {
  return read().has(storyId);
}

/** Idempotent. Returns true when this call was the first-time completion. */
export function guestMarkCompleted(storyId: string): boolean {
  const s = read();
  if (s.has(storyId)) return false;
  s.add(storyId);
  write(s);
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent("irth:guest-story-completed", { detail: { storyId } })); } catch { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent("irth:story-completions:changed")); } catch { /* ignore */ }
  }
  return true;
}

export function guestCompletionsSnapshot(): Set<string> {
  return read();
}
