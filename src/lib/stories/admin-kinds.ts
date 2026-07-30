// ============================================================
// /admin/stories — display-only story kind classification
// ------------------------------------------------------------
// Read-only helpers. No writes, no schema changes. The official
// classification node is the story's own kind:
//     story_kind === 'campaign_intro'  (future column)
//  OR metadata.kind === 'campaign_intro' (current + import format)
// Nothing else (title, slug, id prefix, rewards, order, template,
// scene types, or a bare campaign_id) may classify a story.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export const CAMPAIGN_INTRO_KIND = "campaign_intro";

export interface StoryKindInfo {
  /** true when the story is officially a campaign intro. */
  isCampaignIntro: boolean;
  /** Linked campaign id/slug from metadata.campaign_id (intro only). */
  campaignId: string | null;
}

export interface StoryKindShape {
  story_kind?: string | null;
  metadata?: { kind?: string | null; campaign_id?: string | null } | null;
}

/** The single classification predicate used by the admin console. */
export function isCampaignIntroStory(story: StoryKindShape | null | undefined): boolean {
  if (!story) return false;
  return (
    story.story_kind === CAMPAIGN_INTRO_KIND ||
    story.metadata?.kind === CAMPAIGN_INTRO_KIND
  );
}

export function storyKindInfo(story: StoryKindShape | null | undefined): StoryKindInfo {
  const isIntro = isCampaignIntroStory(story);
  const cid = story?.metadata?.campaign_id;
  return {
    isCampaignIntro: isIntro,
    campaignId: isIntro && typeof cid === "string" && cid.trim() ? cid.trim() : null,
  };
}

/** Display-only read of the classification fields for every story. */
export async function fetchStoryKindMap(): Promise<Map<string, StoryKindInfo>> {
  const { data, error } = await supabase
    .from("stories" as never)
    .select("id,metadata");
  if (error) throw new Error(`fetchStoryKindMap: ${error.message}`);
  const map = new Map<string, StoryKindInfo>();
  for (const row of (data ?? []) as unknown as Array<{ id: string } & StoryKindShape>) {
    map.set(row.id, storyKindInfo(row));
  }
  return map;
}

export interface CampaignLabel {
  id: string;
  slug: string;
  title: string;
}

/** id AND slug → title, so metadata.campaign_id resolves either way. */
export async function fetchCampaignTitleMap(): Promise<Map<string, CampaignLabel>> {
  const { data, error } = await supabase
    .from("admin_campaigns" as never)
    .select("id,slug,title");
  if (error) throw new Error(`fetchCampaignTitleMap: ${error.message}`);
  const map = new Map<string, CampaignLabel>();
  for (const row of (data ?? []) as unknown as CampaignLabel[]) {
    const label: CampaignLabel = { id: row.id, slug: row.slug, title: row.title };
    if (row.id) map.set(row.id, label);
    if (row.slug) map.set(row.slug, label);
  }
  return map;
}
