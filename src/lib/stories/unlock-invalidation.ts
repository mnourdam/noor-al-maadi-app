// ============================================================
// Story unlock — cache invalidation bridge
// ------------------------------------------------------------
// `list_stories_v2` computes `unlocked` server-side from the
// player's *current* progression (discoveries, completions,
// achievements). React Query caches that answer for 60 s and had
// no reason to ever drop it.
//
// The user-visible bug: read the gating Encyclopedia entity, walk
// back to Home, and the Story card is still "مقفلة" — the client
// is showing an answer computed before the discovery existed.
// Restarting the app "fixed" it, which made it look like a data
// problem rather than a caching one.
//
// This bridge invalidates every `stories-summary` query whenever a
// progression signal that can flip an unlock fires. Invalidation is
// debounced (progression events arrive in bursts — e.g. the outbox
// draining ten queued writes) and only refetches mounted queries.
// ============================================================

import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Every client event that can change the result of
 * `evaluate_unlock_spec_v2` for the current player. Each name below was
 * verified against a real `dispatchEvent` call site — a signal nobody
 * fires is a silent hole in the unlock matrix.
 */
const UNLOCK_SIGNALS = [
  "irth:entity-discovery:changed",     // encyclopedia read → user_entity_discoveries
  "irth:atlas-visit:changed",          // atlas detail dwell → atlas_location_visited
  "irth:outbox:flushed",               // queued writes actually landed server-side
  "irth:story-completions:changed",    // story_complete prerequisites
  "irth:story-progress:changed",
  "irth:guest-story-completed",
  "irth:campaign-completions:changed", // campaign_complete prerequisites
  "irth:campaign-progress:changed",    // campaign_chapter_complete prerequisites
  "irth:investigation-progress:changed", // investigation_complete prerequisites
  "irth:investigation-completed",
  "irth:achievement-unlocked",         // achievement-gated unlocks
  "irth:collection:changed",           // artifact ownership gates
  "irth:museum-unlock",
  "irth:level-up",                     // player_level gates
  "irth:reconciliation:changed",       // hydration repair of historical progress
] as const;


const DEBOUNCE_MS = 400;

export function useStoryUnlockInvalidation(queryClient: QueryClient): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: number | null = null;

    const invalidate = () => {
      timer = null;
      // `stories-summary` is keyed [prefix, worldSlug, ...variant], so a
      // prefix match covers Home rail, catalog, Worlds and related rails.
      void queryClient.invalidateQueries({ queryKey: ["stories-summary"] });
    };

    const schedule = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(invalidate, DEBOUNCE_MS);
    };

    for (const evt of UNLOCK_SIGNALS) window.addEventListener(evt, schedule);

    // Identity transitions change WHO the server evaluates the spec for:
    // a guest-computed answer must never survive sign-in (or sign-out).
    // `INITIAL_SESSION` is included on purpose (V16): on Android cold start
    // the persisted session is restored through that event, and without it
    // the guest-era answer stayed cached as the authenticated player's state.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "INITIAL_SESSION"
      ) schedule();
    });

    return () => {
      for (const evt of UNLOCK_SIGNALS) window.removeEventListener(evt, schedule);
      try { sub.subscription.unsubscribe(); } catch { /* noop */ }
      if (timer != null) window.clearTimeout(timer);
    };
  }, [queryClient]);

}
