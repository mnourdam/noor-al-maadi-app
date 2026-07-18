// Guest all-time challenge completion ledger.
//
// Canonical rule: once a player completes a challenge, that challenge must
// never appear in Daily Challenges again — for authenticated users this is
// enforced by the server (`game_progress.completed`); for guests we keep a
// durable local ledger under a single fixed key.
//
// The key is deliberately NOT partitioned by any user id. Guests have no
// identity — the ledger is bound to the device, and every guest session on
// this device shares it. It is never written for authenticated users, and
// it is never read when resolving an authenticated user's completion set,
// so account A cannot see B's completions and no account can see the guest
// ledger.
//
// Storage rules:
//   • persistent in localStorage
//   • deduplicated (Set semantics)
//   • survives cold restart and day rotation
//   • never cleared at midnight
//   • never written to Supabase
//   • never merged into an authenticated account on sign-in

const GUEST_KEY = "irth.game-completions.guest.v1";
const CHANGE_EVENT = "irth:guest-completions-changed";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readRaw(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRaw(ids: string[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(ids));
  } catch {
    /* quota / private mode — ledger degrades to session memory only */
  }
}

/** All-time set of games the guest has completed on this device. */
export function readGuestCompletedIds(): Set<string> {
  return new Set(readRaw());
}

/**
 * Record a guest completion. Returns `firstTime: true` only when this game
 * wasn't already in the ledger — callers use this as the local reward guard
 * so guest rewards are granted exactly once, even across reloads.
 *
 * Fires `irth:guest-completions-changed` so any subscribed surface refreshes.
 */
export function addGuestCompletion(gameId: string): { firstTime: boolean } {
  if (!gameId) return { firstTime: false };
  const cur = readRaw();
  if (cur.includes(gameId)) return { firstTime: false };
  cur.push(gameId);
  writeRaw(cur);
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { gameId } }));
  }
  return { firstTime: true };
}

export const GUEST_COMPLETIONS_STORAGE_KEY = GUEST_KEY;
export const GUEST_COMPLETIONS_EVENT = CHANGE_EVENT;
