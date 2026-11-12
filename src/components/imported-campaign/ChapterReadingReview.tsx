import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import type { CampaignChapter } from "@/types/campaign";
import { coerceRichText } from "@/lib/campaigns/richText";
import { onOwnerChange } from "@/lib/identity/owner";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { RichReadingText } from "./RichReadingText";

/** Only authored reading already encountered, never answer keys or future steps. */
export function chapterReadingSections(chapter: CampaignChapter, completedActivityIds: readonly string[]) {
  const completed = new Set(completedActivityIds);
  const sections: { title: string; text: string }[] = [];
  const seen = new Set<string>();
  const add = (title: string, value: unknown) => {
    const text = coerceRichText(value).trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    sections.push({ title, text });
  };
  add("مقدمة الفصل", chapter.introText);
  add("قراءة تاريخية", chapter.historicalReadingText);
  chapter.activities.forEach((activity, index) => {
    if (!completed.has(activity.id) || activity.type !== "reading_then_question") return;
    add(`نص القراءة ${index + 1}`, activity.contextText);
    // A pure reading step may carry its text in the prompt. Question prompts,
    // answers, hints and feedback are deliberately not part of this view.
    if (!activity.options?.length) add(`متابعة القراءة ${index + 1}`, activity.prompt);
  });
  return sections;
}

/** A sibling overlay: the live activity stays mounted and receives no callbacks. */
export function ChapterReadingReview({ chapter, completedActivityIds }: {
  chapter: CampaignChapter;
  completedActivityIds: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => onOwnerChange(() => setOpen(false)), []);
  const sections = chapterReadingSections(chapter, completedActivityIds);
  if (!sections.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-bold text-gold">
          <BookOpen aria-hidden className="size-4" /> إعادة قراءة نص الفصل
        </button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto rounded-2xl">
        <DialogTitle className="pe-6">نص الفصل: {chapter.title}</DialogTitle>
        <DialogDescription>راجع ما قرأته ثم عد إلى نشاطك كما تركته، دون تغيير تقدمك أو مكافآتك.</DialogDescription>
        {sections.map((section, index) => (
          <section key={index} className="parchment-dark rounded-xl border border-gold/20 p-4">
            <h2 className="mb-3 text-sm font-bold text-gold">{section.title}</h2>
            <RichReadingText text={section.text} size="lg" />
          </section>
        ))}
        <DialogClose asChild>
          <button type="button" className="rounded-xl bg-gradient-gold px-4 py-3 text-sm font-bold text-primary-foreground">العودة إلى النشاط</button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
