/**
 * V16 — send-notification AUTHORSHIP authorization tests.
 *
 * Pure/dry-run only: no Edge invocation, no FCM, no real notification.
 */

import { describe, it, expect } from "vitest";
import {
  extractBearer, isServiceRoleBearer, authorizeUserEnvelope, rolesGrantAdmin,
  decodeJwtPayload, USER_AUTHORABLE_TYPES,
} from "../../supabase/functions/send-notification/authorize";
import { resolveTokenScope } from "../../supabase/functions/send-notification/audience-guard";

const uuid = (n: number) =>
  `0000${n.toString().padStart(4, "0")}-0000-4000-8000-000000000000`.slice(-36);

const ME = uuid(1);
const FRIEND = uuid(2);

/** Minimal unsigned JWT builder for role-claim tests. */
const jwt = (payload: Record<string, unknown>) =>
  `h.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.s`;

describe("V16 send-notification authorship authorization", () => {
  it("1. anon (no bearer) cannot invoke", () => {
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer("")).toBeNull();
    expect(isServiceRoleBearer(null, "svc")).toBe(false);
  });

  it("2. a normal authenticated user cannot author an arbitrary/broadcast notification", () => {
    const denials = [
      { title: "t", body: "b", type: "manual", target_type: "all" },
      { title: "t", body: "b", type: "manual", target_type: "user", target_user_id: FRIEND },
      { type: "friend_request", target_type: "all" },
      { type: "friend_request", target_type: "segment", target_segment_id: "x", target_user_ids: [FRIEND] },
      { type: "friend_request", target_type: "user", target_user_id: FRIEND, target_user_ids: [FRIEND] },
      { type: "friend_request", target_type: "user", target_user_id: FRIEND, dedupe_key: "k" },
      { notification_id: uuid(9) },
    ];
    for (const body of denials) {
      const d = authorizeUserEnvelope(ME, body as Record<string, unknown>);
      expect(d.ok).toBe(false);
      expect(d.ok === false && d.status).toBe(d.ok === false ? d.status : 0);
      expect(d.ok === false && [400, 403].includes(d.status)).toBe(true);
    }
  });

  it("3. an authorized admin passes authorization (roles resolved server-side)", () => {
    expect(rolesGrantAdmin(["admin"])).toBe(true);
    expect(rolesGrantAdmin(["owner"])).toBe(true);
    expect(rolesGrantAdmin(["editor"])).toBe(false);
    expect(rolesGrantAdmin([])).toBe(false);
  });

  it("4. the service/system path stays authorized (literal key and role claim)", () => {
    expect(isServiceRoleBearer("svc-secret", "svc-secret")).toBe(true);
    expect(isServiceRoleBearer(jwt({ role: "service_role" }), "other")).toBe(true);
    expect(isServiceRoleBearer(jwt({ role: "authenticated" }), "other")).toBe(false);
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  });

  it("5. legitimate app peer notifications still pass (V15 compatibility)", () => {
    const friendReq = authorizeUserEnvelope(ME, {
      title: "طلب صداقة جديد", body: "…", type: "friend_request",
      target_type: "user", target_user_id: FRIEND, deep_link: "/friends?tab=requests",
    });
    expect(friendReq.ok).toBe(true);
    expect(friendReq.ok && friendReq.kind === "user" && friendReq.requiresFriendship).toBe(true);

    const accepted = authorizeUserEnvelope(ME, {
      type: "friend_accepted", target_type: "user", target_user_id: FRIEND,
    });
    expect(accepted.ok).toBe(true);

    const achievement = authorizeUserEnvelope(ME, {
      type: "achievement", target_type: "user", target_user_id: ME,
    });
    expect(achievement.ok).toBe(true);
    expect(achievement.ok && achievement.kind === "user" && achievement.requiresFriendship).toBe(false);
  });

  it("6. malformed audience still fails closed (guard preserved)", () => {
    expect(resolveTokenScope({ target_type: "segment", target_user_ids: ["nope"] }).ok).toBe(false);
    expect(resolveTokenScope({ target_type: "segment" }).ok).toBe(false);
  });

  it("7. a missing target cannot widen for a non-admin caller", () => {
    const d = authorizeUserEnvelope(ME, { type: "friend_request", target_type: "user" });
    expect(d.ok).toBe(false);
    const d2 = authorizeUserEnvelope(ME, { type: "friend_request" });
    expect(d2.ok).toBe(false);
  });

  it("8. a forged client admin flag has no effect", () => {
    const d = authorizeUserEnvelope(ME, {
      is_admin: true, admin: true, role: "admin", sender: "admin",
      title: "t", body: "b", type: "manual", target_type: "all",
    });
    expect(d.ok).toBe(false);
  });

  it("9. a user cannot impersonate another user's achievement", () => {
    const d = authorizeUserEnvelope(ME, {
      type: "achievement", target_type: "user", target_user_id: FRIEND,
    });
    expect(d.ok).toBe(false);
  });

  it("10. the user-authorable allowlist is exactly the app's own peer types", () => {
    expect([...USER_AUTHORABLE_TYPES]).toEqual([
      "friend_request", "friend_accepted", "achievement",
    ]);
  });
});
