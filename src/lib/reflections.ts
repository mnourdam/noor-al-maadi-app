// ============================================================
// Reflective Moments — local persistence adapter
// ------------------------------------------------------------
// Reflective Moments are educational pauses inside imported
// campaigns. They are NOT scored: every answer is accepted and
// completion is captured by the standard imported-campaign
// progress store (recordActivity + claimActivityReward), which
// already guarantees idempotency across resumes, offline replays
// and duplicate onResolve calls.
//
// This module owns the *auxiliary* per-reflection state — the
// chosen option and the optional free-text — which is *not*
// tracked by the activity progress ledger. It is stored under
// its own localStorage key, keyed by (campaignId, activityId),
// so the player can resume mid-campaign and see their previous
// selection and personal note.
//
// Data model (fully data-driven; no campaign is hardcoded):
//   {
//     "<campaignId>:<activityId>": {
//       mode: "continue" | "choose" | "write",
//       choiceIndex?: number,   // 0-based, "choose" mode only
//       choiceValue?: string,   // canonicalized option text
//       text?: string,          // "write" mode or allowFreeText
//       at: string,             // ISO timestamp of last update
//     },
//     ...
//   }
//
// Written data NEVER leaves the device — the parent chapter route
// still emits its normal `onResolve(true)` and the standard
// server-side progress ledger records completion. This adapter
// only shapes the *view* on resume.
// ============================================================

import type { CampaignActivity } from "@/types/campaign";
import { supabase } from "@/integrations/supabase/client";

export const REFLECTIONS_KEY = "irth_reflections_v1";
export const REFLECTIONS_CHANGE_EVENT = "irth:reflections-changed";

export type ReflectionMode = "continue" | "choose" | "write";

export interface ReflectionRecord {
  mode: ReflectionMode;
  choiceIndex?: number;
  choiceValue?: string;
  /** Free-text note. Optional for `choose` (when allowFreeText), required for `write`. */
  text?: string;
  /** ISO timestamp of last local update. Compared against server `updated_at` on merge. */
  at: string;
  /** P4.1: canonical source scope. `campaign` (default legacy) or `story`. */
  kind?: "campaign" | "story";
  /** For `story` kind, the story id (also mirrored to campaign_id for uniqueness). */
  sourceId?: string;
  /**
   * The player explicitly skipped this reflective moment. Local-only marker:
   * it never syncs to the server and never appears in the reflections journal,
   * it only lets the activity render as "skipped" on revisit.
   */
  skipped?: boolean;

}

export type ReflectionKey = `${string}:${string}`;
export type ReflectionStore = Record<ReflectionKey, ReflectionRecord>;

export interface ReflectionEntry extends ReflectionRecord {
  campaignId: string;
  activityId: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): ReflectionStore {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(REFLECTIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return (parsed && typeof parsed === "object" ? parsed : {}) as ReflectionStore;
  } catch {
    return {};
  }
}

function writeAll(store: ReflectionStore): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(REFLECTIONS_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(REFLECTIONS_CHANGE_EVENT));
  } catch {
    // Storage full / privacy mode — reflections are non-critical, silently drop.
  }
}

function keyOf(campaignId: string, activityId: string): ReflectionKey {
  return `${campaignId}:${activityId}` as ReflectionKey;
}

function parseKey(k: string): { campaignId: string; activityId: string } | null {
  const idx = k.indexOf(":");
  if (idx <= 0 || idx === k.length - 1) return null;
  return { campaignId: k.slice(0, idx), activityId: k.slice(idx + 1) };
}

export function getReflection(campaignId: string, activityId: string): ReflectionRecord | null {
  return readAll()[keyOf(campaignId, activityId)] ?? null;
}

/**
 * Chronological journal feed. Descending by last-edit timestamp so the
 * "My Reflections" view opens on the most recent entry.
 */
export function listAllReflections(): ReflectionEntry[] {
  const store = readAll();
  const out: ReflectionEntry[] = [];
  for (const [k, rec] of Object.entries(store)) {
    const parsed = parseKey(k);
    if (!parsed) continue;
    out.push({ ...rec, campaignId: parsed.campaignId, activityId: parsed.activityId });
  }
  out.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  return out;
}

