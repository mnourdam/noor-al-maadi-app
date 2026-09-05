// V17-05 — presentation-time MCQ shuffle.
//
// Part 1 exercises the shuffle primitive directly (mapping correctness,
// immutability, determinism, duplicate text, edge sizes).
// Part 2 locks the structural guarantees of the three live renderers at
// source level: one memoised mapping per active question, no recomputation
// on submit, structural (not free-text) identity, and answer-key surfaces
// left in authored order.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shuffleOptions } from "@/lib/campaigns/optionShuffle";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("shuffleOptions primitive", () => {
  it("does not mutate the source array", () => {
    const src = ["a", "b", "c", "d"];
    const copy = [...src];
    shuffleOptions("act-1", src, 2);
    expect(src).toEqual(copy);
  });

  it("returns the same order and mapping for the same seed", () => {
    const src = ["a", "b", "c", "d", "e"];
    const a = shuffleOptions("act-1", src, 1, "attempt-1");
    const b = shuffleOptions("act-1", src, 1, "attempt-1");
    expect(a.options).toEqual(b.options);
    expect(a.toOriginal).toEqual(b.toOriginal);
    expect(a.correctIndex).toBe(b.correctIndex);
  });

  it("toOriginal is a bijection onto the authored indices", () => {
    const src = ["a", "b", "c", "d", "e", "f"];
    const { toOriginal } = shuffleOptions("act-2", src, 0);
    expect(toOriginal.length).toBe(src.length);
    expect([...toOriginal].sort((x, y) => x - y)).toEqual(src.map((_, i) => i));
  });

  it("the correct authored option survives the shuffle", () => {
    const src = ["w1", "w2", "RIGHT", "w3"];
    for (const key of ["k0", "k1", "k2", "k3", "k4", "k5"]) {
      const s = shuffleOptions(key, src, 2, key);
      expect(s.options[s.correctIndex]).toBe("RIGHT");
      expect(s.toOriginal[s.correctIndex]).toBe(2);
      // Every displayed option maps back to its authored twin.
      s.options.forEach((opt, i) => expect(opt).toBe(src[s.toOriginal[i]]));
    }
  });

  it("handles a two-option question", () => {
    const src = ["yes", "no"];
    const s = shuffleOptions("two", src, 1);
    expect(s.options.length).toBe(2);
    expect(s.options[s.correctIndex]).toBe("no");
    expect(s.toOriginal[s.correctIndex]).toBe(1);
  });

  it("handles a four-option question", () => {
    const src = ["a", "b", "c", "d"];
    const s = shuffleOptions("four", src, 3);
    expect([...s.options].sort()).toEqual(["a", "b", "c", "d"]);
    expect(s.toOriginal[s.correctIndex]).toBe(3);
  });

  it("stays index-correct when two options share identical text", () => {
    const src = ["same", "same", "other"];
    const s = shuffleOptions("dup", src, 1);
    // Text matching would be ambiguous; index identity must not be.
    expect(s.toOriginal[s.correctIndex]).toBe(1);
    expect(s.options[s.correctIndex]).toBe("same");
    expect(s.options.filter(o => o === "same").length).toBe(2);
  });

  it("passes through when there are fewer than two options", () => {
    expect(shuffleOptions("one", ["only"], 0)).toEqual({
      options: ["only"], correctIndex: 0, toOriginal: [0],
    });
    expect(shuffleOptions("none", [], -1).options).toEqual([]);
  });
});

describe("campaign MCQ renderer", () => {
  const src = read("src/components/imported-campaign/ActivityRenderer.tsx");
  const block = src.slice(src.indexOf("function MultipleChoiceRenderer"));

  it("derives one memoised mapping keyed on stable identity", () => {
    expect(block).toContain("useMemo");
    expect(block).toContain("shuffleOptions(activity.id, authoredOptions, authoredCorrectIndex)");
    // Option TEXT is no longer a dependency, so a mid-attempt content
    // rewrite cannot reshuffle a live question.
    expect(block).not.toContain('authoredOptions.join("\\u241E")');
    expect(block).toContain("[activity.id, authoredOptions.length, authoredCorrectIndex]");
  });

  it("verifies against the derived mapping, never a recomputed shuffle", () => {
    const submit = block.slice(block.indexOf("const submit ="), block.indexOf("const continueAfterReveal"));
    expect(submit).toContain("picked === correctIndex");
    expect(submit).not.toContain("shuffleOptions(");
  });

  it("never writes back to the authored activity", () => {
    expect(block).not.toMatch(/activity\.options\s*=/);
    expect(block).not.toMatch(/activity\.correctAnswer\s*=/);
    expect(block).not.toContain("authoredOptions.sort");
  });
});

