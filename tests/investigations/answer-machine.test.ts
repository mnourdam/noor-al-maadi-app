// ============================================================
// Phase 3 closing — unit tests for the investigation answer
// state machine + difficulty mapping + encyclopedia refs +
// filter persistence.
//
// Runs with `bun test tests/investigations/`.
// ============================================================
import { describe, it, expect } from "bun:test";
import {
  initialAnswerState,
  pick,
  confirm,
  retry,
  next,
  canAdvance,
  isCompletable,
  type AnswerStep,
} from "../../src/lib/investigations/answer-machine";
import { displayDifficulty, canonicalDifficulty } from "../../src/lib/investigations-source";

const Q = (correct: number): AnswerStep => ({ kind: "question", correctAnswer: correct });
const B: AnswerStep = { kind: "briefing" };
const D: AnswerStep = { kind: "decision" }; // no correctAnswer → auto-correct

describe("answer machine — wrong then correct retry", () => {
  const steps = [B, Q(1), Q(0)] as const;

  it("1. unanswered + wrong confirm → incorrect", () => {
    let s = initialAnswerState();
    s = next(s, steps); // advance past briefing (non-question)
    s = pick(s, 0); // wrong pick
    s = confirm(s, steps[s.idx]);
    expect(s.answer).toBe("incorrect");
    expect(s.resolvedIndices.size).toBe(0);
  });

  it("2. incorrect + retry → unanswered (same question)", () => {
    let s = initialAnswerState();
    s = next(s, steps);
    const qIdx = s.idx;
    s = confirm(pick(s, 0), steps[s.idx]);
    expect(s.answer).toBe("incorrect");
    s = retry(s);
    expect(s.answer).toBe("unanswered");
    expect(s.picked).toBeNull();
    expect(s.idx).toBe(qIdx); // still on same question
  });

  it("3. retry + correct confirm → correct AND counts once", () => {
    let s = initialAnswerState();
    s = next(s, steps);
    s = confirm(pick(s, 0), steps[s.idx]); // wrong
    s = retry(s);
    s = confirm(pick(s, 1), steps[s.idx]); // right
    expect(s.answer).toBe("correct");
    expect(s.resolvedIndices.size).toBe(1);
    expect(s.resolvedIndices.has(1)).toBe(true);
  });

  it("4. correct contributes exactly once — repeated confirms cannot double", () => {
    let s = initialAnswerState();
    s = next(s, steps);
    s = confirm(pick(s, 1), steps[s.idx]);
    s = confirm(s, steps[s.idx]); // second confirm — locked
    s = confirm(pick(s, 1), steps[s.idx]); // repick blocked
    expect(s.resolvedIndices.size).toBe(1);
  });

  it("wrong → wrong → right also counts exactly once", () => {
    let s = initialAnswerState();
    s = next(s, steps);
    s = confirm(pick(s, 0), steps[s.idx]);
    s = retry(s);
    s = confirm(pick(s, 0), steps[s.idx]);
    s = retry(s);
    s = confirm(pick(s, 1), steps[s.idx]);
    expect(s.resolvedIndices.size).toBe(1);
    expect(s.answer).toBe("correct");
  });
});

describe("answer machine — advance rules", () => {
  const steps = [Q(0), Q(0)] as const;

  it("5. Next unavailable before correct", () => {
    let s = initialAnswerState();
    expect(canAdvance(s, steps[s.idx])).toBe(false);
    s = pick(s, 1);
    s = confirm(s, steps[s.idx]); // incorrect
    expect(canAdvance(s, steps[s.idx])).toBe(false);
  });

  it("6. Next advances exactly one step after correct", () => {
    let s = initialAnswerState();
    s = confirm(pick(s, 0), steps[s.idx]);
    expect(canAdvance(s, steps[s.idx])).toBe(true);
    const before = s.idx;
    s = next(s, steps);
    expect(s.idx).toBe(before + 1);
    expect(s.answer).toBe("unanswered");
    expect(s.picked).toBeNull();
  });

  it("7. repeated next() before answering does not advance twice", () => {
    let s = initialAnswerState();
    s = confirm(pick(s, 0), steps[s.idx]); // correct
    s = next(s, steps); // → idx 1
    const before = s.idx;
    s = next(s, steps); // blocked: idx 1 is unanswered question
    s = next(s, steps); // still blocked
    expect(s.idx).toBe(before);
  });

  it("8. final completion only after all required questions correct", () => {
    let s = initialAnswerState();
    // Answer first question correctly
    s = confirm(pick(s, 0), steps[s.idx]);
    s = next(s, steps);
    // Second question still unanswered — cannot finish
    expect(isCompletable(s, steps)).toBe(false);
    expect(canAdvance(s, steps[s.idx])).toBe(false);
    s = confirm(pick(s, 0), steps[s.idx]);
    expect(isCompletable(s, steps)).toBe(true);
    s = next(s, steps);
    expect(s.finished).toBe(true);
  });

  it("decision step with no correctAnswer accepts any pick as correct", () => {
    const decisionSteps = [D] as const;
    let s = initialAnswerState();
    s = confirm(pick(s, 3), decisionSteps[s.idx]);
    expect(s.answer).toBe("correct");
    expect(s.resolvedIndices.size).toBe(1);
  });
});

