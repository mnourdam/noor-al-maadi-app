// ============================================================
// Stories envelope normalization (v1 → v2)
// ------------------------------------------------------------
// The legacy exporter (`admin_export_stories`) still emits
//   { version: 1, exported_at, stories: [ { ..., scenes, media } ] }
// while the frozen importer (`admin_import_stories_v2_*`) only accepts
// the deterministic v2 envelope. This module is the single client-side
// adapter between the two shapes so any file the system ever produced
// can be re-imported without hand editing.
//
// It is pure and network-free: no DB contract, no Library Story logic
// is changed here.
// ============================================================

import type {
  StoryExportEnvelopeV2,
  StoryExportItemV2,
} from "./import-v2";

export const CAMPAIGN_INTRO_KIND = "campaign_intro" as const;

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** True when a payload already claims the v2 envelope contract. */
export function isEnvelopeV2(raw: unknown): boolean {
  return obj(raw).envelope_version === 2;
}

/**
 * Accepts:
 *  - a v2 envelope (returned untouched),
 *  - a legacy v1 bundle `{ version: 1, stories: [...] }`,
 *  - a bare array of story items,
 *  - a single story item object.
 * Always returns a v2 envelope the importer accepts.
 */
export function normalizeStoryEnvelope(raw: unknown): StoryExportEnvelopeV2 {
  if (isEnvelopeV2(raw)) return raw as StoryExportEnvelopeV2;

  const root = obj(raw);
  const rawStories = Array.isArray(raw)
    ? raw
    : Array.isArray(root.stories)
      ? (root.stories as unknown[])
      : root.id || root.slug
        ? [raw]
        : [];

  const media: StoryExportEnvelopeV2["media"] = [];
  const seenMedia = new Set<string>();
  const stories: StoryExportItemV2[] = [];

  for (const entry of rawStories) {
    const s = obj(entry);
    const storyId = str(s.id) ?? "";

    // Hoist per-story media (v1 nests it) to the envelope root.
    for (const m of arr(s.media)) {
      const mm = obj(m);
      const mid = str(mm.id);
      if (!mid || seenMedia.has(mid)) continue;
      seenMedia.add(mid);
      media.push({
        id: mid,
        story_id: str(mm.story_id) ?? storyId ?? null,
        owner_scope: str(mm.owner_scope) ?? "story",
        collection_id: str(mm.collection_id),
        kind: str(mm.kind) ?? "image",
        storage_bucket: str(mm.storage_bucket) ?? "",
        storage_path: str(mm.storage_path) ?? "",
        mime_type: str(mm.mime_type) ?? "",
        byte_size: Number(mm.byte_size ?? 0),
        width: Number(mm.width ?? 0),
        height: Number(mm.height ?? 0),
        checksum_sha256: str(mm.checksum_sha256) ?? "",
        preset: str(mm.preset) ?? "",
        processing_version: Number(mm.processing_version ?? 1),
        metadata: obj(mm.metadata),
      });
    }

    stories.push(normalizeStoryItem(s));
  }

  return {
    envelope_version: 2,
    generator: str(root.generator) ?? "irth-v1-adapter",
    exported_at: str(root.exported_at) ?? new Date().toISOString(),
    story_ids: stories.map((s) => s.id),
    stories,
    collections: (arr(root.collections) as StoryExportEnvelopeV2["collections"]) ?? [],
    media: [...(arr(root.media) as StoryExportEnvelopeV2["media"]), ...media],
  };
}

const CAMPAIGN_INTRO_TAG_LOCAL = "campaign-intro";

