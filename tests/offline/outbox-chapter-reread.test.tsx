import React, { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CampaignChapter } from "@/types/campaign";
const state = vi.hoisted(() => ({ owners: new Set<() => void>(), back: null as null | (() => void) }));
vi.mock("@/lib/identity/owner", () => ({ onOwnerChange: (fn: () => void) => { state.owners.add(fn); return () => state.owners.delete(fn); } }));
vi.mock("@/lib/navigation/engine", () => ({ useOverlayDismiss: (fn: () => void) => {
  useEffect(() => { state.back = fn; return () => { state.back = null; }; }, [fn]);
} }));
import { ChapterReadingReview, chapterReadingSections } from "@/components/imported-campaign/ChapterReadingReview";

const chapter: CampaignChapter = {
  id: "ch1", title: "الفصل الأول", order: 1,
  activities: [
    { id: "read", type: "reading_then_question", prompt: "تأمل أحداث الرحلة", contextText: "نص تاريخي سبق قراءته" },
    { id: "read-question", type: "reading_then_question", prompt: "سؤال سري", contextText: "سياق القراءة السابقة", options: ["إجابة سرية"], correctAnswer: 0, feedbackCorrect: "شرح الحل السري" },
    { id: "future", type: "reading_then_question", prompt: "مستقبل", contextText: "نص لم يصل إليه اللاعب" },
  ],
};
function Review(props: Partial<React.ComponentProps<typeof ChapterReadingReview>> = {}) {
  return <ChapterReadingReview chapter={chapter} completedActivityIds={["read", "read-question"]} {...props} />;
}
beforeEach(() => { localStorage.clear(); vi.stubGlobal("fetch", vi.fn(() => { throw Error("network forbidden"); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const open = () => fireEvent.click(screen.getByRole("button", { name: "إعادة قراءة نص الفصل" }));
it("shows passed reading and authored text but not answers, feedback, or future reading", () => {
  render(<Review chapter={{ ...chapter, introText: "المقدمة", historicalReadingText: "التاريخ" }} />);
  open();
  const dialog = within(screen.getByRole("dialog"));
  for (const text of ["المقدمة", "التاريخ", "نص تاريخي سبق قراءته", "تأمل أحداث الرحلة", "سياق القراءة السابقة"]) expect(dialog.getByText(text)).toBeTruthy();
  for (const text of ["سؤال سري", "إجابة سرية", "شرح الحل السري", "نص لم يصل إليه اللاعب"]) expect(dialog.queryByText(text)).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("does not offer empty/future-only text and handles imported paragraph arrays", () => {
  const view = render(<Review completedActivityIds={[]} />);
  expect(screen.queryByRole("button")).toBeNull();
  view.rerender(<Review chapter={{ ...chapter, introText: ["فقرة أولى", "فقرة ثانية"] as unknown as string }} />);
  open();
  expect(screen.getByText("فقرة أولى")).toBeTruthy();
  expect(screen.getByText("فقرة ثانية")).toBeTruthy();
});
it("deduplicates authored text and never mutates the chapter/progress inputs", () => {
  const c = { ...chapter, introText: "نص تاريخي سبق قراءته", historicalReadingText: "نص تاريخي سبق قراءته" };
  const ids = Object.freeze(["read"]);
  const original = JSON.stringify(c);
  expect(chapterReadingSections(c, ids).filter(s => s.text === c.introText)).toHaveLength(1);
  expect(JSON.stringify(c)).toBe(original);
  expect(ids).toEqual(["read"]);
});
it("repeated review keeps live answer/question mounted and writes no progress or rewards", () => {
  const unmount = vi.fn(), reward = vi.fn();
  function LiveQuestion() {
    const [answer, setAnswer] = useState("");
    useEffect(() => () => unmount(), []);
    return <div><label>جواب السؤال<input value={answer} onChange={e => setAnswer(e.target.value)} /></label><button onClick={reward}>إرسال الجواب</button></div>;
  }
  localStorage.setItem("synthetic-progress", JSON.stringify({ completed: ["read"], hearts: 3, xp: 10 }));
  const before = localStorage.getItem("synthetic-progress");
  render(<><Review /><LiveQuestion /></>);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "جوابي الحالي" } });
  for (let i = 0; i < 3; i++) {
    open();
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى النشاط" }));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("جوابي الحالي");
  }
  expect(reward).not.toHaveBeenCalled();
  expect(unmount).not.toHaveBeenCalled();
  expect(localStorage.getItem("synthetic-progress")).toBe(before);
});
it("hardware Back dismisses only the review overlay and unregisters", () => {
  render(<Review />); open();
  expect(state.back).toBeTypeOf("function");
  act(() => state.back?.());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(state.back).toBeNull();
});
it("Escape dismisses and restores trigger focus", async () => {
  render(<Review />); open();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "إعادة قراءة نص الفصل" })));
});
it("owner change dismisses and chapter navigation unmounts its old overlay", () => {
  const view = render(<ChapterReadingReview key="c1:ch1" chapter={chapter} completedActivityIds={["read"]} />);
  open(); act(() => state.owners.forEach(fn => fn()));
  expect(screen.queryByRole("dialog")).toBeNull();
  open();
  view.rerender(<ChapterReadingReview key="c1:ch2" chapter={{ ...chapter, id: "ch2" }} completedActivityIds={["read"]} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  view.unmount();
  expect(state.owners.size).toBe(0);
});
