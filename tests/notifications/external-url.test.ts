import { describe, it, expect } from "vitest";
import { validateExternalUrl } from "@/lib/notifications/externalUrl";
import { resolveNotificationAction } from "@/lib/notifications/action";
import { resolveRequestAction, validateExternalUrl as edgeValidate } from "../../supabase/functions/send-notification/external-url";

const VALID = [
  "https://youtube.com/watch?v=test",
  "https://www.youtube.com/watch?v=test",
  "https://youtu.be/test",
  "https://t.me/example",
  "https://playirth.com/",
  "https://example.org/path?a=%D8%A7#frag",
];

const INVALID = [
  "javascript:alert(1)",
  "data:text/html,<h1>x</h1>",
  "file:///etc/passwd",
  "intent://scan/#Intent;scheme=zxing;end",
  "content://media/1",
  "blob:https://example.com/1",
  "http://example.com",
  "//example.com",
  "/example.com",
  "example.com",
  "https://user:pass@example.com",
  "https://",
  "https://localhost",
  "ht!tps://x.com",
  "   ",
  "",
  null,
  undefined,
  42,
  "https://exa mple.com",
  "https://example.com/\nevil",
];

describe("external URL validation policy", () => {
  it("accepts absolute https URLs", () => {
    for (const url of VALID) expect(validateExternalUrl(url).ok, url).toBe(true);
  });

  it("rejects unsafe schemes, relative values, credentials and malformed input", () => {
    for (const url of INVALID) expect(validateExternalUrl(url).ok, String(url)).toBe(false);
  });

  it("normalizes harmless surrounding whitespace", () => {
    const res = validateExternalUrl("  https://t.me/example  ");
    expect(res.ok && res.url).toBe("https://t.me/example");
  });

  it("client and edge validators agree on every case", () => {
    for (const url of [...VALID, ...INVALID]) {
      expect(edgeValidate(url).ok, String(url)).toBe(validateExternalUrl(url).ok);
    }
  });
});

describe("edge request action contract", () => {
  it("no action", () => {
    expect(resolveRequestAction({})).toEqual({ ok: true, kind: "none" });
  });

  it("internal deep_link unchanged (V15 producers)", () => {
    expect(resolveRequestAction({ deep_link: "/campaigns" })).toEqual({ ok: true, kind: "internal" });
    expect(resolveRequestAction({ deep_link: "/?todayHistoryId=5#today-in-history", payload: { todayEventId: "5" } }))
      .toEqual({ ok: true, kind: "internal" });
  });

  it("external action validated and normalized", () => {
    const res = resolveRequestAction({ payload: { external_url: " https://t.me/x " } });
    expect(res).toEqual({ ok: true, kind: "external", url: "https://t.me/x" });
  });

  it("internal + external simultaneously is rejected, never guessed", () => {
    const res = resolveRequestAction({ deep_link: "/campaigns", payload: { external_url: "https://t.me/x" } });
    expect(res.ok).toBe(false);
  });

  it("unsafe external URL is rejected before persistence", () => {
    for (const bad of ["javascript:alert(1)", "http://example.com", "//example.com"]) {
      expect(resolveRequestAction({ payload: { external_url: bad } }).ok, bad).toBe(false);
    }
  });
});

describe("canonical client action resolver", () => {
  it("resolves a valid stored external action", () => {
    expect(resolveNotificationAction({ type: "manual", payload: { external_url: "https://youtu.be/test" } }))
      .toEqual({ kind: "external", url: "https://youtu.be/test" });
  });

  it("fails closed on a malformed stored external action", () => {
    for (const bad of ["javascript:alert(1)", "http://example.com", "/campaigns", ""]) {
      const a = resolveNotificationAction({ type: "manual", payload: { external_url: bad } });
      expect(a.kind === "external").toBe(false);
      expect(JSON.stringify(a)).not.toContain(bad || "___");
    }
  });

  it("never turns an unsafe external URL into an internal route", () => {
    const a = resolveNotificationAction({ type: "manual", payload: { external_url: "javascript:alert(1)" } });
    expect(a).toEqual({ kind: "none" });
  });

  it("ambiguous internal+external stored action fails closed", () => {
    expect(resolveNotificationAction({
      type: "manual", deep_link: "/campaigns", payload: { external_url: "https://t.me/x" },
    })).toEqual({ kind: "none" });
  });

  it("V15 notifications without external_url behave exactly as before", () => {
    expect(resolveNotificationAction({ type: "manual", category: "campaign", deep_link: "/campaigns/x", payload: {} }))
      .toEqual({ kind: "internal", path: "/campaigns/x" });
    expect(resolveNotificationAction({ type: "manual", category: "achievement", payload: { achievementId: "a1" } }))
      .toEqual({ kind: "internal", path: "/profile?tab=achievements&achievement=a1" });
    const info = resolveNotificationAction({ id: "n1", type: "daily_fact", payload: {} } as never);
    expect(info.kind).toBe("internal");
  });
});
