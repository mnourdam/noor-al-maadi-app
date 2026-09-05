// @vitest-environment jsdom
//
// V17-07A — Encyclopedia comment HEARTS regression coverage.
//
// Scope: comment hearts only. Replies are V17-07B and are deliberately
// absent from both the product and this suite.
//
// What is locked in here:
//   1. Viewer heart state comes from the SERVER contract (`my_heart`),
//      never inferred client-side.
//   2. The optimistic toggle updates instantly, adopts authoritative
//      server { active, count }, and rolls back exactly on failure.
//   3. The source `row` object is never mutated by the heart control.
//   4. The count can never render negative.
//   5. One request in flight per card (rapid-tap protection).
//   6. Offline is rejected without mutating state — no outbox.
//   7. Accessibility: aria-pressed reflects state, aria-label carries
//      the action and the count.
//   8. No realtime subscription is introduced by the heart path.
//
// Server-side guarantees (single reaction per user/comment, first-heart-only
// notification, self-heart suppression, hidden/removed/nonexistent rejection,
// helpful_count invariant, direct-INSERT rejection, story/entity
// non-regression) are enforced in the database and were verified against
// production inside a rolled-back transaction; the source guards below
// assert the client cannot bypass that authority.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------
// Mocks — isolate the heart control from network, auth and chrome.
// ---------------------------------------------------------------

const toggleReaction = vi.fn();
let online = true;
const toastError = vi.fn();

vi.mock("@/lib/social/reactions", () => ({
  toggleReaction: (...args: unknown[]) => toggleReaction(...args),
}));

vi.mock("@/hooks/useOnline", () => ({
  useOnline: () => online,
}));

vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), channel: vi.fn() },
}));

vi.mock("@/components/EmblemArt", () => ({
  EmblemArt: () => null,
}));

vi.mock("@/components/social/ReportCommentButton", () => ({
  ReportCommentButton: () => null,
}));

vi.mock("@/components/social/ContributionBadge", () => ({
  ContributionBadge: () => null,
}));

const { CommentItem } = await import("@/components/social/CommentItem");
import type { SocialCommentRow } from "@/lib/social/comments";

// ---------------------------------------------------------------
// Harness
// ---------------------------------------------------------------

const VIEWER = "11111111-1111-1111-1111-111111111111";
const AUTHOR = "22222222-2222-2222-2222-222222222222";

function makeRow(over: Partial<SocialCommentRow> = {}): SocialCommentRow {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    anchor_type: "entity",
    anchor_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    author_id: AUTHOR,
    body_text: "تأمّل قصير.",
    status: "visible",
    helpful_count: 3,
    editors_note: false,
    editors_note_rank: null,
    edit_deadline_at: new Date(Date.now() - 1000).toISOString(),
    edited_at: null,
    created_at: new Date("2026-01-01T00:00:00Z").toISOString(),
    is_mine: false,
    my_heart: false,
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

function render(row: SocialCommentRow, currentUserId: string | null = VIEWER) {
  act(() => {
    root.render(
      <CommentItem
        row={row}
        onChange={() => {}}
        onDelete={() => {}}
        currentUserId={currentUserId}
      />,
    );
  });
}

function heartButton(): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>("button[aria-pressed]");
  if (!btn) throw new Error("heart button not found");
  return btn;
}

async function click(btn: HTMLButtonElement) {
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  online = true;
  toggleReaction.mockReset();
  toastError.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// ---------------------------------------------------------------
// 1. Rendering from the server contract
// ---------------------------------------------------------------

describe("heart rendering", () => {
  it("renders an unhearted comment with the server count", () => {
    render(makeRow({ my_heart: false, helpful_count: 3 }));
    const btn = heartButton();
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.textContent).toContain("3");
    expect(btn.getAttribute("aria-label")).toContain("استزدتُ");
  });

  it("renders a hearted comment in the active state", () => {
    render(makeRow({ my_heart: true, helpful_count: 7 }));
    const btn = heartButton();
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.textContent).toContain("7");
    expect(btn.getAttribute("aria-label")).toContain("إلغاء");
  });

  it("takes viewer heart state from the server, never from is_mine", () => {
    // A comment the viewer wrote but has NOT hearted must render unhearted.
    render(makeRow({ is_mine: true, author_id: VIEWER, my_heart: false }));
    expect(heartButton().getAttribute("aria-pressed")).toBe("false");
  });

  it("treats a missing count as zero and never renders a negative", () => {
    render(makeRow({ helpful_count: 0, my_heart: true }));
    expect(heartButton().textContent).toContain("0");
  });
});

