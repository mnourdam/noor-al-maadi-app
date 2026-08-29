/**
 * V16 — CONTRIBUTIONS + COMMUNITY COMMENTS WORKSHOP
 *
 * Dry-run only: pure classifier assertions plus contract assertions against
 * the applied migration SQL. No push is sent, no RPC is invoked.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classifyFeedbackSender, isStaffMessage } from "../../src/lib/feedback/sender";

const MIG_DIR = join(process.cwd(), "supabase/migrations");
const sql =
  readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
    .find((s) => s.includes("is_feedback_staff")) ?? "";
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

const REPORTER = "player-1";

describe("feedback sender classification", () => {
  it("1. a message authored by the contribution owner renders as the player", () => {
    expect(classifyFeedbackSender({ author_id: REPORTER, author_role: "player" }, REPORTER)).toBe("player");
  });

  it("2. a staff-authored message renders as فريق إرث", () => {
    expect(classifyFeedbackSender({ author_id: "admin-1", author_role: "admin" }, REPORTER)).toBe("staff");
    expect(isStaffMessage({ author_id: "admin-1", author_role: "admin" }, REPORTER)).toBe(true);
  });

  it("3. legacy rows mislabelled admin but authored by the owner stay player-side", () => {
    expect(classifyFeedbackSender({ author_id: REPORTER, author_role: "admin" }, REPORTER)).toBe("player");
  });

  it("4. unknown / legacy null sender never becomes admin", () => {
    expect(classifyFeedbackSender({ author_id: null, author_role: "admin" }, REPORTER)).toBe("player");
    expect(classifyFeedbackSender({ author_id: null, author_role: null }, REPORTER)).toBe("player");
    expect(classifyFeedbackSender({ author_id: "x", author_role: "weird" }, REPORTER)).toBe("player");
  });

  it("5. authorship never depends on position/order", () => {
    const thread = [
      { author_id: REPORTER, author_role: "admin" },
      { author_id: "admin-1", author_role: "admin" },
      { author_id: REPORTER, author_role: "admin" },
    ];
    expect(thread.map((m) => classifyFeedbackSender(m, REPORTER))).toEqual(["player", "staff", "player"]);
  });
});

describe("feedback backend contract", () => {
  it("6. the migration exists and adds the canonical staff predicate", () => {
    expect(sql).toBeTruthy();
    expect(code).toContain("CREATE OR REPLACE FUNCTION public.is_feedback_staff");
    expect(code).toMatch(/role IN \('owner','admin','editor'\)/);
  });

  it("7. reply role no longer comes from is_content_editor()", () => {
    const reply = code.split("reply_to_feedback_issue")[1] ?? "";
    expect(reply).toContain("public.is_feedback_staff(auth.uid())");
    expect(reply.split("$function$")[1] ?? "").not.toContain("is_content_editor");
  });

  it("8. dashboard stats accept owner/editor, not only exact admin", () => {
    const stats = code.split("admin_feedback_stats")[1] ?? "";
    expect(stats).toContain("public.is_feedback_staff(auth.uid())");
    expect(stats).not.toContain("has_role(auth.uid(), 'admin')");
  });

  it("9. admin reply pushes only the contribution owner, never the author", () => {
    const trg = code.split("feedback_messages_after_insert")[1] ?? "";
    expect(trg).toContain("v_reporter IS DISTINCT FROM NEW.author_id");
    expect(trg).toContain("'رد جديد من فريق إرث'");
    expect(trg).toContain("'/feedback/' || NEW.issue_id::text");
    expect(trg).not.toContain("target_type', 'all'");
  });

  it("10. status change pushes only the reporter with the human-readable status", () => {
    const st = code.split("set_feedback_issue_status")[1] ?? "";
    expect(st).toContain("_feedback_dispatch_push");
    expect(st).toContain("'feedback:status:'");
    expect(st).toContain("'/feedback/' || p_issue_id::text");
  });

  it("11. one dispatch per mutation — dedupe keys are stable and distinct", () => {
    expect(code).toContain("'feedback:reply:' || NEW.id::text");
    expect(code).toContain("'feedback:status:' || p_issue_id::text || ':' || p_status");
  });

  it("12. push failure never fails the reply / status mutation", () => {
    expect(code).toContain("RETURN false");
    expect((code.match(/EXCEPTION WHEN OTHERS THEN/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(code).toContain("mutation preserved");
    expect(code).toContain("message preserved");
  });

  it("13. a new normal comment no longer opens the report-only queue", () => {
    const trg = code.split("notify_admins_new_comment_v16").slice(1).join("\n");
    expect(trg).not.toContain("/admin/moderation");
    expect(trg).toContain("'/encyclopedia/entity/'");
    expect(trg).toContain("'?comment='");
    // Privacy: still no comment body or author identity in the payload.
    expect(trg).not.toContain("NEW.body_text");
    expect(trg).toContain("'وصل تعليق جديد من أحد اللاعبين وينتظر المراجعة.'");
  });

  it("14. player destinations are never admin routes", () => {
    const player = [
      code.split("feedback_messages_after_insert")[1] ?? "",
      code.split("set_feedback_issue_status")[1] ?? "",
    ].join("\n").split("$function$").slice(0, 3).join("\n");
    expect(player).not.toContain("/admin/");
  });

  it("15. additive only — no drops, renames or retypes", () => {
    expect(code).not.toMatch(/DROP (FUNCTION|TABLE|COLUMN)/i);
    expect(code).not.toMatch(/ALTER TABLE public\.feedback_/i);
    expect(code).not.toMatch(/DELETE FROM public\.feedback_/i);
  });
});
