import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StoryCollection {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  summary_ar: string | null;
  summary_en: string | null;
  cover_media_id: string | null;
  display_order: number;
}

/**
 * Hook to fetch story collections.
 * Uses current online status and authenticated session.
 */
export function useStoryCollections() {
  const [collections, setCollections] = useState<StoryCollection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // 1. Try local/baseline first
      try {
        const { getBaselineContent } = await import("../offline-baseline-resolver");
        const baseline = await getBaselineContent();
        if (baseline?.collections?.story_collections) {
          setCollections(baseline.collections.story_collections as StoryCollection[]);
          setLoading(false);
        }
      } catch (e) { /* ignore */ }

      // 2. Fetch fresh from server if online
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;

      try {
        const { data, error } = await supabase
          .from("story_collections")
          .select("*")
          .order("display_order");

        if (error) throw error;
        setCollections((data ?? []) as StoryCollection[]);
      } catch (err) {
        console.error("[useStoryCollections] failed:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { collections, loading };
}
