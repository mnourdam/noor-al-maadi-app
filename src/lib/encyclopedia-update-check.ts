/**
 * Encyclopedia "content update available" detector.
 *
 * Runs periodically while the app is open (never on cold boot — the
 * bootstrap sync already refreshed everything) and compares the max
 * `updated_at` of the local `encyclopedia_entities` snapshot with the
 * live max in Supabase. When the remote is strictly newer, we surface a
 * banner instead of silently refreshing the page.
 *
 * On user request, `runRefresh()` performs an incremental sync and
 * hot-updates the local-first store + TanStack Query cache so the current
 * page reflows without a hard reload.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadSnapshot } from "./offline-storage";
import { refreshSnapshotIncremental } from "./offline-snapshot";

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 min
const FIRST_CHECK_DELAY_MS = 60 * 1000;  // 1 min after mount (bootstrap grace)

async function getLocalEncyclopediaMaxUpdatedAt(): Promise<string | null> {
  try {
    const snap = await loadSnapshot();
    const rows = snap?.collections?.encyclopedia_entities as any[] | undefined;
    if (!Array.isArray(rows)) return null;
    let best: string | null = null;
    for (const r of rows) {
      const u = r?.updated_at;
      if (typeof u === "string" && (!best || u > best)) best = u;
    }
    return best;
  } catch {
    return null;
  }
}

async function fetchRemoteEncyclopediaMaxUpdatedAt(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("encyclopedia_entities")
      .select("updated_at")
      .eq("enabled", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const u = (data as { updated_at?: string }).updated_at;
    return typeof u === "string" ? u : null;
  } catch {
    return null;
  }
}

export interface EncyclopediaUpdateState {
  available: boolean;
  refreshing: boolean;
  runRefresh: () => Promise<void>;
  dismiss: () => void;
}

export function useEncyclopediaUpdateAvailable(): EncyclopediaUpdateState {
  const queryClient = useQueryClient();
  const [available, setAvailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const localMaxRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  const check = useCallback(async () => {
    if (cancelledRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const [local, remote] = await Promise.all([
      getLocalEncyclopediaMaxUpdatedAt(),
      fetchRemoteEncyclopediaMaxUpdatedAt(),
    ]);
    if (cancelledRef.current) return;
    localMaxRef.current = local;
    if (!remote) return;
    if (!local || remote > local) setAvailable(true);
  }, []);

  const runRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshSnapshotIncremental();
      // Invalidate every encyclopedia query so mounted routes reflow
      // against the new local-first store without a hard reload.
      await queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey?.[0];
          return typeof key === "string" && key.startsWith("encyclopedia");
        },
      });
      // Refresh baseline so we don't immediately re-flag the same version.
      localMaxRef.current = await getLocalEncyclopediaMaxUpdatedAt();
      setAvailable(false);
    } catch (err) {
      console.warn("[encyclopedia-update] refresh failed", err);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, refreshing]);

  const dismiss = useCallback(() => setAvailable(false), []);

  useEffect(() => {
    cancelledRef.current = false;
    // Prime the baseline without triggering the banner on first paint.
    void getLocalEncyclopediaMaxUpdatedAt().then((v) => {
      localMaxRef.current = v;
    });
    const first = window.setTimeout(() => { void check(); }, FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
    const onOnline = () => { void check(); };
    window.addEventListener("online", onOnline);
    return () => {
      cancelledRef.current = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, [check]);

  return { available, refreshing, runRefresh, dismiss };
}
