// ============================================================
// /story/$id — Story player runtime (P4)
// ------------------------------------------------------------
// Resolves the story bundle via `get_story_access` (RLS + unlock
// evaluation server-side). Renders the shared StoryReader when
// unlocked; shows a friendly locked/hidden state otherwise.
// Progress and completion writes are handled inside StoryReader
// via the P1 durable write contract — this route only wires data.
// ============================================================

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Lock } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { StoryReader } from "@/components/stories/StoryReader";
import { fetchStoryAccess } from "@/lib/stories/progress";
import { fetchStoryMediaForRuntime } from "@/lib/stories/media/fetch-for-story";
import type {
  StoryRow,
  StorySceneRow,
  StoryProgressRow,
} from "@/lib/stories/types";

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
      {
        name: "description",
        content: "قصة قصيرة موثّقة من التاريخ الإسلامي على منصّة إرث.",
      },
      { property: "og:title", content: "قصة — إرث" },
      {
        property: "og:description",
        content: "قصة قصيرة موثّقة من التاريخ الإسلامي.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoryRoute,
});

function StoryRoute() {
  const { id } = useParams({ from: "/story/$id" });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["story", id],
    queryFn: () => loadStory(id),
  });

  if (isLoading) {
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
    return (
      <AppShell>
        <Screen title="القصة" subtitle="">
          <LockedState reason={reason} title={bundle?.story?.title_ar} />
        </Screen>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <StoryReader
        story={bundle.story}
        scenes={bundle.scenes}
        media={data?.media ?? []}
        initialProgress={bundle.progress ?? null}
        alreadyCompleted={!!bundle.completed}
        onCompleted={() => void refetch()}
      />
    </AppShell>
  );
}

function LockedState({ reason, title }: { reason: string; title?: string }) {
  const label =
    reason === "locked"
      ? "هذه القصة مقفلة"
      : reason === "not_published"
      ? "هذه القصة غير منشورة"
      : "لم يتم العثور على القصة";
  const hint =
    reason === "locked"
      ? "أنجز الحملات أو التحقيقات المطلوبة لفتحها."
      : reason === "not_published"
      ? "عد لاحقًا بعد النشر."
      : "قد تكون أُزيلت أو أن الرابط غير صحيح.";
  return (
    <div
      dir="rtl"
      className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center"
    >
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
