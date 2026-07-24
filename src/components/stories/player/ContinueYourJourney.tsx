// ============================================================
// ContinueYourJourney — post-completion sheet ("تابع رحلتك").
// Slides up after the RewardMoment. Contains: soft header,
// next-story recommendation, references (collapsed), related
// encyclopedia entities, social block, and an unobtrusive exit.
// ============================================================

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Home, BookOpenText, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Istazadtu } from "@/components/social/Istazadtu";
import { StoryComments } from "@/components/social/StoryComments";
import { PublicContributionsNotice } from "@/components/social/PublicContributionsNotice";
import { StoryCard } from "@/components/stories/StoryCard";
import { listStoriesSummary, pickNextStory, type StorySummary } from "@/lib/stories/summary";
import { supabase } from "@/integrations/supabase/client";
import {
  readReferences,
  readRelatedEntities,
  type StoryReference,
} from "@/lib/stories/references";
import { formatDurationArabic, resolveStoryDurationMs } from "@/lib/stories/duration";


interface StoryMetaRow {
  metadata: Record<string, unknown> | null;
  era: string | null;
}

// M7C — replaced direct `stories` table read with the M6 visibility-safe
// `get_story_bundle_v2` RPC. ContinueYourJourney is only rendered after
// completion, so the caller is always authorized and the bundle returns
// full metadata + era.
function useStoryMeta(storyId: string | undefined) {
  return useQuery({
    queryKey: ["story-meta", storyId],
    enabled: !!storyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!storyId) return null;
      try {
        const { data, error } = await supabase.rpc(
          "get_story_bundle_v2" as never,
          { p_story_id: storyId } as never,
        );
        if (error) return null;
        const payload = (data ?? {}) as { ok?: boolean; story?: { metadata?: unknown; era?: string | null } };
        if (!payload.ok || !payload.story) return null;
        return {
          metadata: (payload.story.metadata ?? null) as StoryMetaRow["metadata"],
          era: payload.story.era ?? null,
        } as StoryMetaRow;
      } catch { return null; }
    },
  });
}


export function ContinueYourJourney({
  finished,
  onReplay,
  onClose,
}: {
  finished: StorySummary | null;
  onReplay: () => void;
  onClose: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["stories-summary", null, "post-completion"],
    queryFn: () => listStoriesSummary(null),
    staleTime: 30_000,
  });

  const next = finished && data ? pickNextStory(data, finished.id) : null;
  const metaQ = useStoryMeta(finished?.id);
  const meta = metaQ.data;
  const refs = meta ? readReferences(meta.metadata) : { primary: [], secondary: [], notes: "" };
  const related = meta ? readRelatedEntities(meta.metadata) : [];
  const durationLabel = finished
    ? formatDurationArabic(resolveStoryDurationMs({ metadata: meta?.metadata ?? null, sceneCount: finished.scene_count }))
    : null;


  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] overflow-y-auto rounded-t-[28px] border-t border-gold/25 bg-background/98 shadow-[0_-24px_70px_rgba(0,0,0,0.75)] backdrop-blur"
      style={{ animation: "cyj-slide 520ms cubic-bezier(0.16,1,0.3,1) both" }}
    >
      <style>{`@keyframes cyj-slide { from { transform: translateY(100%); opacity: 0.4; } to { transform: translateY(0); opacity: 1; } }`}</style>
      <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-white/20" />

      {/* Header — quiet, curated, no exclamation. */}
      <div className="px-6 pt-6 pb-3">
        <p className="text-[10px] tracking-[0.36em] text-gold/70">تابع رحلتك</p>
        <h2 className="mt-2 font-display text-[clamp(20px,5.4vw,26px)] font-bold leading-tight text-gold">
          {finished ? `«${finished.title_ar}»` : "قصة أخرى بانتظارك"}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/60">
          {meta?.era && <span>{meta.era}</span>}
          {meta?.era && durationLabel && <span className="opacity-40">·</span>}
          {durationLabel && <span>{durationLabel}</span>}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-white/65">
          القراءة انتهت. هنا تبدأ المحادثة.
        </p>
      </div>

      {/* 1) Feel — heart interaction */}
      {finished && (
        <div className="px-6 pt-2">
          <Istazadtu anchorType="story" anchorId={finished.id} />
        </div>
      )}

      {/* 2) Reflect — composer + reader reflections */}
      {finished && (
        <div className="px-6 pt-6">
          <PublicContributionsNotice anchorType="story" anchorId={finished.id} />
          <StoryComments storyId={finished.id} />
        </div>
      )}

      {/* 3) Explore — related entities */}
      {related.length > 0 && (
        <RelatedEntitiesBlock related={related} />
      )}

      {/* 4) Verify — references */}
      {(refs.primary.length > 0 || refs.secondary.length > 0 || refs.notes) && (
        <ReferencesBlock refs={refs} />
      )}

      {next && (
        <div className="px-6 pt-8">
          <div className="mb-3 flex items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-l from-gold/40 to-transparent" />
            <p className="text-[10px] tracking-[0.32em] text-gold/70">قصة قادمة</p>
            <span className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent" />
          </div>
          <StoryCard story={next} />
        </div>
      )}

      <div
        className="sticky bottom-0 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-background/95 px-5 py-4 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-black/40 px-4 py-2 text-sm text-gold"
        >
          إغلاق
        </button>
        <Link
          to="/stories"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface/60 px-4 py-2 text-sm"
        >
          كل القصص <ArrowLeft className="size-3.5" />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface/60 px-4 py-2 text-sm"
        >
          <Home className="size-3.5" /> الرئيسية
        </Link>
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-surface/60 px-4 py-2 text-sm"
        >
          إعادة القراءة
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------

