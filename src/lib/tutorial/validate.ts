// ============================================================
// Guided Tutorial — Registry Validator (Phase 2B.5)
// ------------------------------------------------------------
// Fails loudly in development. Never a production dependency —
// the engine calls `validateTutorialConfigInDev()` at mount time,
// and it is a strict no-op when `import.meta.env.PROD` is true.
//
// Checks performed:
//   1. non-empty analyticsId on every step
//   2. no duplicate analyticsId inside a single tutorial
//   3. no duplicate targetId unless explicitly allowed via
//      `allowDuplicateTargetIds`
//   4. at least one enabled step
//   5. first enabled step resolves
//   6. last enabled step resolves
//   7. debugColor is a member of TUTORIAL_DEBUG_COLORS
//   8. disabled-only configs are rejected
//   9. `enabled` is a boolean
//  10. step `id` is non-empty and unique
// ============================================================

import { TUTORIAL_DEBUG_COLORS } from "./types";
import type { TutorialConfig, TutorialStep } from "./types";

export interface TutorialValidationOptions {
  /** When true, duplicate `targetId`s are permitted (e.g. two steps
   *  pointing at the same DOM anchor for A/B copy). Default false. */
  allowDuplicateTargetIds?: boolean;
}

export interface TutorialValidationIssue {
  code: string;
  message: string;
  stepIndex?: number;
  stepId?: string;
}

export interface TutorialValidationResult {
  ok: boolean;
  issues: TutorialValidationIssue[];
}

export function validateTutorialConfig(
  config: TutorialConfig,
  options: TutorialValidationOptions = {},
): TutorialValidationResult {
  const issues: TutorialValidationIssue[] = [];
  const steps = config.steps;

  const analyticsIds = new Set<string>();
  const stepIds = new Set<string>();
  const targetIds = new Set<string>();

  steps.forEach((step: TutorialStep, i: number) => {
    // Step id
    if (!step.id || typeof step.id !== "string") {
      issues.push({
        code: "step-id-missing",
        message: `Step at index ${i} has an empty id.`,
        stepIndex: i,
      });
    } else if (stepIds.has(step.id)) {
      issues.push({
        code: "step-id-duplicate",
        message: `Duplicate step id "${step.id}" at index ${i}.`,
        stepIndex: i,
        stepId: step.id,
      });
    } else {
      stepIds.add(step.id);
    }

    // analyticsId
    if (!step.analyticsId || typeof step.analyticsId !== "string") {
      issues.push({
        code: "analytics-id-missing",
        message: `Step "${step.id}" (index ${i}) has an empty analyticsId.`,
        stepIndex: i,
        stepId: step.id,
      });
    } else if (analyticsIds.has(step.analyticsId)) {
      issues.push({
        code: "analytics-id-duplicate",
        message: `Duplicate analyticsId "${step.analyticsId}" at step "${step.id}" (index ${i}).`,
        stepIndex: i,
        stepId: step.id,
      });
    } else {
      analyticsIds.add(step.analyticsId);
    }

    // targetId
    if (!options.allowDuplicateTargetIds) {
      if (targetIds.has(step.targetId)) {
        issues.push({
          code: "target-id-duplicate",
          message: `Duplicate targetId "${step.targetId}" at step "${step.id}" (index ${i}). Set allowDuplicateTargetIds to permit.`,
          stepIndex: i,
          stepId: step.id,
        });
      } else {
        targetIds.add(step.targetId);
      }
    }

    // enabled
    if (typeof step.enabled !== "boolean") {
      issues.push({
        code: "enabled-not-boolean",
        message: `Step "${step.id}" (index ${i}) has a non-boolean \`enabled\`.`,
        stepIndex: i,
        stepId: step.id,
      });
    }

    // debugColor
    if (!TUTORIAL_DEBUG_COLORS.includes(step.debugColor)) {
      issues.push({
        code: "debug-color-invalid",
        message: `Step "${step.id}" (index ${i}) has invalid debugColor "${String(step.debugColor)}". Allowed: ${TUTORIAL_DEBUG_COLORS.join(", ")}.`,
        stepIndex: i,
        stepId: step.id,
      });
    }
  });

  // Enabled-step invariants
  const enabled = steps.filter((s) => s.enabled === true);
  if (enabled.length === 0) {
    issues.push({
      code: "no-enabled-steps",
      message: `Tutorial "${config.id}" has zero enabled steps.`,
    });
  }
  if (steps.length > 0 && enabled.length === 0) {
    issues.push({
      code: "disabled-only",
      message: `Tutorial "${config.id}" has steps declared, but none are enabled.`,
    });
  }
  // First/last enabled MUST resolve (implicitly guaranteed by
  // enabled.length > 0, but we assert explicitly for clarity).
  if (enabled.length > 0) {
    if (!enabled[0]) {
      issues.push({
        code: "first-enabled-unresolvable",
        message: `First enabled step of "${config.id}" could not be resolved.`,
      });
    }
    if (!enabled[enabled.length - 1]) {
      issues.push({
        code: "last-enabled-unresolvable",
        message: `Last enabled step of "${config.id}" could not be resolved.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Dev-only strict validation. Throws in development if the config
 *  is invalid so misconfigurations are caught at boot. No-op in
 *  production builds. */
export function validateTutorialConfigInDev(
  config: TutorialConfig,
  options?: TutorialValidationOptions,
): void {
  // Vite exposes `import.meta.env.PROD`; guard for non-Vite
  // environments (Node test runners) where it may be undefined.
  const env: { PROD?: boolean; DEV?: boolean } | undefined = (
    import.meta as unknown as { env?: { PROD?: boolean; DEV?: boolean } }
  ).env;
  if (env?.PROD === true) return;

  const result = validateTutorialConfig(config, options);
  if (result.ok) return;

  const details = result.issues
    .map((iss) => ` • [${iss.code}] ${iss.message}`)
    .join("\n");
  const msg = `[tutorial] Invalid tutorial config "${config.id}":\n${details}`;
  // Loud failure — both a console.error and a thrown Error so tests
  // and dev boots surface the problem immediately.
  // eslint-disable-next-line no-console
  console.error(msg);
  throw new Error(msg);
}
