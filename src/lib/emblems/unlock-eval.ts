// ============================================================
// V17-08 — Emblem unlock evaluator (presentation + client gating)
// ------------------------------------------------------------
// Mirrors public.emblem_is_equippable_v1 exactly:
//
//   default        → always
//   campaign_count → completed campaigns >= threshold
//   museum_count   → museum items owned  >= threshold
//   coming_soon    → never (labelled «قريبًا», no fake requirement)
//   equipped id    → always allowed (legacy ownership is never stripped)
//
// The counts MUST come from the same ledgers the server counts, which is
// why the signed-in context is fetched from the server (see
// useEmblemUnlockContext). Guests evaluate against local device evidence
// and never gain server-side ownership.
// ============================================================

import type { HistoricalAvatar } from "@/lib/avatars";
import { emblemUnlockRule, type EmblemUnlockRuleKind } from "./unlock-rules";

export interface EmblemUnlockContext {
  /** Distinct completed campaigns. */
  campaignsCompleted: number;
  /** Museum items owned. */
  museumItems: number;
  /** Currently equipped emblem id — always allowed, never stripped. */
  equippedId?: string | null;
}

export interface EmblemUnlockState {
  unlocked: boolean;
  kind: EmblemUnlockRuleKind;
  comingSoon: boolean;
  /** Exact Arabic requirement — matches what the server enforces. */
  requirementText: string;
  /** Present only when the requirement is a real, countable threshold. */
  progress: { current: number; goal: number; text: string } | null;
}

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export function toArabicDigits(n: number): string {
  return String(Math.max(0, Math.floor(n)))
    .split("")
    .map((c) => AR_DIGITS[Number(c)] ?? c)
    .join("");
}

function campaignRequirementText(n: number): string {
  if (n === 1) return "أكمل حملة واحدة";
  if (n === 2) return "أكمل حملتين";
  if (n <= 10) return `أكمل ${toArabicDigits(n)} حملات`;
  return `أكمل ${toArabicDigits(n)} حملة`;
}

function museumRequirementText(n: number): string {
  return `اجمع ${toArabicDigits(n)} قطعة في المتحف`;
}

export const COMING_SOON_LABEL = "قريبًا";
export const AVAILABLE_LABEL = "متاح";

export function evaluateEmblemUnlock(
  avatar: HistoricalAvatar,
  ctx: EmblemUnlockContext,
): EmblemUnlockState {
  const rule = emblemUnlockRule(avatar);
  const equipped = Boolean(ctx.equippedId) && ctx.equippedId === avatar.id;

  if (rule.kind === "default") {
    return { unlocked: true, kind: rule.kind, comingSoon: false, requirementText: AVAILABLE_LABEL, progress: null };
  }

  if (rule.kind === "coming_soon") {
    return {
      unlocked: equipped,
      kind: rule.kind,
      comingSoon: true,
      requirementText: COMING_SOON_LABEL,
      progress: null,
    };
  }

  const goal = rule.threshold ?? 0;
  const current =
    rule.kind === "campaign_count"
      ? Math.max(0, Math.floor(ctx.campaignsCompleted || 0))
      : Math.max(0, Math.floor(ctx.museumItems || 0));

  return {
    unlocked: equipped || current >= goal,
    kind: rule.kind,
    comingSoon: false,
    requirementText:
      rule.kind === "campaign_count" ? campaignRequirementText(goal) : museumRequirementText(goal),
    progress: {
      current,
      goal,
      text: `${toArabicDigits(Math.min(current, goal))}/${toArabicDigits(goal)}`,
    },
  };
}
