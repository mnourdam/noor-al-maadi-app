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
import { formatStoryDuration, resolveStoryDurationMs } from "@/lib/stories/duration";
import { useProfile } from "@/lib/profile";
import { guestHasCompleted } from "@/lib/stories/guestCompletions";
import { useEffect, useState, useId, type ReactNode } from "react";
import { useStoryCoverSrc } from "@/lib/stories/covers";
import { useUiLanguage } from "@/lib/ui-language/store";
import { selectStoryMetadata } from "@/lib/stories/display-metadata";
import { LockedStoryDialog } from "./LockedStoryDialog";

// Covers are an OFFLINE APPLICATION ASSET (see src/lib/stories/covers):
// bundled covers resolve synchronously from /story-covers, so the card
// paints on the first frame with no RPC, no signing and no network.
// Only stories newer than the installed build fall through to the
// delta-sync path inside `useStoryCoverSrc`.


// Stable identity keeps focus, cover DOM and open card state across display-language changes.
function StoryCardShell({ locked, id, className, labelledBy, onLockedClick, children }: {
  locked: boolean; id: string; className: string; labelledBy: string;
  onLockedClick: () => void; children: ReactNode;
}) {
  return locked ? (
    <button type="button" lang="ar" dir="rtl" aria-labelledby={labelledBy}
      onClick={onLockedClick} className={className}>{children}</button>
  ) : (
    <Link lang="ar" dir="rtl" to="/story/$id" params={{ id }}
      aria-labelledby={labelledBy} className={className}>{children}</Link>
  );
}

export function StoryCard({
  story,
  variant = "grid",
}: {
  story: StorySummary;
  variant?: "grid" | "rail";
}) {
  const { language, direction, messages } = useUiLanguage();
  const title = selectStoryMetadata(story.title_ar, story.title_en, language);
  const summary = selectStoryMetadata(story.summary_ar, story.summary_en, language);
  const labelId = useId();
  const titleId = `${labelId}-title`;
  const lockedId = `${labelId}-locked`;
  const serverState = storyState(story);
  const { profile } = useProfile();
  const isGuest = !profile.loggedIn;
  // Guests have no server row for completion — overlay the local
  // guest-completion set so the pill flips to "اكتمل" immediately
  // and on relaunch. Re-check on the guest-completion event so an
  // in-flight completion updates open card grids without a reload.
  const readGuestStatus = (): boolean | null => {
    try { return isGuest && guestHasCompleted(story.id); } catch { return null; }
  };
  const [guestDone, setGuestDone] = useState<boolean | null>(readGuestStatus);
  useEffect(() => {
    if (!isGuest) {
      setGuestDone(false);
      return;
    }
    const check = () => { try { setGuestDone(guestHasCompleted(story.id)); } catch { setGuestDone(null); } };
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
  const state = isGuest && guestDone === null && serverState !== "locked"
    ? "unknown"
    : guestDone === true && serverState !== "locked" ? "completed" : serverState;

  const durationLabel = formatStoryDuration(
    resolveStoryDurationMs({ metadata: null, sceneCount: story.scene_count }),
    language,
  );
  const cover = useStoryCoverSrc(story);

  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => { setCoverFailed(false); }, [cover]);

  const pct = Math.round(progressFraction(story) * 100);
  const widthClass = variant === "rail" ? "w-44 flex-none snap-start sm:w-52" : "w-full";
  const [lockDialog, setLockDialog] = useState(false);

  const shellClass = `group relative block overflow-hidden rounded-2xl border border-gold/25 bg-black/60 text-start shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/5 transition hover:border-gold/60 hover:shadow-[0_14px_36px_rgba(0,0,0,0.6)] ${widthClass}`;

  return (
    <>
    <StoryCardShell locked={state === "locked"} id={story.id} className={shellClass}
      labelledBy={state === "locked" ? `${titleId} ${lockedId}` : titleId}
      onLockedClick={() => setLockDialog(true)}>

      {/* Cover — tall cinematic 3:4 */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-900">
        {cover && !coverFailed ? (
          <img
            src={cover}
            alt={title?.text ?? ""}
            lang={title?.lang} dir={title?.dir}
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
            <span id={lockedId} lang={language} dir={direction} className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-gold backdrop-blur">
              <Lock className="size-3" /> {messages.catalogLocked}
            </span>
          )}
          {state === "completed" && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-medium text-white"
              lang={language} dir={direction} aria-label={messages.catalogCompleted}
            >
              <CheckCircle2 className="size-3" />
              <span>{messages.catalogCompleted}</span>
              <span aria-hidden className="text-[11px] leading-none">
                ✓
              </span>
            </span>
          )}
          {state === "in_progress" && (
            <span lang={language} dir={direction} className="inline-flex items-center gap-1 rounded-full bg-gold/95 px-2 py-0.5 text-[10px] font-bold text-black">
              <PlayCircle className="size-3" /> {messages.storyResume}
            </span>
          )}
          {isGuest && guestDone === null && <span role="status" lang={language} dir={direction} className="text-xs text-gold">{messages.storyHistoryUnknown}</span>}
          {state === "new" && (!isGuest || guestDone !== null) && (
            <span lang={language} dir={direction} className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-black/70 px-2 py-0.5 text-[10px] tracking-wide text-gold backdrop-blur">
              {messages.storyNew}
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
          <h3 id={titleId} lang={title?.lang} dir={title?.dir} className="font-display text-[15px] font-bold leading-snug text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] line-clamp-2">
            {title?.text}
          </h3>
          {summary && (
            <p lang={summary.lang} dir={summary.dir} className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-white/80">
              {summary.text}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-[10.5px] text-white/85">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3 text-white/70" />
              <span lang={language} dir={direction}>{durationLabel}</span>
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
    </StoryCardShell>
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
