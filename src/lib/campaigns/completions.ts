// ============================================================
// Campaign Completions — sticky, versioned, server-authoritative
// ------------------------------------------------------------
// A campaign completion is a *fact* about a user's history. Once
// recorded, it survives:
//   - reinstall (server ledger is truth)
//   - admin edits that add chapters or republish the campaign
//   - restore of a previous campaign version
//
// This module is the single façade every surface should use to:
//   1. record a completion (offline-first via the outbox)
//   2. read the union of local + server completions
//
// It intentionally does NOT rely on `profile.campaignsCompleted`
// as an authority — that field is a legacy projection that the
// cloud save happily overwrites on login.
// ============================================================

import { recordTrace } from "@/lib/diag-trace";
import { supabase } from "@/integrations/supabase/client";
import { enqueueWithId } from "@/lib/offline/outbox";
import { flushOutbox } from "@/lib/offline/flush";
import { getActiveOwner, getActiveUserId } from "@/lib/identity/owner";

const inflightFetch = new Map<string, Promise<{ userId: string | null; ids: Set<string> }>>();
const LOCAL_STICKY_KEY = "irth.campaign_completions.v1";

interface LocalStickyRecord {
  campaignId: string;
  completedAt: string;
  campaignVersion: number | null;
  source: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readLocalSticky(): Record<string, LocalStickyRecord> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STICKY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalStickyRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

function writeLocalSticky(m: Record<string, LocalStickyRecord>, caller: string): void {
  if (!isBrowser()) return;
  
  // V13 Safety Invariant: Decouple physical partition logic from memory writes.
  // The caller must provide an intended owner.
  try { 
    const data = JSON.stringify(m);
    window.localStorage.setItem(LOCAL_STICKY_KEY, data); 

    import("@/lib/diag-trace").then(m_diag => {
      m_diag.recordTrace("logout-audit", "CAMPAIGN_WRITE_SOURCE", JSON.stringify({
        logicalKey: LOCAL_STICKY_KEY,
        count: Object.keys(m).length,
        caller
      }));
    }).catch(() => {});
  } catch { /* quota */ }
}

/**
 * Local mirror of the sticky facts. Written BEFORE the outbox is drained
 * so a crash between "record" and "flush" cannot lose the completion; the
 * union projection still sees it.
 */
export function localCompletedIds(): Set<string> {
  const ids = new Set<string>();
  
  // 1. Primary Sticky Ledger (Partitioned)
  const sticky = readLocalSticky();
  const stickyIds = Object.keys(sticky);
  for (const cid of stickyIds) ids.add(cid);

  // 2. Legacy Mirror (Partitioned)
  let legacyIds: string[] = [];
  if (isBrowser()) {
    try {
      const legacy = window.localStorage.getItem("irth_campaign_progress");
      if (legacy) {
        const parsed = JSON.parse(legacy) as Record<string, { completed?: boolean }>;
        if (parsed && typeof parsed === "object") {
          for (const [id, data] of Object.entries(parsed)) {
            if (id && data?.completed === true) {
              ids.add(String(id));
              legacyIds.push(String(id));
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  // V13 Forensic Tracing
  import("@/lib/diag-trace").then(m => {
    const activeOwner = typeof getActiveOwner === 'function' ? getActiveOwner() : 'unknown';
    m.recordTrace("logout-audit", "CAMPAIGN_LOCAL_SOURCE", JSON.stringify({
      owner: activeOwner,
      stickyCount: stickyIds.length,
      legacyCount: legacyIds.length,
      totalCount: ids.size,
      idsSample: Array.from(ids).slice(0, 3)
    }));
  }).catch(() => {});

  return ids;
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch { return null; }
}

/**
 * Idempotent. Safe to call every time the completion state is *observed*
 * (e.g. on chapter completion transitions). The outbox keys on the stable
 * per-user idempotency id so replays don't create duplicates. If the caller
 * is offline or unauthenticated, the local sticky fact is still written
 * and the server side syncs on the next successful flush.
 */
export async function recordCampaignCompletion(p: {
  campaignId: string;
  campaignVersion?: number | null;
  source?: string;
}): Promise<void> {
  const cid = String(p.campaignId ?? "").trim();
  if (!cid) return;

  // 1) Local sticky — persists even for guests.
  const m = readLocalSticky();
  if (!m[cid]) {
    m[cid] = {
      campaignId: cid,
      completedAt: new Date().toISOString(),
      campaignVersion: p.campaignVersion ?? null,
      source: p.source ?? "gameplay",
    };
    writeLocalSticky(m, `recordCampaignCompletion:${cid}`);
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("irth:campaign-completions:changed"));
        // Force immediate unlock re-evaluation
        window.dispatchEvent(new CustomEvent("irth:campaign-progress:changed"));
      }
    } catch { /* ignore */ }
  }

  // 2) Server ledger — durable write contract (Priority-Zero).
  //    Enqueue FIRST so a crash or offline state cannot lose the fact,
  //    then attempt the awaited RPC. On success drop the queued item;
  //    on failure leave it queued for later flush attempts.
  const uid = await currentUserId();
  if (!uid) return;
  const outboxId = `campaign_completion:${uid}:${cid}`;
  await enqueueWithId(uid, outboxId, "campaign_completion", {
    campaignId: cid,
    campaignVersion: p.campaignVersion ?? null,
    source: p.source ?? "gameplay",
  });

  // Immediate awaited server acknowledgement when online.
  if (typeof navigator === "undefined" || navigator.onLine) {
    try {
      const { data, error } = await supabase.rpc(
        "record_campaign_completion" as any,
        {
          p_campaign_id: cid,
          p_campaign_version: p.campaignVersion ?? null,
          p_source: p.source ?? "gameplay",
        },
      );
      if (!error) {
        const payload = (data ?? {}) as { ok?: boolean; reason?: string };
        if (payload.ok || payload.reason === "invalid_campaign_id") {
          // Server accepted (or refused permanently). Drop the queued copy.
          try {
            const { remove } = await import("@/lib/offline/outbox");
            await remove(outboxId);
          } catch { /* leave queued — flush will drop it */ }
        } else if (payload.reason === "unauthenticated") {
          // Transient — leave queued for post-login flush.
        } else {
          console.warn("[campaign-completion] rpc-not-ok", payload.reason, { cid });
        }
      } else {
        console.warn("[campaign-completion] rpc-error", error.message, { cid });
      }
    } catch (e) {
      console.warn("[campaign-completion] rpc-exception", e);
    }
  }

  // Best-effort background flush of any other pending items.
  void flushOutbox(uid);
}

/**
 * Fetch the server's sticky completion ledger for the current user.
 * Returns an empty set when signed-out or offline; callers are expected
 * to UNION the result with `localCompletedIds()`.
 * 
 * V13: Returns the userId that produced this result to allow ownership validation.
 */
export async function fetchServerCompletedIds(): Promise<{ userId: string | null; ids: Set<string> }> {
  const uid = await getActiveUserId();
  if (!uid) return { userId: null, ids: new Set<string>() };

  // SINGLE-FLIGHT: Reuse in-flight promise for the same user.
  const existing = inflightFetch.get(uid);
  if (existing) return existing;

  const promise = (async (): Promise<{ userId: string | null; ids: Set<string> }> => {
    const started = performance.now();
    recordTrace("sync-forensics", "CAMPAIGN_CLOUD_FETCH_START");
    try {
      const { data, error } = await supabase
        .from("user_campaign_progress")
        .select("campaign_id")
        .eq("user_id", uid);
      
      // STALE CHECK: If identity switched during the request, discard result.
      if (getActiveUserId() !== uid) {
        recordTrace("sync-forensics", "CAMPAIGN_CLOUD_FETCH_STALE_DISCARDED");
        return { userId: uid, ids: new Set<string>() };
      }

      if (error || !Array.isArray(data)) return { userId: uid, ids: new Set<string>() };
      const ids = new Set<string>();
      for (const row of data as Array<{ campaign_id?: string | null }>) {
        if (row?.campaign_id) {
          normalizeIdentifier(row.campaign_id).forEach(v => ids.add(v));
        }
      }
      const duration = Math.round(performance.now() - started);
      recordTrace("sync-forensics", "CAMPAIGN_CLOUD_FETCH_DONE", `${duration}ms (count: ${ids.size})`);
      return { userId: uid, ids };
    } catch {
      const duration = Math.round(performance.now() - started);
      recordTrace("sync-forensics", "CAMPAIGN_CLOUD_FETCH_DONE", `${duration}ms (failed)`);
      return { userId: uid, ids: new Set<string>() };
    } finally {
      inflightFetch.delete(uid);
    }
  })();

  inflightFetch.set(uid, promise);
  return promise;
}

/**
 * Normalizes an identifier (ID or Slug) to a set of potential matches.
 * Internal only; helps bridge legacy data to canonical state.
 */
function normalizeIdentifier(id: string | null | undefined): string[] {
  if (!id) return [];
  const clean = String(id).trim().toLowerCase();
  if (!clean) return [];
  // Return both the exact match and the potential normalized slug match
  return [clean, clean.replace(/\s+/g, "-")];
}

/**
 * Canonical union. Anything the profile blob claims plus anything the
 * server ledger records plus anything queued locally. This is what
 * achievement engine + world progress should consume.
 * 
 * HARDENING: Every input is normalized to ensure IDs and Slugs are 
 * treated as equivalent for completion checks.
 */
export async function unionCompletedIds(
  profileCompleted: readonly string[] | undefined,
): Promise<Set<string>> {
  const started = performance.now();
  recordTrace("sync-forensics", "CAMPAIGN_RECONCILE_START");
  const out = new Set<string>();
  
  // 1) Immediate Local Evidence (Local Sticky + Legacy Mirror)
  const localStarted = performance.now();
  recordTrace("sync-forensics", "CAMPAIGN_LOCAL_READ_START");
  for (const id of localCompletedIds()) {
    normalizeIdentifier(id).forEach(v => out.add(v));
  }
  recordTrace("sync-forensics", "CAMPAIGN_LOCAL_READ_DONE", `${Math.round(performance.now() - localStarted)}ms`);
  
  // 2) Profile Projection (Union with Local)
  for (const id of profileCompleted ?? []) {
    if (id) normalizeIdentifier(id).forEach(v => out.add(v));
  }
  
  // 3) Server Ledger (Stable Source of Truth)
  const server = await fetchServerCompletedIds();
  
  // STALE CHECK: Response is for a different user than who we're reconciling for.
  if (server.userId && server.userId !== getActiveUserId()) {
    recordTrace("sync-forensics", "CAMPAIGN_RECONCILE_STALE_BLOCKED");
  } else {
    for (const id of server.ids) {
      normalizeIdentifier(id).forEach(v => out.add(v));
    }
  }
  
  const totalDuration = Math.round(performance.now() - started);
  recordTrace("sync-forensics", "CAMPAIGN_RECONCILE_DONE", `${totalDuration}ms (total: ${out.size})`);
  return out;
}

/**
 * Sanitizes Guest campaign completions if they look polluted.
 * Should be called during identity reset to Guest.
 */
export function sanitizeGuestCampaignCompletions(): void {
  if (!isBrowser()) return;
  
  const sticky = readLocalSticky();
  const count = Object.keys(sticky).length;
  
  // V13: We clear Guest progress on logout/reset to ensure no leaks,
  // but we keep legitimate Guest data if we can distinguish it.
  // For now, the safest reset is a clean wipe of the Guest partition.
  import("@/lib/diag-trace").then(m => {
    m.recordTrace("logout-audit", "CAMPAIGN_GUEST_SANITIZED", JSON.stringify({
      key: LOCAL_STICKY_KEY,
      count
    }));
  }).catch(() => {});
  
  window.localStorage.removeItem(LOCAL_STICKY_KEY);
  window.localStorage.removeItem("irth_campaign_progress");
  
  try {
    window.dispatchEvent(new CustomEvent("irth:campaign-completions:changed"));
  } catch {}
}
