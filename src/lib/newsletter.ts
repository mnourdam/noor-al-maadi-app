import { supabase } from "@/integrations/supabase/client";

/**
 * Double Opt-In (DOI) feature flag.
 *
 * When DOI is DISABLED (current default):
 *   - Subscribing sets `subscribed=true, confirmed=false` immediately.
 *   - No confirmation email is sent.
 *   - The row is considered "pending confirmation" for reporting purposes,
 *     but marketing exports MUST NOT be sent to a third-party provider
 *     until real DOI is enabled and the user has confirmed by clicking a link.
 *
 * When DOI is ENABLED (future):
 *   - Subscribing sets `subscribed=true, confirmed=false` and enqueues a
 *     confirmation email with a signed, single-use, time-limited token.
 *   - Clicking the confirmation link hits a dedicated endpoint that
 *     populates `confirmed=true, confirmed_at=now()`.
 *   - Only then is the subscriber eligible for a marketing export.
 *
 * Toggle via `VITE_NEWSLETTER_DOI_ENABLED=1` — server code that eventually
 * sends the confirmation email should mirror the same flag on the server.
 */
export const NEWSLETTER_DOI_ENABLED: boolean =
  ((import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_NEWSLETTER_DOI_ENABLED ?? "") === "1";

export interface NewsletterSubscription {
  id?: string;
  email: string | null;
  subscribed: boolean;
  confirmed: boolean;
  source?: string | null;
  confirmed_at?: string | null;
  unsubscribed_at?: string | null;
  updated_at?: string | null;
}

/**
 * Read the current user's newsletter subscription preference.
 * Returns a default `subscribed:false` shape when no row exists yet.
 */
export async function fetchMyNewsletterSubscription(): Promise<NewsletterSubscription> {
  const { data, error } = await supabase.rpc("get_my_newsletter_subscription");
  if (error) throw error;
  return ((data as unknown) as NewsletterSubscription) ?? { email: null, subscribed: false, confirmed: false };
}

/**
 * Enable or disable the current user's newsletter subscription.
 * Only writes to the newsletter table — never affects authentication emails.
 * No campaigns are sent yet; this only stores the preference for future integration.
 */
export async function setMyNewsletterSubscription(
  subscribed: boolean,
  source: string = "account_settings",
): Promise<NewsletterSubscription> {
  const { data, error } = await supabase.rpc("set_my_newsletter_subscription", {
    p_subscribed: subscribed,
    p_source: source,
  });
  if (error) throw error;
  return (data as unknown) as NewsletterSubscription;
}

// =========================================================
// Admin API (owner/admin only, enforced by DB function)
// =========================================================

export interface NewsletterStats {
  total: number;
  active: number;
  confirmed: number;
  unconfirmed: number;
  unsubscribed: number;
  anonymous: number;
  authenticated: number;
  last7: number;
  last30: number;
  suppressed: number;
}

export interface AdminSubscriberRow {
  id: string;
  email: string;
  user_id: string | null;
  subscribed: boolean;
  confirmed: boolean;
  source: string | null;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
  is_suppressed: boolean;
  suppression_reason: string | null;
}

export type NewsletterFilter =
  | "all" | "active" | "confirmed" | "unconfirmed"
  | "unsubscribed" | "anonymous" | "authenticated" | "suppressed";

export async function fetchNewsletterStats(): Promise<NewsletterStats> {
  const { data, error } = await supabase.rpc("admin_newsletter_stats");
  if (error) throw error;
  return (data as unknown) as NewsletterStats;
}

export async function listNewsletterSubscribers(params: {
  filter?: NewsletterFilter;
  search?: string | null;
  source?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}): Promise<AdminSubscriberRow[]> {
  const { data, error } = await supabase.rpc("admin_list_newsletter_subscribers", {
    p_filter: params.filter ?? "all",
    p_search: params.search ?? undefined,
    p_source: params.source ?? undefined,
    p_from: params.from ?? undefined,
    p_to: params.to ?? undefined,
    p_limit: params.limit ?? 200,
    p_offset: params.offset ?? 0,
  });

  if (error) throw error;
  return ((data as unknown) as AdminSubscriberRow[]) ?? [];
}

export async function adminUnsubscribeNewsletter(id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("admin_unsubscribe_newsletter", {
    p_id: id, p_reason: reason ?? undefined,
  });
  if (error) throw error;
}

export async function adminResubscribeNewsletter(id: string, consentEvidence: string): Promise<void> {
  const { error } = await supabase.rpc("admin_resubscribe_newsletter", {
    p_id: id, p_consent_evidence: consentEvidence,
  });
  if (error) throw error;
}

