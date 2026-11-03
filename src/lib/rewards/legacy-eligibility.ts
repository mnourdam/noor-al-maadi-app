/** Inactive pure planner. Type-only input: no storage, identity, RPC or persistence imports. */
import type {
  CandidateState,
  ImportCandidate,
  LegacyInventory,
  LegacySource,
} from "./legacy-inventory";

export const ELIGIBILITY_POLICY = "v18-legacy-eligibility-1";
export const SETTLEMENT_DOMAINS = [
  "campaign_rewards",
  "story_rewards",
  "investigation_rewards",
  "game_rewards",
  "memory_rewards",
  "daily_quest_rewards",
  "economy_spending",
  "hearts_and_cooldowns",
] as const;
export type SettlementDomain = (typeof SETTLEMENT_DOMAINS)[number];
export type SourceCategory = "A" | "B" | "C" | "D";
export interface PlanReason {
  code: string;
  source?: LegacySource;
}
export interface Decision {
  status: "blocked" | "insufficient_evidence";
  reasons: PlanReason[];
}
export interface SourceAssessment {
  source: LegacySource;
  readerState: CandidateState;
  category: SourceCategory;
  domains: SettlementDomain[];
  basis: string;
}
export interface EligibilityPlan {
  policy: typeof ELIGIBILITY_POLICY;
  baselineEligibility: {
    status: "eligible_candidate" | "blocked" | "insufficient_evidence";
    reasons: PlanReason[];
    profileGroup?: {
      sources: LegacySource[];
      equivalence: "single_source" | "exact_raw";
      historicalOwnership: "not_proven";
    };
  };
  stagingEligibility: { status: "requires_writer_fence" | "blocked"; reasons: PlanReason[] };
  settlementReadinessByDomain: Record<SettlementDomain, Decision>;
  migrationReadiness: Decision;
  authorityActivationEligibility: Decision;
  blockers: Array<
    PlanReason & {
      decision: "baseline" | "staging" | "settlement" | "activation";
      domain?: SettlementDomain;
    }
  >;
  quarantinedSources: SourceAssessment[];
  sourceAssessments: SourceAssessment[];
}
const PROFILE = "hakaya.profile.v2";
const ALL = [...SETTLEMENT_DOMAINS];
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const amount = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const integer = (v: unknown): v is number => amount(v) && Number.isSafeInteger(v);
const numericMap = (v: unknown, whole = false) =>
  record(v) && Object.values(v).every(whole ? integer : amount);
