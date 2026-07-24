// ============================================================
// Home Summary — canonical read-only source for the compact
// Home statistics strip (Phase 6).
// ------------------------------------------------------------
// Returns exactly the five values displayed on Home:
//   dinars, museumCount, campaignsCompleted,
//   investigationsCompleted, storiesCompleted.
//
// Every field routes to a single canonical source. Legacy
// profile arrays (storiesRead / timelinesCompleted /
// missionsCompleted) are NEVER consulted here.
// ============================================================

import { useEffect, useState } from "react";
import { useProfile } from "@/lib/profile";
import { useRealCollectionStats } from "@/lib/real-collection-stats";
import { useCanonicalInvestigationProgress } from "@/lib/investigations/progress";
import {
  fetchServerCompletedIds as fetchServerCampaignCompletedIds,
  localCompletedIds as localCampaignCompletedIds,
} from "@/lib/campaigns/completions";
import { supabase } from "@/integrations/supabase/client";
import { guestCompletionsSnapshot } from "@/lib/stories/guestCompletions";

export interface HomeSummary {
  dinars: number;
  museumCount: number;
  campaignsCompleted: number;
  investigationsCompleted: number;
  storiesCompleted: number;
  loading: boolean;
  error: string | null;
}

async function fetchServerStoryCompletedIds(uid: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from("user_story_completions" as never)
      .select("story_id")
      .eq("user_id", uid);
    if (error || !Array.isArray(data)) return new Set();
    const ids = new Set<string>();
    for (const row of data as Array<{ story_id?: string | null }>) {
      if (row?.story_id) ids.add(String(row.story_id));
    }
    return ids;
  } catch {
    return new Set();
  }
}

/**
 * Canonical Home summary hook. Never returns fabricated zeros while a
 * signed-in user's data is still loading — callers should render a
 * skeleton or placeholder while `loading` is true.
 */
export function useHomeSummary(): HomeSummary {
  const { profile } = useProfile();
  const stats = useRealCollectionStats();
  const canonicalInv = useCanonicalInvestigationProgress();

  const [uid, setUid] = useState<string | null>(null);
  const [uidReady, setUidReady] = useState(false);
  const [campaignsCompleted, setCampaignsCompleted] = useState<number | null>(null);
  const [storiesCompleted, setStoriesCompleted] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track signed-in uid — hard reset on sign-out so Account A counts
  // never bleed into Account B.
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUid(data.session?.user?.id ?? null);
      setUidReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user?.id ?? null;
      setUid(next);
      setUidReady(true);
      if (event === "SIGNED_OUT") {
        setCampaignsCompleted(null);
        setStoriesCompleted(null);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Campaigns — union of local sticky + server ledger (deduped by id).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const local = localCampaignCompletedIds();
        const server = uid ? await fetchServerCampaignCompletedIds() : new Set<string>();
        if (cancelled) return;
        const unioned = new Set<string>();
        for (const id of local) unioned.add(id);
        for (const id of server) unioned.add(id);
        setCampaignsCompleted(unioned.size);
      } catch (e: any) {
        if (!cancelled) setError((prev) => prev ?? String(e?.message ?? e));
      }
    };
    void load();
    const onChange = () => { void load(); };
    if (typeof window !== "undefined") {
      window.addEventListener("irth:campaign-completions:changed", onChange);
      window.addEventListener("irth:outbox:flushed", onChange);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("irth:campaign-completions:changed", onChange);
        window.removeEventListener("irth:outbox:flushed", onChange);
      }
    };
  }, [uid]);

  // Stories — server for signed-in, guest local snapshot otherwise.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (uid) {
          const server = await fetchServerStoryCompletedIds(uid);
          if (cancelled) return;
          setStoriesCompleted(server.size);
        } else {
          setStoriesCompleted(guestCompletionsSnapshot().size);
        }
      } catch (e: any) {
        if (!cancelled) setError((prev) => prev ?? String(e?.message ?? e));
      }
    };
    void load();
    const onChange = () => { void load(); };
    if (typeof window !== "undefined") {
      window.addEventListener("irth:story-completions:changed", onChange);
      window.addEventListener("irth:outbox:flushed", onChange);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("irth:story-completions:changed", onChange);
        window.removeEventListener("irth:outbox:flushed", onChange);
      }
    };
  }, [uid]);

  const loading =
    !uidReady ||
    campaignsCompleted === null ||
    storiesCompleted === null;

  return {
    dinars: profile.dinars ?? 0,
    museumCount: stats.totalCollection,
    campaignsCompleted: campaignsCompleted ?? 0,
    investigationsCompleted: canonicalInv.count,
    storiesCompleted: storiesCompleted ?? 0,
    loading,
    error,
  };
}
