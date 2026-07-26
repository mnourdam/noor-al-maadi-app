// ============================================================
// StoryCard — cinematic story card (Phase 2 redesign).
// ------------------------------------------------------------
// Single card used everywhere Stories are surfaced: Home rail,
// /stories catalog, Worlds section, Related rails, Continue Your
// Journey. Presentational; caller controls the wrapper.
//
// Hierarchy (top → bottom, all over a tall cinematic cover):
//   1. Cover artwork (portrait, 3:4) with bottom gradient
//   2. Top-left status pill (اكتمل / استئناف / جديدة)
//   3. Title (2-line clamp) over the gradient
//   4. One-line summary (1-line clamp)
//   5. Meta row: ⏱ duration · ✨ XP · ◈ Dinars
//   6. Progress bar (in-progress only)
// ============================================================

import { Link } from "@tanstack/react-router";
import {
  BookOpenText,
  CheckCircle2,
  Clock3,
  Coins,
  Lock,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { progressFraction, storyState, type StorySummary } from "@/lib/stories/summary";
import { formatDurationArabic, resolveStoryDurationMs } from "@/lib/stories/duration";
import { useProfile } from "@/lib/profile";
import { guestHasCompleted } from "@/lib/stories/guestCompletions";
import { useEffect, useState } from "react";
import { useStoryCoverSrc } from "@/lib/stories/covers";
import { LockedStoryDialog } from "./LockedStoryDialog";

// Covers are an OFFLINE APPLICATION ASSET (see src/lib/stories/covers):
// bundled covers resolve synchronously from /story-covers, so the card
// paints on the first frame with no RPC, no signing and no network.
// Only stories newer than the installed build fall through to the
// delta-sync path inside `useStoryCoverSrc`.


export function StoryCard({
  story,
  variant = "grid",
}: {
  story: StorySummary;
  variant?: "grid" | "rail";
}) {
  const serverState = storyState(story);
  const { profile } = useProfile();
  const isGuest = !profile.loggedIn;
  // Guests have no server row for completion — overlay the local
  // guest-completion set so the pill flips to "اكتمل" immediately
  // and on relaunch. Re-check on the guest-completion event so an
  // in-flight completion updates open card grids without a reload.
  const [guestDone, setGuestDone] = useState<boolean>(() => isGuest && guestHasCompleted(story.id));
  useEffect(() => {
    if (!isGuest) {
      setGuestDone(false);
      return;
    }
    const check = () => setGuestDone(guestHasCompleted(story.id));
    check();
    if (typeof window === "undefined") return;
    const onChange = () => check();
    window.addEventListener("irth:guest-story-completed", onChange);
    window.addEventListener("irth:story-completions:changed", onChange);
    return () => {
      window.removeEventListener("irth:guest-story-completed", onChange);
      window.removeEventListener("irth:story-completions:changed", onChange);
    };
  }, [isGuest, story.id]);
  const state = guestDone && serverState !== "locked" ? "completed" : serverState;

  const durationLabel = formatDurationArabic(
    resolveStoryDurationMs({ metadata: null, sceneCount: story.scene_count }),
  );
  const coverRow = useCoverRow(story.id, story.cover_media_id);
  const cover = useStoryMediaUrl(coverRow);
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => { setCoverFailed(false); }, [cover]);

  const pct = Math.round(progressFraction(story) * 100);
  const widthClass = variant === "rail" ? "w-44 flex-none snap-start sm:w-52" : "w-full";
  const [lockDialog, setLockDialog] = useState(false);

  const shellClass = `group relative block overflow-hidden rounded-2xl border border-gold/25 bg-black/60 text-start shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/5 transition hover:border-gold/60 hover:shadow-[0_14px_36px_rgba(0,0,0,0.6)] ${widthClass}`;

  // Locked stories never navigate: tapping explains what is still missing.
  const Shell = ({ children }: { children: React.ReactNode }) =>
    state === "locked" ? (
      <button
        type="button"
        dir="rtl"
        aria-label={`${story.title_ar} — مقفلة`}
        onClick={() => setLockDialog(true)}
        className={shellClass}
      >
        {children}
      </button>
    ) : (
      <Link
        dir="rtl"
        to="/story/$id"
        params={{ id: story.id }}
        aria-label={story.title_ar}
        className={shellClass}
      >
        {children}
      </Link>
    );

  return (
    <>
    <Shell>

      {/* Cover — tall cinematic 3:4 */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-900">
        {cover && !coverFailed ? (
          <img
            src={cover}
            alt={story.title_ar}
            loading="lazy"
            decoding="async"
            onError={() => setCoverFailed(true)}
            className={`h-full w-full object-cover transition duration-500 group-hover:scale-[1.04] ${
              !story.unlocked ? "opacity-40 blur-[2px]" : ""
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-black">
            <BookOpenText className="size-10 text-gold/40" />
          </div>
        )}

        {/* Strong bottom gradient — legibility for title/summary */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 62%, rgba(0,0,0,0.92) 100%)",
          }}
        />

        {/* Subtle top vignette for pill legibility */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-16"
          style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0))" }}
        />

        {/* Status pill — top-start (RTL: top-right) */}
        <div className="absolute start-2 top-2">
          {state === "locked" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-gold backdrop-blur">
              <Lock className="size-3" /> مقفلة
            </span>
          )}
          {state === "completed" && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white"
              aria-label="مكتملة"
            >
              <CheckCircle2 className="size-3" />
              <span>مكتملة</span>
              <span aria-hidden className="text-[11px] leading-none">
                ✓
              </span>
            </span>
          )}
          {state === "in_progress" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold/95 px-2 py-0.5 text-[10px] font-bold text-black">
              <PlayCircle className="size-3" /> استئناف
            </span>
          )}
          {state === "new" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-black/70 px-2 py-0.5 text-[10px] tracking-wide text-gold backdrop-blur">
              جديدة
            </span>
          )}
        </div>

        {/* Full lock overlay */}
        {state === "locked" && (
          <div className="absolute inset-0 grid place-items-center">
            <Lock className="size-7 text-gold/90 drop-shadow-lg" />
          </div>
        )}

        {/* Text block — anchored to bottom over gradient */}
        <div className="absolute inset-x-0 bottom-0 z-10 p-3">
          <h3 className="font-display text-[15px] font-bold leading-snug text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] line-clamp-2">
            {story.title_ar}
          </h3>
          {story.summary_ar && (
            <p className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-white/80">
              {story.summary_ar}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-[10.5px] text-white/85">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3 text-white/70" />
              {durationLabel}
            </span>

            {story.xp_reward > 0 && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-3 text-gold" />
                {story.xp_reward}
              </span>
            )}
            {story.dinar_reward > 0 && (
              <span className="inline-flex items-center gap-1">
                <Coins className="size-3 text-gold" />
                {story.dinar_reward}
              </span>
            )}
          </div>
        </div>

        {/* In-progress bar (RTL: fills from right) */}
        {state === "in_progress" && pct > 0 && (
          <div dir="rtl" className="absolute inset-x-0 bottom-0 z-20 h-[3px] bg-black/50">
            <div
              className="h-full"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(270deg, hsl(45 90% 55%), hsl(45 100% 72%))",
                boxShadow: "0 0 8px hsl(45 100% 65% / 0.55)",
              }}
            />
          </div>
        )}
      </div>
    </Shell>
    {lockDialog && (
      <LockedStoryDialog
        title={story.title_ar}
        prereqs={story.prereqs}
        explanation={story.lock_explanation}
        onClose={() => setLockDialog(false)}
      />
    )}
    </>
  );
}