function classify(key: string): {
  category: SourceCategory;
  domains: SettlementDomain[];
  basis: string;
} {
  if (key === PROFILE)
    return {
      category: "A",
      domains: ALL,
      basis:
        "profile.tsx: stored wallet, heart tuple, cooldowns and purchased hints; mixed reward fields cannot be salvaged from a corrupt profile",
    };
  if (["irth.campaign.ordering.help.v3", "irth.games.whoami.help.v1"].includes(key))
    return {
      category: "A",
      domains: ["economy_spending", "hearts_and_cooldowns"],
      basis:
        "ordering-help.ts / who-am-i-help.ts: paid intent/reveal state accompanies separate profile debits; opaque spending must remain unresolved",
    };
  if (key.startsWith("irth.outbox."))
    return {
      category: "A",
      domains: ALL,
      basis:
        "outbox.ts / dead-letter.ts: opaque containers may carry profile_delta and rejected monetary operations; no safe operation-level split admitted",
    };
  if (
    [
      "irth_campaign_ledger_v1",
      "irth_campaign_grants_v1",
      "irth_campaign_grants_v2",
      "irth_campaign_progress",
      "irth_campaign_progress.backup_v1",
      "irth.campaign_completions.v1",
      "irth.campaign_progress_buffer.v1",
    ].includes(key)
  )
    return {
      category: "B",
      domains: ["campaign_rewards"],
      basis:
        "campaignLedger/progress/grant adapters: claims, completion and pending chapter/collection evidence affect campaign dedup, never prove profile delivery; mixed blob retained as a domain barrier",
    };
  if (key === "irth.guest.storyCompletions.v1" || key.startsWith("irth.story_progress_mirror.v1."))
    return {
      category: "B",
      domains: ["story_rewards"],
      basis:
        "guestCompletions / progress-mirror: completed-content guards are not local delivery acknowledgements",
    };
  if (key.startsWith("irth.inv.backfilled.v1:") || key.startsWith("irth.investigations."))
    return {
      category: "B",
      domains: ["investigation_rewards"],
      basis:
        "investigations/progress / worlds-progress: completion/backfill history affects replay eligibility",
    };
  if (key === "irth.game-completions.guest.v1" || key.startsWith("irth.daily-challenges."))
    return {
      category: "B",
      domains: ["game_rewards"],
      basis:
        "guestCompletions / dailyChallengeService: completion and selection facts cannot be discarded as cosmetic state",
    };
  if (key === "irth.memory.history.v1" || key.startsWith("irth.memory.plan."))
    return {
      category: "B",
      domains: ["memory_rewards"],
      basis:
        "memory/history, plan and rewards: grantedAttemptIds and review attempts gate XP; no separation of mixed histories is assumed",
    };
  if (key.startsWith("irth.daily-quest."))
    return {
      category: "B",
      domains: ["daily_quest_rewards"],
      basis: "daily-quest.ts: rewarded flags and target/read history influence reward eligibility",
    };
  if (
    ["irth.achievements.v2.guest_unlocks", "irth.achievements.v2.notified"].includes(key) ||
    key.startsWith("irth.entityDiscoveries.")
  )
    return {
      category: "B",
      domains: ALL,
      basis:
        "achievement reconciliation / discovery eligibility: not proven presentation-only; cross-domain reward evidence is quarantined conservatively",
    };
  // Deliberately one narrow C rule, not a general cache/notification exemption.
  if (key.startsWith("irth.stories.unlock.v1:"))
    return {
      category: "C",
      domains: [],
      basis:
        "stories/unlock-cache.ts: signed access cache only; no wallet/debit/grant or delivery record. Quarantine never authorizes story access",
    };
  return {
    category: "D",
    domains: ALL,
    basis: "source has no admitted economic-independence classification",
  };
}
function owned(source: LegacySource, owner: string): boolean {
  if (!["local", "session"].includes(source.store)) return false;
  if (source.ownership === "physical_suffix")
    return source.physicalKey === `${source.logicalKey}::owner=${owner}`;
  return (
    source.ownership === "owner_prefix" &&
    source.logicalKey === "irth.campaign.ordering.help.v3" &&
    source.physicalKey === `${owner}:${source.logicalKey}`
  );
}
function parseProfile(c: ImportCandidate): Record<string, unknown> | undefined {
  if (c.raw === undefined || !c.economicFields || !["valid", "ambiguous"].includes(c.state)) return;
  if (c.state === "ambiguous" && c.reason !== "multiple_profile_sources") return;
  try {
    const v: unknown = JSON.parse(c.raw);
    return record(v) ? v : undefined;
  } catch {
    return;
  }
}
/** Pure snapshot evaluation; expected identity is caller data, never a live owner lookup. */
export function planLegacyImport(
  inventory: LegacyInventory,
  expected: { owner: string; epoch: number },
): EligibilityPlan {
  const plan: EligibilityPlan = {
    policy: ELIGIBILITY_POLICY,
    baselineEligibility: { status: "insufficient_evidence", reasons: [] },
    stagingEligibility: {
      status: "blocked",
      reasons: [{ code: "writer_fence_unproven" }, { code: "no_staged_import" }],
    },
    settlementReadinessByDomain: Object.fromEntries(
      SETTLEMENT_DOMAINS.map((domain) => [
        domain,
        {
          status: "insufficient_evidence",
          reasons: [
            { code: "delivery_contract_not_integrated" },
            { code: "legacy_history_not_delivery_proof" },
          ],
        },
      ]),
    ) as Record<SettlementDomain, Decision>,
    migrationReadiness: {
      status: "blocked",
      reasons: [{ code: "writer_fence_unproven" }, { code: "no_staged_import" }],
    },
    authorityActivationEligibility: {
      status: "blocked",
      reasons: [{ code: "legacy_writers_not_protected" }, { code: "no_ready_import" }],
    },
    blockers: [],
    quarantinedSources: [],
    sourceAssessments: [],
  };
  const baseline = plan.baselineEligibility;
  function baselineBlock(code: string, source?: LegacySource) {
    baseline.status = "blocked";
    baseline.reasons.push({ code, source: source ? { ...source } : undefined });
  }
  function domainBlock(domains: SettlementDomain[], code: string, source?: LegacySource) {
    for (const domain of domains) {
      const d = plan.settlementReadinessByDomain[domain];
      d.status = "blocked";
      d.reasons.push({ code, source: source ? { ...source } : undefined });
    }
  }
  function finish(): EligibilityPlan {
    if (baseline.status === "eligible_candidate") {
      plan.stagingEligibility.status = "requires_writer_fence";
      plan.stagingEligibility.reasons.push({
        code: "historical_owner_attribution_review_required",
      });
    }
    for (const reason of baseline.reasons)
      if (baseline.status !== "eligible_candidate")
        plan.blockers.push({ ...reason, decision: "baseline" });
    for (const reason of plan.stagingEligibility.reasons)
      plan.blockers.push({ ...reason, decision: "staging" });
    for (const domain of SETTLEMENT_DOMAINS)
      for (const reason of plan.settlementReadinessByDomain[domain].reasons)
        plan.blockers.push({ ...reason, decision: "settlement", domain });
    for (const reason of plan.authorityActivationEligibility.reasons)
      plan.blockers.push({ ...reason, decision: "activation" });
    return plan;
  }
  // Aborted/global failures cannot be rescued from any tentative candidate payload.
  if (
    inventory.owner !== expected.owner ||
    inventory.epoch !== expected.epoch ||
    !/^(user|guest):.+/.test(expected.owner) ||
    !integer(expected.epoch) ||
    inventory.reason !== undefined ||
    ["owner_mismatch", "changed_during_read"].includes(inventory.state) ||
    (!inventory.complete && !inventory.candidates.length)
  ) {
    baselineBlock("reader_report_unusable");
    domainBlock(ALL, "reader_report_unusable");
    return finish();
  }
  const candidateFailure = inventory.candidates.some(
    (c) => !["valid", "missing"].includes(c.state),
  );
  if (inventory.candidates.length && inventory.complete === candidateFailure) {
    baselineBlock("inconsistent_reader_completeness");
    domainBlock(ALL, "inconsistent_reader_completeness");
    return finish();
  }
  const expectedSummary =
    (["unreadable", "owner_mismatch", "corrupt", "ambiguous"] as const).find((state) =>
      inventory.candidates.some((c) => c.state === state),
    ) ?? (inventory.candidates.some((c) => c.state === "valid") ? "valid" : "missing");
  if (inventory.state !== expectedSummary) {
    baselineBlock("inconsistent_reader_summary");
    domainBlock(ALL, "inconsistent_reader_summary");
    return finish();
  }
  const ids = new Set<string>();
  for (const c of inventory.candidates) {
    const id = JSON.stringify([c.source.store, c.source.physicalKey]);
    if (
      ![
        "missing",
        "valid",
        "corrupt",
        "unreadable",
        "owner_mismatch",
        "ambiguous",
        "changed_during_read",
      ].includes(c.state) ||
      !["local", "session"].includes(c.source.store) ||
      (c.source.ownership === "unproven" && c.source.physicalKey !== c.source.logicalKey) ||
      ids.has(id) ||
      ["owner_mismatch", "changed_during_read"].includes(c.state) ||
      (c.source.ownership !== "unproven" && !owned(c.source, expected.owner))
    ) {
      baselineBlock("source_identity_or_snapshot_conflict");
      domainBlock(ALL, "source_identity_or_snapshot_conflict");
      return finish();
    }
    ids.add(id);
    const original = classify(c.source.logicalKey);
    const assessment: SourceAssessment = {
      source: { ...c.source },
      readerState: c.state,
      ...original,
      domains: [...original.domains],
    };
    if (c.source.ownership === "unproven") {
      assessment.category = "D";
      assessment.basis =
        "unattributed global source: current login, suffix of another key and timestamps do not establish ownership";
    }
    plan.sourceAssessments.push(assessment);
    if (c.state === "missing") continue;
    if (assessment.category === "D") {
      plan.quarantinedSources.push(assessment);
      if (original.category === "A" || original.category === "D")
        baselineBlock("unattributed_or_unsafe_economic_source", c.source);
      domainBlock(original.domains, "unattributed_source_quarantined", c.source);
    } else if (assessment.category === "A" && c.source.logicalKey !== PROFILE) {
      // Current reader admits no spend/outbox decoder; even a forged `valid` is not proof.
      plan.quarantinedSources.push(assessment);
      baselineBlock("unresolved_economic_operation", c.source);
      domainBlock(assessment.domains, "unresolved_economic_operation", c.source);
    } else if (assessment.category === "B") {
      plan.quarantinedSources.push(assessment);
      domainBlock(
        assessment.domains,
        c.state === "valid" ? "legacy_evidence_not_delivery_proof" : "unresolved_reward_evidence",
        c.source,
      );
    } else if (assessment.category === "C" && c.state !== "valid") {
      plan.quarantinedSources.push(assessment);
    }
  }
  const profiles = inventory.candidates.filter(
    (c) => c.source.logicalKey === PROFILE && c.state !== "missing",
  );
  const scoped = profiles.filter((c) => owned(c.source, expected.owner));
  if (!scoped.length) {
    if (baseline.status !== "blocked") baseline.reasons.push({ code: "profile_missing" });
  } else {
    const decoded = scoped.map(parseProfile);
    if (decoded.some((v) => !v)) baselineBlock("profile_not_admitted_or_unreadable");
    else if (
      scoped.length > 2 ||
      (scoped.length === 2 &&
        (scoped[0].source.store === scoped[1].source.store || scoped[0].raw !== scoped[1].raw))
    )
      baselineBlock("conflicting_profile_sources");
    else {
      const v = decoded[0]!;
      const required = [
        "points",
        "dinars",
        "hearts",
        "heartsAt",
        "activityCooldowns",
        "hintsPurchased",
      ];
      const missing = required.filter((key) => !Object.hasOwn(v, key));
      if (missing.length) {
        if (baseline.status !== "blocked")
          baseline.reasons.push({ code: "protected_fields_missing" });
      } else if (
        !amount(v.points) ||
        !amount(v.dinars) ||
        !integer(v.hearts) ||
        v.hearts > 5 ||
        !integer(v.heartsAt) ||
        !numericMap(v.activityCooldowns) ||
        !numericMap(v.hintsPurchased, true) ||
        scoped.some((c) =>
          required.some(
            (key) => JSON.stringify(c.economicFields?.[key]) !== JSON.stringify(v[key]),
          ),
        )
      )
        baselineBlock("protected_fields_invalid_or_projection_conflict");
      else if (baseline.status !== "blocked") {
        baseline.status = "eligible_candidate";
        baseline.reasons = [
          {
            code:
              scoped.length === 2
                ? "conditional_exact_raw_profile_group"
                : "validated_scoped_profile_candidate",
          },
          { code: "namespace_is_not_historical_ownership_proof" },
        ];
        baseline.profileGroup = {
          sources: scoped.map((c) => ({ ...c.source })),
          equivalence: scoped.length === 2 ? "exact_raw" : "single_source",
          historicalOwnership: "not_proven",
        };
        // Mixed profile reward history is kept separate from its validated wallet fields.
        const fields: Array<[string[], SettlementDomain[]]> = [
          [["campaignsCompleted"], ["campaign_rewards"]],
          [["storiesRead"], ["story_rewards"]],
          [["investigationsCompleted"], ["investigation_rewards"]],
          [
            [
              "missionsCompleted",
              "puzzlesSolved",
              "whoSolved",
              "timelinesCompleted",
              "decisionsCompleted",
            ],
            ["game_rewards"],
          ],
          [
            [
              "badges",
              "titlesEarned",
              "artifactsFound",
              "charactersUnlocked",
              "streakMilestonesClaimed",
            ],
            ALL,
          ],
        ];
        for (const [keys, domains] of fields)
          if (keys.some((key) => Array.isArray(v[key]) && v[key].length > 0))
            domainBlock(domains, "profile_legacy_history_not_delivery_proof", scoped[0].source);
        if (
          record(v.dailyClaimed) &&
          Array.isArray(v.dailyClaimed.ids) &&
          v.dailyClaimed.ids.length
        )
          domainBlock(
            ["daily_quest_rewards"],
            "profile_daily_claim_history_unknown",
            scoped[0].source,
          );
      }
    }
  }
  if (baseline.status !== "eligible_candidate") domainBlock(ALL, "baseline_not_eligible");
  return finish();
}
