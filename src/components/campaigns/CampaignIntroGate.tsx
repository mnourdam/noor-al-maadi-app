// ============================================================
// CampaignIntroGate (Stage 3)
// ------------------------------------------------------------
// Decides — ONCE, synchronously, from local state — whether the
// campaign's authored intro should play before the campaign surface.
//
// Guarantees:
//  * At most one showing per (identity × campaign × intro_version).
//  * The decision is taken on mount and frozen in a ref, so a re-render,
//    a route reload, or a back navigation from a chapter can never
//    re-open it. Only `resetCampaignIntro()` (explicit replay) can.
//  * No audio ownership: the intro is a passive consumer of the
//    surrounding `CampaignAudioScope`.
//  * No network in the decision path; a missing/disabled intro renders
//    the campaign immediately.
// ============================================================

import { useCallback, useRef, useState, type ReactNode } from "react";
import { areCampaignIntrosEnabled } from "@/lib/campaigns/intro/flags";
import { resolveCampaignIntro, type IntroCarrier } from "@/lib/campaigns/intro/resolve";
import {
  markCampaignIntroCompleted,
  markCampaignIntroSkipped,
  markCampaignIntroStarted,
  shouldShowCampaignIntro,
} from "@/lib/campaigns/intro/state";
import type { CampaignIntroRef } from "@/lib/campaigns/intro/types";

export interface CampaignIntroRenderArgs {
  intro: CampaignIntroRef;
  /** Player finished the intro. */
  onComplete: () => void;
  /** Player pressed "تخطي والبدء". */
  onSkip: () => void;
}

export function CampaignIntroGate({
  campaign,
  /** Explicit replay request (e.g. "إعادة المشاهدة"); bypasses the show-once check. */
  forceReplay = false,
  renderIntro,
  children,
}: {
  campaign: IntroCarrier | null | undefined;
  forceReplay?: boolean;
  renderIntro?: (args: CampaignIntroRenderArgs) => ReactNode;
  children: ReactNode;
}) {
  // Frozen on first render — the decision never re-evaluates for this mount.
  const decision = useRef<CampaignIntroRef | null | undefined>(undefined);
  if (decision.current === undefined) {
    const ref = resolveCampaignIntro(campaign);
    const eligible =
      !!ref &&
      !!renderIntro &&
      areCampaignIntrosEnabled() &&
      (forceReplay || shouldShowCampaignIntro(ref));
    decision.current = eligible ? ref : null;
    if (eligible && ref) markCampaignIntroStarted(ref);
  }

  const intro = decision.current;
  const [open, setOpen] = useState<boolean>(!!intro);
  const resolving = useRef(false);

  const resolve = useCallback(
    (mark: (ref: CampaignIntroRef) => void) => {
      if (resolving.current || !intro) return;
      resolving.current = true; // synchronous double-press guard
      mark(intro); // local write first — no await before the transition
      setOpen(false);
    },
    [intro],
  );

  const onComplete = useCallback(
    () => resolve((r) => markCampaignIntroCompleted(r)),
    [resolve],
  );
  const onSkip = useCallback(
    () => resolve((r) => markCampaignIntroSkipped(r)),
    [resolve],
  );

  if (intro && open && renderIntro) {
    return <>{renderIntro({ intro, onComplete, onSkip })}</>;
  }
  return <>{children}</>;
}
