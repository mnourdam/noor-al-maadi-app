/**
 * Offline snapshot generator + content-source abstraction.
 *
 * Goal: an APK installed with no internet can still browse and play the
 * current core content. Snapshot is sourced from Supabase (live) by an
 * admin, persisted in IndexedDB, and ships in `public/offline-snapshot.json`
 * as the bundled floor.
 *
 * Runtime read priority:
 *   1. latest synced local cache (IndexedDB)
 *   2. bundled snapshot (/offline-snapshot.json)
 *   3. Supabase live fallback (if online)
 *
 * Only public/player-safe published content is included. No drafts, no
 * admin-only data, no PII (profiles, referrals, audit logs, emails).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  loadSnapshot,
  saveSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  type OfflineCollectionKey,
  type OfflineSnapshot,
} from "./offline-storage";

/** Legacy alias kept for older imports. */
export type ContentType =
  | "encyclopedia"
  | "campaigns"
  | "investigations"
  | "today_in_history"
  | "daily_facts"
  | "atlas"
  | "content_registry";

const LEGACY_TO_COLLECTION: Record<ContentType, OfflineCollectionKey> = {
  encyclopedia: "encyclopedia_entities",
  campaigns: "admin_campaigns",
  investigations: "investigations",
  today_in_history: "today_in_history_events",
  daily_facts: "daily_facts",
  atlas: "atlas_entities",
  content_registry: "content_registry",
};

/** Path of the bundled snapshot shipped inside the APK / web build. */
export const BUNDLED_SNAPSHOT_URL = "/offline-snapshot.json";

/** Public-safe collection definitions. */
interface CollectionDef {
  key: OfflineCollectionKey;
  table: string;
  /** Optional filter applied to the query. */
  filter?: (q: any) => any;
  /** Whether this collection is required for first-run playability. */
  required?: boolean;
  label: string;
}

export const COLLECTIONS: CollectionDef[] = [
  { key: "encyclopedia_entities", table: "encyclopedia_entities",
    filter: (q) => q.eq("enabled", true), required: true,
    label: "الموسوعة (شخصيات، دول، مدن، معارك، أحداث)" },
  { key: "admin_campaigns", table: "admin_campaigns",
    filter: (q) => q.eq("status", "published"), required: true,
    label: "الحملات المنشورة (مع الفصول والأنشطة داخل data)" },
  { key: "investigations", table: "investigations",
    filter: (q) => q.eq("enabled", true), required: false,
    label: "التحقيقات" },
  { key: "today_in_history_events", table: "today_in_history_events",
    filter: (q) => q.eq("enabled", true), required: false,
    label: "في مثل هذا اليوم" },
  { key: "daily_facts", table: "daily_facts",
    filter: (q) => q.eq("enabled", true), required: false,
    label: "الحقيقة اليومية" },
  { key: "atlas_entities", table: "atlas_entities",
    filter: (q) => q.eq("status", "published").eq("aps_verified", true), required: false,
    label: "خريطة الأطلس (موثّقة فقط)" },
  // Legacy: museum content lives inside encyclopedia_entities (types:
  // figure/artifact/landmark/city/battle/event). content_registry is kept
  // for backwards-compatibility only — it does NOT duplicate encyclopedia
  // rows and is expected to be empty on modern installs.
  { key: "content_registry", table: "content_registry",
    required: false,
    label: "سجل المتحف (قديم/اختياري — المتحف يقرأ من الموسوعة)" },

];

async function fetchCollection(def: CollectionDef): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let query: any = supabase
      .from(def.table as any)
      .select("*")
      .range(from, from + PAGE - 1);
    if (def.filter) query = def.filter(query);
    const { data, error } = await query;
    if (error) {
      console.warn(`[snapshot] failed to read ${def.table}:`, error.message);
      throw error;
    }
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

async function sha256Hex(text: string): Promise<string | undefined> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return undefined;
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