// ---------------------------------------------------------------
// 2. Optimistic behaviour
// ---------------------------------------------------------------

describe("optimistic heart toggle", () => {
  it("hearts optimistically and adopts the authoritative server state", async () => {
    let resolveRpc: (v: unknown) => void = () => {};
    toggleReaction.mockReturnValue(
      new Promise((r) => {
        resolveRpc = r;
      }),
    );

    render(makeRow({ my_heart: false, helpful_count: 3 }));
    const btn = heartButton();
    await click(btn);

    // Optimistic, before the RPC settles.
    expect(heartButton().getAttribute("aria-pressed")).toBe("true");
    expect(heartButton().textContent).toContain("4");

    // Server is authoritative — another player hearted concurrently.
    await act(async () => {
      resolveRpc({ ok: true, active: true, count: 9 });
    });
    expect(heartButton().textContent).toContain("9");
    expect(heartButton().getAttribute("aria-pressed")).toBe("true");
  });

  it("unhearts optimistically", async () => {
    toggleReaction.mockResolvedValue({ ok: true, active: false, count: 2 });
    render(makeRow({ my_heart: true, helpful_count: 3 }));
    await click(heartButton());
    expect(heartButton().getAttribute("aria-pressed")).toBe("false");
    expect(heartButton().textContent).toContain("2");
  });

  it("calls the RPC with the comment anchor and the comment id", async () => {
    toggleReaction.mockResolvedValue({ ok: true, active: true, count: 4 });
    const row = makeRow();
    render(row);
    await click(heartButton());
    expect(toggleReaction).toHaveBeenCalledWith("comment", row.id);
  });

  it("never renders a negative count even if the server reports one", async () => {
    toggleReaction.mockResolvedValue({ ok: true, active: false, count: -5 });
    render(makeRow({ my_heart: true, helpful_count: 0 }));
    await click(heartButton());
    expect(heartButton().textContent).toContain("0");
    expect(heartButton().textContent).not.toContain("-");
  });
});

// ---------------------------------------------------------------
// 3. Failure, rollback, rapid taps
// ---------------------------------------------------------------

describe("failure handling", () => {
  it("rolls back to the exact pre-toggle state on RPC failure", async () => {
    toggleReaction.mockResolvedValue({ ok: false, reason: "anchor_not_found" });
    render(makeRow({ my_heart: false, helpful_count: 3 }));
    await click(heartButton());
    expect(heartButton().getAttribute("aria-pressed")).toBe("false");
    expect(heartButton().textContent).toContain("3");
    expect(toastError).toHaveBeenCalled();
  });

  it("rolls back an unheart failure too", async () => {
    toggleReaction.mockResolvedValue({ ok: false, reason: "auth_required" });
    render(makeRow({ my_heart: true, helpful_count: 6 }));
    await click(heartButton());
    expect(heartButton().getAttribute("aria-pressed")).toBe("true");
    expect(heartButton().textContent).toContain("6");
  });

  it("ignores rapid repeat taps while a request is in flight", async () => {
    let resolveRpc: (v: unknown) => void = () => {};
    toggleReaction.mockReturnValue(
      new Promise((r) => {
        resolveRpc = r;
      }),
    );
    render(makeRow({ my_heart: false, helpful_count: 3 }));

    const btn = heartButton();
    await click(btn);
    await click(heartButton());
    await click(heartButton());

    expect(toggleReaction).toHaveBeenCalledTimes(1);
    expect(heartButton().textContent).toContain("4");

    await act(async () => {
      resolveRpc({ ok: true, active: true, count: 4 });
    });
    expect(toggleReaction).toHaveBeenCalledTimes(1);
  });

  it("disables the button while the request is in flight", async () => {
    let resolveRpc: (v: unknown) => void = () => {};
    toggleReaction.mockReturnValue(
      new Promise((r) => {
        resolveRpc = r;
      }),
    );
    render(makeRow());
    await click(heartButton());
    expect(heartButton().disabled).toBe(true);
    await act(async () => {
      resolveRpc({ ok: true, active: true, count: 4 });
    });
    expect(heartButton().disabled).toBe(false);
  });

  it("does not mutate the source comment object", async () => {
    toggleReaction.mockResolvedValue({ ok: true, active: true, count: 99 });
    const row = makeRow({ my_heart: false, helpful_count: 3 });
    const snapshot = JSON.stringify(row);
    render(row);
    await click(heartButton());
    expect(JSON.stringify(row)).toBe(snapshot);
    expect(row.helpful_count).toBe(3);
    expect(row.my_heart).toBe(false);
  });
});

