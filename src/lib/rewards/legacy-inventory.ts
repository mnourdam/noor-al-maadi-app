/** Stage 3B-1: opt-in, read-only inventory. No runtime storage/identity imports. */
export type CandidateState =
  | "missing"
  | "valid"
  | "corrupt"
  | "unreadable"
  | "owner_mismatch"
  | "ambiguous"
  | "changed_during_read";
/** Must expose PHYSICAL keys/values through captured, non-migrating raw methods. */
export interface RawLegacyStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(physicalKey: string): string | null;
}
export interface InventoryInputs {
  identity(): { owner: string; epoch: number };
  local(): RawLegacyStorage;
  session(): RawLegacyStorage;
}
export interface LegacySource {
  store: "local" | "session";
  logicalKey: string;
  physicalKey: string;
  ownership: "physical_suffix" | "owner_prefix" | "unproven";
}
export interface ImportCandidate {
  source: LegacySource;
  state: CandidateState;
  reason?: string;
  /** Never supplied for foreign/unattributed values. Never persist or log automatically. */
  raw?: string;
  economicFields?: Record<string, unknown>;
  evidence?:
    | "possible_baseline"
    | "claim_only"
    | "reported_grant"
    | "completion_only"
    | "local_history";
  legacyEntitlements?: Array<{ key: string; state: "legacy_unknown" }>;
}
export interface LegacyInventory {
  owner: string;
  epoch: number | null;
  state: CandidateState;
  complete: boolean;
  reason?: string;
  candidates: ImportCandidate[];
  baseline: { state: CandidateState; candidate?: ImportCandidate };
  /** No existing local legacy format proves atomic delivery to profile. */
  provenDeliveries: never[];
}
const PROFILE = "hakaya.profile.v2";
const ORDERING_HELP = "irth.campaign.ordering.help.v3";
/** Exact logical keys verified in their adapters; no guessed storage aliases. */
export const LEGACY_FIXED_KEYS = [
  PROFILE,
  ORDERING_HELP,
  "irth_campaign_ledger_v1",
  "irth_campaign_grants_v1",
  "irth_campaign_grants_v2",
  "irth_campaign_progress",
  "irth_campaign_progress.backup_v1",
  "irth.campaign_completions.v1",
  "irth.guest.storyCompletions.v1",
  "irth.game-completions.guest.v1",
  "irth.memory.history.v1",
  "irth.games.whoami.help.v1",
  "irth.campaign_progress_buffer.v1",
  "irth.achievements.v2.guest_unlocks",
  "irth.achievements.v2.notified",
  "irth.outbox.fallback.v1",
  "irth.outbox.dead-letter.v1",
] as const;
const PREFIXES = [
  "irth.story_progress_mirror.v1.",
  "irth.inv.backfilled.v1:",
  "irth.daily-quest.",
  "irth.daily-challenges.",
  "irth.memory.plan.",
  "irth.investigations.",
  "irth.entityDiscoveries.",
  "irth.stories.unlock.v1:",
  "irth.outbox.dead-letter.v1:entry:",
];
const SEP = "::owner=";
const known = (key: string) =>
  LEGACY_FIXED_KEYS.some((k) => k === key) || PREFIXES.some((p) => key.startsWith(p));
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const number = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const integer = (v: unknown): v is number => number(v) && Number.isSafeInteger(v);
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const numericMap = (v: unknown, check = number) => record(v) && Object.values(v).every(check);
const STRING_ARRAY_FIELDS = [
  "storiesRead",
  "storiesOpened",
  "puzzlesSolved",
  "whoSolved",
  "investigationsCompleted",
  "timelinesCompleted",
  "decisionsCompleted",
  "missionsCompleted",
  "campaignsCompleted",
  "artifactsFound",
  "charactersUnlocked",
  "regionsUnlocked",
  "badges",
  "titlesEarned",
  "unlockedEras",
];
function isProfile(value: unknown): value is Record<string, unknown> {
  if (
    !record(value) ||
    !number(value.points) ||
    !number(value.dinars) ||
    !integer(value.hearts) ||
    value.hearts > 5 ||
    !integer(value.heartsAt)
  )
    return false;
  if ("activityCooldowns" in value && !numericMap(value.activityCooldowns)) return false;
  if ("hintsPurchased" in value && !numericMap(value.hintsPurchased, integer)) return false;
  if ("loggedIn" in value && typeof value.loggedIn !== "boolean") return false;
  if (STRING_ARRAY_FIELDS.some((k) => k in value && !strings(value[k]))) return false;
  if (
    "streakMilestonesClaimed" in value &&
    (!Array.isArray(value.streakMilestonesClaimed) || !value.streakMilestonesClaimed.every(integer))
  )
    return false;
  if (
    "dailyClaimed" in value &&
    (!record(value.dailyClaimed) ||
      typeof value.dailyClaimed.day !== "string" ||
      !strings(value.dailyClaimed.ids))
  )
    return false;
  return true;
}
function isPending(value: unknown): boolean {
  if (!record(value) || typeof value.at !== "string") return false;
  if (value.kind === "collection")
    return (
      Array.isArray(value.items) &&
      value.items.every(
        (v) => record(v) && typeof v.itemId === "string" && typeof v.itemType === "string",
      )
    );
  return (
    value.kind === "chapter" &&
    typeof value.campaignId === "string" &&
    typeof value.chapterId === "string" &&
    ["unlocked", "completed"].includes(String(value.status)) &&
    number(value.score) &&
    number(value.xpEarned) &&
    number(value.coinsEarned) &&
    typeof value.completed === "boolean"
  );
}
function isLedger(
  value: unknown,
): value is Record<string, unknown> & { keys: Record<string, unknown> } {
  return (
    record(value) &&
    record(value.keys) &&
    Array.isArray(value.pending) &&
    Object.values(value.keys).every(
      (v) => record(v) && typeof v.at === "string" && typeof v.synced === "boolean",
    ) &&
    value.pending.every(isPending) &&
    (!("active" in value) ||
      (record(value.active) &&
        typeof value.active.campaignId === "string" &&
        typeof value.active.chapterId === "string" &&
        typeof value.active.at === "string" &&
        (!("activityId" in value.active) || typeof value.active.activityId === "string")))
  );
}
function grantTotals(value: unknown, chapter: boolean): boolean {
  return (
    record(value) &&
    number(value.xp) &&
    number(value.coins) &&
    strings(value.unlocks) &&
    (chapter || typeof value.updatedAt === "string")
  );
}
function decode(source: LegacySource, raw: string, owner: string): ImportCandidate {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { source, state: "corrupt", reason: "invalid_json", raw };
  }
  // Embedded foreign identity never escapes in raw/projected output.
  if (record(value)) {
    const uid = owner.startsWith("user:") ? owner.slice(5) : null;
    if (
      (typeof value.owner === "string" && value.owner !== owner) ||
      (typeof value.ownerKey === "string" && value.ownerKey !== owner) ||
      ["uid", "userId", "boundUid"].some((k) => typeof value[k] === "string" && value[k] !== uid) ||
      (owner.startsWith("guest:") && value.loggedIn === true)
    )
      return { source, state: "owner_mismatch", reason: "embedded_identity_conflict" };
  }
  if (source.logicalKey.startsWith("irth.outbox.")) {
    const uid = owner.startsWith("user:") ? owner.slice(5) : null;
    const rows = Array.isArray(value) ? value : [value];
    if (
      rows.some(
        (row) =>
          record(row) &&
          [row, row.source, row.letter].some(
            (part) => record(part) && typeof part.userId === "string" && part.userId !== uid,
          ),
      )
    ) {
      return { source, state: "owner_mismatch", reason: "mixed_outbox_identity" };
    }
  }
  const key = source.logicalKey;
  const result: ImportCandidate = { source, state: "valid", raw };
  let valid = false;
  if (key === PROFILE) {
    valid = isProfile(value);
    if (valid) {
      result.economicFields = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([k]) =>
          [
            "points",
            "dinars",
            "hearts",
            "heartsAt",
            "activityCooldowns",
            "hintsPurchased",
            "dailyClaimed",
            "streakMilestonesClaimed",
            ...STRING_ARRAY_FIELDS,
          ].includes(k),
        ),
      );
      result.evidence = "possible_baseline";
    }
  } else if (key === "irth_campaign_ledger_v1") {
    valid = isLedger(value);
    if (valid) {
      result.evidence = "claim_only";
      result.legacyEntitlements = Object.keys(
        (value as { keys: Record<string, unknown> }).keys,
      ).map((key) => ({ key, state: "legacy_unknown" }));
    }
  } else if (key === "irth_campaign_grants_v1" || key === "irth_campaign_grants_v2") {
    valid =
      record(value) &&
      Object.values(value).every(
        (v) =>
          grantTotals(v, false) &&
          (key.endsWith("v1") ||
            (record(v) &&
              record(v.perChapter) &&
              Object.values(v.perChapter).every((c) => grantTotals(c, true)))),
      );
    result.evidence = "reported_grant";
  } else if (key === "irth_campaign_progress" || key === "irth_campaign_progress.backup_v1") {
    valid =
      record(value) &&
      Object.entries(value).every(
        ([id, v]) =>
          record(v) &&
          v.campaignId === id &&
          typeof v.completed === "boolean" &&
          number(v.totalXp) &&
          number(v.totalCoins) &&
          number(v.totalHeartsLost) &&
          strings(v.unlockedRegistryIds) &&
          typeof v.updatedAt === "string" &&
          record(v.chapters) &&
          Object.values(v.chapters).every(
            (c) =>
              record(c) &&
              strings(c.completedActivityIds) &&
              typeof c.completed === "boolean" &&
              number(c.xpEarned) &&
              number(c.coinsEarned) &&
              number(c.heartsLost),
          ),
      );
    result.evidence = "completion_only";
  } else if (
    [
      "irth.guest.storyCompletions.v1",
      "irth.game-completions.guest.v1",
      "irth.achievements.v2.notified",
    ].includes(key)
  ) {
    valid = strings(value);
    result.evidence = "completion_only";
  } else if (key === "irth.memory.history.v1") {
    valid =
      record(value) &&
      value.version === 1 &&
      record(value.items) &&
      Object.entries(value.items).every(
        ([id, v]) =>
          record(v) &&
          v.itemId === id &&
          integer(v.correctStreak) &&
          integer(v.seen) &&
          (v.lastAttemptCorrect === null || typeof v.lastAttemptCorrect === "boolean") &&
          (v.lastAttemptAt === null || integer(v.lastAttemptAt)) &&
          (v.nextDueAt === null || integer(v.nextDueAt)),
      ) &&
      numericMap(value.daily, integer) &&
      strings(value.grantedAttemptIds);
    result.evidence = "local_history";
  } else {
    // No lenient JSON-is-valid fallback for unimplemented historical schemas.
    return { source, state: "ambiguous", reason: "schema_not_admitted" };
  }
  return valid ? result : { source, state: "corrupt", reason: "invalid_shape", raw };
}
class ReadFailure extends Error {
  constructor(
    readonly state: CandidateState,
    message: string,
  ) {
    super(message);
  }
}
/** No automatic entry point. Both adapters and identity reads must be explicitly pure. */
export function inspectLegacyCandidates(owner: string, inputs: InventoryInputs): LegacyInventory {
  let start: { owner: string; epoch: number };
  try {
    const observed = inputs.identity();
    start = { owner: observed.owner, epoch: observed.epoch };
  } catch {
    return {
      owner,
      epoch: null,
      state: "unreadable",
      complete: false,
      reason: "identity_access_failed",
      candidates: [],
      baseline: { state: "unreadable" },
      provenDeliveries: [],
    };
  }
  const failReport = (state: CandidateState, reason: string): LegacyInventory => ({
    owner,
    epoch: start.epoch,
    state,
    complete: false,
    reason,
    candidates: [],
    baseline: { state },
    provenDeliveries: [],
  });
  if (!/^(user|guest):.+/.test(owner) || owner !== start.owner || !integer(start.epoch))
    return failReport("owner_mismatch", "invalid_identity");
  const guard = () => {
    const now = inputs.identity();
    if (now.owner !== owner || now.epoch !== start.epoch)
      throw new ReadFailure("owner_mismatch", "identity_changed");
  };
  const checked = <T>(work: () => T): T => {
    guard();
    const value = work();
    guard();
    return value;
  };
  function capture() {
    const candidates: ImportCandidate[] = [];
    const observations: Array<[string, string, string]> = [];
    for (const kind of ["local", "session"] as const) {
      let storage: RawLegacyStorage;
      try {
        storage = checked(() => inputs[kind]());
      } catch (e) {
        if (e instanceof ReadFailure) throw e;
        throw new ReadFailure("unreadable", `${kind}:storage_access_failed`);
      }
      const relevant = new Map<string, LegacySource>();
      try {
        const length = checked(() => storage.length);
        if (!integer(length)) throw new ReadFailure("unreadable", "invalid_storage_length");
        const seen = new Set<string>();
        for (let i = 0; i < length; i++) {
          const key = checked(() => storage.key(i));
          if (key === null || seen.has(key))
            throw new ReadFailure("changed_during_read", "enumeration_changed");
          seen.add(key);
          // ordering-help explicitly prefixes its owner, so partition does not map it.
          if (key === `${owner}:${ORDERING_HELP}`) {
            relevant.set(key, {
              store: kind,
              logicalKey: ORDERING_HELP,
              physicalKey: key,
              ownership: "owner_prefix",
            });
            continue;
          }
          const split = key.indexOf(SEP);
          const logical = split === -1 ? key : key.slice(0, split);
          // Never getItem another owner's physical key, even for schema inspection.
          if (!known(logical) || (split !== -1 && key.slice(split + SEP.length) !== owner))
            continue;
          relevant.set(key, {
            store: kind,
            logicalKey: logical,
            physicalKey: key,
            ownership: split === -1 ? "unproven" : "physical_suffix",
          });
        }
        if (checked(() => storage.length) !== length)
          throw new ReadFailure("changed_during_read", "enumeration_changed");
        for (const key of LEGACY_FIXED_KEYS) {
          const physical = key === ORDERING_HELP ? `${owner}:${key}` : `${key}${SEP}${owner}`;
          if (!relevant.has(physical))
            candidates.push({
              source: {
                store: kind,
                logicalKey: key,
                physicalKey: physical,
                ownership: key === ORDERING_HELP ? "owner_prefix" : "physical_suffix",
              },
              state: "missing",
            });
        }
        for (const source of [...relevant.values()].sort((a, b) =>
          a.physicalKey.localeCompare(b.physicalKey),
        )) {
          if (source.ownership === "unproven") {
            // Global ownership cannot be proven by active account, name or loggedIn.
            // Do not even retrieve the value: it may belong to a different player.
            candidates.push({ source, state: "ambiguous", reason: "unattributed_global_key" });
            continue;
          }
          const logical = source.logicalKey;
          const uid = owner.startsWith("user:") ? owner.slice(5) : null;
          const dynamicIdentity =
            logical.match(/^irth\.(?:investigations|entityDiscoveries)\.(.+)\.v1$/)?.[1] ??
            logical.match(/^irth\.daily-quest\.(?:history\.|reads\.)?(.+)\.v[12]$/)?.[1] ??
            logical.match(/^irth\.daily-challenges\.(?:done\.)?(.+)\.\d{4}-\d{2}-\d{2}$/)?.[1];
          if (
            (dynamicIdentity !== undefined && dynamicIdentity !== (uid ?? "guest")) ||
            ([
              "irth.guest.storyCompletions.v1",
              "irth.game-completions.guest.v1",
              "irth.achievements.v2.guest_unlocks",
            ].includes(logical) &&
              uid !== null) ||
            (logical.startsWith("irth.story_progress_mirror.v1.") &&
              logical.slice("irth.story_progress_mirror.v1.".length) !== uid) ||
            (logical.startsWith("irth.stories.unlock.v1:") &&
              logical.slice("irth.stories.unlock.v1:".length) !== uid) ||
            (logical.startsWith("irth.inv.backfilled.v1:") &&
              logical.slice("irth.inv.backfilled.v1:".length) !== uid)
          ) {
            candidates.push({ source, state: "owner_mismatch", reason: "key_identity_conflict" });
            continue;
          }
          try {
            const raw = checked(() => storage.getItem(source.physicalKey));
            if (raw === null) throw new ReadFailure("changed_during_read", "key_disappeared");
            observations.push([kind, source.physicalKey, raw]);
            candidates.push(decode(source, raw, owner));
          } catch (e) {
            if (e instanceof ReadFailure) throw e;
            candidates.push({ source, state: "unreadable", reason: "value_read_failed" });
          }
        }
      } catch (e) {
        if (e instanceof ReadFailure) throw e;
        throw new ReadFailure("unreadable", `${kind}:enumeration_failed`);
      }
    }
    return { candidates, observations };
  }
  try {
    // Two complete scans compare exact raw strings, states and physical key sets.
    const first = capture(),
      second = capture();
    guard();
    if (JSON.stringify(first) !== JSON.stringify(second))
      return failReport("changed_during_read", "snapshot_changed");
    const candidates = second.candidates;
    const profiles = candidates.filter(
      (c) => c.source.logicalKey === PROFILE && c.state !== "missing",
    );
    if (profiles.length > 1) {
      for (const candidate of profiles)
        if (candidate.state === "valid") {
          candidate.state = "ambiguous";
          candidate.reason = "multiple_profile_sources";
        }
    }
    const bad = (["unreadable", "owner_mismatch", "corrupt", "ambiguous"] as const).find((state) =>
      candidates.some((c) => c.state === state),
    );
    const state: CandidateState =
      bad ?? (candidates.some((c) => c.state === "valid") ? "valid" : "missing");
    const eligible = profiles.length === 1 && profiles[0].state === "valid" && !bad;
    guard();
    return {
      owner,
      epoch: start.epoch,
      state,
      complete: !bad,
      candidates,
      baseline: eligible ? { state: "valid", candidate: profiles[0] } : { state: bad ?? "missing" },
      provenDeliveries: [],
    };
  } catch (e) {
    if (e instanceof ReadFailure) return failReport(e.state, e.message);
    return failReport("unreadable", "identity_or_inventory_access_failed");
  }
}
