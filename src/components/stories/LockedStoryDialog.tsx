// ============================================================
// LockedStoryDialog — pre-navigation lock explainer
// ------------------------------------------------------------
// Tapping a locked story card must NOT navigate into a dead-end
// locked page. Instead we explain, in place, exactly what the
// player still needs to do (derived from the authoritative
// `prereqs` projection returned by `list_stories_v3`).
//
// Presentational only: unlock truth stays in
// `evaluate_unlock_spec_v2` / `src/lib/stories/unlock`.
// ============================================================

import { Check, Lock, X } from "lucide-react";
import { ModalPortal } from "@/components/ModalPortal";
import { OverlayDismissRegistration } from "@/lib/navigation/overlay-registration";
import type { StoryPrereq } from "@/lib/stories/summary";

/** Arabic phrasing per prerequisite family. */
const KIND_LABEL: Record<string, string> = {
  campaign_complete: "أكمل الحملة",
  campaign_chapter_complete: "أكمل فصل الحملة",
  investigation_complete: "أكمل التحقيق",
  entity_discovered: "اكتشف في الموسوعة",
  entities_discovered: "اكتشف عناصر الموسوعة",
  artifact_owned: "امتلك المقتنى",
  atlas_location_visited: "زر الموقع في الأطلس",
  achievement_unlocked: "افتح الإنجاز",
  player_level: "ابلغ المستوى",
  story_complete: "أكمل القصة",
  date_window: "متاح في فترة محددة",
};

export function LockedStoryDialog({
  title,
  prereqs,
  explanation,
  onClose,
}: {
  title: string;
  prereqs?: StoryPrereq[];
  /** Authored player-facing lock copy from admin (`stories.lock_explanation`). */
  explanation?: string | null;
  onClose: () => void;
}) {
  const items = prereqs ?? [];
  const authored = (explanation ?? "").trim();
  const remaining = items.filter((p) => !p.satisfied);

  return (
    <ModalPortal>
      <OverlayDismissRegistration open onClose={onClose} label="locked-story-dialog" />
      <div
        dir="rtl"
        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <button
          type="button"
          aria-label="إغلاق"
          onClick={onClose}
          className="absolute inset-0"
          tabIndex={-1}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — مقفلة`}
          className="relative w-full max-w-sm rounded-t-3xl border border-gold/30 bg-surface p-5 shadow-elegant sm:rounded-3xl"
        >
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="absolute end-3 top-3 rounded-full border border-white/10 p-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>

          <div className="grid size-11 place-items-center rounded-2xl border border-gold/30 bg-gold/10">
            <Lock className="size-5 text-gold" />
          </div>

          <h2 className="mt-3 font-display text-base font-bold text-gold">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {authored
              ? authored
              : remaining.length > 0
                ? "هذه القصة مقفلة. أكمل المتطلبات التالية لفتحها:"
                : "هذه القصة مقفلة حاليًا. تابع رحلتك في إرث لفتحها."}
          </p>

          {items.length > 0 && (
            <ul className="mt-4 space-y-2">
              {items.map((p) => (
                <li
                  key={`${p.kind}:${p.ref}`}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px] leading-relaxed ${
                    p.satisfied
                      ? "border-emerald-400/25 bg-emerald-400/5 text-emerald-300"
                      : "border-white/10 bg-background/40 text-white/85"
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {p.satisfied ? <Check className="size-3.5" /> : <Lock className="size-3.5 text-gold/80" />}
                  </span>
                  <span>
                    <span className="text-muted-foreground">
                      {KIND_LABEL[p.kind] ?? "متطلب"}:{" "}
                    </span>
                    {p.title ?? p.ref}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={onClose}
            className="mt-5 w-full rounded-full border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-medium text-gold transition hover:bg-gold/20"
          >
            حسنًا
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
