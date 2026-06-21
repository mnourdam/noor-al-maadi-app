/**
 * Offline snapshot generator + content-source abstraction.
 * Phase 1: infrastructure only. Not wired into any feature page yet.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  loadSnapshot,
  saveSnapshot,
  type OfflineSnapshot,
} from "./offline-storage";

export const SNAPSHOT_VERSION = 1;

export type ContentType =
  | "encyclopedia"
  | "campaigns"
  | "investigations"
  | "today_in_history"
  | "daily_facts";

const TABLE_MAP: Record<ContentType, string> = {
  encyclopedia: "encyclopedia_entities",
  campaigns: "admin_campaigns",
  investigations: "investigations",
  today_in_history: "today_in_history_events",
  daily_facts: "daily_facts",
};

async function fetchAllEnabled(table: string): Promise<any[]> {
  // Most content tables expose an `enabled` flag; fall back to selecting all if absent.
  const tryEnabled = await supabase.from(table as any).select("*").eq("enabled", true);
  if (!tryEnabled.error) return tryEnabled.data ?? [];
  const all = await supabase.from(table as any).select("*");
  if (all.error) {
    console.warn(`[snapshot] failed to read ${table}`, all.error.message);
    return [];
  }
  return all.data ?? [];
}

export async function generateSnapshot(): Promise<OfflineSnapshot> {
  const [encyclopedia, campaigns, investigations, today_in_history, daily_facts] =
    await Promise.all([
      fetchAllEnabled(TABLE_MAP.encyclopedia),
      fetchAllEnabled(TABLE_MAP.campaigns),
      fetchAllEnabled(TABLE_MAP.investigations),
      fetchAllEnabled(TABLE_MAP.today_in_history),
      fetchAllEnabled(TABLE_MAP.daily_facts),
    ]);

  return {
    version: SNAPSHOT_VERSION,
    generated_at: new Date().toISOString(),
    encyclopedia,
    campaigns,
    investigations,
    today_in_history,
    daily_facts,
  };
}

/**
 * Content-source abstraction. Priority: local snapshot → Supabase → legacy fallback.
 * Not yet consumed by feature pages — kept here so Phase 2 can migrate incrementally.
 */
export async function getContent<T = any>(
  type: ContentType,
  legacyFallback?: () => T[] | Promise<T[]>,
): Promise<T[]> {
  // 1. local snapshot
  const snap = await loadSnapshot();
  if (snap && Array.isArray((snap as any)[type]) && (snap as any)[type].length > 0) {
    return (snap as any)[type] as T[];
  }

  // 2. Supabase
  try {
    const rows = await fetchAllEnabled(TABLE_MAP[type]);
    if (rows.length > 0) return rows as T[];
  } catch (e) {
    console.warn(`[content-source] Supabase fetch failed for ${type}`, e);
  }

  // 3. legacy fallback
  if (legacyFallback) {
    try {
      return await legacyFallback();
    } catch {
      /* ignore */
    }
  }
  return [];
}

export async function generateAndStoreSnapshot(): Promise<OfflineSnapshot> {
  const snap = await generateSnapshot();
  await saveSnapshot(snap);
  return snap;
}
