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

import { supabase } from "@/integrations/supabase/client";
import { enqueueWithId } from "@/lib/offline/outbox";
import { flushOutbox } from "@/lib/offline/flush";

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

function writeLocalSticky(m: Record<string, LocalStickyRecord>): void {
  if (!isBrowser()) return;
  try { window.localStorage.setItem(LOCAL_STICKY_KEY, JSON.stringify(m)); } catch { /* quota */ }
}

/**
 * Local mirror of the sticky facts. Written BEFORE the outbox is drained
 * so a crash between "record" and "flush" cannot lose the completion; the
 * union projection still sees it.
 */
export function localCompletedIds(): Set<string> {
  const ids = new Set<string>();
  const sticky = readLocalSticky();
  for (const cid of Object.keys(sticky)) ids.add(cid);

  // RECOVERY: The canonical projection must recognize old progression data.
  // `irth_campaign_progress` was the legacy store.
  if (isBrowser()) {
    try {
      const legacy = window.localStorage.getItem("irth_campaign_progress");
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) {
          for (const id of parsed) if (id) ids.add(String(id));
        }
      }
    } catch { /* ignore */ }
  }

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
    writeLocalSticky(m);
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("irth:campaign-completions:changed"));
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
 */
export async function fetchServerCompletedIds(): Promise<Set<string>> {
  const uid = await currentUserId();
  if (!uid) return new Set();
  try {
    const { data, error } = await supabase
      .from("user_campaign_completions" as any)
      .select("campaign_id")
      .eq("user_id", uid);
    if (error || !Array.isArray(data)) return new Set();
    const ids = new Set<string>();
    for (const row of data as Array<{ campaign_id?: string | null }>) {
      if (row?.campaign_id) ids.add(row.campaign_id);
    }
    return ids;
  } catch { return new Set(); }
}

/**
 * Canonical union. Anything the profile blob claims plus anything the
 * server ledger records plus anything queued locally. This is what
 * achievement engine + world progress should consume.
 */
export async function unionCompletedIds(
  profileCompleted: readonly string[] | undefined,
): Promise<Set<string>> {
  const out = new Set<string>();
  
  // 1) Immediate Local Evidence (Local Sticky + Legacy Mirror)
  for (const id of localCompletedIds()) out.add(id);
  
  // 2) Profile Projection (Union with Local)
  for (const id of profileCompleted ?? []) if (id) out.add(id);
  
  // 3) Server Ledger (Stable Source of Truth)
  const server = await fetchServerCompletedIds();
  for (const id of server) out.add(id);
  
  return out;
}