function canonicalJSON(value: any): string {
  // Stable JSON for checksums — sort object keys recursively.
  if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export async function generateSnapshot(): Promise<OfflineSnapshot> {
  const results = await Promise.all(COLLECTIONS.map((def) => fetchCollection(def)));
  const collections: Record<string, any[]> = {};
  const content_counts: Record<string, number> = {};
  const collection_manifest = [] as { key: string; count: number; checksum?: string }[];
  for (let i = 0; i < COLLECTIONS.length; i++) {
    const def = COLLECTIONS[i];
    const rows = results[i];
    collections[def.key] = rows;
    content_counts[def.key] = rows.length;
    collection_manifest.push({
      key: def.key,
      count: rows.length,
      checksum: await sha256Hex(canonicalJSON(rows)),
    });
  }
  const checksum = await sha256Hex(canonicalJSON(collections));
  return {
    snapshot_version: Date.now(),
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source: "live",
    content_counts,
    checksum,
    collection_manifest,
    collections,
  };
}

export async function generateAndStoreSnapshot(): Promise<OfflineSnapshot> {
  const previous = await loadSnapshot();
  const snap = await generateSnapshot();
  const { validateSnapshot } = await import("./offline-snapshot-validate");
  const report = validateSnapshot(snap);
  if (!report.ok) {
    console.warn("[snapshot] refusing to store invalid live snapshot", report.issues);
    throw new Error("Invalid offline snapshot; keeping existing local content");
  }
  // Never let a failed/partial online refresh erase a richer local/bundled
  // cache. This protects offline-first playability when a public policy,
  // network hop, or API page returns empty/incomplete data.
  if (previous?.collections) {
    for (const def of COLLECTIONS) {
      const prevRows = previous.collections[def.key] ?? [];
      const nextRows = snap.collections[def.key] ?? [];
      if (prevRows.length > 0 && nextRows.length === 0) {
        snap.collections[def.key] = prevRows;
        snap.content_counts[def.key] = prevRows.length;
      }
    }
  }
  await saveSnapshot(snap);
  // Keep the in-memory local-first index in sync with the freshly persisted
  // snapshot so subsequent route reads see the new content immediately.
  try {
    const { applyLocalSnapshot } = await import("./local-first-store");
    applyLocalSnapshot(snap);
  } catch { /* ignore */ }
  if (import.meta.env.DEV && typeof window === "undefined") {
    try {
      const { writeBundledSnapshotFile } = await import("./offline-snapshot-write.functions");
      await writeBundledSnapshotFile({ data: { json: JSON.stringify(snap, null, 2) } });
    } catch { /* dev-only path; ignore in prod */ }
  }
  return snap;
}

/** Load the bundled snapshot shipped in /public. */
export async function loadBundledSnapshot(): Promise<OfflineSnapshot | null> {
  const urls = new Set<string>([BUNDLED_SNAPSHOT_URL]);
  try {
    const base = (import.meta as any).env?.BASE_URL ?? "/";
    urls.add(`${String(base).replace(/\/$/, "")}/offline-snapshot.json`);
  } catch { /* ignore */ }
  try {
    if (typeof window !== "undefined") {
      urls.add(new URL("/offline-snapshot.json", window.location.origin).toString());
      urls.add(new URL("offline-snapshot.json", window.location.href).toString());
    }
  } catch { /* ignore */ }

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) continue;
      const j = await res.json();
      if (!j || typeof j !== "object" || !j.collections) continue;
      const snap = { ...j, source: "bundled" } as OfflineSnapshot;
      const { validateSnapshot } = await import("./offline-snapshot-validate");
      if (!validateSnapshot(snap).ok) continue;
      return snap;
    } catch { /* try next URL */ }
  }
  return null;
}

/** Read content for a collection using the documented priority order. */
export async function getCollection<T = any>(
  key: OfflineCollectionKey,
): Promise<T[]> {
  const local = await loadSnapshot();
  if (local?.collections?.[key]?.length) return local.collections[key] as T[];

  const bundled = await loadBundledSnapshot();
  if (bundled?.collections?.[key]?.length) return bundled.collections[key] as T[];

  const def = COLLECTIONS.find((c) => c.key === key);
  if (def && typeof navigator !== "undefined" && navigator.onLine !== false) {
    try { return (await fetchCollection(def)) as T[]; } catch { /* ignore */ }
  }
  return [];
}

/** Back-compat wrapper for the older `getContent("encyclopedia")` API. */
export async function getContent<T = any>(
  type: ContentType,
  legacyFallback?: () => T[] | Promise<T[]>,
): Promise<T[]> {
  const rows = await getCollection<T>(LEGACY_TO_COLLECTION[type]);
  if (rows.length > 0) return rows;
  if (legacyFallback) {
    try { return await legacyFallback(); } catch { /* ignore */ }
  }
  return [];
}

/**
 * Boot-time sync.
 * - If no local snapshot, hydrate from bundled immediately so first paint
 *   has data even when offline.
 * - If online and local snapshot is missing or older than `maxAgeMs`,
 *   regenerate from Supabase in the background.
 */
const SYNC_LOCK_KEY = "irth.offline.sync.lock";

function hasRequiredSnapshotContent(snap: OfflineSnapshot | null | undefined): snap is OfflineSnapshot {
  if (!snap?.collections) return false;
  return REQUIRED_COLLECTION_KEYS.every((key) => Array.isArray(snap.collections[key]) && snap.collections[key].length > 0);
}

export async function bootstrapOfflineSync(opts: { maxAgeMs?: number } = {}): Promise<void> {
  const maxAge = opts.maxAgeMs ?? 6 * 60 * 60 * 1000; // 6h
  try {
    let local = await loadSnapshot();
    if (!hasRequiredSnapshotContent(local)) {
      const bundled = await loadBundledSnapshot();
      if (hasRequiredSnapshotContent(bundled)) {
        await saveSnapshot(bundled);
        local = bundled;
      }
    }
    // Hydrate the in-memory local-first index immediately so player routes
    // can read content synchronously on first paint, even without network.
    try {
      const { applyLocalSnapshot, ensureLocalSnapshotLoaded } = await import("./local-first-store");
      if (hasRequiredSnapshotContent(local)) applyLocalSnapshot(local);
      else await ensureLocalSnapshotLoaded();
    } catch { /* ignore */ }


    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    if (!online) return;

    const stale =
      !local ||
      local.schema_version !== SNAPSHOT_SCHEMA_VERSION ||
      Date.now() - new Date(local.generated_at).getTime() > maxAge;
    if (!stale) return;

    // Lightweight in-tab debounce so multiple route mounts don't refetch.
    try {
      const last = Number(sessionStorage.getItem(SYNC_LOCK_KEY) ?? "0");
      if (Date.now() - last < 60 * 1000) return;
      sessionStorage.setItem(SYNC_LOCK_KEY, String(Date.now()));
    } catch { /* ignore */ }

    // Fire-and-forget — UI is already rendered from local/bundled.
    void generateAndStoreSnapshot().catch((e) =>
      console.warn("[offline-sync] background refresh failed:", e),
    );
  } catch (e) {
    console.warn("[offline-sync] bootstrap failed:", e);
  }
}

export const REQUIRED_COLLECTION_KEYS: OfflineCollectionKey[] = COLLECTIONS
  .filter((c) => c.required)
  .map((c) => c.key);
