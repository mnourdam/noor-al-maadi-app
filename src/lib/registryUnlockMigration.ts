// ============================================================
// Registry → Supabase user_collection migration
// ------------------------------------------------------------
// Promotes localStorage-only imported-registry unlocks to the
// canonical Supabase `user_collection` table so Supabase becomes
// the single source of truth for unlocked items.
//
// Behavior:
//   - Runs on app boot and on SIGNED_IN.
//   - Reads getUnlockedRegistryIds() + listRegistry() to resolve
//     id → (type, slug, source campaign).
//   - Upserts into user_collection (unique on user_id+item_id).
//   - On success, marks the migration done per user in
//     localStorage (cache only, never an unlock authority).
//   - On failure (offline / RLS / network), leaves the flag
//     unset so the next boot/sign-in retries.
//
// Excluded from migration:
//   - badge / achievement registry types
//   - ids with no matching registry entry
//   - any legacy profile arrays (charactersUnlocked/artifactsFound)
//   - anything from src/lib/packs/* (never sourced here anyway)
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { getUnlockedRegistryIds, getUnlockSourcesMap } from "./importedUnlocks";
import { listRegistry } from "./contentRegistryStorage";
import type { RegistryItemType } from "@/types/contentRegistry";

const MIGRATED_KEY_PREFIX = "registryUnlockMigration:v1:";
const PENDING_KEY = "registryUnlockMigration:pending:v1";

const ALLOWED_TYPES: ReadonlySet<RegistryItemType> = new Set([
  "figure", "artifact", "city", "battle", "scholar", "dynasty",
]);

function isBrowser() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function markDone(uid: string) {
  try { window.localStorage.setItem(MIGRATED_KEY_PREFIX + uid, String(Date.now())); } catch {}
}
function isDone(uid: string): boolean {
  try { return !!window.localStorage.getItem(MIGRATED_KEY_PREFIX + uid); } catch { return false; }
}
function setPendingCount(n: number) {
  try {
    if (n > 0) window.localStorage.setItem(PENDING_KEY, String(n));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {}
}

let inFlight: Promise<void> | null = null;

/** Run the migration once per session. Safe to call repeatedly. */
export async function migrateRegistryUnlocksToSupabase(): Promise<void> {
  if (!isBrowser()) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) return;
      if (isDone(uid)) return;

      const ids = getUnlockedRegistryIds();
      if (ids.length === 0) { markDone(uid); return; }

      const reg = new Map(listRegistry().map((i) => [i.id.toLowerCase(), i]));
      const sources = getUnlockSourcesMap();

      const rows: Array<{
        user_id: string;
        item_id: string;
        item_type: string;
        source_campaign_id: string | null;
        unlocked_at: string;
      }> = [];

      const nowIso = new Date().toISOString();
      for (const rawId of ids) {
        const item = reg.get(String(rawId).toLowerCase());
        if (!item) continue;                                 // unresolved
        if (!ALLOWED_TYPES.has(item.type)) continue;         // skip badge/achievement
        rows.push({
          user_id: uid,
          item_id: item.id,
          item_type: item.type,
          source_campaign_id: sources.get(item.id) ?? null,
          unlocked_at: nowIso,
        });
      }

      if (rows.length === 0) { markDone(uid); return; }

      setPendingCount(rows.length);

      const { error } = await supabase
        .from("user_collection")
        .upsert(rows, { onConflict: "user_id,item_id", ignoreDuplicates: true });

      if (error) {
        // Offline / RLS / network — keep pending, retry next boot/sign-in.
        // eslint-disable-next-line no-console
        console.warn("[registry-migration] deferred:", error.message);
        return;
      }

      setPendingCount(0);
      markDone(uid);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[registry-migration] failed:", e);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Pending count (for diagnostics / UI badges if ever needed). */
export function getPendingRegistryUnlockCount(): number {
  if (!isBrowser()) return 0;
  const raw = window.localStorage.getItem(PENDING_KEY);
  return raw ? Number(raw) || 0 : 0;
}
