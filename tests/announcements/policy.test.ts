import { beforeEach, describe, expect, it } from "vitest";
import {
  evaluateMandatory,
  evaluateOptional,
  pickGeneric,
  resolveAnnouncementAction,
  isSafeInternalPath,
  isCriticalGeneric,
  SANE_JUMP_MAX_AHEAD,
  IRTH_PLAY_STORE_URL,
} from "@/lib/announcements/policy";
import { parseAnnouncementRow, type AnnouncementFetch, type AnnouncementRow } from "@/lib/announcements/types";
import { MODAL_PRIORITY, mayShow } from "@/lib/ui/modal-arbiter";

// ── minimal localStorage stub for the device-local state module ──────────
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as unknown as Storage;

const {
  isOptionalSnoozed, snoozeOptional, recordLocalAck, hasLocalAck,
  OPTIONAL_SNOOZE_MS, __resetAnnouncementLocalState,
} = await import("@/lib/announcements/local-state");

const PAST = new Date(Date.now() - 60_000).toISOString();
const FUTURE = new Date(Date.now() + 3_600_000).toISOString();

function row(over: Partial<AnnouncementRow> = {}): AnnouncementRow {
  return {
    id: "a1", kind: "generic", platform: "all", title: "t", body: "b",
    cta_label: null, internal_path: null, external_url: null,
    recommended_version_code: null, min_version_code: null,
    priority: 0, dismissible: true, once_per_user: true,
    effective_at: null, server_time: null, ...over,
  };
}
const okFetch = (rows: AnnouncementRow[]): AnnouncementFetch => ({ ok: true, rows, serverTime: null });

const androidBase = {
  isNativeAndroid: true, isReleaseBuild: true,
  installedVersionCode: 15, installedVersionValid: true,
};
const mandatoryRow = (over: Partial<AnnouncementRow> = {}) =>
  row({ id: "m1", kind: "mandatory_update", platform: "android", min_version_code: 16, effective_at: PAST, ...over });

describe("mandatory update — blocking", () => {
  it("installed 15 / min 16 → blocked", () => {
    const r = evaluateMandatory({ ...androidBase, fetch: okFetch([mandatoryRow()]) });
    expect(r.blocked).toBe(true);
  });
  it("installed 16 / min 16 → allowed", () => {
    const r = evaluateMandatory({ ...androidBase, installedVersionCode: 16, fetch: okFetch([mandatoryRow()]) });
    expect(r).toMatchObject({ blocked: false, reason: "up_to_date" });
  });
  it("installed 17 / min 16 → allowed", () => {
    const r = evaluateMandatory({ ...androidBase, installedVersionCode: 17, fetch: okFetch([mandatoryRow()]) });
    expect(r.blocked).toBe(false);
  });
});

describe("mandatory update — FAIL OPEN", () => {
  const cases: Array<[string, Parameters<typeof evaluateMandatory>[0], string]> = [
    ["offline", { ...androidBase, fetch: { ok: false, reason: "offline" } }, "fetch_failed"],
    ["timeout", { ...androidBase, fetch: { ok: false, reason: "timeout" } }, "fetch_failed"],
    ["rpc error", { ...androidBase, fetch: { ok: false, reason: "error" } }, "fetch_failed"],
    ["malformed response", { ...androidBase, fetch: { ok: false, reason: "malformed" } }, "fetch_failed"],
    ["invalid App.getInfo()", { ...androidBase, installedVersionCode: null, installedVersionValid: false, fetch: okFetch([mandatoryRow()]) }, "invalid_installed_version"],
    ["unknown platform / web", { ...androidBase, isNativeAndroid: false, fetch: okFetch([mandatoryRow()]) }, "not_native_android"],
    ["debug build", { ...androidBase, isReleaseBuild: false, fetch: okFetch([mandatoryRow()]) }, "debug_build"],
    ["min > recommended", { ...androidBase, fetch: okFetch([mandatoryRow({ recommended_version_code: 10 })]) }, "malformed_policy"],
    ["absurd jump (1000)", { ...androidBase, fetch: okFetch([mandatoryRow({ min_version_code: 1000, recommended_version_code: 1000 })]) }, "insane_jump"],
    ["absurd jump (10000)", { ...androidBase, fetch: okFetch([mandatoryRow({ min_version_code: 10000, recommended_version_code: 10000 })]) }, "insane_jump"],
    ["no policy (inactive → absent)", { ...androidBase, fetch: okFetch([]) }, "no_policy"],
    ["future effective_at", { ...androidBase, fetch: okFetch([mandatoryRow({ effective_at: FUTURE })]) }, "not_effective"],
    ["missing effective_at", { ...androidBase, fetch: okFetch([mandatoryRow({ effective_at: null })]) }, "not_effective"],
    ["malformed min", { ...androidBase, fetch: okFetch([mandatoryRow({ min_version_code: null })]) }, "malformed_policy"],
  ];
  for (const [name, ctx, reason] of cases) {
    it(`${name} → allowed`, () => {
      const r = evaluateMandatory(ctx);
      expect(r.blocked).toBe(false);
      expect(r.reason).toBe(reason);
    });
  }

  it("cached policy can never block: only an ok fetch is consulted", () => {
    expect(evaluateMandatory({ ...androidBase, fetch: { ok: false, reason: "offline" } }).row).toBeNull();
  });

  it("the sane-jump boundary is exactly installed + SANE_JUMP_MAX_AHEAD", () => {
    const edge = evaluateMandatory({
      ...androidBase, fetch: okFetch([mandatoryRow({ min_version_code: 15 + SANE_JUMP_MAX_AHEAD })]),
    });
    expect(edge.blocked).toBe(true);
    const over = evaluateMandatory({
      ...androidBase, fetch: okFetch([mandatoryRow({ min_version_code: 15 + SANE_JUMP_MAX_AHEAD + 1 })]),
    });
    expect(over.blocked).toBe(false);
  });

  it("deactivation unblocks on the next fresh check", () => {
    expect(evaluateMandatory({ ...androidBase, fetch: okFetch([mandatoryRow()]) }).blocked).toBe(true);
    expect(evaluateMandatory({ ...androidBase, fetch: okFetch([]) }).blocked).toBe(false);
  });
});

