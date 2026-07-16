// ============================================================
// Encyclopedia entity discovery — local mirror + hooks.
// ------------------------------------------------------------
// Separate from `user_collection` (ownership/awards). A discovery
// means the player has *read* an encyclopedia entity long enough
// (dwell ≥ MIN_READ_MS OR reached the relationship section /
// ~88% scroll). Read behavior — never grants rewards, never
// touches museum ownership.
//
// Storage:
//   • Server: public.user_entity_discoveries (per-user, RLS-scoped)
//   • Local:  localStorage per (auth uid | "guest") — never merged
//             across accounts automatically. Written immediately so
//             Worlds progress moves even offline.
//
// Offline: the outbox `entity_discovery` kind carries an idempotency
// key `entity_discovery:<uid>:<entity_id>` so replays cannot create
// duplicates.
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordEntityDiscovery } from "@/lib/offline/record";

const LOCAL_KEY_PREFIX = "irth.entityDiscoveries.";
const CHANGED_EVENT = "irth:entity-discovery:changed";

export interface LocalDiscovery {
  id: string;      // encyclopedia entity uuid
  slug: string;
  type: string;
  firstAt: string; // ISO
  lastAt: string;  // ISO
  source?: string;
}

function scopeKey(userKey: string): string {
  // Guard against pathological input just in case.
  const safe = userKey && typeof userKey === "string" ? userKey : "guest";
  return `${LOCAL_KEY_PREFIX}${safe}.v1`;
}

function readLocal(userKey: string): Record<string, LocalDiscovery> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(scopeKey(userKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, LocalDiscovery> : {};
  } catch { return {}; }
}

function writeLocal(userKey: string, map: Record<string, LocalDiscovery>): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(scopeKey(userKey), JSON.stringify(map)); } catch { /* quota */ }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
    }
  } catch { /* ignore */ }
}

/** Read the local mirror for a specific user scope. */
export function getLocalDiscoveries(userKey: string): Record<string, LocalDiscovery> {
  return readLocal(userKey);
}

/**
 * Idempotently mark an entity discovered for the given user scope.
 * Writes the local mirror immediately and — when authenticated — enqueues
 * a server upsert through the offline outbox. Safe to call more than once
 * per entity; the second call only refreshes `lastAt`.
 */
export function markEntityDiscovered(params: {
  userKey: string;
  entityId: string;
  entitySlug: string;
  entityType: string;
  source?: string;
}): { firstTime: boolean } {
  const now = new Date().toISOString();
  const map = readLocal(params.userKey);
  const existing = map[params.entityId];
  const firstTime = !existing;
  map[params.entityId] = {
    id: params.entityId,
    slug: params.entitySlug.toLowerCase(),
    type: params.entityType,
    firstAt: existing?.firstAt ?? now,
    lastAt: now,
    source: existing?.source ?? params.source,
  };
  writeLocal(params.userKey, map);
  // Fire the server-side record only for authenticated users. `record.ts`
  // early-returns on guest so double-guard is safe.
  if (params.userKey && params.userKey !== "guest") {
    void recordEntityDiscovery({
      entityId: params.entityId,
      entitySlug: params.entitySlug,
      entityType: params.entityType,
      source: params.source,
    });
  }
  return { firstTime };
}

// ------------------------------------------------------------
// React hook — merges server rows with the local mirror.
// ------------------------------------------------------------

export function useDiscoveredEntities(): { ids: Set<string>; slugs: Set<string> } {
  const [uid, setUid] = useState<string | null>(null);
  const [server, setServer] = useState<{ ids: Set<string>; slugs: Set<string> }>({ ids: new Set(), slugs: new Set() });
  const [localTick, setLocalTick] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUid(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user?.id ?? null;
      setUid(next);
      if (event === "SIGNED_OUT") setServer({ ids: new Set(), slugs: new Set() });
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setLocalTick((n) => n + 1);
    const reload = () => setReloadTick((n) => n + 1);
    window.addEventListener(CHANGED_EVENT, bump);
    window.addEventListener("irth:outbox:flushed", reload);
    return () => {
      window.removeEventListener(CHANGED_EVENT, bump);
      window.removeEventListener("irth:outbox:flushed", reload);
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("user_entity_discoveries")
          .select("entity_id,entity_slug")
          .eq("user_id", uid);
        if (cancelled) return;
        const ids = new Set<string>();
        const slugs = new Set<string>();
        for (const r of (data ?? []) as Array<{ entity_id: string; entity_slug: string }>) {
          if (r.entity_id) ids.add(r.entity_id);
          if (r.entity_slug) slugs.add(String(r.entity_slug).toLowerCase());
        }
        setServer({ ids, slugs });
      } catch { /* offline — keep last known */ }
    })();
    return () => { cancelled = true; };
  }, [uid, reloadTick]);

  // Merge local mirror (per-scope) with server rows. When signed out we
  // read the "guest" scope; when signed in we read that uid's scope.
  const userKey = uid ?? "guest";
  const local = readLocal(userKey);
  // referencing localTick keeps this in sync when the mirror changes.
  void localTick;
  const ids = new Set(server.ids);
  const slugs = new Set(server.slugs);
  for (const r of Object.values(local)) {
    if (r.id) ids.add(r.id);
    if (r.slug) slugs.add(r.slug);
  }
  return { ids, slugs };
}

/** For components that only need the slug view (Worlds progress). */
export function useDiscoveredSlugs(): Set<string> {
  return useDiscoveredEntities().slugs;
}
