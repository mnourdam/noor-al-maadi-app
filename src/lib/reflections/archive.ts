// ============================================================
// My Reflections Archive — personal, read-only feed.
// ------------------------------------------------------------
// One canonical server feed (`list_my_reflections_v1`) merging:
//   • public reflections I wrote on encyclopedia entries / stories
//     (social_comments) — with likes + replies counts
//   • private campaign / story reflections (user_reflections)
// Future reflection kinds flow through the same RPC with no client
// change: the `anchor_type` is passed through verbatim.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export interface ReflectionArchiveRow {
  id: string;
  source: "comment" | "reflection";
  anchor_type: string;
  anchor_id: string | null;
  anchor_title: string | null;
  body: string;
  likes: number;
  replies: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ReflectionArchivePage {
  ok: true;
  items: ReflectionArchiveRow[];
  total: number;
  has_more: boolean;
}

export async function listMyReflections(
  opts: { limit?: number; offset?: number } = {},
): Promise<ReflectionArchivePage | { ok: false; reason: string }> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return { ok: true, items: [], total: 0, has_more: false };
    const { data, error } = await supabase.rpc("list_my_reflections_v1" as never, {
      p_limit: opts.limit ?? 30,
      p_offset: opts.offset ?? 0,
    } as never);
    if (error) return { ok: false, reason: error.message };
    return data as ReflectionArchivePage;
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export function anchorLabelAr(anchorType: string): string {
  switch (anchorType) {
    case "entity": return "مادّة موسوعية";
    case "story": return "قصة";
    case "campaign": return "حملة";
    default: return "محتوى";
  }
}

/** Deep link to the source content, or null when it is not routable. */
export function anchorHref(row: ReflectionArchiveRow): string | null {
  if (!row.anchor_id) return null;
  switch (row.anchor_type) {
    case "entity": return `/encyclopedia/entity/${row.anchor_id}`;
    case "story": return `/story/${row.anchor_id}`;
    case "campaign": return `/campaigns/imported/${row.anchor_id}`;
    default: return null;
  }
}
