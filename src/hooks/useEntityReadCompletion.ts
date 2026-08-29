// ============================================================
// useEntityReadCompletion — shared read-threshold hook for every
// encyclopedia detail route.
//
// Fires once per entity view when EITHER:
//   • player dwells on the article for ≥ MIN_READ_MS (20s)
//   • the relationship section becomes visible, OR
//   • ~88% of the document has been scrolled
// (whichever happens first).
//
// On fire, two independent one-shot side effects run:
//   1. Daily-quest reporting (existing behavior, unchanged)
//   2. Encyclopedia discovery ledger (`user_entity_discoveries` +
//      local mirror). Discovery grants NO rewards — it only marks
//      the entity as "known" for World progress.
// ============================================================

import { useEffect, useRef, type RefObject } from "react";
import {
  MIN_READ_MS,
  QUEST_COMPLETED_EVENT,
  recordEntityOpen,
  reportEntityRead,
} from "@/lib/daily-quest";
import { markEntityDiscovered } from "@/lib/entityDiscoveries";

interface Options {
  /** Canonical entity uuid (after redirect resolution). null while loading. */
  entityId: string | null | undefined;
  /** Canonical entity slug. */
  entitySlug: string | null | undefined;
  /** entity_type (figure|state|city|battle|event|landmark|artifact). */
  entityType: string | null | undefined;
  /** Stable per-user key: auth uid, or "guest". */
  userKey: string;
  /** Ref pointing at the related-history / relationship section. */
  relationshipSectionRef: RefObject<HTMLElement | null>;
  /** Optional label for discovery telemetry (default "encyclopedia"). */
  source?: string;
  /**
   * V16 — READINESS GATE. Discovery may only be recorded once the canonical
   * entity has actually loaded and rendered meaningful content. Route entry,
   * component mount, loading skeletons, unavailable entities, failed fetches
   * and empty bodies must all pass `false`. Defaults to `false` (fail closed).
   */
  contentReady?: boolean;
}

export function useEntityReadCompletion({
  entityId,
  entitySlug,
  entityType,
  userKey,
  relationshipSectionRef,
  source,
  contentReady = false,
}: Options): void {
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!entityId) return;
    // Fail closed: nothing is observed until real content is on screen.
    if (!contentReady) return;
    if (firedRef.current && firedRef.current !== entityId) firedRef.current = null;

    // Telemetry — powers the daily-quest "never opened" priority tier.
    recordEntityOpen(userKey, entityId);

    let cancelled = false;
    let dwellTimer: number | null = null;

    const fire = () => {
      if (cancelled) return;
      if (firedRef.current === entityId) return;
      firedRef.current = entityId;

      // 1. Daily-quest reporting (existing).
      try {
        const r = reportEntityRead(userKey, entityId);
        if (r.justCompleted && r.state) {
          try {
            window.dispatchEvent(
              new CustomEvent(QUEST_COMPLETED_EVENT, { detail: r.state }),
            );
          } catch { /* ignore */ }
        }
      } catch { /* daily-quest failure must not break discovery */ }

      // 2. Discovery ledger — writes local mirror immediately + enqueues
      //    server upsert when authenticated. No reward is granted.
      if (entitySlug && entityType) {
        try {
          markEntityDiscovered({
            userKey,
            entityId,
            entitySlug,
            entityType,
            source: source ?? "encyclopedia",
          });
        } catch { /* discovery failure must not break the page */ }
      }
    };

    // A) Dwell timer.
    dwellTimer = window.setTimeout(() => {
      dwellTimer = null;
      fire();
    }, MIN_READ_MS);

    // B1) Relationship-section intersection.
    let observer: IntersectionObserver | null = null;
    const el = relationshipSectionRef.current;
    if (el && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (en.isIntersecting) {
              fire();
              observer?.disconnect();
              break;
            }
          }
        },
        { threshold: 0.35, rootMargin: "0px 0px -10% 0px" },
      );
      observer.observe(el);
    }

    // B2) ≥ 88% scroll fallback.
    const onScroll = () => {
      if (firedRef.current === entityId) return;
      const doc = document.documentElement;
      const scrolled = window.scrollY + window.innerHeight;
      const total = doc.scrollHeight;
      if (total > 0 && scrolled / total >= 0.88) fire();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // NO mount-time completion. A short or stalled document trivially
    // satisfies `scrolled / total >= 0.88` on the first frame, which used to
    // record discovery before the player read anything. Discovery now
    // requires a real engagement signal AFTER the content is ready.

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (dwellTimer != null) window.clearTimeout(dwellTimer);
    };
  }, [entityId, entitySlug, entityType, userKey, relationshipSectionRef, source, contentReady]);
}