describe("investigation step card", () => {
  const src = read("src/routes/investigation.$id.tsx");

  it("owns a single presentation mapping on the page, passed down to the card", () => {
    expect(src).toContain("const stepShuffle = useMemo(");
    expect(src).toContain("shuffled={stepShuffle}");
    // StepCard no longer computes its own shuffle.
    const card = src.slice(src.indexOf("function StepCard("), src.indexOf("// Legacy player"));
    expect(card).not.toContain("shuffleOptions(");
  });

  it("uses a structural identity, not the free-text prompt", () => {
    const memo = src.slice(src.indexOf("const stepShuffle = useMemo("), src.indexOf("const onConfirm ="));
    expect(memo).toContain("`${row.slug}:${idx}`");
    expect(memo).not.toContain("step.prompt");
  });

  it("verifies by mapping the display pick back to the authored index", () => {
    const confirm = src.slice(src.indexOf("const onConfirm ="), src.indexOf("const onRetry ="));
    expect(confirm).not.toContain("shuffleOptions(");
    expect(confirm).toContain("stepShuffle.toOriginal[picked]");
    expect(confirm).toContain("originalIndex === step.correctAnswer");
  });

  it("legacy investigation quiz keys on investigation id + question index", () => {
    expect(src).toContain("shuffleOptions(`${inv.id}:${qIndex}`, q.choices, q.correctIndex, attemptKey)");
    const submit = src.slice(src.indexOf("const onSubmit = () => {"));
    expect(submit.slice(0, 400)).toContain("picked === shuffled.correctIndex");
  });

  it("identical prompts at different step indices get distinct identities", () => {
    const options = ["a", "b", "c", "d"];
    const seen = new Set<string>();
    for (let idx = 0; idx < 6; idx++) {
      seen.add(shuffleOptions(`slug:${idx}`, options, 0, "slug").toOriginal.join(","));
    }
    // Distinct identities are the point; at least two distinct orders is
    // near-certain and the mapping itself is asserted above.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("chapter quiz", () => {
  const src = read("src/components/ChapterQuiz.tsx");

  it("shuffles at presentation time from one memoised mapping", () => {
    expect(src).toContain("shuffleOptions(`${campaignId}:${chapterId}:${quiz.id}:${q.id}`, q.choices, q.correctIndex)");
    expect(src).toContain("const displayChoices = shuffled.options;");
    expect(src).toContain("const displayCorrectIndex = shuffled.correctIndex;");
  });

  it("renders shuffled options and scores against the mapping", () => {
    expect(src).toContain("{displayChoices.map((c, i) => {");
    expect(src).toContain("const isCorrect = i === displayCorrectIndex;");
    expect(src).toContain("if (picked === displayCorrectIndex) {");
    expect(src).toContain("const correct = revealed && picked === displayCorrectIndex;");
    expect(src).toContain("const wrong = revealed && picked !== displayCorrectIndex;");
  });

  it("never mutates the authored question", () => {
    expect(src).not.toMatch(/q\.choices\s*=/);
    expect(src).not.toMatch(/q\.correctIndex\s*=/);
    expect(src).not.toContain("q.choices.sort");
  });

  it("labels follow display position", () => {
    expect(src).toContain("String.fromCharCode(0x0623 + i)");
  });

  it("scores correctly at every display position", () => {
    const choices = ["c0", "c1", "c2", "c3"];
    for (let authored = 0; authored < 4; authored++) {
      const s = shuffleOptions(`camp:ch:q:${authored}`, choices, authored);
      for (let picked = 0; picked < 4; picked++) {
        const isCorrect = picked === s.correctIndex;
        expect(isCorrect).toBe(s.toOriginal[picked] === authored);
      }
    }
  });
});

describe("answer-key surfaces stay in authored order", () => {
  it("ActivityReviewCard does not shuffle", () => {
    const src = read("src/components/imported-campaign/ActivityReviewCard.tsx");
    expect(src).not.toContain("shuffleOptions");
  });

  it("Memory ReviewActivity is untouched in V17-05", () => {
    const src = read("src/components/memory/ReviewActivity.tsx");
    expect(src).not.toContain("shuffleOptions");
  });
});
