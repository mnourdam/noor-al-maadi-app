import { supabase } from "@/integrations/supabase/client";
import type { FeedbackCategory, FeedbackContext, FeedbackIssue, FeedbackMessage, FeedbackStatus } from "./types";

export async function createIssue(params: {
  category: FeedbackCategory;
  title: string;
  description: string;
  context?: FeedbackContext;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_feedback_issue", {
    p_category: params.category,
    p_title: params.title,
    p_description: params.description,
    p_context: (params.context ?? {}) as never,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function replyToIssue(issueId: string, body: string, isInternal = false): Promise<void> {
  const { error } = await supabase.rpc("reply_to_feedback_issue", {
    p_issue_id: issueId,
    p_body: body,
    p_is_internal: isInternal,
  });
  if (error) throw error;
}

export async function setIssueStatus(issueId: string, status: FeedbackStatus): Promise<void> {
  const { error } = await supabase.rpc("set_feedback_issue_status", {
    p_issue_id: issueId,
    p_status: status,
  });
  if (error) throw error;
}

export async function markIssueRead(issueId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_feedback_issue_read", { p_issue_id: issueId });
  if (error) throw error;
}

export async function listMyIssues(): Promise<FeedbackIssue[]> {
  const { data, error } = await supabase.rpc("list_my_feedback_issues");
  if (error) throw error;
  return (data as unknown as FeedbackIssue[]) ?? [];
}

export async function getIssueThread(issueId: string): Promise<{ issue: FeedbackIssue; messages: FeedbackMessage[] }> {
  const { data, error } = await supabase.rpc("get_feedback_issue_thread", { p_issue_id: issueId });
  if (error) throw error;
  return data as unknown as { issue: FeedbackIssue; messages: FeedbackMessage[] };
}

export interface AdminIssueRow extends FeedbackIssue {
  reporter: { id: string; username: string | null; display_name: string | null; avatar_id: string | null } | null;
}

export async function adminListIssues(params: {
  status?: FeedbackStatus | null;
  category?: FeedbackCategory | null;
  search?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<AdminIssueRow[]> {
  const { data, error } = await supabase.rpc("admin_list_feedback_issues", {
    p_status: params.status ?? undefined,
    p_category: params.category ?? undefined,
    p_search: params.search ?? undefined,
    p_limit: params.limit ?? 100,
    p_offset: params.offset ?? 0,
  });
  if (error) throw error;
  return (data as unknown as AdminIssueRow[]) ?? [];
}

export async function rateIssue(issueId: string, rating: 1 | 2 | 3 | 4 | 5): Promise<void> {
  const { error } = await supabase.rpc("rate_feedback_issue", { p_issue_id: issueId, p_rating: rating });
  if (error) throw error;
}

export async function countMyUnreadFeedback(): Promise<number> {
  const { data, error } = await supabase.rpc("count_my_unread_feedback");
  if (error) throw error;
  return Number(data ?? 0);
}

export interface AdminFeedbackStats {
  counts: Partial<Record<FeedbackStatus, number>>;
  avg_first_response_seconds: number;
  avg_resolution_seconds: number;
  avg_rating: number;
  rating_count: number;
}

export async function adminFeedbackStats(): Promise<AdminFeedbackStats> {
  const { data, error } = await supabase.rpc("admin_feedback_stats");
  if (error) throw error;
  return data as unknown as AdminFeedbackStats;
}
