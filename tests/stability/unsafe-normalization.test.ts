/**
 * Regression tests for the P0 Android crash loop:
 *
 *   TypeError: Cannot read properties of undefined (reading 'toLowerCase')
 *   route before: /investigations?world=
 *
 * Root cause: untrusted rows (localStorage content registry + offline snapshot)
 * were normalized with a direct `.toLowerCase()`. Because the bad row lived in
 * localStorage it survived force-close, so every launch re-crashed on Home.
 */
import { afterEach, describe, expect, it } from "vitest";
import { optionalText, safeCompare, safeKey, safeText } from "@/lib/text/safe-text";

describe("safe-text normalization", () => {
  it("never throws on non-string input", () => {
    for (const v of [undefined, null, 0, NaN, {}, [], true, Symbol.iterator]) {
      expect(() => safeKey(v as unknown)).not.toThrow();
      expect(() => safeText(v as unknown)).not.toThrow();
    }
  });

  it("lowercases and trims real strings", () => {
    expect(safeKey("  Cave_Of_HIRA ")).toBe("cave_of_hira");
    expect(safeText("  x ")).toBe("x");
  });

  it("returns empty string for unusable values", () => {
    expect(safeKey(undefined)).toBe("");
    expect(safeKey(null)).toBe("");
    expect(safeKey({})).toBe("");
  });

  it("optionalText drops empty search-param values", () => {
    expect(optionalText("")).toBeUndefined();
    expect(optionalText("   ")).toBeUndefined();
    expect(optionalText(undefined)).toBeUndefined();
    expect(optionalText("prophetic")).toBe("prophetic");
  });

  it("safeCompare tolerates missing values", () => {
    expect(() => safeCompare(undefined, "a")).not.toThrow();
    expect(safeCompare("a", "b")).toBeLessThan(0);
  });
});

describe("content registry sanitization", () => {
  // `vi.unstubAllGlobals` is not implemented by the bun test runner's vitest
  // shim, so globals are saved and restored by hand here.
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, localStorage: g.localStorage };

  afterEach(() => {
    g.window = saved.window;
    g.localStorage = saved.localStorage;
  });

  it("drops rows without a usable id (the row that survived force-close)", async () => {
    const poisoned = JSON.stringify([
      { id: "figure_salah", type: "figure", name: "صلاح" },
      { id: undefined, type: "figure", name: "بدون معرّف" },
      { type: "artifact", name: "بدون معرّف" },
      { id: "   ", type: "city", name: "فراغ" },
      null,
      "not-an-object",
    ]);
    const store = {
      getItem: (k: string) => (k === "irth_content_registry" ? poisoned : null),
      setItem: () => {},
      removeItem: () => {},
      key: () => null,
      clear: () => {},
      length: 0,
    };
    vi.stubGlobal("window", { localStorage: store });
    vi.stubGlobal("localStorage", store);

    const { listRegistry } = await import("@/lib/contentRegistryStorage");
    const items = listRegistry();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("figure_salah");
    // Every surviving row is safe to normalize.
    expect(() => items.map((i) => i.id.toLowerCase())).not.toThrow();
  });
});

describe("world search-param write contract", () => {
  it("an empty world param never resolves to a filter", () => {
    // `?world=` (empty) and a missing param must behave identically.
    expect(safeKey("")).toBe("");
    expect(safeKey(undefined)).toBe("");
  });
});
