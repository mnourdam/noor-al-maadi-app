// ============================================================
// Reflective Moments — persistence + mode resolution
// ------------------------------------------------------------
// Verifies:
//   • Mode inference from authored fields
//   • Round-trip save/get of chosen option and free text
//   • Resume-after-reload preserves state (via mocked localStorage)
//   • Repeated saves are idempotent per (campaignId, activityId)
// ============================================================

import { beforeEach, describe, expect, test } from "bun:test";
import type { CampaignActivity } from "@/types/campaign";
import {
  REFLECTIONS_KEY,
  getReflection,
  saveReflection,
  resolveReflectionMode,
  reflectionChoices,
} from "@/lib/reflections";

// jsdom-lite: bun:test runs in node — provide a localStorage stub scoped to
// each test so state does not leak across cases.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
  key(i: number) { return Array.from(this.data.keys())[i] ?? null; }
  get length() { return this.data.size; }
}

beforeEach(() => {
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
    localStorage: new MemoryStorage(),
  };
});

function activity(patch: Partial<CampaignActivity>): CampaignActivity {
  return {
    id: patch.id ?? "a1",
    type: "reflection_prompt",
    prompt: "ماذا تعلّمت؟",
    ...patch,
  };
}

describe("resolveReflectionMode", () => {
  test("continue when no options and no explicit mode", () => {
    expect(resolveReflectionMode(activity({}))).toBe("continue");
  });
  test("choose inferred from ≥2 non-empty options", () => {
    expect(resolveReflectionMode(activity({ options: ["صبر", "حكمة"] }))).toBe("choose");
  });
  test("empty options do not trigger choose", () => {
    expect(resolveReflectionMode(activity({ options: ["", "  "] }))).toBe("continue");
  });
  test("authored write wins over options", () => {
    expect(
      resolveReflectionMode(activity({ reflectionMode: "write", options: ["a", "b"] })),
    ).toBe("write");
  });
  test("authored continue wins over options", () => {
    expect(
      resolveReflectionMode(activity({ reflectionMode: "continue", options: ["a", "b"] })),
    ).toBe("continue");
  });
  test("authored choose downgrades to continue when options missing", () => {
    expect(resolveReflectionMode(activity({ reflectionMode: "choose" }))).toBe("continue");
  });
});

describe("reflectionChoices", () => {
  test("trims and filters empties", () => {
    expect(reflectionChoices(activity({ options: [" صبر ", "", "حكمة"] }))).toEqual([
      "صبر",
      "حكمة",
    ]);
  });
});

describe("persistence", () => {
  test("save + get round-trip for choose mode", () => {
    saveReflection("c1", "a1", { mode: "choose", choiceIndex: 1, choiceValue: "حكمة" });
    const r = getReflection("c1", "a1");
    expect(r?.mode).toBe("choose");
    expect(r?.choiceIndex).toBe(1);
    expect(r?.choiceValue).toBe("حكمة");
    expect(typeof r?.at).toBe("string");
  });

  test("save + get round-trip for write mode", () => {
    saveReflection("c1", "a1", { mode: "write", text: "الصبر مفتاح الفرج" });
    expect(getReflection("c1", "a1")?.text).toBe("الصبر مفتاح الفرج");
  });

  test("resume after reload preserves state", () => {
    saveReflection("c1", "a1", { mode: "choose", choiceIndex: 0, choiceValue: "صبر" });
    // Simulate reload: preserve underlying storage, blow away module cache.
    const raw = (globalThis as any).window.localStorage.getItem(REFLECTIONS_KEY);
    (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = {
      localStorage: new MemoryStorage(),
    };
    (globalThis as any).window.localStorage.setItem(REFLECTIONS_KEY, raw!);
    const r = getReflection("c1", "a1");
    expect(r?.choiceValue).toBe("صبر");
  });

  test("repeated save is idempotent per (campaignId, activityId)", () => {
    saveReflection("c1", "a1", { mode: "choose", choiceIndex: 1, choiceValue: "حكمة" });
    saveReflection("c1", "a1", { mode: "choose", choiceIndex: 2, choiceValue: "شجاعة" });
    const store = JSON.parse(
      (globalThis as any).window.localStorage.getItem(REFLECTIONS_KEY)!,
    );
    expect(Object.keys(store).length).toBe(1);
    expect(store["c1:a1"].choiceValue).toBe("شجاعة");
  });

  test("returns null when no record exists", () => {
    expect(getReflection("nope", "nope")).toBeNull();
  });

  test("SSR-safe when window is undefined", () => {
    // @ts-expect-error deliberately clearing
    delete (globalThis as any).window;
    expect(getReflection("c1", "a1")).toBeNull();
    // Should not throw:
    saveReflection("c1", "a1", { mode: "continue" });
  });
});
