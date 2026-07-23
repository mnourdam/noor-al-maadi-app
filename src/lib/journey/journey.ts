// ============================================================
// Journey Log — runtime API (P6 Step 4)
// ------------------------------------------------------------
// FROZEN CONTRACT.
//
// The Journey Log is the player's own historical archive. It is
// NOT a social feed. It has no reactions, comments, sharing,
// followers, or popularity. It only reads events the player
// themselves produced, unioned from six existing progress
// systems on the server.
//
// The wire shape below is the frozen event model. Future kinds
// are added to `JourneyEventKind` (additive) and to the server
// UNION in the migration — the shape itself does not change.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export type JourneyEventKind =
  | "story_completed"
  | "campaign_completed"
  | "investigation_completed"
  | "achievement_earned"
  | "encyclopedia_discovery"
  | "museum_discovery";

export const JOURNEY_KIND_ORDER: readonly JourneyEventKind[] = [
  "story_completed",
  "campaign_completed",
  "investigation_completed",
  "achievement_earned",
  "encyclopedia_discovery",
  "museum_discovery",
] as const;

export interface JourneyEvent {
  event_id: string;
  kind: JourneyEventKind;
  occurred_at: string;             // ISO timestamp
  subject_id: string;              // story_id | campaign_id | UUID as text | slug | etc.
  subject_type: string;            // 'story' | 'campaign' | ... | entity_type
  metadata: Record<string, unknown>;
}

export interface JourneyPage {
  items: JourneyEvent[];
  next_cursor: { ts: string; id: string } | null;
}

export interface ListJourneyOptions {
  kinds?: JourneyEventKind[];
  cursor?: { ts: string; id: string } | null;
  limit?: number;
}

/**
 * List the current player's journey events, newest first.
 * Keyset-paginated. Signed-in only (returns empty for guests).
 */
export async function listMyJourney(opts: ListJourneyOptions = {}): Promise<JourneyPage> {
  const limit = Math.max(1, Math.min(opts.limit ?? 30, 100));
  const kinds = opts.kinds && opts.kinds.length > 0 ? opts.kinds : null;

  const { data, error } = await supabase.rpc("list_my_journey", {
    _kinds: kinds as unknown as never,
    _cursor_ts: opts.cursor?.ts ?? undefined,
    _cursor_id: opts.cursor?.id ?? undefined,
    _limit: limit,
  });

  if (error || !data) return { items: [], next_cursor: null };

  const items = (data as unknown as JourneyEvent[]).map((row) => ({
    ...row,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  }));

  const next_cursor =
    items.length === limit
      ? { ts: items[items.length - 1].occurred_at, id: items[items.length - 1].event_id }
      : null;

  return { items, next_cursor };
}

export type JourneyKindCounts = Partial<Record<JourneyEventKind, number>>;

export async function journeyKindCounts(): Promise<JourneyKindCounts> {
  const { data, error } = await supabase.rpc("journey_kind_counts");
  if (error || !data) return {};
  const out: JourneyKindCounts = {};
  for (const row of data as Array<{ kind: JourneyEventKind; total: number | string }>) {
    out[row.kind] = Number(row.total) || 0;
  }
  return out;
}
