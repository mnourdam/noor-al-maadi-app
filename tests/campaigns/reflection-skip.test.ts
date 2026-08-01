import { describe, it, expect, beforeEach } from "vitest";
import {
  reflectionAction,
  hasReflectionText,
  canSkipReflection,
} from "@/lib/campaigns/reflectionAction";
import {
  markReflectionSkipped,
  getReflection,
  saveReflection,
  listAllReflections,
} from "@/lib/reflections";

const base = { text: "", resolved: false, saved: false, isReplay: false, editing: false };

describe("reflective moment — skip vs save separation", () => {
  it("shows SKIP when nothing is written", () => {
    expect(reflectionAction(base)).toBe("skip");
  });

  it("treats whitespace-only input as empty (still SKIP)", () => {
    expect(hasReflectionText("   \n\t ")).toBe(false);
    expect(reflectionAction({ ...base, text: "   " })).toBe("skip");
  });

  it("shows SAVE only once real text exists", () => {
    expect(reflectionAction({ ...base, text: "تأمل" })).toBe("save");
  });

  it("shows NEXT after a written reflection was saved", () => {
    expect(
      reflectionAction({ ...base, text: "تأمل", resolved: true, saved: true }),
    ).toBe("next");
  });

  it("shows EDIT on replay of a completed moment", () => {
    expect(reflectionAction({ ...base, resolved: true, isReplay: true })).toBe("edit");
  });

  it("skip is never gated by input — only by the double-tap lock", () => {
    expect(canSkipReflection(false)).toBe(true);
    expect(canSkipReflection(true)).toBe(false);
  });
});

describe("skip persistence", () => {
  beforeEach(() => {
    // Minimal browser storage stub — reflections are a local-first store.
    const mem = new Map<string, string>();
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
      },
      dispatchEvent: () => true,
    };
    (globalThis as any).CustomEvent = class { constructor(public type: string) {} };
  });


  it("records a skip without writing an empty reflection to the journal", () => {
    markReflectionSkipped("camp-1", "act-1", "write");
    const rec = getReflection("camp-1", "act-1");
    expect(rec?.skipped).toBe(true);
    expect(rec?.text ?? "").toBe("");
    expect(listAllReflections().some(e => e.activityId === "act-1")).toBe(false);
  });

  it("never clobbers an existing written reflection with a skip marker", () => {
    saveReflection("camp-1", "act-2", { mode: "write", text: "نص محفوظ" });
    markReflectionSkipped("camp-1", "act-2", "write");
    const rec = getReflection("camp-1", "act-2");
    expect(rec?.skipped).toBeFalsy();
    expect(rec?.text).toBe("نص محفوظ");
  });
});
