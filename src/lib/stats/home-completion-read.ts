import { supabase } from "@/integrations/supabase/client";
import { getActiveOwner, getIdentityEpoch } from "@/lib/identity/owner";

export type HomeCompletionKind = "campaigns" | "stories";

/** Strict display read: failed/aborted reads must never become verified zeros. */
export async function readHomeCompletionIds(
  kind: HomeCompletionKind,
  uid: string,
  owner: string,
  epoch: number,
  signal: AbortSignal,
): Promise<string[]> {
  const current = () => !signal.aborted && getActiveOwner() === owner && getIdentityEpoch() === epoch;
  if (!current() || owner !== `user:${uid}`) throw new Error("Home identity changed");
  const result = kind === "campaigns"
    ? await supabase.from("user_campaign_completions").select("campaign_id").eq("user_id", uid).abortSignal(signal)
    : await supabase.from("user_story_completions" as never).select("story_id").eq("user_id", uid).abortSignal(signal);
  if (!current()) throw new Error("Home identity changed");
  if (result.error || !Array.isArray(result.data)) throw new Error("تعذر تحديث إحصاءات الإنجاز");
  const ids = new Set<string>();
  for (const row of result.data as Array<{ campaign_id?: string; story_id?: string }>) {
    const raw = kind === "campaigns" ? row.campaign_id : row.story_id;
    if (!raw) continue;
    if (kind === "campaigns") {
      // Match campaigns/completions identifier normalization exactly.
      const id = String(raw).trim().toLowerCase();
      if (id) { ids.add(id); ids.add(id.replace(/\s+/g, "-")); }
    } else ids.add(String(raw));
  }
  return [...ids];
}
