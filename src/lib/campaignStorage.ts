// ============================================================
// Campaign Storage (localStorage adapter)
// ------------------------------------------------------------
// All admin-managed campaigns currently live in localStorage so
// the panel works without a backend. The shape of the exported
// functions is intentionally backend-agnostic — when wiring
// Supabase/Firebase later, swap the body of these functions and
// every consumer (admin panel + public merge helper) keeps
// working unchanged.
// ============================================================

import type {
  Campaign,
  CampaignActivity,
  CampaignChapter,
  CampaignQuestionType,
  ValidationIssue,
  ValidationResult,
} from "@/types/campaign";
import { ACTIVITY_DEFAULTS } from "@/types/campaign";
import { sortCampaignsChronological } from "./campaignChronology";
import { isDividerPayload, selectCampaignRows } from "./campaigns/entities";

export const CAMPAIGNS_KEY = "irth_admin_campaigns";
export const BACKUPS_KEY = "irth_admin_backups";

const SUPPORTED_TYPES: CampaignQuestionType[] = [
  "reading_then_question",
  "multiple_choice",
  "true_false",
  "arrange_events",
  "decision_choice",
  "match_pairs",
  "fill_blank",
  "reflection_prompt",
];

/** Friendly aliases accepted in imported JSON, mapped to canonical types. */
const TYPE_ALIASES: Record<string, CampaignQuestionType> = {
  reading: "reading_then_question",
  multiple_choice: "multiple_choice",
  mcq: "multiple_choice",
  true_false: "true_false",
  ordering: "arrange_events",
  arrange: "arrange_events",
  decision: "decision_choice",
  match: "match_pairs",
  fill_blank: "fill_blank",
  reflection: "reflection_prompt",
};

function canonicalActivityType(raw: any): CampaignQuestionType | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  if (SUPPORTED_TYPES.includes(v as CampaignQuestionType)) return v as CampaignQuestionType;
  return TYPE_ALIASES[v];
}


function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "-").replace(/^-+|-+$/g, "") || uid("camp");
}

// -------------------- CRUD --------------------

export function listCampaigns(): Campaign[] {
  if (!isBrowser()) return [];
  return safeParse<Campaign[]>(window.localStorage.getItem(CAMPAIGNS_KEY), []);
}

export function listPublishedCampaigns(): Campaign[] {
  // Always return campaigns in chronological order (oldest historical period
  // first) — see src/lib/campaignChronology.ts.
  return sortCampaignsChronological(listCampaigns().filter(c => c.status === "published"));
}

export function getCampaign(id: string): Campaign | undefined {
  return listCampaigns().find(c => c.id === id);
}

export function saveCampaigns(items: Campaign[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(items));
}

export function upsertCampaign(c: Campaign): Campaign {
  const now = new Date().toISOString();
  const list = listCampaigns();
  const idx = list.findIndex(x => x.id === c.id);
  const next = { ...c, updatedAt: now, createdAt: c.createdAt ?? now };
  if (idx >= 0) list[idx] = next; else list.push(next);
  saveCampaigns(list);
  // Fire-and-forget cloud push (no-op during a cloud→local pull).
  import("@/lib/cloudSync").then(m => m.pushCampaign(next)).catch(() => {});
  return next;
}

export function deleteCampaign(id: string): void {
  saveCampaigns(listCampaigns().filter(c => c.id !== id));
  import("@/lib/cloudSync").then(m => m.deleteCampaignFromCloud(id)).catch(() => {});
}

export function duplicateCampaign(id: string): Campaign | undefined {
  const src = getCampaign(id);
  if (!src) return undefined;
  const copy: Campaign = {
    ...src,
    id: `${src.id}-copy-${Math.random().toString(36).slice(2, 5)}`,
    title: `${src.title} (نسخة)`,
    status: "draft",
    createdAt: undefined,
    updatedAt: undefined,
    chapters: src.chapters.map(ch => ({
      ...ch,
      id: uid("ch"),
      activities: ch.activities.map(a => ({ ...a, id: uid("act") })),
    })),
  };
  return upsertCampaign(copy);
}

