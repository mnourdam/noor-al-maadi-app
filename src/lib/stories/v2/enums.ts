// ============================================================
// Stories M5 — Frozen enum labels (Arabic) for the v2 editor UI.
// ------------------------------------------------------------
// Read-only reflection of the frozen M1/M2 enums. Never mutate
// or extend without a new migration.
// ============================================================

export const STORY_CATEGORY = [
  "event", "character", "city", "landmark", "battle",
  "artifact", "document", "daily_life", "analysis", "alternate_history",
] as const;
export type StoryCategory = (typeof STORY_CATEGORY)[number];
export const STORY_CATEGORY_LABEL: Record<StoryCategory, string> = {
  event: "حدث", character: "شخصية", city: "مدينة", landmark: "معلم",
  battle: "معركة", artifact: "قطعة أثرية", document: "وثيقة",
  daily_life: "حياة يومية", analysis: "تحليل", alternate_history: "تاريخ بديل",
};

export const STORY_RARITY = ["standard", "featured", "rare", "legendary"] as const;
export type StoryRarity = (typeof STORY_RARITY)[number];
export const STORY_RARITY_LABEL: Record<StoryRarity, string> = {
  standard: "قياسي", featured: "مميّزة", rare: "نادرة", legendary: "أسطورية",
};

export const STORY_LOCK_VISIBILITY = ["visible", "mystery", "hidden"] as const;
export type StoryLockVisibility = (typeof STORY_LOCK_VISIBILITY)[number];
export const STORY_LOCK_VISIBILITY_LABEL: Record<StoryLockVisibility, string> = {
  visible: "مرئية (مع شرح القفل)", mystery: "لغز (بلا كشف)", hidden: "مخفية تمامًا",
};

export const STORY_LENGTH_CLASS = ["short", "standard", "epic"] as const;
export type StoryLengthClass = (typeof STORY_LENGTH_CLASS)[number];
export const STORY_LENGTH_CLASS_LABEL: Record<StoryLengthClass, string> = {
  short: "قصيرة", standard: "قياسية", epic: "ملحمية",
};

export const STORY_HISTORICAL_CONFIDENCE = ["established", "debated", "speculative", "alternate"] as const;
export type StoryHistoricalConfidence = (typeof STORY_HISTORICAL_CONFIDENCE)[number];
export const STORY_HISTORICAL_CONFIDENCE_LABEL: Record<StoryHistoricalConfidence, string> = {
  established: "ثابتة", debated: "مختلف عليها", speculative: "افتراضية", alternate: "بديلة",
};

export const STORY_SNAPSHOT_TIER = ["core", "standard", "on_demand"] as const;
export type StorySnapshotTier = (typeof STORY_SNAPSHOT_TIER)[number];
export const STORY_SNAPSHOT_TIER_LABEL: Record<StorySnapshotTier, string> = {
  core: "أساسية (تُنزَّل دائمًا)", standard: "قياسية", on_demand: "عند الطلب",
};

export const STORY_TIME_PRECISION = ["day", "month", "year", "decade", "century", "period", "unknown"] as const;
export type StoryTimePrecision = (typeof STORY_TIME_PRECISION)[number];
export const STORY_TIME_PRECISION_LABEL: Record<StoryTimePrecision, string> = {
  day: "يوم", month: "شهر", year: "سنة", decade: "عقد",
  century: "قرن", period: "حقبة", unknown: "غير معروف",
};

export const STORY_PRODUCTION_STATUS = [
  "idea", "research", "writing", "json_ready", "imported",
  "images_in_progress", "images_linked", "testing", "completed",
] as const;
export type StoryProductionStatus = (typeof STORY_PRODUCTION_STATUS)[number];
export const STORY_PRODUCTION_STATUS_LABEL: Record<StoryProductionStatus, string> = {
  idea: "فكرة", research: "بحث", writing: "كتابة", json_ready: "جاهزة JSON",
  imported: "مستوردة", images_in_progress: "صور قيد الإعداد",
  images_linked: "صور مربوطة", testing: "اختبار", completed: "مكتملة",
};

// --- Relations enums (frozen M2) ---
export const STORY_RELATION_TARGET_TYPE = [
  "campaign", "campaign_chapter", "investigation", "encyclopedia_entity",
  "atlas_entity", "artifact", "achievement", "story", "collection",
  "today_in_history_event",
] as const;
export type StoryRelationTargetType = (typeof STORY_RELATION_TARGET_TYPE)[number];
export const STORY_RELATION_TARGET_TYPE_LABEL: Record<StoryRelationTargetType, string> = {
  campaign: "حملة", campaign_chapter: "فصل حملة", investigation: "تحقيق",
  encyclopedia_entity: "مدخل موسوعة", atlas_entity: "أطلس", artifact: "قطعة (محظور)",
  achievement: "إنجاز", story: "قصة", collection: "مجموعة", today_in_history_event: "حدث اليوم",
};

export const STORY_RELATION_ROLE = [
  "depicts", "mentions", "context", "prerequisite", "sequel_of",
  "prequel_of", "related_reading", "part_of_collection",
  "answers_investigation", "unlocks", "source_context",
] as const;
export type StoryRelationRole = (typeof STORY_RELATION_ROLE)[number];
export const STORY_RELATION_ROLE_LABEL: Record<StoryRelationRole, string> = {
  depicts: "يصوّر", mentions: "يذكر", context: "سياق",
  prerequisite: "متطلب سابق", sequel_of: "تابع لـ", prequel_of: "يسبق",
  related_reading: "قراءة ذات صلة", part_of_collection: "جزء من مجموعة",
  answers_investigation: "يجيب تحقيقًا", unlocks: "يفتح", source_context: "سياق مصدر",
};

// --- Sources enums (frozen M2) ---
export const STORY_SOURCE_KIND = [
  "book", "manuscript", "article", "quran", "hadith", "url", "archive", "other",
] as const;
export type StorySourceKind = (typeof STORY_SOURCE_KIND)[number];
export const STORY_SOURCE_KIND_LABEL: Record<StorySourceKind, string> = {
  book: "كتاب", manuscript: "مخطوطة", article: "مقالة", quran: "قرآن",
  hadith: "حديث", url: "رابط", archive: "أرشيف", other: "أخرى",
};
