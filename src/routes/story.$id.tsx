// ============================================================
// /story/$id — cinematic Story runtime (Phase B Rev 2)
// ------------------------------------------------------------
// The old three-view (Landing → Reader → Completion) is retired.
// The route mounts a fullscreen <StoryPlayer/> for accessible stories
// and an inline compact card for locked / not-found / not-published.
// Progress + completion contracts unchanged.
// ============================================================

import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Lock, Loader2 } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { StoryPlayer } from "@/components/stories/player/StoryPlayer";
import { fetchStoryAccess } from "@/lib/stories/progress";
import { fetchStoryMediaForRuntime } from "@/lib/stories/media/fetch-for-story";
import { listStoriesSummary } from "@/lib/stories/summary";
import type { StoryRow, StorySceneRow, StoryProgressRow } from "@/lib/stories/types";
import { storySummaryQueryKey, useStoryIdentityKey } from "@/lib/stories/query-keys";

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

function StoryRoute() {
  const { id } = useParams({ from: "/story/$id" });
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["story", id],
    queryFn: () => loadStory(id),
  });

  const storyIdentity = useStoryIdentityKey();
  const summariesQ = useQuery({
    queryKey: storySummaryQueryKey(storyIdentity, null, "single", id),
    queryFn: () => listStoriesSummary(null),
    staleTime: 60_000,
  });
  const summary = summariesQ.data?.find((s) => s.id === id) ?? null;

  // Campaign intro stories are NOT library content. A direct library URL
  // hands the player back to the owning campaign (which applies its own
  // progression lock) instead of playing the intro out of context.
  const introCampaignId =
    data?.bundle?.reason === "campaign_intro"
      ? ((data.bundle as { campaign_id?: string | null }).campaign_id ?? null)
      : null;
  useEffect(() => {
    if (data?.bundle?.reason !== "campaign_intro") return;
    void navigate(
      introCampaignId
        ? { to: "/campaigns/imported/$id", params: { id: introCampaignId }, replace: true }
        : { to: "/campaigns", replace: true },
    );
  }, [data?.bundle?.reason, introCampaignId, navigate]);



  if (isLoading || summariesQ.isLoading) {
    return (
      <div className="fixed inset-0 z-[200] grid place-items-center bg-black text-gold">
        <Loader2 className="size-6 animate-spin" />
      </div>
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
          <LockedState reason={reason} title={bundle?.story?.title_ar} prereqs={summary?.prereqs} />
        </Screen>
      </AppShell>
    );
  }

  // Replay of a completed story ALWAYS restarts at scene 0 so the
  // reader can re-experience the story rather than landing on the
  // last (reflection) scene. First-run playback resumes from the
  // furthest-viewed scene.
  const initial = (() => {
    if (bundle.completed) return 0;
    const p = bundle.progress;
    if (!p) return 0;
    return Math.max(p.last_scene_index ?? 0, p.max_scene_index_reached ?? 0);
  })();

  return (
    <StoryPlayer
      story={bundle.story}
      scenes={bundle.scenes}
      media={data?.media ?? []}
      summary={summary}
      initialSceneIndex={initial}
      alreadyCompleted={!!bundle.completed}
      onExit={() => {
        void navigate({ to: "/stories" });
      }}
    />
  );
}

function LockedState({
  reason,
  title,
  prereqs,
}: {
  reason: string;
  title?: string;
  prereqs?: { kind: string; ref: string; title: string | null; satisfied: boolean }[];
}) {
  const label =
    reason === "locked"
      ? "هذه القصة مقفلة"
      : reason === "campaign_intro"
        ? "هذه افتتاحية حملة"
        : "لم يتم العثور على القصة";
  const hint =
    reason === "locked"
      ? "أنجز الحملات أو التحقيقات المطلوبة لفتحها."
      : reason === "campaign_intro"
        ? "تُعرض الافتتاحية داخل حملتها فقط. جارٍ تحويلك…"
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
      {reason === "locked" && prereqs && prereqs.length > 0 && (
        <ul className="mx-auto mt-4 max-w-sm space-y-1 text-start text-[12px] text-white/80">
          {prereqs.map((p) => (
            <li key={`${p.kind}:${p.ref}`} className={p.satisfied ? "text-emerald-400" : ""}>
              • {p.title ?? p.ref}
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/stories"
        className="mt-4 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
      >
        كل القصص <ArrowLeft className="size-3.5" />
      </Link>
    </div>
  );
}
