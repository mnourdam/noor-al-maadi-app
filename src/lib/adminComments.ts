// ============================================================
// Admin — unified player comments & reflections (read-only)
// ------------------------------------------------------------
// Thin client over admin_list_content_comments_v1 (SECURITY DEFINER,
// admin-gated server-side). Merges social_comments (encyclopedia +
// story anchors) and user_reflections (campaign + story reflections).
// No writes, no moderation — display only.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export type CommentSourceFilter = "all" | "encyclopedia" | "story" | "campaign";

export interface AdminCommentRow {
  id: string;
  kind: "comment" | "reflection";
  source: "encyclopedia" | "story" | "campaign";
  anchor_id: string | null;
  anchor_title: string | null;
  body: string;
  status: string | null;
  author_name: string | null;
  author_username: string | null;
  author_id: string;
  created_at: string;
}

export interface AdminCommentsPage {
  ok: boolean;
  reason?: string;
  total: number;
  items: AdminCommentRow[];
}

export async function adminListContentComments(
  opts: { source?: CommentSourceFilter; search?: string; limit?: number; offset?: number } = {},
): Promise<AdminCommentsPage> {
  const { data, error } = await supabase.rpc("admin_list_content_comments_v1" as never, {
    p_source: opts.source ?? "all",
    p_search: opts.search?.trim() || null,
    p_limit: opts.limit ?? 100,
    p_offset: opts.offset ?? 0,
  } as never);
  if (error) return { ok: false, reason: error.message, total: 0, items: [] };
  return data as unknown as AdminCommentsPage;
}

export function sourceLabelAr(source: AdminCommentRow["source"]): string {
  switch (source) {
    case "encyclopedia": return "الموسوعة";
    case "story": return "قصة";
    case "campaign": return "حملة";
  }
}

/** Player-facing deep link to the commented content, or null. */
export function commentAnchorHref(row: AdminCommentRow): string | null {
  if (!row.anchor_id) return null;
  switch (row.source) {
    case "encyclopedia": return `/encyclopedia/entity/${row.anchor_id}`;
    case "story": return `/story/${row.anchor_id}`;
    case "campaign": return `/campaigns/imported/${row.anchor_id}`;
    default: return null;
  }
}

// ------------------------------------------------------------
// Rankings (read-only, server-aggregated over ALL rows)
// ------------------------------------------------------------

export interface AdminCommentRankRow {
  user_id: string;
  name: string | null;
  username: string | null;
  avatar_id: string | null;
  total: number;
  campaigns: number;
  stories: number;
  encyclopedia: number;
  kinds: number;
}

export interface AdminCommentRankings {
  ok: boolean;
  reason?: string;
  stats: { total: number; participants: number; campaigns: number; stories_encyclopedia: number };
  overall: AdminCommentRankRow[];
  campaigns: AdminCommentRankRow[];
  stories: AdminCommentRankRow[];
  encyclopedia: AdminCommentRankRow[];
  diverse: AdminCommentRankRow[];
}

const EMPTY_RANKINGS: AdminCommentRankings = {
  ok: false,
  stats: { total: 0, participants: 0, campaigns: 0, stories_encyclopedia: 0 },
  overall: [], campaigns: [], stories: [], encyclopedia: [], diverse: [],
};

export async function adminContentCommentRankings(): Promise<AdminCommentRankings> {
  const { data, error } = await supabase.rpc("admin_content_comment_rankings_v1" as never);
  if (error) return { ...EMPTY_RANKINGS, reason: error.message };
  return { ...EMPTY_RANKINGS, ...(data as unknown as AdminCommentRankings) };
}
