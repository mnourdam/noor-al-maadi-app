// ============================================================
// /story/$id — three-view runtime: Landing → Reader → Completion (P4.1)
// ------------------------------------------------------------
// - Landing: metadata, prereqs, resume/start button (default view).
// - Reader:  the P4 StoryReader (unchanged runtime).
// - Completion: rewarding ending screen with next-story suggestion.
//
// Server-side access resolved via `get_story_access`; unlock,
// prereq resolution, progress and rewards status come from
// `list_stories_v2` (single fetch, cached).
// ============================================================

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ArrowLeft, BookOpen, Lock } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { StoryReader } from "@/components/stories/StoryReader";
import { StoryLanding } from "@/components/stories/StoryLanding";
import { StoryCompletion } from "@/components/stories/StoryCompletion";
import { fetchStoryAccess } from "@/lib/stories/progress";
import { fetchStoryMediaForRuntime } from "@/lib/stories/media/fetch-for-story";
import { listStoriesSummary } from "@/lib/stories/summary";
import type { StoryRow, StorySceneRow, StoryProgressRow } from "@/lib/stories/types";

interface Bundle {
  ok: boolean;
  reason?: string;
  story?: StoryRow;
  scenes?: StorySceneRow[];
  progress?: StoryProgressRow | null;
  completed?: boolean;
}

async function loadStory(id: string) {
  const bundle = (await fetchStoryAccess(id)) as Bundle;
  if (!bundle.ok || !bundle.story || !bundle.scenes) {
    return { bundle, media: [] as never[] };
  }
  const media = await fetchStoryMediaForRuntime(bundle.story, bundle.scenes);
  return { bundle, media };
}

export const Route = createFileRoute("/story/$id")({
  head: () => ({
    meta: [
      { title: "قصة — إرث" },
      { name: "description", content: "قصة قصيرة موثّقة من التاريخ الإسلامي على منصّة إرث." },
      { property: "og:title", content: "قصة — إرث" },
      { property: "og:description", content: "قصة قصيرة موثّقة من التاريخ الإسلامي." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoryRoute,
});

type View = "landing" | "reader" | "completion";

function StoryRoute() {
  const { id } = useParams({ from: "/story/$id" });
  const [view, setView] = useState<View>("landing");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["story", id],
    queryFn: () => loadStory(id),
  });

  const summariesQ = useQuery({
    queryKey: ["stories-summary", null, "single", id],
    queryFn: () => listStoriesSummary(null),
    staleTime: 60_000,
  });
  const summary = summariesQ.data?.find((s) => s.id === id) ?? null;

  // Reset view when route id changes.
  useEffect(() => { setView("landing"); }, [id]);

  if (isLoading || summariesQ.isLoading) {
    return (
      <AppShell>
        <Screen title="القصة" subtitle="جاري التحميل...">
          <div className="p-6 text-center text-sm text-muted-foreground">...</div>
        </Screen>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <Screen title="القصة" subtitle="تعذّر التحميل">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        </Screen>
      </AppShell>
    );
  }

  const bundle = data?.bundle;
  if (!bundle?.ok || !bundle.story || !bundle.scenes) {
    const reason = bundle?.reason ?? "not_found";
    // If we have a summary (published & visible), the "locked" case shows
    // the landing page (which knows how to render prereqs). Otherwise a
    // generic not-found / not-published card.
    if (reason === "locked" && summary) {
      return (
        <AppShell>
          <StoryLanding summary={summary} onStart={() => { /* locked */ }} />
        </AppShell>
      );
    }
    return (
      <AppShell>
        <Screen title="القصة" subtitle="">
          <LockedState reason={reason} title={bundle?.story?.title_ar} />
        </Screen>
      </AppShell>
    );
  }

  if (view === "landing") {
    if (!summary) {
      // Fallback: bundle came through but the summary RPC did not surface
      // this story (edge case). Enter the reader directly.
      return renderReader();
    }
    return (
      <AppShell>
        <StoryLanding summary={summary} onStart={() => setView("reader")} />
      </AppShell>
    );
  }

  if (view === "completion" && summary) {
    return (
      <AppShell>
        <StoryCompletion
          finished={summary}
          onReplay={() => { setView("reader"); void refetch(); }}
        />
      </AppShell>
    );
  }

  return renderReader();

  function renderReader() {
    return (
      <AppShell>
        <StoryReader
          story={bundle!.story!}
          scenes={bundle!.scenes!}
          media={data?.media ?? []}
          initialProgress={bundle!.progress ?? null}
          alreadyCompleted={!!bundle!.completed}
          onCompleted={() => {
            void refetch();
            void summariesQ.refetch();
            setView("completion");
          }}
        />
      </AppShell>
    );
  }
}

function LockedState({ reason, title }: { reason: string; title?: string }) {
  const label =
    reason === "locked"      ? "هذه القصة مقفلة"
    : reason === "not_published" ? "هذه القصة غير منشورة"
                              : "لم يتم العثور على القصة";
  const hint =
    reason === "locked"      ? "أنجز الحملات أو التحقيقات المطلوبة لفتحها."
    : reason === "not_published" ? "عد لاحقًا بعد النشر."
                              : "قد تكون أُزيلت أو أن الرابط غير صحيح.";
  return (
    <div dir="rtl" className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
      {reason === "locked" ? (
        <Lock className="mx-auto mb-3 size-8 text-gold/70" />
      ) : (
        <BookOpen className="mx-auto mb-3 size-8 text-gold/70" />
      )}
      <p className="font-display text-base font-bold text-gold">
        {title ? `${title} — ${label}` : label}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <Link
        to="/stories"
        className="mt-4 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
      >
        كل القصص <ArrowLeft className="size-3.5" />
      </Link>
    </div>
  );
}
