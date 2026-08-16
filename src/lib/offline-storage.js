/**
 * Offline storage layer.
 *
 * Persists the offline content snapshot in IndexedDB (with localStorage fallback).
 * Schema:
 *   {
 *     snapshot_version: number,          // bumped on schema change
 *     generated_at: string (ISO),
 *     source: "live" | "bundled",
 *     content_counts: Record<collection, number>,
 *     checksum?: string (sha256 hex of canonical JSON of `collections`)
 *     collections: Record<collection, any[]>
 *   }
 */
export const SNAPSHOT_SCHEMA_VERSION = 5;
/**
 * Hard floor for the player-facing public encyclopedia dataset. This is a
 * deliberate fail-closed guard: a bootstrap/full-sync result with 923/1000
 * rows is worse than no live sync at all, because it poisons IndexedDB and
 * hides most of the app offline. If the live public dataset intentionally
 * changes below this number, update this floor in the same release that ships
 * a newly verified bundled snapshot.
 */
export const MIN_PUBLIC_ENCYCLOPEDIA_ROWS = 1778;
const DB_NAME = "irth-offline";
const DB_VERSION = 1;
const STORE = "snapshots";
const KEY = "content";
const LS_KEY = "irth.offline.snapshot.v2";
const LEGACY_LS_KEY = "irth.offline.snapshot.v1";
function hasIDB() {
    try {
        return typeof indexedDB !== "undefined";
    }
    catch {
        return false;
    }
}
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE))
                db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
function snapshotPersistable(snap) {
    if (!snap?.collections || typeof snap.collections !== "object")
        return false;
    const encyclopedia = snap.collections.encyclopedia_entities;
    if (!Array.isArray(encyclopedia) || encyclopedia.length < MIN_PUBLIC_ENCYCLOPEDIA_ROWS) {
        console.warn(`[offline-storage] rejecting incomplete encyclopedia snapshot: ` +
            `${Array.isArray(encyclopedia) ? encyclopedia.length : 0}/${MIN_PUBLIC_ENCYCLOPEDIA_ROWS}`);
        return false;
    }
    if (snap.content_counts && typeof snap.content_counts === "object") {
        for (const [key, rows] of Object.entries(snap.collections)) {
            if (Array.isArray(rows) && typeof snap.content_counts[key] === "number" && snap.content_counts[key] !== rows.length) {
                console.warn(`[offline-storage] rejecting snapshot with mismatched count for ${key}: ` +
                    `${snap.content_counts[key]} != ${rows.length}`);
                return false;
            }
        }
    }
    return true;
}
async function idbPut(value) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}
async function idbGet() {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
}
async function idbDelete() {
    const db = await openDB();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}
/** Sensitive keys that must never persist in offline caches (schema v3+).
 *  Older caches (v1/v2) may have leaked these; we strip them on every load. */
const SENSITIVE_CAMPAIGN_KEYS = [
    "draft_data",
    "updated_by",
    "last_editor_email",
    "has_unpublished_changes",
];
function sanitizeCampaignRow(row) {
    if (!row || typeof row !== "object")
        return row;
    let hit = false;
    for (const k of SENSITIVE_CAMPAIGN_KEYS)
        if (k in row) {
            hit = true;
            break;
        }
    if (!hit)
        return row;
    const clone = {};
    for (const key of Object.keys(row)) {
        if (SENSITIVE_CAMPAIGN_KEYS.includes(key))
            continue;
        clone[key] = row[key];
    }
    return clone;
}
function sanitizeCollections(collections) {
    const out = {};
    if (!collections)
        return out;
    for (const [k, rows] of Object.entries(collections)) {
        if (k === "admin_campaigns" && Array.isArray(rows)) {
            out[k] = rows.map(sanitizeCampaignRow);
        }
        else {
            out[k] = rows;
        }
    }
    return out;
}
/** Normalize legacy v1 shape (flat keys) into v2/v3, sanitizing sensitive
 *  campaign columns from any legacy cache. */
function normalize(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    if (raw.collections && raw.content_counts) {
        const snap = {
            schema_version: typeof raw.schema_version === "number" ? raw.schema_version : SNAPSHOT_SCHEMA_VERSION,
            ...raw,
        };
        snap.collections = sanitizeCollections(snap.collections);
        // Recompute counts to keep the persistence-guard invariant that
        // content_counts[k] === collections[k].length after sanitisation.
        const counts = { ...(snap.content_counts ?? {}) };
        for (const [k, v] of Object.entries(snap.collections)) {
            if (Array.isArray(v))
                counts[k] = v.length;
        }
        snap.content_counts = counts;
        return snap;
    }
    // Legacy flat v1
    const collections = {};
    const map = {
        encyclopedia: "encyclopedia_entities",
        campaigns: "admin_campaigns",
        investigations: "investigations",
        today_in_history: "today_in_history_events",
        daily_facts: "daily_facts",
    };
    for (const [k, target] of Object.entries(map)) {
        if (Array.isArray(raw[k]))
            collections[target] = raw[k];
    }
    const sanitized = sanitizeCollections(collections);
    const counts = {};
    for (const [k, v] of Object.entries(sanitized))
        counts[k] = v.length;
    return {
        snapshot_version: typeof raw.version === "number" ? raw.version : 1,
        schema_version: 1,
        generated_at: raw.generated_at ?? new Date(0).toISOString(),
        content_counts: counts,
        collections: sanitized,
    };
}
export async function saveSnapshot(snap) {
    if (!snapshotPersistable(snap)) {
        throw new Error("Refusing to persist incomplete offline snapshot");
    }
    if (hasIDB()) {
        try {
            await idbPut(snap);
            return;
        }
        catch { /* fall through */ }
    }
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(snap));
    }
    catch (e) {
        console.warn("[offline-storage] saveSnapshot failed", e);
    }
}
export async function loadSnapshot() {
    if (hasIDB()) {
        try {
            const v = await idbGet();
            if (v) {
                const snap = normalize(v);
                if (snapshotPersistable(snap))
                    return snap;
                await idbDelete().catch(() => { });
            }
        }
        catch { /* fall through */ }
    }
    try {
        const raw = localStorage.getItem(LS_KEY) ?? localStorage.getItem(LEGACY_LS_KEY);
        if (!raw)
            return null;
        const snap = normalize(JSON.parse(raw));
        if (snapshotPersistable(snap))
            return snap;
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(LEGACY_LS_KEY);
        return null;
    }
    catch {
        return null;
    }
}
export async function getSnapshotInfo() {
    const snap = await loadSnapshot();
    if (!snap)
        return null;
    return {
        snapshot_version: snap.snapshot_version,
        generated_at: snap.generated_at,
        source: snap.source,
        content_counts: snap.content_counts,
        checksum: snap.checksum,
    };
}
/** Back-compat alias used by older callers. */
export async function getSnapshotVersion() {
    const info = await getSnapshotInfo();
    return info ? { version: info.snapshot_version, generated_at: info.generated_at } : null;
}
export async function clearSnapshot() {
    if (hasIDB()) {
        try {
            await idbDelete();
        }
        catch { /* ignore */ }
    }
    try {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(LEGACY_LS_KEY);
    }
    catch { /* ignore */ }
}
