import { recordTrace } from "@/lib/diag-trace";
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
import { getIdentityEpoch } from "../identity/owner";
import { peekAll, remove, bumpAttempt, type OutboxItem } from "./outbox";
import { recordDeadLetter, isPermanentReason } from "./dead-letter";

let lastFlushAt = 0;
let inflight: Promise<{ flushed: number; failed: number }> | null = null;
let activeFlushEpoch = 0;

export function getIdentityEpochSafe(): number {
  try {
    return getIdentityEpoch();
  } catch {
    return 0;
  }
}

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
        if (!p?.campaignId) return { ok: false, error: "invalid_campaign_id" };
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
        if (!payload.ok) return { ok: false, error: payload.reason ?? "rpc-not-ok" };
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:campaign-completions:changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      case "tutorial_completion": {
        const p = item.payload as { tutorialId: string; version: number };
        if (!p?.tutorialId || typeof p.version !== "number") {
          return { ok: false, error: "invalid_tutorial_id" };
        }
        const { data: res, error } = await supabase.rpc(
          "record_tutorial_completion" as any,
          { p_tutorial_id: p.tutorialId, p_version: p.version },
        );
        if (error) return { ok: false, error: error.message };
        const payload = (res ?? {}) as { ok?: boolean; reason?: string };
        if (!payload.ok) return { ok: false, error: payload.reason ?? "rpc-not-ok" };
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:onboarding:changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      case "story_progress": {
        const p = item.payload as { storyId: string; sceneIndex: number };
        if (!p?.storyId) return { ok: false, error: "invalid_story_id" };
        if (typeof p.sceneIndex !== "number" || p.sceneIndex < 0) {
          return { ok: false, error: "invalid_scene_index" };
        }
        const { data: res, error } = await supabase.rpc(
          "record_story_progress_v2" as any,
          { p_story_id: p.storyId, p_scene_index: p.sceneIndex },
        );
        if (error) return { ok: false, error: error.message };
        const payload = (res ?? {}) as { ok?: boolean; reason?: string };
        if (!payload.ok) return { ok: false, error: payload.reason ?? "rpc-not-ok" };
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:story-progress:changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      case "story_completion": {
        const p = item.payload as { storyId: string };
        if (!p?.storyId) return { ok: false, error: "invalid_story_id" };
        const { data: res, error } = await supabase.rpc(
          "complete_story_v2" as any,
          { p_story_id: p.storyId },
        );
        if (error) return { ok: false, error: error.message };
        const payload = (res ?? {}) as { ok?: boolean; reason?: string };
        if (!payload.ok) return { ok: false, error: payload.reason ?? "rpc-not-ok" };
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:story-completions:changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      // Premium Emblem selection. `sync_my_public_stats` is the only granted
      // write path to `profiles.avatar_id` (direct UPDATE on the column is
      // revoked), so we re-derive the full public stats payload from current
      // local state and stamp the queued avatar id onto it. Idempotent.
      case "avatar_select": {
        const payload = item.payload as { avatarId?: string };
        if (!payload?.avatarId) return { ok: false, error: "invalid_avatar_id" };
        const [{ readPersistedProfileState }, { derivePublicStats }, { unionCompletedIds }] = await Promise.all([
          import("@/lib/profile"),
          import("@/lib/social"),
          import("@/lib/campaigns/completions"),
        ]);
        const p = readPersistedProfileState();
        let canonicalCount: number | undefined;
        try {
          const union = await unionCompletedIds(p.campaignsCompleted);
          if (union.size > 0) {
            canonicalCount = union.size;
          }
        } catch (e) {
          console.error("[flush] failed to resolve canonical completions for avatar sync", e);
        }
        // Force the avatar_id from the outbox item payload so we don't accidentally
        // sync a newer/older local state than what was queued.
        const stats = { ...derivePublicStats(p, canonicalCount), avatar_id: payload.avatarId };


        const { error } = await supabase.rpc("sync_my_public_stats" as any, {
          p_stats: stats as any,
        });
        if (error) return { ok: false, error: error.message };
        try {
          const { clearPendingAvatar } = await import("@/lib/emblems/avatar-persistence");
          clearPendingAvatar(item.userId);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:avatar:synced"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      // Reflective Moments — durable mirror of `user_reflections`.
      // Stable outbox id per (campaign, activity) means a burst of edits
      // collapses to the last value; the unique key makes replays safe.
      case "reflection_save": {
        const p = item.payload as {
          campaignId?: string;
          activityId?: string;
          rec?: Record<string, unknown>;
        };
        if (!p?.campaignId || !p?.activityId || !p?.rec) {
          return { ok: false, error: "invalid_reflection_payload" };
        }
        const { reflectionUpsertRow } = await import("@/lib/reflections");
        const { error } = await supabase
          .from("user_reflections")
          .upsert(reflectionUpsertRow(item.userId, p.campaignId, p.activityId, p.rec as any) as any, {
            onConflict: "user_id,campaign_id,activity_id",
          });
        if (error) return { ok: false, error: error.message };
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:reflections-changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      // Reflection delete. Clears the local tombstone on success so a later
      // hydration stops re-issuing the delete.
      case "reflection_delete": {
        const p = item.payload as { campaignId?: string; activityId?: string };
        if (!p?.campaignId || !p?.activityId) {
          return { ok: false, error: "invalid_reflection_payload" };
        }
        const { error } = await supabase
          .from("user_reflections")
          .delete()
          .eq("user_id", item.userId)
          .eq("campaign_id", p.campaignId)
          .eq("activity_id", p.activityId);
        if (error) return { ok: false, error: error.message };
        try {
          const { clearReflectionTombstone } = await import("@/lib/reflections");
          clearReflectionTombstone(p.campaignId, p.activityId);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("irth:reflections-changed"));
          }
        } catch { /* ignore */ }
        return { ok: true };
      }

      // Campaign intro watch mirror. Backup only — the local record is the
      // display authority. The RPC merge is idempotent and monotonic, so a
      // retry after a long offline session can never resurrect an intro.
      case "campaign_intro": {
        const p = item.payload as {
          campaignId?: string; introVersion?: number; storyId?: string | null;
          status?: string; lastSceneIndex?: number;
        };
        if (!p?.campaignId) return { ok: false, error: "invalid_campaign_id" };
        if (!p.status || !["started", "completed", "skipped"].includes(p.status)) {
          return { ok: false, error: "invalid_status" };
        }
        const { data: res, error } = await supabase.rpc(
          "record_campaign_intro_v1" as any,
          {
            p_campaign_id: p.campaignId,
            p_intro_version: Math.max(1, Math.trunc(Number(p.introVersion) || 1)),
            p_story_id: p.storyId ?? null,
            p_status: p.status,
            p_last_scene_index: Math.max(0, Math.trunc(Number(p.lastSceneIndex) || 0)),
          },
        );
        if (error) return { ok: false, error: error.message };
        const payload = (res ?? {}) as { ok?: boolean; reason?: string };
        if (!payload.ok) return { ok: false, error: payload.reason ?? "rpc-not-ok" };
        return { ok: true };
      }


      default:
        return { ok: false, error: "unknown-kind" };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/**
 * Synchronous flush of all pending items for the current user.
 * 
 * IDENTITY GUARD: This function is owner-partitioned. If a logout
 * happens while a flush is in progress, the identity epoch changes,
 * and every await point in the loop checks it to stop immediately.
 */
export async function flushOutbox(userId: string): Promise<{ flushed: number; failed: number }> {
  const started = performance.now();
  if (!userId) return { flushed: 0, failed: 0 };
  
  if (inflight) return inflight;
  recordTrace("sync-forensics", "OUTBOX_FLUSH_START", JSON.stringify({ userId: userId.slice(0, 8) }));
  inflight = (async () => {
    let flushed = 0;
    let failed = 0;
    try {
      const items = await peekAll(userId);
      for (const item of items) {
        // IDENTITY CHECK: Before owner-sensitive mutation / network call.
        if (getIdentityEpochSafe() !== startEpoch) {
          console.warn("[flush] identity changed mid-flush, stopping safely", { userId });
          break;
        }

        const res = await handleItem(item);

        // IDENTITY CHECK: After network call, before updating local queue state.
        if (getIdentityEpochSafe() !== startEpoch) {
          console.warn("[flush] identity changed after handleItem, aborting queue update", { userId });
          break;
        }

        if (res.ok) {
          await remove(item.id);
          flushed++;
        } else if (isPermanentReason(res.error)) {
          // Priority-Zero §3: never retry a permanent rejection forever.
          // Never mark as synced. Move to the dead-letter diagnostics store
          // so admins can see the failure, then drop from the retry queue.
          recordDeadLetter(item, res.error ?? "permanent");
          await remove(item.id);
          failed++;
        } else {
          await bumpAttempt(item.id, res.error ?? null);
          failed++;
        }
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
    const duration = Math.round(performance.now() - started);
    recordTrace("sync-forensics", "OUTBOX_FLUSH_DONE", `${duration}ms (flushed: ${flushed}, failed: ${failed})`);
    return { flushed, failed };
  })();
  return inflight;
}

export function getLastFlushAt(): number { return lastFlushAt; }