describe("optional update", () => {
  const opt = (over: Partial<AnnouncementRow> = {}) =>
    row({ id: "o1", kind: "optional_update", platform: "android", recommended_version_code: 16, ...over });
  const base = { isNativeAndroid: true, installedVersionValid: true };

  it("installed 15 / recommended 16 → shown", () => {
    expect(evaluateOptional({ ...base, installedVersionCode: 15, fetch: okFetch([opt()]) }).show).toBe(true);
  });
  it("installed 16 / recommended 16 → hidden", () => {
    expect(evaluateOptional({ ...base, installedVersionCode: 16, fetch: okFetch([opt()]) }).show).toBe(false);
  });
  it("installed 17 / recommended 16 → hidden", () => {
    expect(evaluateOptional({ ...base, installedVersionCode: 17, fetch: okFetch([opt()]) }).show).toBe(false);
  });
  it("web never sees an optional Android update", () => {
    expect(evaluateOptional({ ...base, isNativeAndroid: false, installedVersionCode: 15, fetch: okFetch([opt()]) }).show).toBe(false);
  });
  it("fetch failure hides it (never blocks)", () => {
    expect(evaluateOptional({ ...base, installedVersionCode: 15, fetch: { ok: false, reason: "timeout" } }).show).toBe(false);
  });

  it("«لاحقًا» snoozes for 72h, survives restart, and a newer version re-prompts", () => {
    __resetAnnouncementLocalState();
    const ctx = { ...base, installedVersionCode: 15, fetch: okFetch([opt()]), isSnoozed: (id: string, v: number) => isOptionalSnoozed(id, v) };
    expect(evaluateOptional(ctx).show).toBe(true);
    snoozeOptional("o1", 16);
    expect(evaluateOptional(ctx).show).toBe(false);           // snoozed
    expect(isOptionalSnoozed("o1", 16)).toBe(true);            // persisted (restart)
    expect(OPTIONAL_SNOOZE_MS).toBe(72 * 60 * 60 * 1000);
    expect(isOptionalSnoozed("o1", 16, Date.now() + OPTIONAL_SNOOZE_MS + 1)).toBe(false);
    // newer recommendation re-prompts
    const newer = { ...ctx, fetch: okFetch([opt({ recommended_version_code: 17 })]) };
    expect(evaluateOptional(newer).show).toBe(true);
  });

  it("the store destination is the fixed Irth Play URL", () => {
    expect(IRTH_PLAY_STORE_URL).toBe("https://play.google.com/store/apps/details?id=app.lovable.irth");
  });
});