// -------------------- Validation + Normalization --------------------

export function validateCampaign(raw: unknown, knownRegistryIds?: Set<string>): ValidationResult {
  const issues: ValidationIssue[] = [];
  const push = (level: ValidationIssue["level"], message: string, path?: string) =>
    issues.push({ level, message, path });

  if (!raw || typeof raw !== "object") {
    push("error", "صيغة JSON غير صالحة: المتوقع كائن حملة.");
    return { ok: false, issues };
  }
  // A section divider is NOT a campaign. It can never enter campaign
  // validation, import, or storage.
  if (isDividerPayload(raw)) {
    push("error", "هذا فاصل عصر (divider) وليس حملة — الفواصل تُدار من شاشة ترتيب الحملات فقط.");
    return { ok: false, issues };
  }
  const obj = raw as Record<string, any>;


  if (typeof obj.title !== "string" || !obj.title.trim()) {
    push("error", "حقل (title) العنوان مطلوب.");
  }
  if (!Array.isArray(obj.chapters)) {
    push("error", "حقل (chapters) الفصول مطلوب ويجب أن يكون مصفوفة.");
    return { ok: false, issues };
  }

  const id: string = (typeof obj.id === "string" && obj.id.trim()) ? obj.id.trim() : slugify(obj.title ?? "campaign");
  const status = obj.status === "published" ? "published" : "draft";

  const chapterIds = new Set<string>();
  const chapters: CampaignChapter[] = (obj.chapters as any[]).map((ch, ci) => {
    const chId: string = (typeof ch?.id === "string" && ch.id.trim()) ? ch.id.trim() : uid("ch");
    if (chapterIds.has(chId)) push("error", `معرّف الفصل مكرّر: ${chId}`, `chapters[${ci}].id`);
    chapterIds.add(chId);
    if (typeof ch?.title !== "string" || !ch.title.trim()) {
      push("error", `الفصل #${ci + 1}: العنوان مطلوب.`, `chapters[${ci}].title`);
    }
    const activities: CampaignActivity[] = Array.isArray(ch?.activities)
      ? ch.activities.map((a: any, ai: number) => {
          const aType = canonicalActivityType(a?.type);
          if (!aType) {
            push("error", `نوع النشاط غير مدعوم: ${a?.type ?? "غير معرّف"}`, `chapters[${ci}].activities[${ai}].type`);
          }
          if (typeof a?.prompt !== "string" || !a.prompt.trim()) {
            push("error", `النشاط #${ai + 1}: نص السؤال مطلوب.`, `chapters[${ci}].activities[${ai}].prompt`);
          }
          return {
            id: (typeof a?.id === "string" && a.id) ? a.id : uid("act"),
            type: (aType ?? a?.type) as CampaignQuestionType,

            prompt: String(a?.prompt ?? ""),
            contextText: a?.contextText,
            options: Array.isArray(a?.options) ? a.options.map(String) : undefined,
            correctAnswer: a?.correctAnswer,
            correctOrder: Array.isArray(a?.correctOrder) ? a.correctOrder.map(String) : undefined,
            pairs: Array.isArray(a?.pairs) ? a.pairs : undefined,
            feedbackCorrect: a?.feedbackCorrect,
            feedbackWrong: a?.feedbackWrong,
            hint: a?.hint,
            xpReward: typeof a?.xpReward === "number" ? a.xpReward
              : typeof a?.xp === "number" ? a.xp : ACTIVITY_DEFAULTS.xpReward,
            coinsReward: typeof a?.coinsReward === "number" ? a.coinsReward
              : typeof a?.coins === "number" ? a.coins : ACTIVITY_DEFAULTS.coinsReward,
            heartsPenalty: typeof a?.heartsPenalty === "number" ? a.heartsPenalty
              : typeof a?.hearts_penalty === "number" ? a.hearts_penalty : ACTIVITY_DEFAULTS.heartsPenalty,
            difficulty: a?.difficulty,
            relatedFigure: a?.relatedFigure,
            relatedCity: a?.relatedCity,
            relatedBattle: a?.relatedBattle,
            relatedArtifact: a?.relatedArtifact,
          };
        })
      : [];
    // Accept snake_case rewards on chapters (xp, coins, hearts_penalty, unlocks).
    const chRewards = ch?.rewards && typeof ch.rewards === "object" ? { ...ch.rewards } : {};
    if (typeof ch?.xp === "number" && chRewards.xp == null) chRewards.xp = ch.xp;
    if (typeof ch?.coins === "number" && chRewards.coins == null) chRewards.coins = ch.coins;
    if (Array.isArray(ch?.unlocks) && chRewards.unlocks == null) chRewards.unlocks = ch.unlocks;
    return {
      id: chId,
      title: String(ch?.title ?? ""),
      subtitle: ch?.subtitle,
      introText: ch?.introText,
      historicalReadingText: ch?.historicalReadingText,
      order: typeof ch?.order === "number" ? ch.order : ci + 1,
      unlockRequirement: ch?.unlockRequirement,
      rewards: Object.keys(chRewards).length ? chRewards : undefined,
      activities,
    };
  });


  // Warn on missing registry references for unlocks.
  const allUnlocks: string[] = [
    ...(Array.isArray(obj.unlocks) ? obj.unlocks : []),
    ...(obj.finalRewards?.unlocks ?? []),
    ...chapters.flatMap(ch => ch.rewards?.unlocks ?? []),
  ];
  if (knownRegistryIds) {
    for (const u of allUnlocks) {
      if (!knownRegistryIds.has(u)) {
        push("warning", `عنصر سجل المحتوى غير موجود: ${u}`, "unlocks");
      }
    }
  }

  const normalized: Campaign = {
    id,
    slug: typeof obj.slug === "string" ? obj.slug : slugify(obj.title ?? id),
    title: String(obj.title ?? ""),
    subtitle: obj.subtitle,
    historicalPeriod: obj.historicalPeriod ?? obj.period,
    description: obj.description,
    coverImage: obj.coverImage,
    mapRegion: obj.mapRegion,
    category: obj.category,
    difficulty: obj.difficulty,
    estimatedDuration: obj.estimatedDuration,
    status,
    tags: Array.isArray(obj.tags) ? obj.tags.map(String) : undefined,
    chapters,
    finalRewards: obj.finalRewards ?? obj.rewards,

    unlocks: Array.isArray(obj.unlocks) ? obj.unlocks.map(String) : undefined,

    chronological_order: typeof obj.chronological_order === "number" ? obj.chronological_order
      : typeof obj.chronologicalOrder === "number" ? obj.chronologicalOrder : undefined,
    sort_year: typeof obj.sort_year === "number" ? obj.sort_year
      : typeof obj.sortYear === "number" ? obj.sortYear : undefined,
    worldSlug: typeof obj.worldSlug === "string" ? obj.worldSlug
      : typeof obj.world_slug === "string" ? obj.world_slug : undefined,
    era: typeof obj.era === "string" ? obj.era : undefined,
  };


  return { ok: !issues.some(i => i.level === "error"), issues, normalized };
}

// -------------------- Backups / Export --------------------

export function exportAllCampaigns(): string {
  return JSON.stringify(listCampaigns(), null, 2);
}

export function exportCampaign(id: string): string {
  const c = getCampaign(id);
  return c ? JSON.stringify(c, null, 2) : "";
}

export function snapshotBackup(label?: string): void {
  if (!isBrowser()) return;
  const backups = safeParse<any[]>(window.localStorage.getItem(BACKUPS_KEY), []);
  backups.unshift({
    at: new Date().toISOString(),
    label: label ?? "auto",
    campaigns: listCampaigns(),
    registry: safeParse(window.localStorage.getItem("irth_content_registry"), []),
  });
  // Keep last 10 only.
  window.localStorage.setItem(BACKUPS_KEY, JSON.stringify(backups.slice(0, 10)));
}

export function listBackups(): Array<{ at: string; label: string }> {
  if (!isBrowser()) return [];
  return safeParse<any[]>(window.localStorage.getItem(BACKUPS_KEY), [])
    .map(b => ({ at: b.at, label: b.label }));
}

export { uid, slugify };