function normalizeStoryItem(s: Json): StoryExportItemV2 {
  const id = str(s.id) ?? "";
  // A campaign intro is identified by `metadata.kind`. The library exclusion
  // reads the tag, so the two are kept in lockstep at import time — an intro
  // can never leak into the story library because a tag was missing.
  const rawTags = arr(s.tags).filter((t): t is string => typeof t === "string");
  const isIntro = str(obj(s.metadata).kind) === CAMPAIGN_INTRO_KIND;
  const tags =
    isIntro && !rawTags.includes(CAMPAIGN_INTRO_TAG_LOCAL)
      ? [...rawTags, CAMPAIGN_INTRO_TAG_LOCAL]
      : rawTags;
  return {

    id,
    slug: str(s.slug) ?? id,
    schema_version: 2,
    title_ar: str(s.title_ar) ?? "",
    title_en: str(s.title_en),
    summary_ar: str(s.summary_ar),
    summary_en: str(s.summary_en),
    world_slug: str(s.world_slug),
    era: str(s.era),
    display_order: Number(s.display_order ?? 0),
    status: str(s.status) ?? "draft",
    unlock_spec: s.unlock_spec ?? null,
    cover_media_id: str(s.cover_media_id),
    xp_reward: Number(s.xp_reward ?? 0),
    dinar_reward: Number(s.dinar_reward ?? 0),
    metadata: obj(s.metadata),
    category: str(s.category) ?? "event",
    rarity: str(s.rarity) ?? "standard",
    production_status: str(s.production_status) ?? "idea",
    lock_visibility: str(s.lock_visibility) ?? "visible",
    historical_confidence: str(s.historical_confidence) ?? "established",
    hijri_start_year: numOrNull(s.hijri_start_year),
    hijri_start_month: numOrNull(s.hijri_start_month),
    hijri_start_day: numOrNull(s.hijri_start_day),
    hijri_end_year: numOrNull(s.hijri_end_year),
    hijri_end_month: numOrNull(s.hijri_end_month),
    hijri_end_day: numOrNull(s.hijri_end_day),
    gregorian_start: str(s.gregorian_start),
    gregorian_end: str(s.gregorian_end),
    story_collection_id: str(s.story_collection_id),
    collection_order: numOrNull(s.collection_order),
    time_precision: str(s.time_precision) ?? "unknown",
    length_class: str(s.length_class) ?? "standard",
    tags,
    snapshot_tier: str(s.snapshot_tier) ?? "standard",
    scenes: arr(s.scenes).map((sc) => {
      const x = obj(sc);
      return {
        id: str(x.id) ?? "",
        scene_index: Number(x.scene_index ?? 0),
        scene_type: str(x.scene_type) ?? "text",
        schema_version: 2 as const,
        title_ar: str(x.title_ar),
        title_en: str(x.title_en),
        payload: obj(x.payload),
        primary_media_id: str(x.primary_media_id),
      };
    }),
    relations: (arr(s.relations) as StoryExportItemV2["relations"]) ?? [],
    sources: (arr(s.sources) as StoryExportItemV2["sources"]) ?? [],
  };
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined || v === "" ? null : Number(v);
}

// ============================================================
// Campaign Intro helpers
// ============================================================

export function isCampaignIntroItem(item: { metadata?: unknown; tags?: unknown }): boolean {
  const kind = str(obj(item.metadata).kind);
  if (kind === CAMPAIGN_INTRO_KIND) return true;
  return arr(item.tags).includes(CAMPAIGN_INTRO_TAG_LOCAL);
}

export function campaignIdOfItem(item: { metadata?: unknown }): string | null {
  return str(obj(item.metadata).campaign_id);
}

export interface IntroValidationIssue {
  storyId: string;
  code:
    | "not_campaign_intro"
    | "missing_campaign_id"
    | "unknown_campaign"
    | "duplicate_published_intro";
  detail?: string;
}

export interface IntroValidationInput {
  /** Campaign ids known to the system. */
  knownCampaignIds: Set<string>;
  /** campaign_id → story id of an already published intro. */
  publishedIntroByCampaign: Map<string, string>;
  /** Allow replacing an existing published intro for the same campaign. */
  allowReplace?: boolean;
}

/** Validates a v2 envelope as a Campaign Intro bundle. Pure. */
export function validateCampaignIntroEnvelope(
  envelope: StoryExportEnvelopeV2,
  input: IntroValidationInput,
): { ok: boolean; issues: IntroValidationIssue[] } {
  const issues: IntroValidationIssue[] = [];

  for (const s of envelope.stories) {
    if (!isCampaignIntroItem(s)) {
      issues.push({ storyId: s.id, code: "not_campaign_intro" });
      continue;
    }
    const campaignId = campaignIdOfItem(s);
    if (!campaignId) {
      issues.push({ storyId: s.id, code: "missing_campaign_id" });
      continue;
    }
    if (!input.knownCampaignIds.has(campaignId)) {
      issues.push({ storyId: s.id, code: "unknown_campaign", detail: campaignId });
      continue;
    }
    const existing = input.publishedIntroByCampaign.get(campaignId);
    if (existing && existing !== s.id && !input.allowReplace) {
      issues.push({ storyId: s.id, code: "duplicate_published_intro", detail: existing });
    }
  }

  return { ok: issues.length === 0, issues };
}

export const INTRO_ISSUE_LABEL: Record<IntroValidationIssue["code"], string> = {
  not_campaign_intro: "الملف ليس افتتاحية حملة (metadata.kind ≠ campaign_intro).",
  missing_campaign_id: "لا يوجد metadata.campaign_id.",
  unknown_campaign: "الحملة المستهدفة غير موجودة.",
  duplicate_published_intro: "توجد افتتاحية منشورة لهذه الحملة بالفعل.",
};