// ------------------------------------------------------------
// Durability layer (Stabilization P2)
// ------------------------------------------------------------
// Previously every server write here was fire-and-forget with a
// swallowed error, so an offline save only reached the server on the
// NEXT sign-in hydration, and an offline delete was silently resurrected
// by that same hydration (the server row still existed and no local
// entry claimed it). Both writes now go through the durable outbox with
// a stable idempotency key per (campaign, activity), and deletes leave a
// local tombstone until the server confirms.
// ------------------------------------------------------------

const TOMBSTONES_KEY = "irth.reflections.tombstones.v1";

function readTombstones(): Record<string, number> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(TOMBSTONES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeTombstones(map: Record<string, number>): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

function addTombstone(k: string): void {
  const map = readTombstones();
  map[k] = Date.now();
  writeTombstones(map);
}

/** Called by the outbox handler once the server confirmed the delete. */
export function clearReflectionTombstone(campaignId: string, activityId: string): void {
  const map = readTombstones();
  const k = keyOf(campaignId, activityId);
  if (!(k in map)) return;
  delete map[k];
  writeTombstones(map);
}

async function currentUid(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Server upsert payload — shared by the outbox handler and the direct path. */
export function reflectionUpsertRow(
  uid: string,
  campaignId: string,
  activityId: string,
  rec: ReflectionRecord,
) {
  return {
    user_id: uid,
    campaign_id: campaignId,
    activity_id: activityId,
    // New canonical scope (Stories P1 staged migration). Legacy
    // campaign_id/activity_id remain populated for compatibility.
    source_type: rec.kind === "story" ? "story" : "campaign",
    source_id: rec.sourceId ?? campaignId,
    context_id: activityId,
    mode: rec.mode,
    choice_index: rec.choiceIndex ?? null,
    choice_value: rec.choiceValue ?? null,
    note: rec.text ?? null,
  };
}

/**
 * Durable server mirror. Enqueues under a stable id so repeated edits of the
 * same reflection collapse to one pending write (never duplicate rows), then
 * best-effort flushes so the online case lands within one round-trip.
 * Guests are a no-op: the local store is their truth.
 */
async function syncReflectionToServer(
  campaignId: string,
  activityId: string,
  rec: ReflectionRecord,
): Promise<"synced" | "queued" | "local"> {
  const uid = await currentUid();
  if (!uid) return "local";
  let queued = false;
  try {
    const { enqueueWithId } = await import("@/lib/offline/outbox");
    await enqueueWithId(uid, `reflection:${campaignId}:${activityId}`, "reflection_save", {
      campaignId,
      activityId,
      rec,
    });
    queued = true;
  } catch { /* fall through to the direct attempt */ }
  try {
    const { flushOutbox } = await import("@/lib/offline/flush");
    await flushOutbox(uid);
    if (queued) return "synced";
  } catch { /* ignore */ }
  try {
    const { error } = await supabase
      .from("user_reflections")
      .upsert(reflectionUpsertRow(uid, campaignId, activityId, rec), {
        onConflict: "user_id,campaign_id,activity_id",
      });
    if (!error) return "synced";
  } catch { /* offline / transient */ }
  return queued ? "queued" : "local";
}

export function saveReflection(
  campaignId: string,
  activityId: string,
  patch: Omit<ReflectionRecord, "at"> & { at?: string },
): ReflectionRecord {
  const store = readAll();
  const k = keyOf(campaignId, activityId);
  const prev = store[k];
  const next: ReflectionRecord = {
    mode: patch.mode,
    choiceIndex: patch.choiceIndex ?? prev?.choiceIndex,
    choiceValue: patch.choiceValue ?? prev?.choiceValue,
    text: patch.text ?? prev?.text,
    kind: patch.kind ?? prev?.kind,
    sourceId: patch.sourceId ?? prev?.sourceId,
    at: patch.at ?? new Date().toISOString(),
  };
  store[k] = next;
  writeAll(store);
  // A re-save revives a previously deleted reflection.
  clearReflectionTombstone(campaignId, activityId);
  // Durable mirror; stable outbox key + upsert make duplicate rows impossible.
  void syncReflectionToServer(campaignId, activityId, next);
  return next;
}

/**
 * Pull every reflection the signed-in player owns and merge into the
 * local store. Merge rule: whichever side has the newer timestamp wins
 * per activity. Local-only entries (offline saves) are pushed back up.
 */
export async function hydrateReflectionsFromServer(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    const { data, error } = await supabase
      .from("user_reflections")
      .select("campaign_id, activity_id, mode, choice_index, choice_value, note, updated_at, source_type, source_id")
      .eq("user_id", uid);
    if (error || !data) return;
    const local = readAll();
    const tombstones = readTombstones();
    const merged: ReflectionStore = { ...local };
    const stale: Array<{ campaignId: string; activityId: string; rec: ReflectionRecord }> = [];
    const seen = new Set<string>();
    for (const row of data) {
      const cid = String(row.campaign_id ?? "");
      const aid = String(row.activity_id ?? "");
      if (!cid || !aid) continue;
      const k = keyOf(cid, aid);
      seen.add(k);
      // A pending local delete must never be resurrected by hydration.
      if (k in tombstones) {
        delete merged[k];
        void deleteReflection(cid, aid);
        continue;
      }
      const serverAt = String(row.updated_at ?? "") || new Date().toISOString();
      const kind = (row.source_type === "story" ? "story" : "campaign") as "story" | "campaign";
      const rec: ReflectionRecord = {
        mode: (row.mode as ReflectionMode) ?? "continue",
        choiceIndex: typeof row.choice_index === "number" ? row.choice_index : undefined,
        choiceValue: row.choice_value ?? undefined,
        text: row.note ?? undefined,
        at: serverAt,
        kind,
        sourceId: row.source_id ?? undefined,
      };
      const existing = merged[k];
      if (!existing || (existing.at || "").localeCompare(serverAt) < 0) {
        merged[k] = rec;
      } else if ((existing.at || "").localeCompare(serverAt) > 0) {
        stale.push({ campaignId: cid, activityId: aid, rec: existing });
      }
    }
    for (const [k, rec] of Object.entries(local)) {
      if (seen.has(k) || k in tombstones) continue;
      const parsed = parseKey(k);
      if (parsed) stale.push({ campaignId: parsed.campaignId, activityId: parsed.activityId, rec });
    }
    writeAll(merged);
    for (const s of stale) void syncReflectionToServer(s.campaignId, s.activityId, s.rec);
  } catch {
    // Journal continues to render from local mirror.
  }
}

/**
 * Delete a reflection locally and on the server.
 *
 * Durable: a local tombstone plus an outbox entry keep the delete alive
 * through offline, process death and reinstall, so hydration can never
 * resurrect a reflection the player removed.
 */
export async function deleteReflection(campaignId: string, activityId: string): Promise<void> {
  const store = readAll();
  const k = keyOf(campaignId, activityId);
  if (store[k]) {
    delete store[k];
    writeAll(store);
  }
  const uid = await currentUid();
  if (!uid) return;
  addTombstone(k);
  try {
    const { enqueueWithId } = await import("@/lib/offline/outbox");
    await enqueueWithId(uid, `reflection:${campaignId}:${activityId}`, "reflection_delete", {
      campaignId,
      activityId,
    });
  } catch { /* direct attempt below */ }
  try {
    const { flushOutbox } = await import("@/lib/offline/flush");
    await flushOutbox(uid);
  } catch { /* ignore */ }
  if (!(keyOf(campaignId, activityId) in readTombstones())) return;
  try {
    const { error } = await supabase
      .from("user_reflections")
      .delete()
      .eq("user_id", uid)
      .eq("campaign_id", campaignId)
      .eq("activity_id", activityId);
    if (!error) clearReflectionTombstone(campaignId, activityId);
  } catch {
    /* silent */
  }
}

/**
 * Resolves the effective reflective-moment mode from an authored
 * `CampaignActivity`. Pure function — safe to unit-test.
 *
 * Rules:
 *   1. `reflectionMode === "write"` → "write" (author-forced).
 *   2. `reflectionMode === "choose"` AND has ≥2 options → "choose".
 *   3. `reflectionMode === "continue"` → "continue".
 *   4. Author left mode unset:
 *        - has ≥2 non-empty options → "choose"
 *        - otherwise                → "continue"
 */
export function resolveReflectionMode(activity: CampaignActivity): ReflectionMode {
  const opts = (activity.options ?? []).map(o => (o ?? "").trim()).filter(Boolean);
  const authored = activity.reflectionMode;
  if (authored === "write") return "write";
  if (authored === "continue") return "continue";
  if (authored === "choose") return opts.length >= 2 ? "choose" : "continue";
  return opts.length >= 2 ? "choose" : "continue";
}

/** Non-empty, trimmed choice list — safe to render directly. */
export function reflectionChoices(activity: CampaignActivity): string[] {
  return (activity.options ?? []).map(o => (o ?? "").trim()).filter(Boolean);
}
