// ============================================================
// Home Summary — canonical read-only source for the compact
// Home statistics strip (Phase 6).
// ------------------------------------------------------------
// Returns exactly the five values displayed on Home:
//   dinars, museumCount, campaignsCompleted,
//   investigationsCompleted, storiesCompleted.
//
// Every field routes to a single canonical source. Legacy
// profile arrays (storiesRead / timelinesCompleted /
// missionsCompleted) are NEVER consulted here.
// ============================================================

import { useEffect, useReducer, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import { useRealCollectionStats } from "@/lib/real-collection-stats";
import { useCanonicalInvestigationProgress } from "@/lib/investigations/progress";
import { localCompletedIds as localCampaignCompletedIds } from "@/lib/campaigns/completions";
import { guestCompletionsSnapshot } from "@/lib/stories/guestCompletions";
import { readMirror } from "@/lib/stories/progress-mirror";
import { getActiveOwner, getIdentityEpoch, onOwnerChange } from "@/lib/identity/owner";
import { isReconciliationTerminal, subscribeReconciliation } from "@/lib/boot/reconciliation";
import { readHomeCompletionIds } from "./home-completion-read";

export interface HomeSummary {
  dinars: number;
  museumCount: number;
  campaignsCompleted: number;
  investigationsCompleted: number;
  storiesCompleted: number;
  loading: boolean;
  error: string | null;
}


const PREFIX = "home-completions";
// Multiple mounted consumers / outbox event bursts share one trailing refresh.
const refreshTimers = new WeakMap<QueryClient, Map<string, ReturnType<typeof setTimeout>>>();
function scheduleRefresh(client: QueryClient, owner: string, epoch: number) {
  const key = [PREFIX, owner, epoch];
  void client.cancelQueries({ queryKey: key });
  let timers = refreshTimers.get(client);
  if (!timers) { timers = new Map(); refreshTimers.set(client, timers); }
  const id = JSON.stringify(key);
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => {
    timers.delete(id);
    if (getActiveOwner() === owner && getIdentityEpoch() === epoch && isReconciliationTerminal()) {
      void client.invalidateQueries({ queryKey: key });
    }
  }, 75));
}
const subscribeOwner = (notify: () => void) => onOwnerChange(notify);
const identitySnapshot = () => JSON.stringify([getActiveOwner(), getIdentityEpoch()]);
const serverIdentity = () => '["pending",-1]';
const subscribeReady = (notify: () => void) => subscribeReconciliation(notify);
const serverReady = () => false;

/** Display cache only. Never writes progress, profile, rewards or localStorage. */
export function useHomeSummary(): HomeSummary {
  const { profile } = useProfile();
  const { user, loadingSession } = useAccount();
  const stats = useRealCollectionStats();
  const canonicalInv = useCanonicalInvestigationProgress();
  const identity = useSyncExternalStore(subscribeOwner, identitySnapshot, serverIdentity);
  const [owner, epoch] = JSON.parse(identity) as [string, number];
  const reconciled = useSyncExternalStore(subscribeReady, isReconciliationTerminal, serverReady);
  const uid = user?.id ?? null;
  const ready = !loadingSession && reconciled && (uid ? owner === `user:${uid}` : owner.startsWith("guest:"));
  const queryClient = useQueryClient();
  const [, refreshLocal] = useReducer((n: number) => n + 1, 0);
  const campaigns = useQuery({
    queryKey: [PREFIX, owner, epoch, "campaigns"],
    queryFn: ({ signal }) => readHomeCompletionIds("campaigns", uid!, owner, epoch, signal),
    enabled: ready && !!uid,
    staleTime: 0, // Always revalidate on return, without clearing verified display data.
    refetchOnMount: true, // Also revalidate when Android stable-mode defaults disable it.
    refetchOnReconnect: true,
    gcTime: 5 * 60_000,
    retry: false,
  });
  const stories = useQuery({
    queryKey: [PREFIX, owner, epoch, "stories"],
    queryFn: ({ signal }) => readHomeCompletionIds("stories", uid!, owner, epoch, signal),
    enabled: ready && !!uid,
    staleTime: 0,
    refetchOnMount: true, // Also revalidate when Android stable-mode defaults disable it.
    refetchOnReconnect: true,
    gcTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!ready) return;
    const changed = () => {
      refreshLocal(); // Accepted local progress is visible before the network returns.
      // Invalidate/cancel even an INITIAL read so an old response cannot win over
      // a completion. Signal-consuming reads and React Query fence stale replies.
      scheduleRefresh(queryClient, owner, epoch);
    };
    const events = ["irth:campaign-completions:changed", "irth:story-completions:changed", "irth:outbox:flushed"];
    for (const event of events) window.addEventListener(event, changed);
    return () => { for (const event of events) window.removeEventListener(event, changed); };
  }, [queryClient, owner, epoch, ready]);

  // Re-read local accepted facts on every render/return. Do not seed a signed-in
  // account from the guest ledger or treat an incomplete mirror as a full count.
  let campaignCount: number | null = null;
  let storyCount: number | null = null;
  let localError: string | null = null;
  if (ready) {
    try {
      if (!uid || campaigns.data !== undefined) {
        campaignCount = new Set([...localCampaignCompletedIds(), ...(campaigns.data ?? [])]).size;
      }
      if (!uid) storyCount = guestCompletionsSnapshot().size;
      else if (stories.data !== undefined) {
        const entries: unknown = readMirror(uid).entries;
        const accepted = entries && typeof entries === "object" && !Array.isArray(entries)
          ? Object.entries(entries).filter(([, row]) =>
            row !== null && typeof row === "object" && !Array.isArray(row) && row.completed === true,
          ).map(([id]) => id)
          : [];
        storyCount = new Set([...stories.data, ...accepted]).size;
      }
    } catch { localError = "تعذر قراءة إحصاءات الإنجاز المحلية"; }
  }
  return {
    dinars: profile.dinars ?? 0,
    museumCount: stats.totalCollection,
    campaignsCompleted: campaignCount ?? 0,
    investigationsCompleted: canonicalInv.count,
    storiesCompleted: storyCount ?? 0,
    loading: !ready || campaignCount === null || storyCount === null,
    error: localError ?? (campaigns.error || stories.error ? "تعذر تحديث إحصاءات الإنجاز" : null),
  };
}
