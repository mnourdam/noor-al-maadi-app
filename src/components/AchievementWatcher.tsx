import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAchievementViews } from "@/lib/achievements/v2/driver";
import {
  getPersisted,
  isMirrorReady,
  onEngineTick,
} from "@/lib/achievements/v2/engine";
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
  // Force this component to re-render whenever the engine ticks, so a
  // late `mirrorReady` flip (server fetch resolves after mount) still
  // establishes the baseline.
  const tickRef = useRef(0);
  useEffect(() => {
    const off = onEngineTick(() => {
      tickRef.current += 1;
    });
    return off;
  }, []);

  // Session-scoped set of transition ids we've already surfaced. Stable
  // ids (`achievement:<uid>:<id>`) ensure repeat renders / realtime
  // echoes / claim acknowledgements cannot re-fire.
  const notifiedTransitionsRef = useRef<Set<string>>(new Set());
  const baselineCapturedRef = useRef(false);
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
    // Gate: never notify until the engine has established the server
    // baseline. Pre-baseline unlocks are historical by definition.
    if (!isMirrorReady()) return;

    const notified = notifiedTransitionsRef.current;
    const uid = authUidRef.current;
    const uidTag = uid ?? "guest";

    if (!baselineCapturedRef.current) {
      baselineCapturedRef.current = true;
      // Seed baseline from persisted (server-mirrored) ids. These are
      // historical, so mark them as already-notified for this session.
      for (const id of getPersisted().keys()) {
        notified.add(`achievement:${uidTag}:${id}`);
      }
      // Also seed anything currently unlocked (guest local state,
      // instant guest evaluation) — no notification for pre-baseline
      // unlocks, ever.
      for (const v of views) {
        if (v.state === "unlocked" || v.state === "claimed") {
          notified.add(`achievement:${uidTag}:${v.id}`);
        }
      }
      return;
    }

    for (const v of views) {
      if (v.state !== "unlocked" && v.state !== "claimed") continue;
      const transitionId = `achievement:${uidTag}:${v.id}`;
      if (notified.has(transitionId)) continue;
      notified.add(transitionId);
      void notifyAchievementUnlocked(v, transitionId, uid);
    }
  }, [views]);

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
