import { describe, expect, it } from "vitest";
import {
  buildGamesExportBundle,
  gamesExportFileName,
  parseGamesImportPayload,
  serializeGame,
} from "@/lib/games/export";
import { validateGameJson } from "@/lib/games/schemas";
import type { GameRow } from "@/lib/games/store";
import type { GameMode } from "@/lib/games/types";

function row(mode: GameMode, i: number, stages: unknown[], extra: Partial<GameRow> = {}): GameRow {
  return {
    id: `id-${mode}-${i}`,
    slug: `${mode}-game-${i}`,
    mode,
    title: `لعبة ${i}`,
    description: "وصف",
    difficulty: 3,
    estimated_time: 7,
    xp_reward: 80,
    coin_reward: 30,
    hearts_penalty: 1,
    related_entities: ["figure:x"],
    metadata: { era: "abbasid", museum_unlocks: ["artifact:astrolabe"] },
    stages,
    status: "published",
    published_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...extra,
  } as GameRow;
}

const STAGES: Record<GameMode, unknown[]> = {
  memory: [{ pairs: [{ a: "أ", b: "ب" }, { a: "ج", b: "د" }, { a: "هـ", b: "و" }] }],
  who_am_i: [{ hints: ["١", "٢", "٣"], answer: "خالد", acceptable: ["خالد بن الوليد"] }],
  chronology: [
    { events: [{ label: "أ", year: 600 }, { label: "ب", year: 610 }, { label: "ج", year: 620 }] },
  ],
  connections: [
    {
      pairs: [
        { left: "أ", right: "ب", relation: "ر" },
        { left: "ج", right: "د", relation: "ر" },
        { left: "هـ", right: "و", relation: "ر" },
      ],
    },
  ],
  crossword: [
    {
      rows: 5,
      cols: 5,
      clues: [
        { number: 1, direction: "across", row: 0, col: 0, answer: "بغداد", hint: "عاصمة" },
        { number: 1, direction: "down", row: 0, col: 0, answer: "بصرة", hint: "مدينة" },
      ],
    },
  ],
};

const MODES = Object.keys(STAGES) as GameMode[];

describe("games bulk export", () => {
  it("file name follows irth-games-{mode}-YYYYMMDD-HHmm.json", () => {
    const at = new Date(2026, 6, 31, 15, 25);
    expect(gamesExportFileName("memory", at)).toBe("irth-games-memory-20260731-1525.json");
  });

  it("bundle count matches the full row set, independent of any UI slice", () => {
    const all = Array.from({ length: 24 }, (_, i) => row("memory", i, STAGES.memory));
    const bundle = buildGamesExportBundle("memory", all);
    expect(bundle.count).toBe(24);
    expect(bundle.games).toHaveLength(24);
    // A filtered/paginated view would have produced fewer rows.
    const paged = buildGamesExportBundle("memory", all.slice(0, 10));
    expect(paged.count).toBe(10);
    expect(bundle.games.length).toBeGreaterThan(paged.games.length);
  });

  it("keeps ids, slugs, status, rewards and all fields", () => {
    const g = row("who_am_i", 1, STAGES.who_am_i);
    const s = serializeGame(g) as any;
    expect(s.id).toBe(g.id);
    expect(s.slug).toBe(g.slug);
    expect(s.status).toBe("published");
    expect(s.rewards).toEqual({ xp: 80, coins: 30, museum_unlocks: ["artifact:astrolabe"] });
    expect(s.metadata).toEqual({ era: "abbasid" });
    expect(s.related_entities).toEqual(["figure:x"]);
    expect(s.stages).toEqual(g.stages);
  });

  it("crossword export keeps the full generated grid data", () => {
    const g = row("crossword", 1, STAGES.crossword);
    const s = serializeGame(g) as any;
    expect(s.stages[0].clues).toHaveLength(2);
    expect(s.stages[0].rows).toBe(5);
  });

  it("every mode round-trips through its own importer without loss", () => {
    for (const mode of MODES) {
      const rows = [row(mode, 1, STAGES[mode]), row(mode, 2, STAGES[mode])];
      const bundle = buildGamesExportBundle(mode, rows);
      const parsedFile = JSON.parse(JSON.stringify(bundle));

      const payload = parseGamesImportPayload(parsedFile);
      expect(payload.ok, mode).toBe(true);
      if (!payload.ok) continue;
      expect(payload.bulk).toBe(true);
      expect(payload.items).toHaveLength(rows.length);

      for (const [i, item] of payload.items.entries()) {
        const res = validateGameJson(mode, item);
        expect(res.ok ? [] : res.errors, `${mode}[${i}]`).toEqual([]);
        if (!res.ok) continue;
        expect(res.value.slug).toBe(rows[i].slug);
        expect(res.value.rewards?.xp).toBe(80);
        expect(res.value.rewards?.coins).toBe(30);
        expect(res.value.stages).toHaveLength(1);
      }
    }
  });

  it("accepts single object and bare array shapes too", () => {
    const single = serializeGame(row("memory", 1, STAGES.memory));
    const one = parseGamesImportPayload(single);
    expect(one.ok && one.bulk).toBe(false);
    expect(one.ok && one.items).toHaveLength(1);

    const arr = parseGamesImportPayload([single, single]);
    expect(arr.ok && arr.bulk).toBe(true);
    expect(arr.ok && arr.items).toHaveLength(2);
  });

  it("rejects empty payloads instead of silently importing nothing", () => {
    expect(parseGamesImportPayload([]).ok).toBe(false);
    expect(parseGamesImportPayload({ games: [] }).ok).toBe(false);
    expect(parseGamesImportPayload("nope").ok).toBe(false);
  });
});
