/**
 * Offline fallback helpers (Item 13 — LC1 QA).
 *
 * Tiny adapters that read from the existing offline snapshot when a
 * Supabase request fails or returns null. Intentionally minimal — they
 * piggyback on `getCollection()` which already implements:
 *   1. local IndexedDB snapshot   (latest sync)
 *   2. bundled `/offline-snapshot.json` (APK floor)
 *
 * No new sync engine. No extra storage. Just polite fallbacks so the
 * player keeps seeing real content when offline.
 */
import { getCollection } from "./offline-snapshot";
import { selectCampaignRows } from "./campaigns/entities";
export async function cachedEncyclopediaList() {
    try {
        return await getCollection("encyclopedia_entities");
    }
    catch {
        return [];
    }
}
export async function cachedEncyclopediaBySlug(slug, entityType) {
    if (!slug)
        return null;
    const rows = await cachedEncyclopediaList();
    const matches = rows.filter((r) => r?.enabled !== false && r?.slug === slug &&
        (!entityType || r?.entity_type === entityType));
    if (matches.length === 0)
        return null;
    // Pick the richest record so a stub duplicate never wins over a full one.
    const score = (e) => {
        let s = 0;
        const b = e.body;
        if (b && typeof b === "object") {
            if (Array.isArray(b.sections))
                s += b.sections.length * 4;
            if (Array.isArray(b.timeline))
                s += b.timeline.length * 3;
            if (Array.isArray(b.facts))
                s += b.facts.length;
            if (Array.isArray(b.sources))
                s += b.sources.length;
            if (typeof b.overview === "string")
                s += Math.min(5, Math.floor(b.overview.length / 200));
        }
        if (e.summary)
            s += 1;
        if (e.subtitle)
            s += 1;
        return s;
    };
    return [...matches].sort((a, b) => score(b) - score(a))[0] ?? null;
}
export async function cachedEncyclopediaById(id) {
    if (!id)
        return null;
    const rows = await cachedEncyclopediaList();
    return rows.find((r) => r?.enabled !== false && r?.id === id) ?? null;
}
export async function cachedEncyclopediaByType(entityType) {
    const rows = await cachedEncyclopediaList();
    return rows.filter((r) => r?.enabled !== false && r?.entity_type === entityType);
}
export async function cachedAtlasEntities() {
    try {
        const rows = await getCollection("atlas_entities");
        return rows.filter((r) => r?.status === "published" && r?.aps_verified);
    }
    catch {
        return [];
    }
}
export async function cachedPublishedCampaigns() {
    try {
        const rows = await getCollection("admin_campaigns");
        // Section dividers live in the same collection but are NOT campaigns.
        return selectCampaignRows(rows.filter((r) => r?.status === "published"))
            .map((r) => ({ id: r.id, slug: r.slug, data: r.data }));
    }
    catch {
        return [];
    }
}
/** True when the browser believes it has no network. SSR-safe. */
export function isLikelyOffline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
}
