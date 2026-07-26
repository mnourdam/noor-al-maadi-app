// ============================================================
// Stories catalog — filtering / sorting model
// ------------------------------------------------------------
// Pure, synchronous, zero-network. The catalog feed is already in
// memory (one `list_stories_v2` call), so every filter, search and
// sort here runs locally — the same philosophy as the Encyclopedia
// index and the Campaigns hub. No RPC per filter change, ever.
// ============================================================

import { normalizeArabicSearch } from "@/lib/encyclopedia-search";
import type { StorySummary } from "./summary";

export type StoryStatusFilter = "all" | "available" | "in_progress" | "completed" | "locked";
export type StorySortKey = "recommended" | "newest" | "shortest" | "reward";

export interface StoryCatalogFilters {
  q: string;
  status: StoryStatusFilter;
  world: string | null;
  era: string | null;
  category: string | null;
}

export const EMPTY_STORY_FILTERS: StoryCatalogFilters = {
  q: "",
  status: "all",
  world: null,
  era: null,
  category: null,
};

export const STORY_STATUS_LABELS: Record<StoryStatusFilter, string> = {
  all: "الكل",
  available: "متاحة",
  in_progress: "قيد القراءة",
  completed: "مكتملة",
  locked: "مقفلة",
};

export const STORY_CATEGORY_LABELS: Record<string, string> = {
  event: "أحداث",
  character: "شخصيات",
  city: "مدن",
  landmark: "معالم",
  battle: "معارك",
  artifact: "آثار",
  document: "وثائق",
  daily_life: "حياة يومية",
  analysis: "تحليل",
  alternate_history: "تاريخ بديل",
};

export const STORY_SORT_LABELS: Record<StorySortKey, string> = {
  recommended: "المقترح",
  newest: "الأحدث",
  shortest: "الأقصر",
  reward: "الأعلى مكافأة",
};

export function storyCategoryLabel(key: string | null | undefined): string {
  if (!key) return "غير مصنّفة";
  return STORY_CATEGORY_LABELS[key] ?? key;
}

/** Distinct, count-annotated values for one facet — drives the chip rows. */
export interface Facet {
  value: string;
  count: number;
}

function tally(values: (string | null | undefined)[]): Facet[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ar"));
}

export interface StoryFacets {
  worlds: Facet[];
  eras: Facet[];
  categories: Facet[];
}

export function buildStoryFacets(stories: StorySummary[]): StoryFacets {
  return {
    worlds: tally(stories.map((s) => s.world_slug)),
    eras: tally(stories.map((s) => s.era)),
    categories: tally(stories.map((s) => s.category)),
  };
}

function matchesStatus(s: StorySummary, status: StoryStatusFilter): boolean {
  switch (status) {
    case "all":         return true;
    case "locked":      return !s.unlocked;
    case "completed":   return s.completed;
    case "in_progress": return s.unlocked && !s.completed && !!s.progress;
    case "available":   return s.unlocked && !s.completed;
  }
}

function haystack(s: StorySummary): string {
  return normalizeArabicSearch(
    [s.title_ar, s.title_en, s.summary_ar, s.summary_en, ...(s.tags ?? [])]
      .filter(Boolean)
      .join(" "),
  );
}

export function filterStories(
  stories: StorySummary[],
  filters: StoryCatalogFilters,
): StorySummary[] {
  const q = normalizeArabicSearch(filters.q.trim());
  return stories.filter((s) => {
    if (!matchesStatus(s, filters.status)) return false;
    if (filters.world && s.world_slug !== filters.world) return false;
    if (filters.era && s.era !== filters.era) return false;
    if (filters.category && s.category !== filters.category) return false;
    if (q && !haystack(s).includes(q)) return false;
    return true;
  });
}

const RARITY_WEIGHT: Record<string, number> = {
  legendary: 3,
  rare: 2,
  featured: 1,
  standard: 0,
};

export function sortStories(stories: StorySummary[], sort: StorySortKey): StorySummary[] {
  const list = stories.slice();
  switch (sort) {
    case "newest":
      return list.sort(
        (a, b) =>
          Date.parse(b.published_at ?? "") - Date.parse(a.published_at ?? "") ||
          a.display_order - b.display_order,
      );
    case "shortest":
      return list.sort((a, b) => a.scene_count - b.scene_count || a.display_order - b.display_order);
    case "reward":
      return list.sort(
        (a, b) =>
          b.xp_reward + b.dinar_reward - (a.xp_reward + a.dinar_reward) ||
          a.display_order - b.display_order,
      );
    case "recommended":
    default:
      // Continue → new → rare-first → completed → locked.
      return list.sort((a, b) => rank(a) - rank(b) || a.display_order - b.display_order);
  }
}

function rank(s: StorySummary): number {
  if (!s.unlocked) return 400;
  if (s.completed) return 300;
  if (s.progress) return 0;
  return 100 - (RARITY_WEIGHT[s.rarity ?? "standard"] ?? 0);
}

export function activeFilterCount(f: StoryCatalogFilters): number {
  return (
    (f.q.trim() ? 1 : 0) +
    (f.status !== "all" ? 1 : 0) +
    (f.world ? 1 : 0) +
    (f.era ? 1 : 0) +
    (f.category ? 1 : 0)
  );
}

/** Headline counters shown above the grid — always derived from one feed. */
export function storyCounters(stories: StorySummary[]) {
  return {
    total: stories.length,
    completed: stories.filter((s) => s.completed).length,
    inProgress: stories.filter((s) => s.unlocked && !s.completed && !!s.progress).length,
    locked: stories.filter((s) => !s.unlocked).length,
  };
}
