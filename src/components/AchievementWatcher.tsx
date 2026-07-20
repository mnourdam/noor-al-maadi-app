import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAchievementViews } from "@/lib/achievements/v2/driver";
import type { AchievementView } from "@/lib/achievements/v2";

/**
 * v2 Notification watcher.
 *
 * The engine (see `engine.ts`) is authoritative for evaluation, unlock
 * persistence, and reward claim. This component's ONLY job is to surface
 * the "just-unlocked" transition to the player through the notification
 * pipeline:
 *   - toast
 *   - in-app banner (`irth:notifications:banner`)
 *   - SFX (`irth:achievement-unlocked`)
 *   - server notification row + push (for signed-in users)
 *
 * Dedup uses `localStorage` (`irth.achievements.v2.watcher_seen`) so each
 * id notifies exactly once per device, and the first render after cold
 * boot silently backfills already-unlocked ids without spamming.
 */

const SEEN_KEY = "irth.achievements.v2.watcher_seen";
const XP_BY_RARITY: Record<string, number> = {
  common: 25,
  rare: 50,
  epic: 100,
  legendary: 100,
};

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveSeen(seen: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* noop */
  }
}

export function AchievementWatcher() {
  const views = useAchievementViews();
  const seenRef = useRef<Set<string>>(loadSeen());
  const firstRun = useRef(true);

  useEffect(() => {
    const seen = seenRef.current;
    const unlocked = views.filter(
      (v) => v.state === "unlocked" || v.state === "claimed",
    );
    for (const v of unlocked) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      if (firstRun.current) continue; // silent backfill
      void notifyAchievementUnlocked(v);
    }
    saveSeen(seen);
    firstRun.current = false;
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

async function notifyAchievementUnlocked(v: AchievementView) {
  const name = v.displayTitle ?? "إنجاز";
  const desc = v.displayDescription ?? "";
  const icon = v.media.icon.ref;
  const rewards = rewardSummary(v);
  const body = rewards ? `حصلت على إنجاز: ${name} — ${rewards}` : `حصلت على إنجاز: ${name}`;
  const deepLink = `/profile?tab=achievements`;

  toast.success(`إنجاز جديد: ${name}`, {
    description: rewards ? `${desc} • ${rewards}` : desc,
    icon,
    duration: 6000,
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("irth:achievement-unlocked", { detail: { id: v.id } }),
    );
  }

  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) {
      window.dispatchEvent(
        new CustomEvent("irth:notifications:banner", {
          detail: {
            id: `local-ach-${v.id}-${Date.now()}`,
            title: "إنجاز جديد",
            body,
            type: "achievement",
            category: "achievement",
            icon,
            deep_link: deepLink,
            payload: { achievementId: v.id, url: deepLink },
          },
        }),
      );
      return;
    }
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
