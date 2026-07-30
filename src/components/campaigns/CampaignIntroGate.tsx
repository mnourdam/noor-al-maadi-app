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
import { isCampaignIntroEnabledFor } from "@/lib/campaigns/intro/flags";
import { introDebug } from "@/lib/campaigns/intro/debug";
import {
  diagnoseCampaignIntro,
  auditCampaignIntroRuntime,
  publishIntroDiagnostics,
  type IntroDecisionReport,
} from "@/lib/campaigns/intro/diagnose";
import { resolveCampaignIntro, type IntroCarrier } from "@/lib/campaigns/intro/resolve";
import {
  markCampaignIntroCompleted,
  markCampaignIntroSkipped,
  markCampaignIntroStarted,
  shouldShowCampaignIntro,
} from "@/lib/campaigns/intro/state";
import { queueCampaignIntroSync } from "@/lib/campaigns/intro/sync";
import type { CampaignIntroRef, CampaignIntroState } from "@/lib/campaigns/intro/types";


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
    // Cheapest check first: a campaign without an authored intro exits
    // here, before any storage read — no measurable start-up cost.
    const ref = resolveCampaignIntro(campaign);
    const report = diagnoseCampaignIntro(campaign, {
      forceReplay,
      hasRenderer: !!renderIntro,
    });
    const eligible = report.decision === "show" && !!ref && !!renderIntro;
    decision.current = eligible ? ref : null;
    introDebug(eligible ? "gate:open" : "gate:pass-through", report as never);
    publishIntroDiagnostics(report, ref);
    if (!eligible && import.meta.env?.DEV) {
      // Never fail silently while authoring content.
      // eslint-disable-next-line no-console
      console.info("[campaign-intro] rejected:", report.rejectionReason, report);
      void auditCampaignIntroRuntime(campaign, { forceReplay, hasRenderer: !!renderIntro }).then(
        (full: IntroDecisionReport) => {
          // eslint-disable-next-line no-console
          console.info("[campaign-intro] runtime audit:", full);
          publishIntroDiagnostics(full, ref);
        },
      );
    }
    if (eligible && ref) {
      markCampaignIntroStarted(ref);
      // Mirror only — fire-and-forget, never awaited.
      queueCampaignIntroSync(ref, "started");
    }
  }



  const intro = decision.current;
  const [open, setOpen] = useState<boolean>(!!intro);
  const resolving = useRef(false);

  const resolve = useCallback(
    (mark: (ref: CampaignIntroRef) => CampaignIntroState) => {
      if (resolving.current || !intro) return;
      resolving.current = true; // synchronous double-press guard
      const record = mark(intro); // local write first — no await before the transition
      setOpen(false);
      // Backup mirror AFTER the local write + transition. If it fails or the
      // device is offline the outbox retries; the intro never re-shows.
      queueCampaignIntroSync(intro, record.status, record.lastSceneIndex);
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

  // Dev-only replay hatch. Never rendered in a production build.
  const authored = resolveCampaignIntro(campaign);
  return (
    <>
      {children}
      {import.meta.env?.DEV && authored ? (
        <button
          type="button"
          onClick={() => {
            resetCampaignIntro(authored);
            window.location.reload();
          }}
          className="fixed bottom-24 left-3 z-50 rounded-full border border-border bg-card/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-lg backdrop-blur"
        >
          إعادة ضبط الافتتاحية
        </button>
      ) : null}
    </>
  );
}

