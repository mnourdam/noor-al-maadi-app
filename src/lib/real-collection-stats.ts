// ============================================================
// Real Collection Stats — single source of truth for homepage
// counters and "recently discovered" rails.
//
// Merges three unlock systems:
//   1. Local profile arrays (artifactsFound / charactersUnlocked /
//      missionsCompleted / storiesRead / timelinesCompleted /
//      investigationsCompleted)
//   2. Supabase `user_collection` rows
//   3. Imported-campaign registry unlocks (localStorage)
//
// Identical to the logic used by the museum (`/collection`), so
// numbers on the homepage match what the player sees there.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useProfile } from "./profile";
import { ARTIFACTS, CHARACTERS, CAMPAIGNS } from "./data";
import { getUnlockedRegistryIds } from "./importedUnlocks";
import { listRegistry } from "./contentRegistryStorage";
import { displayName } from "./display-names";
import { supabase } from "@/integrations/supabase/client";

/** Items whose Arabic title cannot be resolved are excluded from
 *  homepage rails. Their raw IDs are logged once so data owners can
 *  fix the underlying registry/Supabase content. */
const _missingTitlesLogged = new Set<string>();
function logMissingTitle(source: string, id: string) {
  const k = `${source}:${id}`;
  if (_missingTitlesLogged.has(k)) return;
  _missingTitlesLogged.add(k);
  // eslint-disable-next-line no-console
  console.warn(`[home] unresolved Arabic title (${source}): ${id}`);
}
/** Arabic regex: any letter in the Arabic Unicode block. */
const HAS_ARABIC = /[\u0600-\u06FF]/;
function isValidArabicTitle(s: string | null | undefined): s is string {
  if (!s) return false;
  const t = s.trim();
  if (!t) return false;
  return HAS_ARABIC.test(t);
}

export type UnifiedUnlock = {
  key: string;
  kind: "شخصية" | "أثر" | "مدينة" | "معركة" | "حدث" | "معلم" | "دولة" | "علم";
  title: string;
  subtitle?: string;
  icon: string;
  to: string;
  unlockedAt: number; // ms epoch (0 if unknown — sorts last)
};

const KIND_ICON: Record<UnifiedUnlock["kind"], string> = {
  شخصية: "👤",
  أثر: "🏺",
  مدينة: "🏛️",
  معركة: "⚔️",
  حدث: "📜",
  معلم: "🕌",
  دولة: "🏳️",
  علم: "📖",
};

const TYPE_TO_KIND: Record<string, UnifiedUnlock["kind"]> = {
  figure: "شخصية", character: "شخصية", scholar: "علم",
  artifact: "أثر", relic: "أثر",
  city: "مدينة", landmark: "معلم",
  battle: "معركة",
  event: "حدث",
  state: "دولة", dynasty: "دولة",
};

function kindFromType(t: string): UnifiedUnlock["kind"] {
  return TYPE_TO_KIND[t.toLowerCase()] ?? "حدث";
}

function useSupabaseCollection() {
  const [rows, setRows] = useState<
    Array<{ type: string; slug: string; unlockedAt: number }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (!uid) return;
        const { data } = await supabase
          .from("user_collection")
          .select("item_id,item_type,unlocked_at")
          .eq("user_id", uid);
        if (cancelled || !data) return;
        setRows(
          data.map((r: any) => ({
            type: String(r.item_type ?? ""),
            slug: String(r.item_id ?? ""),
            unlockedAt: r.unlocked_at ? new Date(r.unlocked_at).getTime() : 0,
          })),
        );
      } catch {
        /* offline / signed-out */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return rows;
}

