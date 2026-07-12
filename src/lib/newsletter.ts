import { supabase } from "@/integrations/supabase/client";

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
