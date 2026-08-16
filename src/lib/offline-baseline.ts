/**
 * Baseline content schema and types.
 */
import { Database } from "@/integrations/supabase/types";

type TableName = keyof Database["public"]["Tables"];
type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];


export interface BaselineContent {
  version: number;
  generated_at: string;
  collections: {
    games: Row<"games">[];
    stories: Row<"stories">[];
    story_scenes: Row<"story_scenes">[];
    story_media: Row<"story_media">[];
  };
}

/**
 * Validate that the loaded object matches the expected baseline structure.
 */
export function isValidBaseline(data: any): data is BaselineContent {
  if (!data || typeof data !== "object") return false;
  if (typeof data.version !== "number") return false;
  if (!data.collections || typeof data.collections !== "object") return false;
  
  const c = data.collections;
  return (
    Array.isArray(c.games) &&
    Array.isArray(c.stories) &&
    Array.isArray(c.story_scenes) &&
    Array.isArray(c.story_media)
  );
}
