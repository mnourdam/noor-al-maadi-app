import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useProfile } from "@/lib/profile";
import { ACHIEVEMENTS, evaluateAchievements, type AchievementDef } from "@/lib/app-constants";
import { supabase } from "@/integrations/supabase/client";

/**
 * Watches profile state and surfaces newly-unlocked achievements through
 * the unified notification pipeline:
 *   - toast (legacy, retained for instant feedback)
 *   - in-app banner (cinematic, via `irth:notifications:banner` event)
 *   - SFX (via `irth:achievement-unlocked` event, see sfxHooks)
 *   - server notification row + FCM push (via `send-notification` edge fn)
 *
 * Dedup is enforced via `profile.achievementsEarned[id]` so each achievement
 * notifies exactly once on the locked → unlocked transition.
 *
 * XP grant is TIER-BASED (rarity), NOT the legacy per-achievement `rewards`
 * amounts — those were authored with inflated numbers that never fired.
 * Rarity → XP map (economy pillar):
 *   common / uncommon → 25 XP (small)
 *   rare              → 50 XP (medium)
 *   epic / legendary  → 100 XP (major)
 */
const ACHIEVEMENT_XP_BY_RARITY: Record<string, number> = {
  common:    25,
  uncommon:  25,
  rare:      50,
  epic:      100,
  legendary: 100,
};

export function AchievementWatcher() {
  const { profile, markAchievementEarned, addPoints } = useProfile();
  const firstRun = useRef(true);

  useEffect(() => {
    const evals = evaluateAchievements(profile);
    const earnedMap = profile.achievementsEarned ?? {};

    for (const e of evals) {
      if (!e.earned) continue;
      if (earnedMap[e.id]) continue;
      const def = ACHIEVEMENTS.find((a) => a.id === e.id);
      if (!def) continue;
      const isNew = markAchievementEarned(e.id);
      // On the very first render after hydration, silently backfill timestamps
      // for already-earned achievements so we don't spam notifications on app open.
      if (isNew && !firstRun.current) {
        const xp = ACHIEVEMENT_XP_BY_RARITY[def.rarity] ?? 25;
        if (xp > 0) addPoints(xp);
        void notifyAchievementUnlocked(def, xp);
      }
    }
    firstRun.current = false;
    // We intentionally depend on the whole profile so any state change re-checks.
  }, [profile, markAchievementEarned, addPoints]);

  return null;
}

function rewardSummary(def: AchievementDef): string | null {
  const parts: string[] = [];
  for (const r of def.rewards ?? []) {
    if (r.kind === "xp" && r.amount) parts.push(`${r.amount} خبرة`);
    else if (r.kind === "dinars" && r.amount) parts.push(`${r.amount} دينار`);
    else if (r.kind === "title" && r.label) parts.push(`لقب: ${r.label}`);
    else if (r.kind === "badge" && r.label) parts.push(`شارة: ${r.label}`);
    else if (r.kind === "avatar" && r.label) parts.push(`أفاتار: ${r.label}`);
    else if (r.kind === "museum") parts.push("قطعة متحف");
  }
  return parts.length ? parts.join(" • ") : null;
}

async function notifyAchievementUnlocked(def: AchievementDef) {
  const title = "إنجاز جديد";
  const rewards = rewardSummary(def);
  const body = rewards
    ? `حصلت على إنجاز: ${def.name} — ${rewards}`
    : `حصلت على إنجاز: ${def.name}`;
  const deepLink = `/profile?tab=achievements`;

  // 1) Toast — instant, non-blocking confirmation.
  toast.success(`إنجاز جديد: ${def.name}`, {
    description: rewards ? `${def.desc} • ${rewards}` : def.desc,
    icon: def.icon,
    duration: 6000,
  });

  // 2) Immediate SFX (respects user audio settings via audioManager).
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("irth:achievement-unlocked", { detail: { id: def.id } }));
  }

  // 3) Server notification row + push delivery. Realtime listener will
  //    re-fetch and surface the InAppBanner + bell badge automatically.
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) {
      // Guest — fall back to a local-only banner so the achievement is still visible.
      window.dispatchEvent(
        new CustomEvent("irth:notifications:banner", {
          detail: {
            id: `local-ach-${def.id}-${Date.now()}`,
            title,
            body,
            type: "achievement",
            category: "achievement",
            icon: def.icon,
            deep_link: deepLink,
            payload: { achievementId: def.id, url: deepLink },
          },
        }),
      );
      return;
    }
    await supabase.functions.invoke("send-notification", {
      body: {
        title,
        body,
        type: "achievement",
        target_type: "user",
        target_user_id: uid,
        deep_link: deepLink,
      },
    });
  } catch (err) {
    console.warn("[achievement] notification dispatch failed", err);
  }
}
