// ============================================================
// Personal Notifications — RPC-only client (P6 Step 3)
// ------------------------------------------------------------
// Personal, quiet, useful, educational. Never addictive.
//
// FROZEN contracts:
//   list_my_notifications(cursor, limit)   → paginated inbox
//   unread_notification_count()            → single number
//   mark_notification_read(id)             → one row
//   mark_all_notifications_read()          → whole inbox
//
// Rules the UI must honour:
//   * Never preload the full history — always paginate.
//   * Only ever show the current user's own inbox (server enforces).
//   * No sound, no push, no toast on receipt. Just a subtle badge.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export type PersonalNotificationKind =
  | "story_reaction_on_comment"
  | "comment_promoted_editor_note"
  | "comment_marked_contribution"
  | "comment_hidden"
  | "comment_restored"
  | "story_unlocked";

export interface PersonalNotificationRow {
  id: string;
  user_id: string;
  kind: PersonalNotificationKind;
  subject_type: "story" | "comment";
  subject_id: string;
  batch_key: string;
  count: number;
  last_actor_id: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationsPage {
  ok: true;
  items: PersonalNotificationRow[];
  next_cursor: string | null;
}

export async function listMyNotifications(opts: { cursor?: string | null; limit?: number } = {}):
  Promise<NotificationsPage | { ok: false; reason: string }>
{
  try {
    const { data, error } = await supabase.rpc("list_my_notifications" as never, {
      p_cursor: opts.cursor ?? null,
      p_limit: opts.limit ?? 20,
    } as never);
    if (error) return { ok: false, reason: error.message };
    return data as NotificationsPage;
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export async function unreadNotificationCount(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("unread_notification_count" as never);
    if (error) return 0;
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  try {
    const { data, error } = await supabase.rpc("mark_notification_read" as never, {
      p_id: id,
    } as never);
    if (error) return { ok: false };
    return (data ?? { ok: false }) as { ok: boolean };
  } catch {
    return { ok: false };
  }
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean; updated?: number }> {
  try {
    const { data, error } = await supabase.rpc("mark_all_notifications_read" as never);
    if (error) return { ok: false };
    return (data ?? { ok: false }) as { ok: boolean; updated?: number };
  } catch {
    return { ok: false };
  }
}
