// ============================================================
// V17-08 — Emblem unlock context
// ------------------------------------------------------------
// Signed-in: counts come from the SERVER ledgers via
// get_my_emblem_state_v1 so the client gate and the server gate can
// never disagree. Cached locally so the picker still works offline.
//
// Guest: local device evidence only (guest progression parity). A guest
// never gains server-side ownership from this path.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { EmblemUnlockContext } from "./unlock-eval";

const CACHE_KEY = "irth.emblems.unlock.counts.v1";

interface Counts {
  campaignsCompleted: number;
  museumItems: number;
}

function readCache(uid: string): Counts | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${uid}`);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Counts>;
    if (typeof v?.campaignsCompleted !== "number" || typeof v?.museumItems !== "number") return null;
    return { campaignsCompleted: v.campaignsCompleted, museumItems: v.museumItems };
  } catch {
    return null;
  }
}

function writeCache(uid: string, c: Counts) {
  try {
    localStorage.setItem(`${CACHE_KEY}:${uid}`, JSON.stringify(c));
  } catch {
    /* quota — cache is best-effort */
  }
}

export async function fetchEmblemUnlockCounts(): Promise<Counts | null> {
  try {
    const { data, error } = await supabase.rpc("get_my_emblem_state_v1" as never);
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as {
      campaigns_completed?: number | null;
      museum_items?: number | null;
    };
    return {
      campaignsCompleted: Number(row?.campaigns_completed ?? 0) || 0,
      museumItems: Number(row?.museum_items ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * @param uid          signed-in user id, or null for a guest
 * @param equippedId   currently equipped emblem — never stripped
 * @param guestFallback local evidence used for guests (and before the first
 *                      successful fetch on a cold, offline start)
 */
export function useEmblemUnlockContext(
  uid: string | null | undefined,
  equippedId: string | null | undefined,
  guestFallback: Counts,
): EmblemUnlockContext {
  const [counts, setCounts] = useState<Counts | null>(() => (uid ? readCache(uid) : null));

  useEffect(() => {
    if (!uid) {
      setCounts(null);
      return;
    }
    let alive = true;
    setCounts(readCache(uid));
    void (async () => {
      const fresh = await fetchEmblemUnlockCounts();
      if (!alive || !fresh) return;
      writeCache(uid, fresh);
      setCounts(fresh);
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  return useMemo(() => {
    const base = uid ? (counts ?? { campaignsCompleted: 0, museumItems: 0 }) : guestFallback;
    return {
      campaignsCompleted: base.campaignsCompleted,
      museumItems: base.museumItems,
      equippedId: equippedId ?? null,
    };
  }, [uid, counts, guestFallback.campaignsCompleted, guestFallback.museumItems, equippedId]);
}
