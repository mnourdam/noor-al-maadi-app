// ============================================================
// /stories — public index of published stories (P4)
// ------------------------------------------------------------
// Reads via list_published_stories RPC (anon-safe). Locked
// state is displayed on the detail route (/story/$id) using
// get_story_access. This page is a plain catalog.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, ArrowLeft, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Screen } from "@/components/AppShell";
import { useStoryMediaUrl } from "@/lib/stories/media/url";

interface PublishedStoryRow {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  summary_ar: string | null;
  world_slug: string | null;
  era: string | null;
  display_order: number;
  xp_reward: number;
  dinar_reward: number;
  cover_media_id: string | null;
  content_version: number;
  published_at: string | null;
}

interface CoverRow {
  id: string;
  storage_bucket: string;
  storage_path: string;
  processing_version: number;
}

function StoryCoverImg({ cover, alt }: { cover: CoverRow; alt: string }) {
  const src = useStoryMediaUrl(cover);
  return (
    <img
      src={src ?? undefined}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
    />
  );
}

async function loadStories() {
  const { data, error } = await supabase.rpc("list_published_stories" as never);
  if (error) throw new Error(error.message);
  const stories = (data ?? []) as PublishedStoryRow[];
  const coverIds = stories.map((s) => s.cover_media_id).filter(
    (v): v is string => !!v,
  );
  let covers: Record<string, CoverRow> = {};
  if (coverIds.length > 0) {
    const { data: mdata } = await supabase
      .from("story_media")
      .select("id, storage_bucket, storage_path")
      .in("id", coverIds);
    for (const row of (mdata ?? []) as CoverRow[]) covers[row.id] = row;
  }
  return { stories, covers };
}

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
    queryKey: ["stories", "published"],
    queryFn: loadStories,
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
        {data && data.stories.length === 0 && (
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
        {data && data.stories.length > 0 && (
          <ul dir="rtl" className="grid gap-3 sm:grid-cols-2">
            {data.stories.map((s) => {
              const cover = s.cover_media_id
                ? data.covers[s.cover_media_id]
                : null;
              return (
                <li key={s.id}>
                  <Link
                    to="/story/$id"
                    params={{ id: s.id }}
                    className="group block overflow-hidden rounded-2xl border border-gold/20 bg-surface/60 transition hover:border-gold/50"
                  >
                    {cover ? (
                      <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
                        <img
                          src={storyMediaPublicUrl(cover)}
                          alt={s.title_ar}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-[16/9] w-full items-center justify-center bg-muted/40">
                        <BookOpenText className="size-8 text-gold/50" />
                      </div>
                    )}
                    <div className="space-y-1 p-3">
                      <h2 className="font-display text-base font-bold text-gold">
                        {s.title_ar}
                      </h2>
                      {s.summary_ar && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {s.summary_ar}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                        <span>
                          {s.xp_reward > 0 && <>+{s.xp_reward} XP</>}
                          {s.xp_reward > 0 && s.dinar_reward > 0 && " · "}
                          {s.dinar_reward > 0 && <>+{s.dinar_reward} دينار</>}
                        </span>
                        <span className="inline-flex items-center gap-1 text-gold">
                          افتح <ArrowLeft className="size-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
          <Lock className="size-3" /> بعض القصص تُفتح بعد إنجاز حملات أو تحقيقات.
        </p>
      </Screen>
    </AppShell>
  );
}