describe("generic announcements", () => {
  beforeEach(() => __resetAnnouncementLocalState());

  it("a public generic announcement shows", () => {
    expect(pickGeneric(okFetch([row()]))?.id).toBe("a1");
  });
  it("once-per-user hides an acknowledged announcement", () => {
    expect(pickGeneric(okFetch([row()]), { ackedIds: ["a1"] })).toBeNull();
  });
  it("guest acknowledgement persists locally", () => {
    recordLocalAck("a1");
    expect(hasLocalAck("a1")).toBe(true);
  });
  it("repeatable announcements ignore acks", () => {
    expect(pickGeneric(okFetch([row({ once_per_user: false })]), { ackedIds: ["a1"] })?.id).toBe("a1");
  });
  it("higher priority wins", () => {
    const picked = pickGeneric(okFetch([row({ id: "low", priority: 1 }), row({ id: "high", priority: 9 })]));
    expect(picked?.id).toBe("high");
  });
  it("a failed fetch shows nothing (hidden, never widened)", () => {
    expect(pickGeneric({ ok: false, reason: "error" })).toBeNull();
  });

  it("valid internal CTA resolves", () => {
    expect(resolveAnnouncementAction(row({ internal_path: "/campaigns", cta_label: "افتح" })))
      .toEqual({ kind: "internal", path: "/campaigns", label: "افتح" });
  });
  it("valid external https CTA resolves", () => {
    expect(resolveAnnouncementAction(row({ external_url: "https://t.me/x" })))
      .toEqual({ kind: "external", url: "https://t.me/x", label: null });
  });
  it("invalid or ambiguous CTA → no action", () => {
    for (const bad of ["javascript:alert(1)", "http://x.com", "//x.com", "/ok"]) {
      const r = resolveAnnouncementAction(row({ external_url: bad }));
      expect(r.kind).not.toBe("external");
    }
    expect(resolveAnnouncementAction(row({ internal_path: "//evil.com" })).kind).toBe("none");
    expect(resolveAnnouncementAction(row({ internal_path: "/a", external_url: "https://t.me/x" })).kind).toBe("none");
  });
  it("update kinds never carry an admin action", () => {
    expect(resolveAnnouncementAction(row({ kind: "mandatory_update", external_url: "https://evil.example.com" })).kind)
      .toBe("none");
  });
  it("internal path safety", () => {
    expect(isSafeInternalPath("/campaigns")).toBe(true);
    expect(isSafeInternalPath("//x")).toBe(false);
    expect(isSafeInternalPath("campaigns")).toBe(false);
    expect(isSafeInternalPath("/a b")).toBe(false);
  });
});

describe("row schema validation", () => {
  it("drops malformed rows", () => {
    for (const bad of [null, 42, {}, { id: "x" }, { id: "x", kind: "weird", title: "t" }, { id: "", kind: "generic", title: "t" }]) {
      expect(parseAnnouncementRow(bad)).toBeNull();
    }
  });
  it("normalizes non-positive version codes to null", () => {
    const parsed = parseAnnouncementRow({ id: "x", kind: "mandatory_update", platform: "android", title: "t", min_version_code: 0 });
    expect(parsed?.min_version_code).toBeNull();
  });
});

describe("startup overlay arbiter", () => {
  it("mandatory outranks everything except fatal recovery", () => {
    expect(mayShow(MODAL_PRIORITY.mandatoryUpdate, MODAL_PRIORITY.launchChain)).toBe(true);
    expect(mayShow(MODAL_PRIORITY.mandatoryUpdate, MODAL_PRIORITY.tutorial)).toBe(true);
    expect(mayShow(MODAL_PRIORITY.mandatoryUpdate, MODAL_PRIORITY.eventModal)).toBe(true);
    expect(mayShow(MODAL_PRIORITY.mandatoryUpdate, MODAL_PRIORITY.fatal)).toBe(false);
  });
  it("critical generic outranks optional update, which outranks normal generic", () => {
    expect(MODAL_PRIORITY.criticalAnnouncement).toBeLessThan(MODAL_PRIORITY.optionalUpdate);
    expect(MODAL_PRIORITY.optionalUpdate).toBeLessThan(MODAL_PRIORITY.genericAnnouncement);
    expect(mayShow(MODAL_PRIORITY.optionalUpdate, MODAL_PRIORITY.criticalAnnouncement)).toBe(false);
  });
  it("generic outranks tutorial and event modals", () => {
    expect(mayShow(MODAL_PRIORITY.genericAnnouncement, MODAL_PRIORITY.tutorial)).toBe(true);
    expect(mayShow(MODAL_PRIORITY.tutorial, MODAL_PRIORITY.genericAnnouncement)).toBe(false);
  });
  it("the existing launch chain is never pre-empted by announcements", () => {
    expect(mayShow(MODAL_PRIORITY.criticalAnnouncement, MODAL_PRIORITY.launchChain)).toBe(false);
    expect(mayShow(MODAL_PRIORITY.optionalUpdate, MODAL_PRIORITY.launchChain)).toBe(false);
    expect(mayShow(MODAL_PRIORITY.genericAnnouncement, MODAL_PRIORITY.launchChain)).toBe(false);
  });
  it("critical generic classification", () => {
    expect(isCriticalGeneric(row({ priority: 100 }))).toBe(true);
    expect(isCriticalGeneric(row({ priority: 99 }))).toBe(false);
    expect(isCriticalGeneric(row({ kind: "optional_update", priority: 500 }))).toBe(false);
  });
});