describe("difficulty mapping", () => {
  it("maps every canonical slug to Arabic", () => {
    expect(displayDifficulty("easy")).toBe("سهل");
    expect(displayDifficulty("medium")).toBe("متوسط");
    expect(displayDifficulty("hard")).toBe("صعب");
    expect(displayDifficulty("very_hard")).toBe("صعب جدًا");
    expect(displayDifficulty("very-hard")).toBe("صعب جدًا");
  });
  it("unknown → غير محدد, never the raw slug", () => {
    expect(displayDifficulty("bogus")).toBe("غير محدد");
    expect(displayDifficulty(null)).toBe("غير محدد");
    expect(displayDifficulty(undefined)).toBe("غير محدد");
  });
  it("canonicalDifficulty rejects unknown", () => {
    expect(canonicalDifficulty("hard")).toBe("hard");
    expect(canonicalDifficulty("bogus")).toBeNull();
  });
});

describe("filter persistence serialization", () => {
  // Mirrors the shape used by investigations.tsx sessionStorage payload.
  type Persisted = { search: string; era: string; difficulty: string; status: "all" | "solved" | "unsolved" };
  function serialize(p: Persisted): string { return JSON.stringify(p); }
  function deserialize(raw: string | null): Persisted {
    if (!raw) return { search: "", era: "", difficulty: "", status: "all" };
    try {
      const p = JSON.parse(raw);
      return {
        search: typeof p.search === "string" ? p.search : "",
        era: typeof p.era === "string" ? p.era : "",
        difficulty: typeof p.difficulty === "string" ? p.difficulty : "",
        status: p.status === "solved" || p.status === "unsolved" ? p.status : "all",
      };
    } catch { return { search: "", era: "", difficulty: "", status: "all" }; }
  }

  it("round-trips a full filter set", () => {
    const p: Persisted = { search: "بغداد", era: "abbasid", difficulty: "very_hard", status: "unsolved" };
    expect(deserialize(serialize(p))).toEqual(p);
  });
  it("returns defaults for null / invalid payloads", () => {
    expect(deserialize(null)).toEqual({ search: "", era: "", difficulty: "", status: "all" });
    expect(deserialize("not-json")).toEqual({ search: "", era: "", difficulty: "", status: "all" });
    expect(deserialize('{"status":"garbage"}')).toEqual({ search: "", era: "", difficulty: "", status: "all" });
  });
});

describe("combined filter predicate", () => {
  // Mirrors the row-filter logic in investigations.tsx so a regression
  // in combined-filter behaviour surfaces here without needing React.
  type Row = { slug: string; title: string; difficulty: string; era: string; done: boolean };
  const rows: Row[] = [
    { slug: "a", title: "معركة القادسية",   difficulty: "hard",      era: "rashidun", done: false },
    { slug: "b", title: "بيت الحكمة",         difficulty: "medium",    era: "abbasid",  done: true  },
    { slug: "c", title: "فتح القسطنطينية",     difficulty: "very_hard", era: "ottoman",  done: false },
    { slug: "d", title: "معركة اليرموك",       difficulty: "hard",      era: "rashidun", done: true  },
  ];
  function apply(f: { q?: string; era?: string; difficulty?: string; status?: "all" | "solved" | "unsolved" }) {
    return rows.filter((r) => {
      if (f.q && !r.title.includes(f.q)) return false;
      if (f.era && r.era !== f.era) return false;
      if (f.difficulty && r.difficulty !== f.difficulty) return false;
      if (f.status === "solved" && !r.done) return false;
      if (f.status === "unsolved" && r.done) return false;
      return true;
    });
  }
  it("search alone", () => {
    expect(apply({ q: "معركة" }).map((r) => r.slug)).toEqual(["a", "d"]);
  });
  it("era + difficulty", () => {
    expect(apply({ era: "rashidun", difficulty: "hard" }).map((r) => r.slug)).toEqual(["a", "d"]);
  });
  it("status + era", () => {
    expect(apply({ era: "rashidun", status: "solved" }).map((r) => r.slug)).toEqual(["d"]);
  });
  it("no matches yields empty list", () => {
    expect(apply({ era: "abbasid", difficulty: "very_hard" })).toEqual([]);
  });
});
