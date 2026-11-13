import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import type { CampaignChapter } from "@/types/campaign";
import { coerceRichText } from "@/lib/campaigns/richText";
import { onOwnerChange } from "@/lib/identity/owner";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useUiLanguage } from "@/lib/ui-language/store";
import { UI_MESSAGES } from "@/lib/ui-language/messages";
import { RichReadingText } from "./RichReadingText";

/** Only authored reading already encountered, never answer keys or future steps. */
export function chapterReadingSections(chapter: CampaignChapter, completedActivityIds: readonly string[], messages = UI_MESSAGES.ar) {
  const completed = new Set(completedActivityIds);
  const sections: { title: string; text: string }[] = [];
  const seen = new Set<string>();
  const add = (title: string, value: unknown) => {
    const text = coerceRichText(value).trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    sections.push({ title, text });
  };
  add(messages.rereadIntro, chapter.introText);
  add(messages.rereadHistory, chapter.historicalReadingText);
  chapter.activities.forEach((activity, index) => {
    if (!completed.has(activity.id) || activity.type !== "reading_then_question") return;
    add(`${messages.rereadText} ${index + 1}`, activity.contextText);
    // A pure reading step may carry its text in the prompt. Question prompts,
    // answers, hints and feedback are deliberately not part of this view.
    if (!activity.options?.length) add(`${messages.rereadContinuation} ${index + 1}`, activity.prompt);
  });
  return sections;
}

/** A sibling overlay: the live activity stays mounted and receives no callbacks. */
export function ChapterReadingReview({ chapter, completedActivityIds }: {
  chapter: CampaignChapter;
  completedActivityIds: readonly string[];
}) {
  const { language, direction, messages } = useUiLanguage();
  const [open, setOpen] = useState(false);
  useEffect(() => onOwnerChange(() => setOpen(false)), []);
  const sections = chapterReadingSections(chapter, completedActivityIds, messages);
  if (!sections.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" lang={language} dir={direction} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-bold text-gold">
          <BookOpen aria-hidden className="size-4" /> {messages.reread}
        </button>
      </DialogTrigger>
      <DialogContent lang={language} dir={direction} closeLabel={messages.close} className="max-h-[85dvh] overflow-y-auto rounded-2xl">
        <DialogTitle className="pe-6">{messages.rereadTitle} <bdi lang="ar" dir="rtl">{chapter.title}</bdi></DialogTitle>
        <DialogDescription>{messages.rereadDescription}</DialogDescription>
        {sections.map((section, index) => (
          <section key={index} className="parchment-dark rounded-xl border border-gold/20 p-4">
            <h2 className="mb-3 text-sm font-bold text-gold">{section.title}</h2>
            <div lang="ar" dir="rtl"><RichReadingText text={section.text} size="lg" /></div>
          </section>
        ))}
        <DialogClose asChild>
          <button type="button" className="rounded-xl bg-gradient-gold px-4 py-3 text-sm font-bold text-primary-foreground">{messages.rereadReturn}</button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
