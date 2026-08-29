/**
 * V16 minimal startup/modal arbiter.
 *
 * Existing overlays are NOT rewritten. The arbiter only answers one
 * question for the surfaces that opt in: "given everything currently on
 * screen, may I show now?". Deterministic priority (lower number wins):
 *
 *   1 fatal/recovery guards          (DOM-detected, never yields)
 *   2 mandatory update               (arbiter-owned, outranks everything)
 *   3 splash / cinematic / first launch (DOM-detected legacy chain)
 *   4 critical generic announcement
 *   5 optional update
 *   6 normal generic announcement
 *   7 tutorial                        (DOM-detected)
 *   8 story unlock / level-up events  (DOM-detected dialogs)
 *
 * Rule: at most ONE startup/modal overlay at a time.
 */

export const MODAL_PRIORITY = {
  fatal: 1,
  mandatoryUpdate: 2,
  launchChain: 3,
  criticalAnnouncement: 4,
  optionalUpdate: 5,
  genericAnnouncement: 6,
  tutorial: 7,
  eventModal: 8,
} as const;

export type ModalPriority = (typeof MODAL_PRIORITY)[keyof typeof MODAL_PRIORITY];

/** Selectors describing overlays the arbiter does not own. */
const LEGACY_SELECTORS: Array<{ selector: string; priority: ModalPriority }> = [
  { selector: "[data-irth-recovery-layer]", priority: MODAL_PRIORITY.fatal },
  { selector: "[data-irth-cinematic-opening]", priority: MODAL_PRIORITY.launchChain },
  { selector: "[data-irth-splash]", priority: MODAL_PRIORITY.launchChain },
  { selector: "[data-irth-first-launch]", priority: MODAL_PRIORITY.launchChain },
  { selector: "[data-irth-tutorial-overlay]", priority: MODAL_PRIORITY.tutorial },
  { selector: "[role='dialog'][data-state='open']", priority: MODAL_PRIORITY.eventModal },
  { selector: "[role='alertdialog'][data-state='open']", priority: MODAL_PRIORITY.eventModal },
];

/** Highest-ranking (numerically smallest) overlay currently mounted, if any. */
export function detectActiveOverlayPriority(doc?: Document): ModalPriority | null {
  const d = doc ?? (typeof document !== "undefined" ? document : null);
  if (!d) return null;
  let best: ModalPriority | null = null;
  for (const { selector, priority } of LEGACY_SELECTORS) {
    try {
      if (!d.querySelector(selector)) continue;
    } catch {
      continue;
    }
    if (best === null || priority < best) best = priority;
  }
  return best;
}

/**
 * Pure arbitration: may a surface of `priority` show while `active` (the
 * strongest currently-mounted overlay) is on screen?
 */
export function mayShow(priority: ModalPriority, active: ModalPriority | null): boolean {
  if (active === null) return true;
  return priority < active;
}

/** Convenience wrapper over the live DOM. */
export function canShowModal(priority: ModalPriority, doc?: Document): boolean {
  // The mandatory blocker is the only surface allowed to pre-empt the
  // launch chain and every event modal; it still yields to fatal recovery.
  const active = detectActiveOverlayPriority(doc);
  return mayShow(priority, active);
}

/**
 * Deterministic non-modal banner slots. Banners are not arbitrated away —
 * they simply must never overlap each other.
 */
export const BANNER_SLOT = {
  /** In-app push banner. */
  top: "top",
  /** Content-update banner. */
  bottom: "bottom",
} as const;
