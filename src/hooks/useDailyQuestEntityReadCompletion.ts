// ============================================================
// useDailyQuestEntityReadCompletion
//
// Shared reading-completion hook used by every encyclopedia detail
// route (generic entity route + type-specific routes like the state
// page). It centralizes:
//
//   • recordEntityOpen(userKey, entityId) — priority-tier telemetry
//   • dwell timer (MIN_READ_MS) so quick drag-to-bottom cannot fire
//   • IntersectionObserver on the related-history/relationship
//     section — primary threshold
//   • ~88 % scroll fallback — secondary threshold for routes without
//     that section or for very short articles
//   • one-shot QUEST_COMPLETED_EVENT dispatch on justCompleted
//
// The daily-quest module already guards mismatched entities and
// double-completion — this hook is just the render-side wiring.
// ============================================================

import { useEffect, useRef, type RefObject } from "react";
import {
  MIN_READ_MS,
  QUEST_COMPLETED_EVENT,
  recordEntityOpen,
  reportEntityRead,
} from "@/lib/daily-quest";

interface Options {
  /** Canonical entity id (post-redirect). null while loading. */
  entityId: string | null | undefined;
  /** Stable per-user key: user.id when authenticated, "guest" otherwise. */
  userKey: string;
  /** Ref pointing at the related-history / relationship section. */
  relationshipSectionRef: RefObject<HTMLElement | null>;
}

export function useDailyQuestEntityReadCompletion({
  entityId,
  userKey,
  relationshipSectionRef,
}: Options): void {
  const questFiredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!entityId) return;
    // Reset the per-entity fire guard when navigating between articles.
    if (questFiredRef.current && questFiredRef.current !== entityId) {
      questFiredRef.current = null;
    }

    // Telemetry: powers the daily-quest "never opened" priority tier.
    recordEntityOpen(userKey, entityId);

    const mountedAt = Date.now();
    let thresholdMet = false;
    let pendingTimer: number | null = null;
    let cancelled = false;

    const fire = () => {
      if (cancelled) return;
      if (questFiredRef.current === entityId) return;
      const r = reportEntityRead(userKey, entityId);
      if (r.justCompleted && r.state) {
        questFiredRef.current = entityId;
        try {
          window.dispatchEvent(
            new CustomEvent(QUEST_COMPLETED_EVENT, { detail: r.state }),
          );
        } catch {
          /* ignore */
        }
      } else if (r.state?.rewarded) {
        // Already rewarded on a previous session — don't re-fire.
        questFiredRef.current = entityId;
      }
    };

    const tryFire = () => {
      if (questFiredRef.current === entityId) return;
      const remaining = MIN_READ_MS - (Date.now() - mountedAt);
      if (remaining > 0) {
        if (pendingTimer == null) {
          pendingTimer = window.setTimeout(() => {
            pendingTimer = null;
            if (thresholdMet) fire();
          }, remaining);
        }
        return;
      }
      fire();
    };

    // Primary: relationship-section intersection.
    let observer: IntersectionObserver | null = null;
    const el = relationshipSectionRef.current;
    if (el && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (en.isIntersecting) {
              thresholdMet = true;
              tryFire();
              observer?.disconnect();
              break;
            }
          }
        },
        { threshold: 0.35, rootMargin: "0px 0px -10% 0px" },
      );
      observer.observe(el);
    }

    // Fallback: ≥ 88 % of the document scrolled.
    const onScroll = () => {
      if (questFiredRef.current === entityId) return;
      const doc = document.documentElement;
      const scrolled = window.scrollY + window.innerHeight;
      const total = doc.scrollHeight;
      if (total > 0 && scrolled / total >= 0.88) {
        thresholdMet = true;
        tryFire();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Kick once — a short article may already be at the bottom.
    onScroll();

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (pendingTimer != null) window.clearTimeout(pendingTimer);
    };
  }, [entityId, userKey, relationshipSectionRef]);
}
