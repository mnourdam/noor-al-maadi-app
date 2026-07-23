// ============================================================
// /stories — public catalog of stories (Phase 2 redesign).
// ------------------------------------------------------------
// Uses the canonical StorySummary feed + shared cinematic
// StoryCard so Home rail and /stories match pixel-for-pixel.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, Lock } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { StoryCard } from "@/components/stories/StoryCard";
import { listStoriesSummary } from "@/lib/stories/summary";

export const Route = createFileRoute("/stories/")({
  head: () => ({
    meta: [
      { title: "القصص — إرث" },
      {
        name: "description",
        content:
          "قصص إرث: مشاهد قصيرة مبنية على مصادر تاريخية موثّقة، تربطك بلحظات مفصلية من التاريخ الإسلامي.",
      },
      { property: "og:title", content: "قصص إرث" },
      {
        property: "og:description",
        content: "مشاهد قصيرة موثّقة من التاريخ الإسلامي.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoriesIndex,
});

function StoriesIndex() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["stories-summary", null, "catalog"],
    queryFn: () => listStoriesSummary(null),
    staleTime: 30_000,
  });

  return (
    <AppShell>
      <Screen
        title="القصص"
        subtitle="مشاهد قصيرة موثّقة من التاريخ الإسلامي"
      >
        {isLoading && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            جاري التحميل...
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            تعذّر تحميل القصص: {(error as Error).message}
          </div>
        )}
        {data && data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
            <BookOpenText className="mx-auto mb-3 size-8 text-gold/70" />
            <p className="font-display text-base font-bold text-gold">
              لا توجد قصص منشورة بعد
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              ابقَ قريبًا — سنضيف قصصًا جديدة قريبًا بإذن الله.
            </p>
          </div>
        )}
        {data && data.length > 0 && (
          <ul
            dir="rtl"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            {data.map((s) => (
              <li key={s.id}>
                <StoryCard story={s} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <Lock className="size-3" /> بعض القصص تُفتح بعد إنجاز حملات أو تحقيقات.
        </p>
      </Screen>
    </AppShell>
  );
}
