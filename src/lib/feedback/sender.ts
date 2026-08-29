/**
 * Canonical feedback/contribution sender classifier (V16).
 *
 * One rule for every thread surface (player + admin). Authorship is never
 * inferred from message order or position.
 *
 *  - a message authored by the contribution owner is ALWAYS the player side,
 *    even when a legacy row carries `author_role = 'admin'` (the historical
 *    `reply_to_feedback_issue` bug labelled every reply as admin because
 *    `is_content_editor()` is true inside SECURITY DEFINER functions).
 *  - a message authored by someone else with the admin role is Irth staff.
 *  - anything incomplete (null author, unknown role) fails closed to the
 *    player-safe presentation — never to "فريق إرث".
 */

import type { FeedbackMessage } from "./types";

export type FeedbackSender = "player" | "staff";

export interface SenderInput {
  author_id?: string | null;
  author_role?: string | null;
  is_internal?: boolean | null;
}

export function classifyFeedbackSender(
  message: SenderInput | FeedbackMessage,
  reporterId: string | null | undefined,
): FeedbackSender {
  const authorId = message.author_id ?? null;
  const role = (message.author_role ?? "").toLowerCase();

  // Owner of the contribution → always the player side.
  if (authorId && reporterId && authorId === reporterId) return "player";

  // Internal notes can only be authored by staff.
  if (message.is_internal) return "staff";

  if (role === "admin" && authorId) return "staff";

  // Missing/unknown identity → player-safe.
  return "player";
}

export function isStaffMessage(
  message: SenderInput | FeedbackMessage,
  reporterId: string | null | undefined,
): boolean {
  return classifyFeedbackSender(message, reporterId) === "staff";
}
