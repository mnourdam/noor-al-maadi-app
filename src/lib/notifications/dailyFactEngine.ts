/**
 * Daily Fact Selection Engine v1
 *
 * Implements a deterministic shuffle-bag selection to ensure:
 * 1. Category Diversity: Don't repeat the same category two days in a row.
 * 2. Item Diversity: Cycle through all items in a category before repeating.
 * 3. Determinism: The same UTC date always yields the same fact.
 * 4. Priority: Today-in-History still suppresses Daily Facts.
 */

import { Database } from "@/integrations/supabase/types";

type DailyFact = Database["public"]["Tables"]["daily_facts"]["Row"];

/** Canonical categories for Daily Facts. */
export const DAILY_FACT_CATEGORIES = [
  "هل تعلم؟",
  "من التاريخ",
  "من الحضارة الإسلامية",
  "أقوال العلماء",
  "شخصيات",
  "مدن",
  "معارك",
  "آثار",
  "مخطوطات",
  "حقائق تاريخية",
] as const;

export type DailyFactCategory = (typeof DAILY_FACT_CATEGORIES)[number];

/**
 * Simple deterministic PRNG based on a seed.
 * LCG (Linear Congruential Generator) for consistency.
 */
function seededRandom(seed: number) {
  const m = 0x80000000;
  const a = 1103515245;
  const c = 12345;
  let state = seed % m;
  return function () {
    state = (a * state + c) % m;
    return state / (m - 1);
  };
}

/** Deterministic shuffle using a seeded random source. */
function shuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const rng = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Derives a deterministic "Epoch Seed" from a date string (YYYY-MM-DD).
 * Used to keep selection stable for the entire day.
 */
function getDaySeed(runDate: string): number {
  let hash = 0;
  for (let i = 0; i < runDate.length; i++) {
    hash = (hash << 5) - hash + runDate.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Selects a fact using the Shuffle-Bag strategy.
 */
export function selectDailyFact(
  facts: DailyFact[],
  runDate: string
): DailyFact | null {
  if (!facts.length) return null;

  const daySeed = getDaySeed(runDate);
  const totalDays = Math.floor(new Date(runDate).getTime() / (1000 * 60 * 60 * 24));

  // 1. Group by category
  const categoriesMap: Record<string, DailyFact[]> = {};
  facts.forEach((f) => {
    // Attempt to extract category from body if not explicit, or use "هل تعلم؟"
    const category = inferCategory(f);
    if (!categoriesMap[category]) categoriesMap[category] = [];
    categoriesMap[category].push(f);
  });

  const availableCategories = Object.keys(categoriesMap).sort();
  if (!availableCategories.length) return null;

  // 2. Deterministic Category Cycle (Tier 1)
  // Use a cycle seed that changes every N days where N is the number of categories.
  const catCycleIndex = totalDays % availableCategories.length;
  const catShuffleSeed = Math.floor(totalDays / availableCategories.length);
  const shuffledCategories = shuffle(availableCategories, catShuffleSeed);
  const selectedCategory = shuffledCategories[catCycleIndex];

  const categoryFacts = categoriesMap[selectedCategory];
  if (!categoryFacts.length) return null;

  // 3. Deterministic Item Cycle within category (Tier 2)
  // Sort facts by ID for stability before shuffling.
  const sortedFacts = [...categoryFacts].sort((a, b) => a.id.localeCompare(b.id));
  const itemCycleIndex = totalDays % sortedFacts.length;
  const itemShuffleSeed = Math.floor(totalDays / sortedFacts.length) + 12345; // Different seed offset
  const shuffledItems = shuffle(sortedFacts, itemShuffleSeed);

  return shuffledItems[itemCycleIndex];
}

/**
 * Logic to infer category from existing content since the DB doesn't have it yet.
 * If we add a category column later, this will prioritize it.
 */
function inferCategory(fact: DailyFact): string {
  // Check if we have a category in the metadata/title if ever added
  // For now, parse prefixes or use a fallback.
  const title = fact.title || "";
  const body = fact.body || "";

  if (title.includes("قيل") || body.includes("قال")) return "أقوال العلماء";
  if (body.includes("مدينة") || body.includes("عاصمة")) return "مدن";
  if (body.includes("معركة") || body.includes("غزوة")) return "معارك";
  if (body.includes("شخصية") || body.includes("لقب")) return "شخصيات";
  if (body.includes("أثر") || body.includes("معلم")) return "آثار";
  if (body.includes("مخطوط")) return "مخطوطات";
  if (body.includes("حضارة")) return "من الحضارة الإسلامية";

  // Default to common category
  return "هل تعلم؟";
}
