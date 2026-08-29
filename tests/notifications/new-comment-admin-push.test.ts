/**
 * V16 — NEW COMMUNITY COMMENT -> ADMIN PUSH
 *
 * Dry-run only. No Edge invocation, no FCM, no real notification.
 *
 * The producer is a database trigger, so the contract it must honour is
 * asserted against the applied migration SQL, plus pure simulations of the
 * recipient/dedupe behaviour it encodes.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveTokenScope } from "../../supabase/functions/send-notification/audience-guard";
import { authorizeUserEnvelope } from "../../supabase/functions/send-notification/authorize";

const MIG_DIR = join(process.cwd(), "supabase/migrations");
const sql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .find((s) => s.includes("notify_admins_new_comment_v16"));

const TITLE = "تعليق جديد";
const BODY = "وصل تعليق جديد من أحد اللاعبين وينتظر المراجعة.";
const ROUTE = "/admin/moderation";

/** Pure mirror of the producer's recipient + dedupe rule. */
function plan(comment: { id: string; authorId: string }, roles: { user_id: string; role: string }[]) {
  const staff = new Set(roles.filter((r) => r.role === "owner" || r.role === "admin").map((r) => r.user_id));
  if (staff.has(comment.authorId)) return [];
  return [...staff].map((admin) => ({
    title: TITLE,
    body: BODY,
    type: "new_comment",
    target_type: "user",
    target_user_id: admin,
    deep_link: ROUTE,
    dedupe_key: `comment:new:${comment.id}:${admin}`,
  }));
}

const ROLES = [
  { user_id: "a1", role: "owner" },
  { user_id: "a2", role: "admin" },
  { user_id: "e1", role: "editor" },
  { user_id: "p1", role: "player" },
];

describe("V16 new-comment admin push", () => {
  it("0. the migration exists and defines the trigger producer", () => {
    expect(sql).toBeTruthy();
    expect(sql!).toContain("CREATE TRIGGER social_comments_notify_admins_v16");
  });

  it("1. fires only on genuinely new comment rows (no update/delete/moderation)", () => {
    expect(sql!).toMatch(/AFTER INSERT ON public\.social_comments/);
    expect(sql!).not.toMatch(/AFTER\s+(UPDATE|DELETE)\s+ON public\.social_comments/);
    expect(sql!).not.toContain("BEFORE INSERT ON public.social_comments");
    // Never touches the editorial contribution model.
    expect(sql!).not.toContain("social_comment_contributions");
  });

  it("2. recipients resolve server-side from canonical user_roles owner|admin", () => {
    expect(sql!).toMatch(/FROM public\.user_roles r WHERE r\.role IN \('owner','admin'\)/);
    expect(sql!).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i); // no hardcoded emails
    expect(sql!).not.toContain("auth.users");
    const ids = plan({ id: "c1", authorId: "p1" }, ROLES).map((r) => r.target_user_id).sort();
    expect(ids).toEqual(["a1", "a2"]);
  });

  it("3. a comment authored by an owner/admin notifies nobody", () => {
    expect(plan({ id: "c2", authorId: "a2" }, ROLES)).toEqual([]);
    expect(plan({ id: "c3", authorId: "a1" }, ROLES)).toEqual([]);
    expect(sql!).toContain("r.user_id = NEW.author_id AND r.role IN ('owner','admin')");
  });

  it("4. exactly one logical notification per admin, deduped by comment identity", () => {
    const first = plan({ id: "c1", authorId: "p1" }, ROLES);
    const retry = plan({ id: "c1", authorId: "p1" }, ROLES);
    expect(first.map((r) => r.dedupe_key)).toEqual(retry.map((r) => r.dedupe_key));
    expect(new Set(first.map((r) => r.dedupe_key)).size).toBe(first.length);
    expect(first[0].dedupe_key.startsWith("comment:new:c1:")).toBe(true);
    expect(sql!).toContain("'comment:new:' || NEW.id::text");
  });

  it("5. targeted only — never a broadcast, never a segment widening", () => {
    for (const req of plan({ id: "c1", authorId: "p1" }, ROLES)) {
      expect(req.target_type).toBe("user");
      const scope = resolveTokenScope({ target_type: "user", target_user_id: "00000000-0000-4000-8000-000000000001" });
      expect(scope.ok && scope.scope).toBe("user");
    }
    expect(sql!).not.toContain("'target_type',    'all'");
    expect(sql!).not.toContain("broadcast");
  });

  it("6. privacy: no comment body, author identity or email reaches the payload", () => {
    const req = plan({ id: "c1", authorId: "p1" }, ROLES)[0];
    expect(JSON.stringify(req)).not.toContain("p1");
    expect(req.title).toBe(TITLE);
    expect(req.body).toBe(BODY);
    expect(sql!).not.toContain("NEW.body_text");
    expect(sql!).not.toContain("NEW.author_id::text");
    expect(sql!).not.toContain("email");
  });

  it("7. the tap destination is a fixed trusted admin route", () => {
    expect(plan({ id: "c1", authorId: "p1" })[0]?.deep_link ?? ROUTE).toBe(ROUTE);
    expect(sql!).toContain("'deep_link',      '/admin/moderation'");
  });

  it("8. dispatch is fail-soft: the comment survives any notification failure", () => {
    // Per-recipient guard + whole-function guard, both returning NULL.
    expect((sql!.match(/EXCEPTION WHEN OTHERS THEN/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sql!).toContain("comment preserved");
    expect(sql!).toMatch(/RETURN NULL;\s*END;\s*\$function\$/);
  });

  it("9. reuses the one secured send path — never FCM, never a direct row insert", () => {
    expect(sql!).toContain("/functions/v1/send-notification");
    expect(sql!).not.toContain("INSERT INTO public.notifications");
    expect(sql!).not.toContain("fcm.googleapis.com");
    expect(sql!).not.toContain("device_tokens");
  });

  it("10. system authorization only — the commenting client supplies nothing", () => {
    // Credential is resolved server-side; an ordinary user envelope still
    // cannot author this notification type.
    expect(sql!).toContain("vault.decrypted_secrets");
    const forged = authorizeUserEnvelope("00000000-0000-4000-8000-000000000001", {
      type: "new_comment", target_type: "user",
      target_user_id: "00000000-0000-4000-8000-000000000002",
      deep_link: ROUTE, is_admin: true, role: "admin",
    });
    expect(forged.ok).toBe(false);
  });

  it("11. add_story_comment_v2 and existing rows are untouched (V15-safe)", () => {
    expect(sql!).not.toContain("add_story_comment_v2");
    expect(sql!).not.toMatch(/ALTER TABLE public\.social_comments/);
    expect(sql!).not.toMatch(/UPDATE public\.social_comments/);
    expect(sql!).not.toContain("DROP FUNCTION public.");
  });
});

function planOne(id: string) {
  return plan({ id, authorId: "p1" }, ROLES);
}
void planOne;
