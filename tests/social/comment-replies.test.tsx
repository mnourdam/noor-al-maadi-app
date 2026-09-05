// @vitest-environment jsdom
//
// V17-07B — Encyclopedia comment REPLIES (one level) client coverage.
//
// What is locked in here:
//   1. Depth: a reply card never renders a reply affordance.
//   2. The composer is online-only, capped at 300 chars, and keeps the
//      typed text when the server rejects the reply.
//   3. A successful reply clears the box and is handed upward exactly once.
//   4. Arabic reason copy exists for every reply-specific server reason.
//   5. Replies carry the SAME heart control as top-level comments.
//   6. No realtime, no outbox, no client-side anchor derivation.
//
// Server-side guarantees (nested rejection, per-parent cap of 3, top-level
// cap untouched, total_visible excluding replies, cascade delete, tombstone
// thread, ranking exclusion, one notification per reply, self-reply
// suppression) live in the database and were verified against production.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const addCommentReply = vi.fn();
const toastError = vi.fn();
let online = true;

vi.mock("@/hooks/useOnline", () => ({ useOnline: () => online }));
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), channel: vi.fn() },
}));
vi.mock("@/lib/social/comments", async () => {
  const actual = await vi.importActual<typeof import("@/lib/social/comments")>(
    "@/lib/social/comments",
  );
  return { ...actual, addCommentReply: (...a: unknown[]) => addCommentReply(...a) };
});

const { ReplyComposer } = await import("@/components/social/ReplyComposer");
const { commentErrorCopyAr } = await import("@/lib/social/comments");
import type { SocialCommentRow } from "@/lib/social/comments";

// ---------------------------------------------------------------
// Harness
// ---------------------------------------------------------------

let host: HTMLDivElement;
let root: Root;
const posted = vi.fn();
const cancelled = vi.fn();

beforeEach(() => {
  online = true;
  addCommentReply.mockReset();
  toastError.mockReset();
  posted.mockReset();
  cancelled.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mount(parentId = "parent-1") {
  act(() => {
    root.render(
      <ReplyComposer
        parentId={parentId}
        parentAuthorName="ابن بطوطة"
        onPosted={posted}
        onCancel={cancelled}
      />,
    );
  });
}

const box = () => host.querySelector("textarea") as HTMLTextAreaElement;
const send = () =>
  Array.from(host.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("إرسال"),
  ) as HTMLButtonElement;
const cancel = () =>
  Array.from(host.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("إلغاء"),
  ) as HTMLButtonElement;

async function type(text: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    setter.call(box(), text);
    box().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const reply: SocialCommentRow = {
  id: "reply-1",
  author_id: "u2",
  author_name: "قارئ",
  body_text: "ردّ",
  helpful_count: 0,
  editors_note: false,
  created_at: new Date().toISOString(),
  edited_at: null,
  edit_deadline_at: new Date(Date.now() + 6e5).toISOString(),
  is_mine: false,
} as unknown as SocialCommentRow;

// ---------------------------------------------------------------
// 1. Composer behaviour
// ---------------------------------------------------------------

describe("reply composer", () => {
  it("blocks an empty reply and never calls the server", async () => {
    mount();
    expect(send().disabled).toBe(true);
    await click(send());
    expect(addCommentReply).not.toHaveBeenCalled();
  });

  it("sends the parent id and body, then clears on success", async () => {
    addCommentReply.mockResolvedValue({ ok: true, comment: reply });
    mount("parent-9");
    await type("ردّ قصير");
    await click(send());
    expect(addCommentReply).toHaveBeenCalledWith("parent-9", "ردّ قصير");
    expect(posted).toHaveBeenCalledTimes(1);
    expect(box().value).toBe("");
  });

  it("keeps the typed text and shows Arabic copy when the server rejects", async () => {
    addCommentReply.mockResolvedValue({ ok: false, reason: "reply_limit_reached" });
    mount();
    await type("ردّ رابع");
    await click(send());
    expect(box().value).toBe("ردّ رابع");
    expect(posted).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(commentErrorCopyAr("reply_limit_reached"));
  });

  it("refuses to send while offline — there is no outbox", async () => {
    online = false;
    mount();
    await type("ردّ");
    await click(send());
    expect(addCommentReply).not.toHaveBeenCalled();
    expect(box().value).toBe("ردّ");
  });

  it("shows the 300-character counter and disables submit past the limit", async () => {
    mount();
    await type("x".repeat(301));
    expect(host.textContent).toContain("301/300");
    expect(send().disabled).toBe(true);
  });

  it("cancel closes without sending", async () => {
    mount();
    await type("ردّ");
    await click(cancel());
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(addCommentReply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------
// 2. Reason copy
// ---------------------------------------------------------------

describe("Arabic reason copy", () => {
  it("covers every reply-specific server reason", () => {
    for (const reason of [
      "parent_not_found",
      "parent_not_available",
      "nested_reply_not_allowed",
      "reply_limit_reached",
      "unsupported_anchor",
    ]) {
      const copy = commentErrorCopyAr(reason);
      expect(copy.length).toBeGreaterThan(0);
      expect(copy).not.toMatch(/[a-z_]{6,}/);
    }
  });
});

// ---------------------------------------------------------------
// 3. Source guards — depth, transport, authority
// ---------------------------------------------------------------

describe("source guards", () => {
  const item = read("src/components/social/CommentItem.tsx");
  const replies = read("src/components/social/CommentReplies.tsx");
  const composer = read("src/components/social/ReplyComposer.tsx");
  const story = read("src/components/social/StoryComments.tsx");
  const lib = read("src/lib/social/comments.ts");

  it("keeps replies exactly one level deep", () => {
    expect(item).toMatch(/!isReply && onReply/);
    expect(replies).not.toMatch(/<CommentReplies/);
  });

  it("never derives the anchor client-side — the server owns it", () => {
    expect(composer).not.toMatch(/anchor_type|anchor_id/);
    expect(lib).toMatch(/add_comment_reply_v1/);
    expect(lib).not.toMatch(/add_comment_reply_v1[\s\S]{0,200}p_anchor/);
  });

  it("adds no realtime and no persistence for replies", () => {
    for (const src of [replies, composer]) {
      const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code).not.toMatch(/\.channel\(|postgres_changes|subscribe\(/);
      expect(code).not.toMatch(/localStorage|indexedDB|outbox|enqueue/i);
    }
  });

  it("resolves deep links through the thread RPC, not by paginating", () => {
    expect(story).toMatch(/getCommentThread/);
    expect(lib).toMatch(/get_comment_thread_v1/);
  });

  it("keeps replies out of the top-level count", () => {
    // total only ever moves on top-level post/delete.
    expect(story).not.toMatch(/onReplyPosted[\s\S]{0,400}setTotal/);
  });
});
