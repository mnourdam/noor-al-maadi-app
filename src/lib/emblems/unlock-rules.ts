// ============================================================
// V17-08 — Emblem unlock rules (single client-side derivation)
// ------------------------------------------------------------
// The ONLY structured unlock rules that are actually enforced are
// the count-based ones that have a real, server-verifiable ledger:
//
//   campaign_count → public.user_campaign_completions
//   museum_count   → public.user_collection
//
// Every other gated emblem in AVATARS carries a free-text label that
// references content which does not exist in production (named
// campaigns / achievements). Those are NOT presented as earnable:
// they are `coming_soon` and are refused by the server too.
//
// This module derives the rule set from AVATARS so there is exactly one
// authored source; the server catalog table is generated from the same
// derivation.
// ============================================================

import { AVATARS, type HistoricalAvatar } from "@/lib/avatars";

export type EmblemUnlockRuleKind =
  | "default"
  | "campaign_count"
  | "museum_count"
  | "coming_soon";

export interface EmblemUnlockRule {
  kind: EmblemUnlockRuleKind;
  /** Only present for the count-based kinds. */
  threshold?: number;
}

/** Derive the enforced rule for a single emblem. */
export function emblemUnlockRule(avatar: HistoricalAvatar): EmblemUnlockRule {
  if (avatar.unlock_method === "default") return { kind: "default" };
  const t = avatar.unlock_requirement?.threshold;
  if (typeof t === "number" && Number.isFinite(t) && t > 0) {
    if (avatar.unlock_method === "museum") return { kind: "museum_count", threshold: Math.floor(t) };
    if (avatar.unlock_method === "campaign") return { kind: "campaign_count", threshold: Math.floor(t) };
  }
  return { kind: "coming_soon" };
}

/** id → rule, for the whole catalog. */
export const EMBLEM_UNLOCK_RULES: Record<string, EmblemUnlockRule> = Object.fromEntries(
  AVATARS.map((a) => [a.id, emblemUnlockRule(a)]),
);

export function ruleFor(emblemId: string): EmblemUnlockRule | null {
  return EMBLEM_UNLOCK_RULES[emblemId] ?? null;
}
