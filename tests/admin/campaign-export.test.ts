import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  buildEnvelope,
  buildAuditCsv,
  buildAuditReport,
  CSV_COLUMNS,
  type RawCampaignExportRow,
} from "@/lib/admin/campaignExport";

const campaign = (over: Partial<RawCampaignExportRow> = {}): RawCampaignExportRow => ({
  id: "c1",
  slug: "c-1",
  title: "حملة",
  status: "published",
  content_version: 3,
  published_at: null,
  has_unpublished_changes: false,
  updated_by: null,
  last_editor_email: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-02T00:00:00Z",
  key_art: { path: "a.jpg", square_path: null, credit: null, source: null },
  versions_count: 2,
  inbound_story_relations: [],
  draft_data: null,
  data: {
    chronological_order: 5,
    worldSlug: "abbasid",
    metadata: { core_entities: ["baghdad"] },
    chapters: [
      {
        id: "ch1",
        title: "الفصل",
        order: 1,
        rewards: { xp: 10, unlocks: ["story:s1"] },
        activities: [
          {
            id: "a1", type: "multiple_choice", order: 1, prompt: "س؟",
            options: ["أ", "ب"], correctAnswer: 0, explanation: "لأن…",
            xpReward: 5, coinsReward: 2, heartsPenalty: 1,
          },
        ],
      },
    ],
  },
  ...over,
});

describe("campaign export — fidelity", () => {
  it("emits data and draft_data verbatim and preserves ids/order/types", () => {
    const row = campaign();
    const env = buildEnvelope([row], { scope: "all", includeAudit: false });
    const out = env.campaigns[0];
    expect(out.id).toBe("c1");
    expect(out.data).toStrictEqual(row.data);
    expect(out.draft_data).toBe(null);
    expect(out.content_version).toBe(3);
    expect(out.versions_count).toBe(2);
    expect((out.data as any).chapters[0].activities[0].correctAnswer).toBe(0); // number, not string
    expect(env.counts).toEqual({ campaigns: 1, chapters: 1, activities: 1 });
    expect(out.derived.unlocks).toEqual(["story:s1"]);
    expect(out.derived.related_entities).toEqual(["baghdad"]);
  });

  it("CSV is one row per activity with the documented columns", () => {
    const env = buildEnvelope([campaign()], { scope: "all", includeAudit: false });
    const lines = buildAuditCsv(env.campaigns).split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("a1");
  });
});

describe("campaign export — audit", () => {
  const audit = (data: any) => buildAuditReport(buildEnvelope([campaign({ data })], { scope: "all", includeAudit: false }).campaigns);
  const codes = (data: any) => audit(data).campaigns[0].issues.map(i => i.code);

  it("passes a healthy campaign", () => {
    expect(audit(campaign().data).totals.errors).toBe(0);
  });

  it("flags empty chapters and missing options/answers", () => {
    expect(codes({ chapters: [] })).toContain("campaign_without_chapters");
    expect(codes({ chapters: [{ id: "ch1", title: "t", order: 1, activities: [] }] }))
      .toContain("chapter_without_activities");
    expect(codes({ chapters: [{ id: "ch1", title: "t", order: 1, activities: [
      { id: "a1", type: "multiple_choice", prompt: "س؟" },
    ] }] })).toEqual(expect.arrayContaining(["question_without_options", "question_without_correct_answer"]));
  });

  it("flags an answer that is not among the options and unknown types", () => {
    expect(codes({ chapters: [{ id: "ch1", title: "t", order: 1, activities: [
      { id: "a1", type: "multiple_choice", prompt: "س؟", options: ["أ", "ب"], correctAnswer: 7 },
    ] }] })).toContain("correct_answer_not_in_options");
    expect(codes({ chapters: [{ id: "ch1", title: "t", order: 1, activities: [
      { id: "a1", type: "mystery_type", prompt: "س؟" },
    ] }] })).toContain("unknown_activity_type");
  });

  it("does not flag reused narrative prompts", () => {
    const c = codes({ chapters: [{ id: "ch1", title: "t", order: 1, activities: [
      { id: "a1", type: "reading_then_question", prompt: "اقرأ المشهد.", contextText: "نص" },
      { id: "a2", type: "reading_then_question", prompt: "اقرأ المشهد.", contextText: "نص آخر" },
    ] }] });
    expect(c).not.toContain("duplicate_question_in_campaign");
  });

  it("flags unresolvable related entities when the registry is known", () => {
    const env = buildEnvelope([campaign()], { scope: "all", includeAudit: false });
    const rep = buildAuditReport(env.campaigns, new Set(["cordoba"]));
    expect(rep.campaigns[0].issues.map(i => i.code)).toContain("unresolvable_related_entity");
  });
});