function useEntityTitles(ids: string[]) {
  return useQuery({
    queryKey: ["entity-titles", [...ids].sort()],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("encyclopedia_entities")
        .select("id, title, slug")
        .in("id", ids);
      const map = new Map<string, string>();
      for (const row of (data ?? []) as { id: string; title: string | null; slug: string | null }[]) {
        map.set(row.id, row.title || row.slug || row.id);
      }
      return map;
    },

  });
}

function RelatedEntitiesBlock({ related }: { related: { id: string; title_ar?: string | null }[] }) {
  const missing = related.filter((r) => !r.title_ar).map((r) => r.id);
  const titlesQ = useEntityTitles(missing);
  const titleFor = (r: { id: string; title_ar?: string | null }) =>
    r.title_ar || titlesQ.data?.get(r.id) || r.id;
  return (
    <div className="px-5 pt-6">
      <p className="mb-2 text-[10px] tracking-[0.28em] text-gold/70">استكشف أكثر</p>
      <ul className="flex flex-wrap gap-2">
        {related.map((r) => (
          <li key={r.id}>
            <Link
              to="/encyclopedia/entity/$id"
              params={{ id: r.id }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-surface/60 px-3 py-1.5 text-[12px] text-white/85 hover:border-gold/40 hover:text-gold"
            >
              <BookOpenText className="size-3.5 opacity-70" />
              {titleFor(r)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}


function ReferencesBlock({
  refs,
}: {
  refs: { primary: StoryReference[]; secondary: StoryReference[]; notes?: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 pt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-surface/40 px-3 py-2 text-[12px] text-white/85"
      >
        <span className="tracking-wide text-gold/80">المصادر والمراجع</span>
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-3 rounded-lg border border-white/10 bg-black/30 p-3 text-[12px] leading-relaxed">
          {refs.primary.length > 0 && (
            <RefsGroup title="مصادر أولية" items={refs.primary} />
          )}
          {refs.secondary.length > 0 && (
            <RefsGroup title="مصادر ثانوية" items={refs.secondary} />
          )}
          {refs.notes && (
            <div className="border-t border-white/10 pt-2 text-[11px] text-white/60">
              {refs.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RefsGroup({ title, items }: { title: string; items: StoryReference[] }) {
  return (
    <div>
      <div className="mb-1 text-[10px] tracking-[0.24em] text-gold/70">{title}</div>
      <ul className="space-y-1">
        {items.map((r, i) => (
          <li key={i} className="text-white/85">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer" className="underline decoration-gold/40 hover:text-gold">
                {r.title}
              </a>
            ) : (
              <span>{r.title}</span>
            )}
            {(r.author || r.year) && (
              <span className="text-white/50">
                {" — "}
                {[r.author, r.year].filter(Boolean).join("، ")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// re-export for callers
export type { StorySummary };
