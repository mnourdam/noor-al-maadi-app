// ============================================================
// Stories — client-side scene health checks (P3 quality pass)
// ------------------------------------------------------------
// Pure functions. Complements the server-side publish validator:
// the server is the authority for blocking issues, this module
// gives live editor feedback WITHOUT a round-trip.
// ============================================================

import type { StoryRow, StorySceneRow, UnlockSpec } from "./types";
import type { StoryMediaRow } from "./media/dao";

export type HealthSeverity = "error" | "warning" | "info";

export interface HealthFinding {
  severity: HealthSeverity;
  code: string;
  message: string;
  sceneId?: string;
  sceneIndex?: number;
}

function walkUnlockIds(spec: UnlockSpec | null | undefined, out: string[]): void {
  if (!spec) return;
  if (spec.type === "story_completed" && spec.story_id) out.push(`story:${spec.story_id}`);
  if (spec.type === "campaign_completed" && spec.campaign_id) out.push(`campaign:${spec.campaign_id}`);
  if (spec.type === "investigation_completed" && spec.investigation_id) out.push(`investigation:${spec.investigation_id}`);
  spec.children?.forEach((c) => walkUnlockIds(c, out));
}

export function computeStoryHealth(
  story: StoryRow,
  scenes: StorySceneRow[],
  media: StoryMediaRow[],
): HealthFinding[] {
  const findings: HealthFinding[] = [];

  // Empty story
  if (scenes.length === 0) {
    findings.push({ severity: "error", code: "empty_story", message: "لا توجد مشاهد." });
    return findings;
  }

  // No cover
  if (!story.cover_media_id) {
    findings.push({ severity: "warning", code: "no_cover", message: "لا يوجد غلاف للقصة." });
  }

  // Duplicate scene_index
  const indexSeen = new Map<number, number>();
  for (const s of scenes) {
    indexSeen.set(s.scene_index, (indexSeen.get(s.scene_index) ?? 0) + 1);
  }
  for (const [idx, n] of indexSeen) {
    if (n > 1) {
      findings.push({
        severity: "error",
        code: "duplicate_order",
        message: `ترتيب مكرر (#${idx}) في ${n} مشاهد.`,
      });
    }
  }

  // Unreachable indices (gaps): scene_index should be 0..n-1
  const sorted = [...scenes].sort((a, b) => a.scene_index - b.scene_index);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].scene_index !== i) {
      findings.push({
        severity: "warning",
        code: "unreachable_scene",
        message: `فجوة في ترتيب المشاهد عند #${i}.`,
      });
      break;
    }
  }

  // Per-scene checks
  const attachedMediaIds = new Set<string>();
  if (story.cover_media_id) attachedMediaIds.add(story.cover_media_id);
  for (const s of scenes) {
    if (!s.title_ar || !s.title_ar.trim()) {
      findings.push({
        severity: "warning", code: "missing_title",
        message: "عنوان مفقود.",
        sceneId: s.id, sceneIndex: s.scene_index,
      });
    }
    const hasBody = s.payload && Object.keys(s.payload).length > 0;
    if (!hasBody) {
      findings.push({
        severity: "warning", code: "missing_body",
        message: "محتوى فارغ.",
        sceneId: s.id, sceneIndex: s.scene_index,
      });
    }
    if (s.scene_type === "reflection") {
      const prompt = (s.payload?.["prompt_ar"] ?? s.payload?.["prompt"]) as string | undefined;
      if (!prompt || !prompt.trim()) {
        findings.push({
          severity: "warning", code: "invalid_reflection",
          message: "مشهد تأمّل بدون سؤال (prompt_ar).",
          sceneId: s.id, sceneIndex: s.scene_index,
        });
      }
    }
    if (s.primary_media_id) attachedMediaIds.add(s.primary_media_id);
  }

  // Orphan media (uploaded to story but not referenced)
  for (const m of media) {
    if (m.story_id === story.id && !attachedMediaIds.has(m.id)) {
      findings.push({
        severity: "info", code: "orphan_media",
        message: `وسائط غير مرتبطة: ${m.preset} (${(m.byte_size / 1024).toFixed(0)}KB).`,
      });
    }
  }

  // Invalid unlock references — surface unresolved ids for a manual check
  const unlockIds: string[] = [];
  walkUnlockIds(story.unlock_spec, unlockIds);
  if (unlockIds.length > 0) {
    findings.push({
      severity: "info", code: "unlock_references",
      message: `شرط الفتح يعتمد على: ${unlockIds.join(", ")}. تحقق من وجودها.`,
    });
  }

  return findings;
}

export function summarizeHealth(findings: HealthFinding[]): {
  errors: number; warnings: number; infos: number;
} {
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length,
  };
}
