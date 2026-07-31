// ============================================================
// Campaign Progression — Integrity Audit
// ------------------------------------------------------------
// Pure diagnostics for the DYNAMIC unlock model. It never mutates
// state and never gates gameplay: it reports authoring problems so a
// new era added from the admin panel can be verified in seconds.
//
// Detects:
//   1. group_without_open_start  — a group with no open first campaign
//   2. campaign_without_group    — campaign with no valid group key
//   3. multiple_starts           — >1 campaign computed as group start
//   4. chain_break               — locked campaign after an unreachable one
//   5. chain_cycle               — authored condition loop between campaigns
//   6. divider_without_group     — visual divider with no live campaigns
//   7. group_without_divider     — live group with no visible divider
// ============================================================

import {
  computeSectionLockMap,
  deriveCampaignGroupKey,
  isActiveCampaign,
  isSpecialCampaign,
  type CampaignLike,
  type ProgressionState,
} from "./progression";

export type ProgressionIssueCode =
  | "group_without_open_start"
  | "campaign_without_group"
  | "multiple_starts"
  | "chain_break"
  | "chain_cycle"
  | "divider_without_group"
  | "group_without_divider";

export interface ProgressionIssue {
  code: ProgressionIssueCode;
  severity: "error" | "warning";
  /** Arabic, admin-facing. */
  message: string;
  groupKey?: string;
  campaignIds?: string[];
  dividerId?: string;
}

export interface AuditDividerLike {
  id?: string;
  title?: string;
  rawSectionKey?: string | null;
  sectionKey?: string | null;
  era?: string;
}

export interface AuditSection {
  divider?: AuditDividerLike | null;
  campaigns: readonly CampaignLike[];
}

export interface ProgressionAudit {
  issues: ProgressionIssue[];
  groups: {
    groupKey: string;
    dividerId: string | null;
    dividerTitle: string | null;
    total: number;
    active: number;
    startId: string | null;
  }[];
  ok: boolean;
}

const EMPTY_STATE: ProgressionState = { completedCampaignIds: new Set<string>() };

/** Full audit of the live feed. `state` defaults to a fresh player. */
export function auditCampaignProgression(
  sections: readonly AuditSection[] | undefined,
  state: ProgressionState = EMPTY_STATE,
): ProgressionAudit {
  const issues: ProgressionIssue[] = [];
  const groups = new Map<
    string,
    { campaigns: CampaignLike[]; divider: AuditDividerLike | null }
  >();

  (sections ?? []).forEach((s, i) => {
    const divider = s.divider ?? null;
    let touched = false;
    for (const c of s.campaigns ?? []) {
      const key = deriveCampaignGroupKey(c, divider, i);
      if (key.startsWith("index:")) {
        issues.push({
          code: "campaign_without_group",
          severity: "error",
          message: `الحملة «${c.title ?? c.id}» بلا مفتاح مجموعة صالح (section_key أو era).`,
          campaignIds: [c.id],
        });
      }
      const entry = groups.get(key);
      if (entry) {
        entry.campaigns.push(c);
        if (!entry.divider && divider) entry.divider = divider;
      } else {
        groups.set(key, { campaigns: [c], divider });
      }
      touched = true;
    }
    if (divider && !touched) {
      issues.push({
        code: "divider_without_group",
        severity: "warning",
        message: `الفاصل «${divider.title ?? divider.id}» لا يحتوي أي حملة — لا يسبب خطأ، لكنه فارغ.`,
        dividerId: divider.id,
      });
    }
  });

  const summary: ProgressionAudit["groups"] = [];

  for (const [groupKey, { campaigns, divider }] of groups) {
    const lockMap = computeSectionLockMap(campaigns, state);
    const active = campaigns.filter((c) => isActiveCampaign(c));
    const regular = active.filter((c) => !isSpecialCampaign(c));
    const starts = regular.filter((c) => lockMap.get(c.id)?.kind === "open");

    summary.push({
      groupKey,
      dividerId: divider?.id ?? null,
      dividerTitle: divider?.title ?? null,
      total: campaigns.length,
      active: active.length,
      startId: starts[0]?.id ?? null,
    });

    if (regular.length > 0 && starts.length === 0) {
      issues.push({
        code: "group_without_open_start",
        severity: "error",
        message: `المجموعة «${groupKey}» لا تملك حملة بداية مفتوحة.`,
        groupKey,
        campaignIds: regular.map((c) => c.id),
      });
    }
    if (starts.length > 1) {
      issues.push({
        code: "multiple_starts",
        severity: "error",
        message: `المجموعة «${groupKey}» فيها أكثر من حملة محسوبة كبداية.`,
        groupKey,
        campaignIds: starts.map((c) => c.id),
      });
    }
    if (active.length > 0 && !divider) {
      issues.push({
        code: "group_without_divider",
        severity: "warning",
        message: `المجموعة «${groupKey}» منشورة بلا فاصل مرئي — الحملة الأولى مفتوحة، لكن يُنصح بإضافة فاصل.`,
        groupKey,
      });
    }

    // Chain break: an unreachable campaign followed by more locked ones.
    let unreachableFrom: string | null = null;
    for (const c of regular) {
      const st = lockMap.get(c.id);
      if (!st) continue;
      if (unreachableFrom && st.locked) {
        issues.push({
          code: "chain_break",
          severity: "warning",
          message: `تسلسل المجموعة «${groupKey}» منقطع عند «${c.title ?? c.id}».`,
          groupKey,
          campaignIds: [unreachableFrom, c.id],
        });
        break;
      }
      if (st.locked && !isActiveCampaign(c)) unreachableFrom = c.id;
    }

    // Cycle detection over authored campaign→campaign conditions.
    const byId = new Map(campaigns.map((c) => [c.id, c]));
    for (const c of campaigns) {
      const seen = new Set<string>([c.id]);
      let cur: CampaignLike | undefined = c;
      while (cur?.unlock?.campaignId) {
        const next: string = cur.unlock.campaignId;
        if (seen.has(next)) {
          issues.push({
            code: "chain_cycle",
            severity: "error",
            message: `حلقة في شروط الفتح تبدأ من «${c.title ?? c.id}».`,
            groupKey,
            campaignIds: [...seen, next],
          });
          break;
        }
        seen.add(next);
        cur = byId.get(next);
      }
    }
  }

  return {
    issues,
    groups: summary,
    ok: issues.every((i) => i.severity !== "error"),
  };
}
