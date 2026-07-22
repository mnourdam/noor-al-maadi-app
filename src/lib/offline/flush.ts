// ============================================================
// Offline Outbox Flush Driver
// ------------------------------------------------------------
// Drains all queued mutations for the currently authenticated
// user, respecting per-user isolation. Idempotent by design —
// each item carries a stable `id` used as an idempotency key
// server-side (either via unique-constraint upserts or the
// `apply_profile_delta` RPC).
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { peekAll, remove, bumpAttempt, type OutboxItem } from "./outbox";
import { recordDeadLetter, isPermanentReason } from "./dead-letter";

let lastFlushAt = 0;
let inflight: Promise<{ flushed: number; failed: number }> | null = null;

async function handleItem(item: OutboxItem): Promise<{ ok: boolean; error?: string }> {
  // Sanity: never sync one user's item into another user's session.
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid || uid !== item.userId) {
    return { ok: false, error: "session-mismatch" };
  }

  try {
    switch (item.kind) {
      case "collection_add": {
        const p = item.payload as {
          itemId: string; itemType: string;
          sourceCampaignId?: string | null; sourceChapterId?: string | null;
        };
        const { error } = await supabase
          .from("user_collection")
          .upsert(
            {
              user_id: uid,
              item_id: p.itemId,
              item_type: p.itemType,
              source_campaign_id: p.sourceCampaignId ?? null,
              source_chapter_id: p.sourceChapterId ?? null,
            },
            { onConflict: "user_id,item_id", ignoreDuplicates: true },
          );
        if (error) return { ok: false, error: error.message };
        return { ok: true };
      }

      case "entity_discovery": {
        const p = item.payload as {
          entityId: string; entitySlug: string; entityType: string;
          source?: string | null; viewedAt?: string | null;
        };
        const viewedAt = p.viewedAt ?? new Date().toISOString();
        // Upsert: first_discovered_at is preserved by the DB (NOT included in
        // the update set on conflict). last_viewed_at moves forward.
        const { error } = await (supabase as any)
          .from("user_entity_discoveries")
          .upsert(
            {
              user_id: uid,
              entity_id: p.entityId,
              entity_slug: p.entitySlug,
              entity_type: p.entityType,
              source: p.source ?? null,
              last_viewed_at: viewedAt,
            },
            { onConflict: "user_id,entity_id", ignoreDuplicates: false },
          );
        if (error) return { ok: false, error: error.message };
        return { ok: true };
      }

      case "game_complete": {
        const p = item.payload as { gameId: string; stageIndex: number; score: number };
        const { error } = await supabase.from("game_progress").upsert(
          {
            user_id: uid,
            game_id: p.gameId,
            stage_index: p.stageIndex,
            completed: true,
            best_score: p.score,
            last_played_at: new Date().toISOString(),
          },
          { onConflict: "user_id,game_id" },
        );
        if (error) return { ok: false, error: error.message };
        return { ok: true };
      }

      case "chapter_progress": {
        // Priority-Zero authoritative path — every campaign chapter write
        // funnels through record_campaign_progress_v2 which atomically:
        //   • upserts user_campaign_progress with sticky merge semantics
        //   • stamps user_campaign_completions on the final chapter
        // Legacy raw upsert removed 2026-07.
        const p = item.payload as {
          campaignId: string; chapterId: string;
          score?: number; xpEarned?: number; coinsEarned?: number;
          completed?: boolean;
        };
        if (!p?.campaignId || !p?.chapterId) {
          return { ok: false, error: "invalid_chapter_id" };
        }
        const { data: res, error } = await supabase.rpc(
          "record_campaign_progress_v2" as any,
          {
            p_campaign_id: p.campaignId,
            p_chapter_id: p.chapterId,
            p_completed: !!p.completed,
            p_score: p.score ?? null,
            p_xp_earned: p.xpEarned ?? null,
            p_coins_earned: p.coinsEarned ?? null,
          },
        );
        if (error) return { ok: false, error: error.message };
        const payload = (res ?? {}) as { ok?: boolean; reason?: string };
        if (!payload.ok) return { ok: false, error: payload.reason ?? "rpc-not-ok" };
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:campaign-progress:changed"));
            window.dispatchEvent(new CustomEvent("irth:campaign-completions:changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }


      case "profile_delta": {
        const p = item.payload as { xp?: number; dinars?: number; hearts?: number; source?: string };
        const { data: res, error } = await supabase.rpc("apply_profile_delta", {
          p_delta_id: item.id,
          p_xp: p.xp ?? 0,
          p_dinars: p.dinars ?? 0,
          p_hearts: p.hearts ?? 0,
          p_source: p.source ?? item.kind,
        });
        if (error) return { ok: false, error: error.message };
        const payload = (res ?? {}) as { ok?: boolean };
        if (!payload.ok) return { ok: false, error: "rpc-not-ok" };
        return { ok: true };
      }

      case "investigation_complete": {
        const p = item.payload as {
          investigationId: string; score?: number; correctCount?: number;
        };
        const { data: res, error } = await supabase.rpc("complete_investigation_v2" as any, {
          p_investigation_id: p.investigationId,
          p_delta_id: item.id,
          p_score: Math.max(0, p.score ?? 0),
          p_correct_count: Math.max(0, p.correctCount ?? 0),
        });
        if (error) return { ok: false, error: error.message };
        const payload = (res ?? {}) as { ok?: boolean; reason?: string };
        if (!payload.ok) {
          // Investigation not found on server (disabled / removed). Drop the
          // item so it doesn't jam the queue — nothing to record.
          if (payload.reason === "investigation_not_found") return { ok: true };
          return { ok: false, error: payload.reason ?? "rpc-not-ok" };
        }
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:investigation-progress:changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      case "investigation_backfill": {
        const p = item.payload as { legacyKey: string };
        const { data: res, error } = await supabase.rpc("backfill_investigation_completion" as any, {
          p_legacy_key: p.legacyKey,
        });
        if (error) return { ok: false, error: error.message };
        const payload = (res ?? {}) as { ok?: boolean };
        if (!payload.ok) return { ok: false, error: "rpc-not-ok" };
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:investigation-progress:changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      case "investigation_backfill_batch": {
        const p = item.payload as { legacyKeys: string[] };
        const keys = Array.isArray(p?.legacyKeys)
          ? p.legacyKeys.filter((s): s is string => typeof s === "string" && s.length > 0)
          : [];
        if (keys.length === 0) return { ok: true };
        const { data: res, error } = await supabase.rpc(
          "backfill_investigation_completions" as any,
          { p_legacy_keys: keys },
        );
        if (error) return { ok: false, error: error.message };
        const payload = (res ?? {}) as { ok?: boolean; reason?: string };
        if (!payload.ok) {
          // Unauthenticated flushes are transient — leave the item queued so
          // the next flush after sign-in picks it up.
          if (payload.reason === "unauthenticated") return { ok: false, error: "unauthenticated" };
          return { ok: false, error: payload.reason ?? "rpc-not-ok" };
        }
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:investigation-progress:changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      case "campaign_completion": {
        // Sticky, versioned campaign completion. Server dedupes on
        // (user_id, campaign_id); replays are idempotent. If the campaign
        // is no longer reachable on the server (deleted content), drop
        // the item silently so it can't jam the queue.
        const p = item.payload as {
          campaignId: string;
          campaignVersion?: number | null;
          source?: string | null;
        };
        if (!p?.campaignId) return { ok: true };
        const { data: res, error } = await supabase.rpc(
          "record_campaign_completion" as any,
          {
            p_campaign_id: p.campaignId,
            p_campaign_version: p.campaignVersion ?? null,
            p_source: p.source ?? "gameplay",
          },
        );
        if (error) return { ok: false, error: error.message };
        const payload = (res ?? {}) as { ok?: boolean; reason?: string };
        if (!payload.ok) {
          if (payload.reason === "invalid_campaign_id") return { ok: true };
          return { ok: false, error: payload.reason ?? "rpc-not-ok" };
        }
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:campaign-completions:changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      default:
        return { ok: false, error: "unknown-kind" };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function flushOutbox(userId: string): Promise<{ flushed: number; failed: number }> {
  if (inflight) return inflight;
  if (typeof navigator !== "undefined" && !navigator.onLine) return { flushed: 0, failed: 0 };
  inflight = (async () => {
    let flushed = 0;
    let failed = 0;
    try {
      const items = await peekAll(userId);
      for (const item of items) {
        const res = await handleItem(item);
        if (res.ok) { await remove(item.id); flushed++; }
        else { await bumpAttempt(item.id, res.error ?? null); failed++; }
      }
      lastFlushAt = Date.now();
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("irth:outbox:flushed", { detail: { flushed, failed } }));
        }
      } catch { /* ignore */ }
    } finally {
      inflight = null;
    }
    return { flushed, failed };
  })();
  return inflight;
}

export function getLastFlushAt(): number { return lastFlushAt; }
