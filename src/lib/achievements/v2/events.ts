/**
 * Achievement event bus.
 *
 * The engine emits declarative event identifiers (from `AchievementEventHooks`)
 * through this bus after successful unlock/claim/view. Presentation-layer
 * modules subscribe and decide what to do (confetti, sounds, modals,
 * unlocks). The engine itself is completely decoupled from presentation.
 *
 * A parallel channel emits analytics events using each definition's
 * `analyticsId`, so analytics wiring is data-driven too.
 */

import type { AchievementEventId, AchievementDefinition, TransitionOrigin } from "./types";

export type AchievementLifecycleHook = "onUnlocked" | "onClaimed" | "onViewed";

export interface AchievementEventPayload {
  hook: AchievementLifecycleHook;
  eventId: AchievementEventId;
  achievementId: string;
  definition: AchievementDefinition;
  at: number;
}

export interface AchievementAnalyticsPayload {
  hook: AchievementLifecycleHook;
  analyticsId: string;
  achievementId: string;
  at: number;
}

type EventListener = (p: AchievementEventPayload) => void;
type AnalyticsListener = (p: AchievementAnalyticsPayload) => void;
export interface AchievementTransitionPayload {
  achievementId: string;
  origin: TransitionOrigin;
  at: number;
}
type TransitionListener = (p: AchievementTransitionPayload) => void;

const eventListeners = new Set<EventListener>();
const analyticsListeners = new Set<AnalyticsListener>();
const transitionListeners = new Set<TransitionListener>();

export function onAchievementEvent(fn: EventListener): () => void {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}

export function onAchievementAnalytics(fn: AnalyticsListener): () => void {
  analyticsListeners.add(fn);
  return () => analyticsListeners.delete(fn);
}

export function onAchievementTransition(fn: TransitionListener): () => void {
  transitionListeners.add(fn);
  return () => transitionListeners.delete(fn);
}

function emit(fn: () => void) {
  // Fail-soft: one bad listener must not break the pipeline.
  try {
    fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[achievements] event listener threw", err);
  }
}

/**
 * Fire every event id declared for `hook` on `def`. Also fires an analytics
 * event if `def.analyticsId` is set.
 */
export function dispatchAchievementHook(
  hook: AchievementLifecycleHook,
  def: AchievementDefinition,
): void {
  const ids = def.events?.[hook] ?? [];
  const at = Date.now();

  for (const eventId of ids) {
    const payload: AchievementEventPayload = {
      hook,
      eventId,
      achievementId: def.id,
      definition: def,
      at,
    };
    for (const l of eventListeners) emit(() => l(payload));
  }

  if (def.analyticsId) {
    const payload: AchievementAnalyticsPayload = {
      hook,
      analyticsId: def.analyticsId,
      achievementId: def.id,
      at,
    };
    for (const l of analyticsListeners) emit(() => l(payload));
  }
}

export function dispatchAchievementTransition(
  achievementId: string,
  origin: TransitionOrigin,
): void {
  const payload: AchievementTransitionPayload = {
    achievementId,
    origin,
    at: Date.now(),
  };
  for (const l of transitionListeners) emit(() => l(payload));
}

/** Test / debug hook — dumps current subscriber counts. */
export function _debugListenerCounts() {
  return {
    events: eventListeners.size,
    analytics: analyticsListeners.size,
    transitions: transitionListeners.size,
  };
}
