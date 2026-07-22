import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAchievementViews } from "@/lib/achievements/v2/driver";
import { onAchievementTransition } from "@/lib/achievements/v2";
import type { AchievementView } from "@/lib/achievements/v2";

/**
 * v2 Notification watcher.
 *
 * Presents the ONE approved achievement notification per genuine live
 * unlock transition. Everything historical (server mirror, hydration,
 * backfill, reinstall restore, guest→account migration, claim RPC
 * acknowledgement, rerender) is silent.
 *
 * Suppression model:
 *   1. Wait for `isMirrorReady()` — the engine only flips this true
 *      AFTER the server `user_achievements` mirror has been fetched
 *      (or explicitly skipped for a guest). Historical unlocks land in
 *      `persisted` before this flag flips.
 *   2. On the first mirror-ready pass, seed the local "notified" set
 *      from `getPersisted()` — every id the server already knows about
 *      is historical by definition, so no notification is emitted for
 *      those ids this session, even after a fresh install.
 *   3. Only ids that appear in `views` as `unlocked`/`claimed` AFTER
 *      that baseline is captured are treated as live transitions and
 *      surfaced through the approved gold InAppBanner path.
 *   4. The transition id (`achievement:<uid>:<achievementId>`) is
 *      stable so a repeat render, claim ack, or realtime echo cannot
 *      re-fire the banner (InAppBanner dedupes by id).
 *
 * Presentation channel:
 *   - Signed-in user: `send-notification` writes a row that surfaces
 *     via realtime → the gold InAppBanner. No local toast.
 *   - Guest: local `irth:notifications:banner` event → the same gold
 *     banner component. No local toast, no server round-trip.
 *
 * The obsolete sonner `toast.success` path (white/green success chip)
 * is removed — it was the second, unapproved surface for the same
 * event.
 */

const XP_BY_RARITY: Record<string, number> = {
  common: 25,
  rare: 50,
  epic: 100,
  legendary: 100,
};

export function AchievementWatcher() {
  const views = useAchievementViews();
  const viewsById = useMemo(() => new Map(views.map((v) => [v.id, v])), [views]);

  // Session-scoped set of transition ids we've already surfaced. Stable
  // ids (`achievement:<uid>:<id>`) ensure repeat renders / realtime
  // echoes / claim acknowledgements cannot re-fire.
  const notifiedTransitionsRef = useRef<Set<string>>(new Set());
  const authUidRef = useRef<string | null>(null);

  // Capture auth uid once for stable transition ids.
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) authUidRef.current = data.user?.id ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      authUidRef.current = session?.user?.id ?? null;
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    return onAchievementTransition((transition) => {
      if (transition.origin !== "live_gameplay_unlock") return;
      const uid = authUidRef.current;
      const transitionId = `achievement:${uid ?? "guest"}:${transition.achievementId}`;
      if (notifiedTransitionsRef.current.has(transitionId)) return;
      const v = viewsById.get(transition.achievementId);
      if (!v || (v.state !== "unlocked" && v.state !== "claimed")) return;
      notifiedTransitionsRef.current.add(transitionId);
      void notifyAchievementUnlocked(v, transitionId, uid);
    });
  }, [viewsById]);

  return null;
}

function rewardSummary(v: AchievementView): string | null {
  const r = v.rewards;
  if (!r) return null;
  const parts: string[] = [];
  if (r.xp) parts.push(`${XP_BY_RARITY[v.rarity] ?? r.xp} خبرة`);
  if (r.dinars) parts.push(`${r.dinars} دينار`);
  if (r.titleId) parts.push(`لقب: ${r.titleId}`);
  if (r.museumItemId) parts.push("قطعة متحف");
  return parts.length ? parts.join(" • ") : null;
}

async function notifyAchievementUnlocked(
  v: AchievementView,
  transitionId: string,
  uid: string | null,
) {
  const name = v.displayTitle ?? "إنجاز";
  const desc = v.displayDescription ?? "";
  const icon = v.media.icon.ref;
  const rewards = rewardSummary(v);
  const body = rewards ? `حصلت على إنجاز: ${name} — ${rewards}` : `حصلت على إنجاز: ${name}`;
  const deepLink = `/profile?tab=achievements`;

  // Approved gold presentation only. Emit a single sound cue.
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("irth:achievement-unlocked", { detail: { id: v.id } }),
    );
  }

  if (!uid) {
    // Guest: local gold InAppBanner (single path).
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("irth:notifications:banner", {
          detail: {
            id: transitionId,
            title: "إنجاز جديد",
            body: rewards ? `${desc || name} • ${rewards}` : desc || name,
            type: "achievement",
            category: "achievement",
            icon,
            deep_link: deepLink,
            payload: { achievementId: v.id, url: deepLink },
          },
        }),
      );
    }
    return;
  }

  // Signed-in: writing the notification row is the single presentation
  // path. Realtime delivers the gold InAppBanner in the foreground and
  // FCM handles background delivery. No local toast — that produced the
  // white/green duplicate.
  try {
    await supabase.functions.invoke("send-notification", {
      body: {
        title: "إنجاز جديد",
        body,
        type: "achievement",
        target_type: "user",
        target_user_id: uid,
        deep_link: deepLink,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[achievement] notification dispatch failed", err);
  }
}