export function useRealCollectionStats() {
  const { profile } = useProfile();
  const supaRows = useSupabaseCollection();

  // Imported registry unlocks (localStorage)
  const importedIds = useMemo(() => {
    try {
      return getUnlockedRegistryIds();
    } catch {
      return [];
    }
  }, [profile.missionsCompleted]); // re-evaluate when player progresses
  const registry = useMemo(() => {
    try {
      return listRegistry();
    } catch {
      return [];
    }
  }, []);
  const registryById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof listRegistry>[number]>();
    for (const i of registry) m.set(i.id.toLowerCase(), i);
    return m;
  }, [registry]);

  // ===== Merge into unified list =====
  const all = useMemo<UnifiedUnlock[]>(() => {
    const seen = new Set<string>();
    const out: UnifiedUnlock[] = [];

    const push = (u: UnifiedUnlock) => {
      if (seen.has(u.key)) return;
      seen.add(u.key);
      out.push(u);
    };

    // 1. Supabase user_collection — has reliable timestamps
    for (const r of supaRows) {
      const kind = kindFromType(r.type);
      const regItem = registryById.get(r.slug.toLowerCase());
      const dn = displayName(r.slug);
      const candidate =
        (isValidArabicTitle(regItem?.name) ? regItem!.name : null) ??
        (dn !== r.slug && isValidArabicTitle(dn) ? dn : null);
      if (!candidate) { logMissingTitle("supabase", r.slug); continue; }
      const img = (regItem?.image ?? "").trim();
      const icon = img && [...img].length === 1 ? img : KIND_ICON[kind];
      push({
        key: `sb:${r.type}:${r.slug}`,
        kind,
        title: candidate,
        subtitle: kind,
        icon,
        to: `/encyclopedia/entity/${r.slug}`,
        unlockedAt: r.unlockedAt,
      });
    }

    // 2. Imported registry unlocks
    for (const id of importedIds) {
      const item = registryById.get(id.toLowerCase());
      if (!item) { logMissingTitle("registry-missing", id); continue; }
      if (!isValidArabicTitle(item.name)) { logMissingTitle("registry", item.id); continue; }
      const kind = kindFromType(String(item.type));
      const img = (item.image ?? "").trim();
      const icon = img && [...img].length === 1 ? img : KIND_ICON[kind];
      const slug = (item as any).slug ?? item.id;
      push({
        key: `reg:${item.id}`,
        kind,
        title: item.name.trim(),
        subtitle: kind,
        icon,
        to: `/encyclopedia/entity/${slug}`,
        unlockedAt: 0,
      });
    }

    // NOTE: legacy profile arrays (charactersUnlocked / artifactsFound) are
    // intentionally NOT included here. They contained demo/seed data
    // (e.g. Salah al-Din, Umar) that polluted the homepage "latest
    // discoveries" rail with items the player never actually unlocked in
    // the current Supabase-based gameplay. Source of truth = Supabase
    // user_collection + imported registry unlocks only.

    return out;
  }, [supaRows, importedIds, registryById]);


  // Recently discovered: prefer items with real timestamps, then locals
  // (most-recent first by profile array order — newest pushed last).
  const recent = useMemo<UnifiedUnlock[]>(() => {
    const stamped = all.filter((u) => u.unlockedAt > 0).sort((a, b) => b.unlockedAt - a.unlockedAt);
    const importedRev = [...all.filter((u) => u.unlockedAt === 0 && u.key.startsWith("reg:"))].reverse();
    const merged: UnifiedUnlock[] = [];
    const pushUnique = (u: UnifiedUnlock) => {
      if (!merged.find((m) => m.key === u.key)) merged.push(u);
    };
    stamped.forEach(pushUnique);
    importedRev.forEach(pushUnique);
    return merged.slice(0, 8);
  }, [all]);


  // ===== Aggregate counters =====
  const totalCollection = all.length;
  const eventsDiscovered =
    profile.storiesRead.length +
    profile.timelinesCompleted.length +
    profile.investigationsCompleted.length;
  const battlesCompleted = useMemo(() => {
    const ids = new Set(profile.missionsCompleted);
    return CAMPAIGNS.flatMap((c) => c.missions).filter(
      (m) =>
        ids.has(m.id) &&
        (m.title.includes("معركة") || m.title.includes("غزوة") || m.title.includes("فتح")),
    ).length;
  }, [profile.missionsCompleted]);

  return {
    totalCollection,
    eventsDiscovered,
    battlesCompleted,
    recent,
    all,
  };
}
