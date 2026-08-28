/**
 * V16 — send-path safety tests.
 *
 * These tests exercise the PURE audience guard used by the
 * `send-notification` edge function. No real notification is ever sent:
 * the token query is simulated, FCM is never contacted.
 */

import { describe, it, expect } from "vitest";
import {
  resolveTokenScope, assertNoSegmentWidening, isUuid,
} from "../../supabase/functions/send-notification/audience-guard";

const uuid = (n: number) =>
  `0000${n.toString().padStart(4, "0")}-0000-4000-8000-000000000000`.slice(-36);

const ALL_ENABLED_TOKENS = Array.from({ length: 660 }, (_, i) => ({
  token: `t${i}`,
  user_id: uuid(i),
}));

/** Simulated token query — mirrors the edge function's branching exactly. */
function simulateTokenQuery(notif: Record<string, unknown>) {
  const scope = resolveTokenScope(notif);
  if (!scope.ok) return { failed: true as const, error: scope.error, tokens: [] };
  assertNoSegmentWidening(notif, scope);
  if (scope.scope === "broadcast") return { failed: false as const, broadcast: true, tokens: ALL_ENABLED_TOKENS };
  return {
    failed: false as const,
    broadcast: false,
    tokens: ALL_ENABLED_TOKENS.filter((t) => scope.userIds.includes(t.user_id)),
  };
}

describe("V16 segment send safety", () => {
  it("segment matching 1 user restricts the token query to that user", () => {
    const r = simulateTokenQuery({
      target_type: "segment", target_segment_id: "level_20_plus", target_user_ids: [uuid(3)],
    });
    expect(r.broadcast).toBe(false);
    expect(r.tokens.map((t) => t.user_id)).toEqual([uuid(3)]);
  });

  it("segment matching 38 users restricts to exactly those users", () => {
    const ids = Array.from({ length: 38 }, (_, i) => uuid(i));
    const r = simulateTokenQuery({
      target_type: "segment", target_segment_id: "filter:level>5", target_user_ids: ids,
    });
    expect(r.tokens).toHaveLength(38);
    expect(new Set(r.tokens.map((t) => t.user_id))).toEqual(new Set(ids));
  });

  it("valid zero audience sends to nobody and never broadcasts", () => {
    const scope = resolveTokenScope({
      target_type: "segment", target_segment_id: "level_50_plus", target_user_ids: [],
    });
    expect(scope.ok).toBe(true);
    expect(scope.ok && scope.scope).toBe("list");
    const r = simulateTokenQuery({
      target_type: "segment", target_segment_id: "level_50_plus", target_user_ids: [],
    });
    expect(r.broadcast).toBe(false);
    expect(r.tokens).toHaveLength(0);
  });

  it("missing target_user_ids on a segment send fails closed", () => {
    const r = simulateTokenQuery({ target_type: "segment", target_segment_id: "no_friends" });
    expect(r.failed).toBe(true);
    expect(r.tokens).toHaveLength(0);
  });

  it("malformed target_user_ids fails closed", () => {
    const r = simulateTokenQuery({
      target_type: "segment", target_segment_id: "no_friends",
      target_user_ids: ["not-a-uuid", uuid(1)],
    });
    expect(r.failed).toBe(true);
    expect(r.tokens).toHaveLength(0);
  });

  it("lost target_segment_id fails closed", () => {
    const r = simulateTokenQuery({ target_type: "segment", target_user_ids: [uuid(1)] });
    expect(r.failed).toBe(true);
    expect(r.tokens).toHaveLength(0);
  });

  it("a segment payload can NEVER widen to all enabled tokens", () => {
    const hostile: Record<string, unknown>[] = [
      { target_type: "segment" },
      { target_type: "segment", target_segment_id: "x", target_user_ids: null },
      { target_type: "segment", target_segment_id: "", target_user_ids: [uuid(1)] },
      { target_type: "segment", target_segment_id: "x", target_user_ids: "all" },
      { target_type: "segment", target_segment_id: "x", target_user_ids: {} },
      { target_type: "segment", target_segment_id: "x", target_user_ids: [null] },
    ];
    for (const notif of hostile) {
      const r = simulateTokenQuery(notif);
      expect(r.tokens.length).toBeLessThan(ALL_ENABLED_TOKENS.length);
      expect((r as { broadcast?: boolean }).broadcast ?? false).toBe(false);
    }
  });

  it("the hard guard throws if a segment ever reaches broadcast scope", () => {
    expect(() =>
      assertNoSegmentWidening({ target_type: "segment" }, { ok: true, scope: "broadcast" }),
    ).toThrow(/segment_broadcast_guard/);
  });

  it("explicit broadcast still works", () => {
    const r = simulateTokenQuery({ target_type: "all" });
    expect(r.broadcast).toBe(true);
    expect(r.tokens).toHaveLength(ALL_ENABLED_TOKENS.length);
  });

  it("single-user target still works and requires a uuid", () => {
    const ok = simulateTokenQuery({ target_type: "user", target_user_id: uuid(7) });
    expect(ok.tokens.map((t) => t.user_id)).toEqual([uuid(7)]);
    const bad = simulateTokenQuery({ target_type: "user", target_user_id: "nope" });
    expect(bad.failed).toBe(true);
  });

  it("isUuid rejects non-uuid values", () => {
    expect(isUuid(uuid(1))).toBe(true);
    expect(isUuid("all")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it("target_user_ids and target_segment_id survive persistence", () => {
    // Mirrors the edge function's insert projection.
    const body = {
      title: "t", body: "b", target_type: "segment",
      target_user_ids: [uuid(1), uuid(2)], target_segment_id: "active_today",
    };
    const insert = {
      target_type: body.target_type ?? "all",
      target_user_id: null,
      target_user_ids: Array.isArray(body.target_user_ids) ? body.target_user_ids : null,
      target_segment_id: typeof body.target_segment_id === "string" ? body.target_segment_id : null,
    };
    expect(insert.target_user_ids).toEqual([uuid(1), uuid(2)]);
    expect(insert.target_segment_id).toBe("active_today");
    // A row rebuilt from persistence still resolves to a restricted list.
    const scope = resolveTokenScope(insert);
    expect(scope.ok && scope.scope).toBe("list");
  });

  it("draft/scheduled payloads keep their audience fields (no regression)", () => {
    const draft = {
      target_type: "segment", target_segment_id: "inactive_7d",
      target_user_ids: [uuid(5)], status: "scheduled",
    };
    const scope = resolveTokenScope(draft);
    expect(scope.ok && scope.scope).toBe("list");
    expect(scope.ok && scope.scope === "list" && scope.userIds).toEqual([uuid(5)]);
  });
});
