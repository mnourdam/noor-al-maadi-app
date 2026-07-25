// Phase 3 — Atlas detail viewer.
// When an entity is linked to an encyclopedia article, render from the
// local-first encyclopedia cache so the Atlas remains usable offline.
//
// Layout: bottom sheet on mobile, floating popover at the bottom-right on
// desktop. Safe-area padding so it never hides behind the home-bar.
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { BookOpen, Crosshair, Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { KIND_LABEL_AR, type AtlasEntityRow } from "@/lib/atlas-entities";
import {
  fetchEncyclopediaByIdLocalFirst,
  type SupabaseEncyclopediaEntity,
} from "@/lib/encyclopedia-source";
import { FeedbackCTA } from "@/components/feedback/FeedbackCTA";
import { useStashCurrentAsOrigin } from "@/lib/navigation";
import { useAccount } from "@/lib/account";
import { ATLAS_VISIT_DWELL_MS, recordAtlasVisit } from "@/lib/atlas/visits";



function useEncyclopediaEntity(id: string | null) {
  return useQuery<SupabaseEncyclopediaEntity | null>({
    queryKey: ["atlas-encyclopedia-entity", id],
    enabled: !!id,
    staleTime: 30_000,
    queryFn: async () => {
      if (!id) return null;
      return fetchEncyclopediaByIdLocalFirst(id);
    },
  });
}

export function AtlasEntityDetailPanel({
  entity,
  onClose,
  onCenter,
}: {
  entity: AtlasEntityRow;
  onClose: () => void;
  onCenter?: () => void;
}) {
  const encId = entity.encyclopedia_entity_id ?? null;
  const { data: article, isLoading } = useEncyclopediaEntity(encId);
  const stashOrigin = useStashCurrentAsOrigin();

  const hasCoords = entity.aps_x != null && entity.aps_y != null;

  // Live values from the encyclopedia (source of truth) win. The Atlas
  // row's own name/era are used only as a fallback while loading, or for
  // unlinked entities.
  const title = article?.title || entity.name_ar;
  const subtitle = article?.subtitle ?? entity.name_en ?? null;
  const summary = article?.summary ?? null;

  const era =
    entity.era ||
    (entity.year_start != null
      ? entity.year_end != null && entity.year_end !== entity.year_start
        ? `${entity.year_start}–${entity.year_end}م`
        : `${entity.year_start}م`
      : null);

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label={title}
      className="pointer-events-auto absolute inset-x-3 z-30 max-w-md
                 rounded-2xl border border-amber-400/30 text-amber-50 shadow-[0_18px_40px_rgba(0,0,0,0.55)]
                 animate-in fade-in slide-in-from-bottom-2 duration-200
                 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[22rem]"
      style={{
        bottom: "max(0.75rem, env(safe-area-inset-bottom))",
        backgroundImage:
          "linear-gradient(180deg, oklch(0.22 0.04 252 / 0.96), oklch(0.16 0.05 255 / 0.96))",
      }}
    >
      <button
        onClick={onClose}
        aria-label="إغلاق"
        className="absolute left-2 top-2 rounded-full p-1 text-amber-200/80 hover:bg-amber-400/10"
      >
        <X className="size-4" />
      </button>

      <div className="p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300/80">
          {KIND_LABEL_AR[entity.kind] ?? entity.kind}
          {era && <span className="mx-1.5 opacity-60">·</span>}
          {era && <span className="font-normal tracking-normal">{era}</span>}
        </p>
        <h2 className="mt-0.5 font-display text-lg font-bold leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p
            dir={article?.subtitle ? "rtl" : "ltr"}
            className="mt-0.5 text-[11px] text-amber-200/70"
          >
            {subtitle}
          </p>
        )}

        {isLoading && encId ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-amber-200/70">
            <Loader2 className="size-3.5 animate-spin" />
            تحميل المقالة...
          </p>
        ) : summary ? (
          <p className="mt-3 text-[13px] leading-relaxed text-amber-100/90 line-clamp-4">
            {summary}
          </p>
        ) : !encId ? (
          <p className="mt-3 text-[12px] leading-relaxed text-amber-200/70">
            المقالة قادمة قريباً.
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          {encId ? (
            <Link
              to="/encyclopedia/entity/$id"
              params={{ id: encId }}
              onClick={() => stashOrigin(`/encyclopedia/entity/${encId}`)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 px-4 py-2 text-[13px] font-bold text-slate-950 shadow hover:from-amber-300 hover:to-amber-400"
            >

              <BookOpen className="size-4" /> اقرأ في الموسوعة
            </Link>
          ) : (
            <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-amber-400/30 bg-slate-900/60 px-4 py-2 text-[12px] font-medium text-amber-100/70">
              <BookOpen className="size-4" /> المقالة قادمة قريباً
            </span>
          )}
          {hasCoords && onCenter && (
            <button
              type="button"
              onClick={onCenter}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-amber-400/30 bg-slate-950/60 px-4 py-2 text-[12px] font-medium text-amber-100 hover:bg-slate-900"
            >
              <Crosshair className="size-4" /> توسيط على الخريطة
            </button>
          )}
        </div>

        <FeedbackCTA
          className="mt-4"
          context={{
            atlas_entity_id: entity.id,
            encyclopedia_entity_id: encId ?? undefined,
            title: entity.name_ar,
          }}
        />
      </div>
    </div>
  );
}

