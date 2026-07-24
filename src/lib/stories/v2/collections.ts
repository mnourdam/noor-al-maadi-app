// ============================================================
// Stories M5 — Read helper for story_collections list.
// Additive read only; no schema/RPC changes. RLS on
// public.story_collections restricts to editors.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export interface CollectionOption {
  id: string;
  slug: string;
  title_ar: string;
  display_order: number;
}

export async function listCollections(): Promise<CollectionOption[]> {
  const { data, error } = await supabase
    .from("story_collections" as never)
    .select("id,slug,title_ar,display_order")
    .order("display_order", { ascending: true });
  if (error) throw new Error(`listCollections: ${error.message}`);
  return (data ?? []) as unknown as CollectionOption[];
}