// ---------------------------------------------------------------
// 4. Offline and guests — no outbox, no local truth
// ---------------------------------------------------------------

describe("offline and guests", () => {
  it("rejects a heart while offline without touching state or the network", async () => {
    online = false;
    render(makeRow({ my_heart: false, helpful_count: 3 }));
    await click(heartButton());
    expect(toggleReaction).not.toHaveBeenCalled();
    expect(heartButton().getAttribute("aria-pressed")).toBe("false");
    expect(heartButton().textContent).toContain("3");
    expect(toastError).toHaveBeenCalled();
  });

  it("does not queue the heart for later — no outbox machinery exists", () => {
    const src = read("src/components/social/CommentItem.tsx");
    // Prose in the header comment may say "no outbox"; what must not exist is
    // any persistence or queue mechanism behind the heart action.
    const code = src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/localStorage|idb|indexedDB|enqueue|outbox|retryQueue/i);
  });


  it("prompts a guest to sign in instead of calling the RPC", async () => {
    render(makeRow(), null);
    await click(heartButton());
    expect(toggleReaction).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------
// 5. Source guards — authority, scope and no realtime
// ---------------------------------------------------------------

describe("V17-07A source guards", () => {
  const item = read("src/components/social/CommentItem.tsx");
  const reactions = read("src/lib/social/reactions.ts");
  const comments = read("src/lib/social/comments.ts");
  const storyComments = read("src/components/social/StoryComments.tsx");
  const replies = read("src/components/social/CommentReplies.tsx");

  it("mutates reactions only through the validated toggle RPC", () => {
    expect(item).toContain("toggleReaction");
    // No direct table access anywhere in the social client layer.
    for (const src of [item, reactions, comments, storyComments]) {
      expect(src).not.toMatch(/\.from\(\s*["'`]social_reactions["'`]\s*\)/);
    }
  });

  it("adds no realtime subscription", () => {
    for (const src of [item, reactions, comments, storyComments]) {
      expect(src).not.toMatch(/\.channel\(|postgres_changes|subscribe\(/);
    }
  });

  it("exposes server-computed my_heart on the comment row contract", () => {
    expect(comments).toMatch(/my_heart\?:\s*boolean/);
  });

  // V17-07B shipped ONE level of replies. The guard now protects the depth
  // limit instead of the absence of replies.
  it("keeps replies to a single level in the UI", () => {
    // A reply card must never render its own reply affordance.
    expect(item).toMatch(/!isReply && onReply/);
    // The replies block never nests another replies block.
    expect(replies).not.toMatch(/<CommentReplies/);
  });

  it("keeps comment pagination and ordering untouched", () => {
    expect(comments).toContain("editors_helpful_new");
    expect(comments).toContain("next_cursor");
    expect(storyComments).toContain("loadMore");
  });
});
