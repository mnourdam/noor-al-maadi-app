import type { AchievementId, TransitionOrigin, UserAchievementRecord } from "./types";

export interface TransitionDecisionInput {
  id: AchievementId;
  origin: TransitionOrigin;
  liveTransitionsReady: boolean;
  serverPersistedBeforeEvaluation: boolean;
  evaluatorSatisfied: boolean;
  reconcilerClassifiedAsNew: boolean;
  claimInserted?: boolean;
  claimExisting?: boolean;
  serverRecord?: UserAchievementRecord | null;
}

export interface TransitionDecision {
  notificationEmitted: boolean;
  suppressionReason: string | null;
}

export const SILENT_TRANSITION_ORIGINS: ReadonlySet<TransitionOrigin> = new Set([
  "startup_hydration",
  "historical_reconciliation",
  "historical_repair",
  "claim_ack",
  "guest_migration",
  "definition_backfill",
]);

export function isNotificationOrigin(origin: TransitionOrigin): boolean {
  return origin === "live_gameplay_unlock";
}

export function shouldEmitAchievementNotification(
  input: TransitionDecisionInput,
): TransitionDecision {
  if (!input.liveTransitionsReady) {
    return { notificationEmitted: false, suppressionReason: "live_transitions_not_ready" };
  }
  if (!isNotificationOrigin(input.origin)) {
    return { notificationEmitted: false, suppressionReason: `silent_origin:${input.origin}` };
  }
  if (!input.evaluatorSatisfied) {
    return { notificationEmitted: false, suppressionReason: "evaluator_not_satisfied" };
  }
  if (!input.reconcilerClassifiedAsNew) {
    return { notificationEmitted: false, suppressionReason: "not_a_new_transition" };
  }
  if (input.serverPersistedBeforeEvaluation) {
    return { notificationEmitted: false, suppressionReason: "server_already_persisted" };
  }
  if (input.claimExisting) {
    return { notificationEmitted: false, suppressionReason: "claim_conflict_existing" };
  }
  if (input.serverRecord?.presentedAt || input.serverRecord?.notifiedAt) {
    return { notificationEmitted: false, suppressionReason: "server_already_presented" };
  }
  if (input.claimInserted === false) {
    return { notificationEmitted: false, suppressionReason: "claim_not_inserted" };
  }
  return { notificationEmitted: true, suppressionReason: null };
}
