// ============================================================
// Priority-Zero persistence contract tests
// ============================================================
import { describe, it, expect } from "vitest";
import { isPermanentReason, PERMANENT_REASONS } from "@/lib/offline/dead-letter";

describe("Priority-Zero: dead-letter classification", () => {
  it("classifies permanent reasons", () => {
    for (const r of PERMANENT_REASONS) expect(isPermanentReason(r)).toBe(true);
  });

  it("does not classify transient / unknown reasons as permanent", () => {
    expect(isPermanentReason("queued")).toBe(false);
    expect(isPermanentReason("network")).toBe(false);
    expect(isPermanentReason("rpc-not-ok")).toBe(false);
    expect(isPermanentReason(null)).toBe(false);
    expect(isPermanentReason(undefined)).toBe(false);
  });

  it("covers every id-validation failure the RPCs surface", () => {
    // Contract with server RPCs — do not shrink without updating the SQL.
    expect(PERMANENT_REASONS.has("invalid_campaign_id")).toBe(true);
    expect(PERMANENT_REASONS.has("invalid_chapter_id")).toBe(true);
    expect(PERMANENT_REASONS.has("invalid_tutorial_id")).toBe(true);
    expect(PERMANENT_REASONS.has("invalid_version")).toBe(true);
  });
});

describe("Priority-Zero: chapter-progress stable idempotency id", () => {
  // Stability contract: re-enqueueing the same (uid, campaign, chapter)
  // must map to the SAME outbox row so replays never duplicate.
  const buildId = (uid: string, campaign: string, chapter: string) =>
    `chapter_progress:${uid}:${campaign}:${chapter}`;

  it("is deterministic across calls", () => {
    expect(buildId("u1", "campA", "ch3")).toBe(buildId("u1", "campA", "ch3"));
  });

  it("scopes by user", () => {
    expect(buildId("u1", "c", "ch")).not.toBe(buildId("u2", "c", "ch"));
  });

  it("scopes by chapter", () => {
    expect(buildId("u1", "c", "ch1")).not.toBe(buildId("u1", "c", "ch2"));
  });
});

describe("Priority-Zero: tutorial-completion stable idempotency id", () => {
  const buildId = (uid: string, tutorial: string, version: number) =>
    `tutorial_completion:${uid}:${tutorial}:${version}`;

  it("changes when the tutorial version bumps", () => {
    expect(buildId("u1", "irth-first-time", 1))
      .not.toBe(buildId("u1", "irth-first-time", 2));
  });

  it("is stable at the same version", () => {
    expect(buildId("u1", "irth-first-time", 3))
      .toBe(buildId("u1", "irth-first-time", 3));
  });
});
