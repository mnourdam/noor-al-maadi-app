/**
 * V16 Phase B — Android regression tests.
 *
 *  A) current=16, optional recommended=17 → prompt shows; "لاحقًا" dismisses
 *     it (session state + persisted snooze); "تحديث الآن" opens the fixed
 *     Play Store URL.
 *  B) current=16, mandatory min=17 → blocker always shows, is never
 *     dismissible and can never be suppressed by optional snooze / acks.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  evaluateMandatory,
  evaluateOptional,
  IRTH_PLAY_STORE_URL,
} from "@/lib/announcements/policy";
import { MODAL_PRIORITY, mayShow } from "@/lib/ui/modal-arbiter";
import type { AnnouncementFetch, AnnouncementRow } from "@/lib/announcements/types";

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
  isOptionalSnoozed, snoozeOptional, recordLocalAck, __resetAnnouncementLocalState,
} = await import("@/lib/announcements/local-state");

const PAST = new Date(Date.now() - 60_000).toISOString();

function row(over: Partial<AnnouncementRow>): AnnouncementRow {
  return {
    id: "x", kind: "generic", platform: "android", title: "t", body: "b",
    cta_label: null, internal_path: null, external_url: null,
    recommended_version_code: null, min_version_code: null,
    priority: 0, dismissible: true, once_per_user: true,
    effective_at: null, server_time: null, ...over,
  };
}

const OPTIONAL_17 = row({
  id: "opt-17", kind: "optional_update", recommended_version_code: 17, dismissible: true,
});
const MANDATORY_17 = row({
  id: "man-17", kind: "mandatory_update", min_version_code: 17,
  recommended_version_code: 17, dismissible: false, effective_at: PAST,
});

const ok = (rows: AnnouncementRow[]): AnnouncementFetch =>
  ({ ok: true, rows, serverTime: null });

const ANDROID_16 = {
  isNativeAndroid: true,
  isReleaseBuild: true,
  installedVersionCode: 16,
  installedVersionValid: true,
};

describe("A — optional update (installed 16, recommended 17)", () => {
  beforeEach(() => __resetAnnouncementLocalState());

  it("shows the prompt", () => {
    const res = evaluateOptional({ ...ANDROID_16, fetch: ok([OPTIONAL_17]) });
    expect(res.show).toBe(true);
    expect(res.row?.id).toBe("opt-17");
  });

  it("'لاحقًا' snoozes the exact (id, recommendedVersion) pair and hides it", () => {
    snoozeOptional("opt-17", 17);
    expect(isOptionalSnoozed("opt-17", 17)).toBe(true);
    const res = evaluateOptional({
      ...ANDROID_16,
      fetch: ok([OPTIONAL_17]),
      isSnoozed: (id, code) => isOptionalSnoozed(id, code),
    });
    expect(res.show).toBe(false);
    expect(res.reason).toBe("snoozed");
  });

  it("a NEWER recommended version prompts again despite the old snooze", () => {
    snoozeOptional("opt-17", 17);
    const newer = row({ ...OPTIONAL_17, id: "opt-18", recommended_version_code: 18 });
    const res = evaluateOptional({
      ...ANDROID_16,
      fetch: ok([newer]),
      isSnoozed: (id, code) => isOptionalSnoozed(id, code),
    });
    expect(res.show).toBe(true);
  });

  it("session dismissal hides it even when persisted snooze storage fails", () => {
    const dismissed = ["opt-17"];
    const res = evaluateOptional({
      ...ANDROID_16,
      fetch: ok([OPTIONAL_17]),
      isSnoozed: (id) => dismissed.includes(id),
    });
    expect(res.show).toBe(false);
  });

  it("update CTA targets the fixed Irth Play Store URL", () => {
    expect(IRTH_PLAY_STORE_URL).toBe(
      "https://play.google.com/store/apps/details?id=app.lovable.irth",
    );
  });
});

describe("B — mandatory update (installed 16, min 17)", () => {
  beforeEach(() => __resetAnnouncementLocalState());

  it("blocks", () => {
    const res = evaluateMandatory({ ...ANDROID_16, fetch: ok([MANDATORY_17]) });
    expect(res.blocked).toBe(true);
    expect(res.row?.id).toBe("man-17");
  });

  it("is NOT suppressed by an existing optional snooze or local ack", () => {
    snoozeOptional("opt-17", 17);
    snoozeOptional("man-17", 17);
    recordLocalAck("man-17");
    const res = evaluateMandatory({
      ...ANDROID_16,
      fetch: ok([OPTIONAL_17, MANDATORY_17]),
    });
    expect(res.blocked).toBe(true);
  });

  it("requires an effective_at in the past — a null one never blocks", () => {
    const res = evaluateMandatory({
      ...ANDROID_16,
      fetch: ok([row({ ...MANDATORY_17, effective_at: null })]),
    });
    expect(res.blocked).toBe(false);
    expect(res.reason).toBe("not_effective");
  });

  it("outranks optional/generic/launch chain but yields to fatal recovery", () => {
    expect(mayShow(MODAL_PRIORITY.mandatoryUpdate, MODAL_PRIORITY.optionalUpdate)).toBe(true);
    expect(mayShow(MODAL_PRIORITY.mandatoryUpdate, MODAL_PRIORITY.launchChain)).toBe(true);
    expect(mayShow(MODAL_PRIORITY.mandatoryUpdate, MODAL_PRIORITY.fatal)).toBe(false);
    expect(mayShow(MODAL_PRIORITY.optionalUpdate, MODAL_PRIORITY.mandatoryUpdate)).toBe(false);
  });
});

describe("host + admin wiring", () => {
  const host = readFileSync("src/components/announcements/AnnouncementHost.tsx", "utf8");
  const admin = readFileSync("src/routes/admin.announcements.tsx", "utf8");

  it("optional 'لاحقًا' records a session dismissal that re-evaluates the memo", () => {
    expect(host).toContain("setSnoozedOptional");
    expect(host).toMatch(/snoozedOptional\.includes\(id\)/);
    expect(host).toMatch(/\[native, installed, fetchState, snoozedOptional\]/);
  });

  it("mandatory blocker renders no dismiss control", () => {
    const block = host.slice(host.indexOf("data-irth-mandatory-update"), host.indexOf("criticalFirst"));
    expect(block).not.toContain("لاحقًا");
    expect(block).not.toContain("إغلاق");
  });

  it("admin composer defaults a blank mandatory effective_at to now", () => {
    expect(admin).toMatch(/kind === "mandatory_update" && !form\.effective_at/);
    expect(admin).toContain("new Date().toISOString()");
  });
});
