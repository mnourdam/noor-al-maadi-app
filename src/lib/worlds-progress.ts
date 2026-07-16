// ============================================================
// Worlds Progress — derived-only progression + "Continue Journey"
// recommender + dynamic section ranking.
//
// PURE DERIVATION. No new tables, no new columns, no writes.
// Reads exclusively from:
//   • localEncyclopediaAll() / localPublishedCampaigns() /
//     localInvestigations()      (offline snapshot)
//   • user_collection             (existing Supabase table)
//   • user_campaign_progress      (existing Supabase table)
//   • profile.investigationsCompleted / storiesRead / ...
//     (existing local profile)
//
// All hooks are safe on any client. Server-side callers get empty
// results, never crashes.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureLocalSnapshotLoaded,
  localEncyclopediaAll,
  localPublishedCampaigns,
  localInvestigations,
} from "@/lib/local-first-store";
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";
import { entitySortKey } from "@/lib/entityChronology";
import { WORLD_ERA, WORLD_HUBS, WORLD_SLUGS } from "@/lib/worlds";
import { useProfile } from "@/lib/profile";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type EntityBucket =
  | "figure" | "city" | "event" | "battle" | "landmark" | "artifact" | "state";

export type WorldEntityIndex = {
  slug: string;                    // world slug
  entities: SupabaseEncyclopediaEntity[];
  bySlug: Map<string, SupabaseEncyclopediaEntity>;
  byBucket: Record<EntityBucket, SupabaseEncyclopediaEntity[]>;
  campaignIds: string[];           // published campaigns in this world
  investigationSlugs: string[];    // investigations mapped to this world
};

export type WorldProgress = {
  slug: string;
  entities:       { discovered: number; total: number; pct: number };
  campaigns:      { started: number; completed: number; total: number; pct: number };
  investigations: { completed: number; total: number; pct: number };
  museum:         { discovered: number; total: number; pct: number };
  overallPct: number;
  /** Milestone signature — stable string that only changes on meaningful events. */
  signature: string;
};

export type SectionKey = "campaigns" | "encyclopedia" | "investigations" | "museum";

export type Recommendation =
  | { kind: "campaign_resume"; campaignId: string; campaignSlug: string; chapterId: string; title: string; to: { path: "/campaigns/imported/$id/chapter/$chapter"; params: { id: string; chapter: string } } }
  | { kind: "campaign_start";  campaignId: string; campaignSlug: string; title: string; to: { path: "/campaigns/imported/$id"; params: { id: string } } }
  | { kind: "investigation";   slug: string; title: string; to: { path: "/investigation/$id"; params: { id: string } } }
  | { kind: "entity";          bucket: EntityBucket; slug: string; title: string; to: { path: "/encyclopedia/entity/$id"; params: { id: string } } }
  | { kind: "artifact";        slug: string; title: string; to: { path: "/encyclopedia/entity/$id"; params: { id: string } } }
  | { kind: "world_complete" };

// ------------------------------------------------------------
// Era → world resolution (mirrors worlds.ts::WORLD_ERA, expanded
// to include the same conflated tags handled there).
// ------------------------------------------------------------

const ERA_TO_WORLD: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [world, era] of Object.entries(WORLD_ERA)) out[era] = world;
  // Historical era aliases that the encyclopedia uses interchangeably.
  out["seerah"] = "prophetic";
  out["mongol"] = "mongols";
  return out;
})();

function eraOf(e: SupabaseEncyclopediaEntity): string | null {
  const m = e.metadata as Record<string, unknown> | null | undefined;
  if (!m || typeof m !== "object") return null;
  const v = m.era;
  return typeof v === "string" ? v.toLowerCase() : null;
}

function worldOf(e: SupabaseEncyclopediaEntity): string | null {
  const era = eraOf(e);
  if (!era) return null;
  return ERA_TO_WORLD[era] ?? null;
}

// ------------------------------------------------------------
// Static world index (built once per snapshot). O(N).
// ------------------------------------------------------------

let _indexCache: {
  version: number;
  byWorld: Map<string, WorldEntityIndex>;
} | null = null;

function snapshotVersion(): number {
  // Snapshot rebuild is opaque; use total row count + first/last updated_at as
  // a cheap version proxy so we rebuild when local-first-store swaps rows.
  const rows = localEncyclopediaAll();
  if (rows.length === 0) return 0;
  const last = rows[rows.length - 1]?.updated_at ?? "";
  const first = rows[0]?.updated_at ?? "";
  return rows.length * 31 + first.length * 7 + last.length;
}

function emptyBuckets(): Record<EntityBucket, SupabaseEncyclopediaEntity[]> {
  return { figure: [], city: [], event: [], battle: [], landmark: [], artifact: [], state: [] };
}

/** Build the static world→entity/campaign/investigation index. Memoised. */
export function buildWorldIndex(): Map<string, WorldEntityIndex> {
  const v = snapshotVersion();
  if (_indexCache && _indexCache.version === v) return _indexCache.byWorld;

  const byWorld = new Map<string, WorldEntityIndex>();
  for (const h of WORLD_HUBS) {
    byWorld.set(h.slug, {
      slug: h.slug,
      entities: [],
      bySlug: new Map(),
      byBucket: emptyBuckets(),
      campaignIds: [],
      investigationSlugs: [],
    });
  }

  // 1. Encyclopedia entities → world via era.
  for (const e of localEncyclopediaAll() as SupabaseEncyclopediaEntity[]) {
    if (!e || e.enabled === false) continue;
    const ws = worldOf(e);
    if (!ws) continue;
    const bucket = (e.entity_type ?? "").toLowerCase() as EntityBucket;
    const idx = byWorld.get(ws);
    if (!idx) continue;
    idx.entities.push(e);
    idx.bySlug.set(e.slug.toLowerCase(), e);
    if (bucket in idx.byBucket) idx.byBucket[bucket].push(e);
  }

  // 2. Campaigns → world via canonical worldSlug (fallback: entity refs).
  const camps = localPublishedCampaigns() as Array<{ data: any }>;
  for (const c of camps) {
    const d = (c?.data ?? {}) as Record<string, unknown>;
    const ws = typeof d.worldSlug === "string" && WORLD_SLUGS.has(d.worldSlug as string)
      ? (d.worldSlug as string)
      : null;
    if (ws) {
      const idx = byWorld.get(ws);
      if (idx && typeof d.id === "string") idx.campaignIds.push(d.id);
      continue;
    }
    // Fallback: pick the world matched by the majority of core/supporting refs.
    const meta = (d.metadata && typeof d.metadata === "object" ? d.metadata : {}) as Record<string, unknown>;
    const refs: string[] = [];
    for (const k of ["core_entities", "supporting_entities"]) {
      for (const src of [d[k], meta[k]]) {
        if (Array.isArray(src)) for (const s of src) if (typeof s === "string") refs.push(normalizeEntitySlug(s.split(":").pop() ?? ""));
      }
    }
    const tally = new Map<string, number>();
    for (const [ws2, idx] of byWorld) {
      let hits = 0;
      for (const r of refs) if (idx.bySlug.has(r)) hits++;
      if (hits > 0) tally.set(ws2, hits);
    }
    let best: string | null = null; let bestN = 0;
    for (const [ws2, n] of tally) if (n > bestN) { best = ws2; bestN = n; }
    if (best && typeof d.id === "string") byWorld.get(best)!.campaignIds.push(d.id);
  }

  // 3. Investigations → world via majority era of related_entities.
  const invs = localInvestigations() as Array<{ slug: string; related_entities?: unknown; enabled?: boolean }>;
  for (const inv of invs) {
    if (!inv || inv.enabled === false || !inv.slug) continue;
    const refs = Array.isArray(inv.related_entities) ? inv.related_entities as unknown[] : [];
    const tally = new Map<string, number>();
    for (const r of refs) {
      if (typeof r !== "string") continue;
      const s = normalizeEntitySlug(r.split(":").pop() ?? "").toLowerCase();
      for (const [ws2, idx] of byWorld) {
        const e = idx.bySlug.get(s);
        if (e) tally.set(ws2, (tally.get(ws2) ?? 0) + 1);
      }
    }
    let best: string | null = null; let bestN = 0;
    for (const [ws2, n] of tally) if (n > bestN) { best = ws2; bestN = n; }
    if (best) byWorld.get(best)!.investigationSlugs.push(inv.slug);
  }

  _indexCache = { version: v, byWorld };
  return byWorld;
}

/** Force-invalidate the index cache. Called by admin flows on imports. */
export function invalidateWorldIndex(): void { _indexCache = null; }

// ------------------------------------------------------------
// Discovered slugs — now sourced from `user_entity_discoveries`
// (encyclopedia reads), NOT from `user_collection` (ownership).
// The old museum set moved to `useMuseumSlugs` below.
// ------------------------------------------------------------

export { useDiscoveredSlugs } from "@/lib/entityDiscoveries";

/**
 * Museum ownership set — rows in `user_collection` for the current user.
 * Kept intentionally independent from encyclopedia discovery: reading an
 * artifact page must never mark it as collected.
 */
export function useMuseumSlugs(): Set<string> {
  const [uid, setUid] = useState<string | null>(null);
  const [slugs, setSlugs] = useState<Set<string>>(() => new Set());
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUid(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user?.id ?? null;
      setUid(next);
      if (event === "SIGNED_OUT") setSlugs(new Set());
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setReloadTick((n) => n + 1);
    window.addEventListener("irth:outbox:flushed", bump);
    window.addEventListener("irth:collection:changed", bump);
    return () => {
      window.removeEventListener("irth:outbox:flushed", bump);
      window.removeEventListener("irth:collection:changed", bump);
    };
  }, []);

  useEffect(() => {
    if (!uid) { setSlugs(new Set()); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_collection")
          .select("item_id,item_type")
          .eq("user_id", uid);
        if (cancelled) return;
        const out = new Set<string>();
        for (const r of (data ?? []) as Array<{ item_id: string }>) {
          if (typeof r.item_id === "string" && r.item_id) {
            out.add(r.item_id.toLowerCase());
          }
        }
        setSlugs(out);
      } catch { /* offline — keep last known */ }
    })();
    return () => { cancelled = true; };
  }, [uid, reloadTick]);

  return slugs;
}

// ------------------------------------------------------------
// Per-user investigation-completed mirror.
// ------------------------------------------------------------
// `profile.investigationsCompleted` lives in a single device-global
// localStorage key. During SIGN_IN/SIGN_OUT transitions the array
// briefly carries the previous account's data before cloud_saves
// finish hydrating — that leak would flash into Worlds progress.
//
// Strategy: partition by uid (or "guest") in a separate mirror. For
// ~1.2s after every auth change Worlds reads from the mirror only,
// then trusts `profile.investigationsCompleted` again and writes it
// back to the current uid's mirror. This prevents any cross-account
// flash without touching the profile store or its conflict flow.
// ------------------------------------------------------------

function investigationsMirrorKey(uid: string | null): string {
  return `irth.investigations.${uid ?? "guest"}.v1`;
}

function readInvestigationsMirror(uid: string | null): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(investigationsMirrorKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch { return []; }
}

function writeInvestigationsMirror(uid: string | null, arr: string[]): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(investigationsMirrorKey(uid), JSON.stringify(arr)); } catch { /* quota */ }
}

function usePerUserInvestigationsCompleted(profileArr: string[]): string[] {
  const [uid, setUid] = useState<string | null>(null);
  const [stable, setStable] = useState(false);
  const [mirror, setMirror] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUid(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUid(session?.user?.id ?? null);
      setStable(false);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { setMirror(readInvestigationsMirror(uid)); }, [uid]);

  useEffect(() => {
    const t = window.setTimeout(() => setStable(true), 1200);
    return () => window.clearTimeout(t);
  }, [uid]);

  useEffect(() => {
    if (!stable) return;
    writeInvestigationsMirror(uid, profileArr ?? []);
  }, [stable, uid, profileArr]);

  return stable ? (profileArr ?? []) : mirror;
}

// ------------------------------------------------------------
// Campaign progress (cloud + local merge, minimal for per-world stats)
// ------------------------------------------------------------

type CampaignChapterCloud = { campaign_id: string; chapter_id: string; completed_at: string | null };

export function useCloudCampaignProgress(): Map<string, Set<string>> {
  // campaign_id -> Set<chapter_id> completed
  const [uid, setUid] = useState<string | null>(null);
  const [map, setMap] = useState<Map<string, Set<string>>>(() => new Map());
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUid(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUid(session?.user?.id ?? null);
      if (!session) setMap(new Map());
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setReloadTick((n) => n + 1);
    window.addEventListener("irth:outbox:flushed", bump);
    window.addEventListener("irth:campaign-progress:changed", bump);
    return () => {
      window.removeEventListener("irth:outbox:flushed", bump);
      window.removeEventListener("irth:campaign-progress:changed", bump);
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_campaign_progress")
          .select("campaign_id,chapter_id,completed_at")
          .eq("user_id", uid);
        if (cancelled) return;
        const next = new Map<string, Set<string>>();
        for (const r of (data ?? []) as CampaignChapterCloud[]) {
          if (!r.campaign_id || !r.chapter_id || !r.completed_at) continue;
          let s = next.get(r.campaign_id);
          if (!s) { s = new Set(); next.set(r.campaign_id, s); }
          s.add(r.chapter_id);
        }
        setMap(next);
      } catch { /* offline */ }
    })();
    return () => { cancelled = true; };
  }, [uid, reloadTick]);

  return map;
}

// ------------------------------------------------------------
// Progress computation
// ------------------------------------------------------------

function pctSafe(a: number, b: number): number {
  if (b <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((a / b) * 100)));
}

/** Extract chapters from a raw campaign row's `data` blob. */
function campaignChapters(c: { data: any } | undefined | null): Array<{ id: string }> {
  const chs = c?.data?.chapters;
  return Array.isArray(chs) ? chs.filter((x): x is { id: string } => !!x && typeof x?.id === "string") : [];
}

function findCampaignRow(id: string): { data: any } | null {
  const rows = localPublishedCampaigns() as Array<{ data: any }>;
  return rows.find((r) => r?.data?.id === id) ?? null;
}

export function computeWorldProgress(
  worldSlug: string,
  inputs: {
    index: Map<string, WorldEntityIndex>;
    discovered: Set<string>;
    cloudCampaign: Map<string, Set<string>>;
    investigationsCompleted: string[];
  },
): WorldProgress {
  const idx = inputs.index.get(worldSlug);
  const empty: WorldProgress = {
    slug: worldSlug,
    entities: { discovered: 0, total: 0, pct: 0 },
    campaigns: { started: 0, completed: 0, total: 0, pct: 0 },
    investigations: { completed: 0, total: 0, pct: 0 },
    museum: { discovered: 0, total: 0, pct: 0 },
    overallPct: 0,
    signature: `${worldSlug}::0::0::0::0::0`,
  };
  if (!idx) return empty;

  // Entities
  const total = idx.entities.length;
  let discovered = 0;
  for (const e of idx.entities) if (inputs.discovered.has(e.slug.toLowerCase())) discovered++;

  // Museum (artifact subset)
  const artifacts = idx.byBucket.artifact;
  const artifactTotal = artifacts.length;
  let artifactDiscovered = 0;
  for (const e of artifacts) if (inputs.discovered.has(e.slug.toLowerCase())) artifactDiscovered++;

  // Campaigns
  const campTotal = idx.campaignIds.length;
  let campStarted = 0; let campDone = 0;
  let totalChapters = 0; let completedChapters = 0;
  for (const cid of idx.campaignIds) {
    const row = findCampaignRow(cid);
    const chapters = campaignChapters(row);
    if (chapters.length === 0) continue;
    totalChapters += chapters.length;

    const cloudDone = inputs.cloudCampaign.get(cid) ?? new Set<string>();
    // Merge local + cloud for the "started/completed" boolean.
    const local = getCampaignProgress(cid);
    let doneN = 0;
    for (const ch of chapters) {
      const isDone = cloudDone.has(ch.id) || !!local.chapters[ch.id]?.completed;
      if (isDone) doneN++;
    }
    completedChapters += doneN;
    if (doneN > 0) campStarted++;
    if (doneN === chapters.length) campDone++;
  }

  // Investigations
  const invTotal = idx.investigationSlugs.length;
  const invDoneSet = new Set(inputs.investigationsCompleted);
  let invDone = 0;
  for (const s of idx.investigationSlugs) if (invDoneSet.has(s)) invDone++;

  const entitiesPct    = pctSafe(discovered, total);
  const campaignsPct   = totalChapters > 0 ? pctSafe(completedChapters, totalChapters) : 0;
  const investPct      = pctSafe(invDone, invTotal);
  const museumPct      = pctSafe(artifactDiscovered, artifactTotal);

  // Weighted overall — see plan §Progression.
  const parts: Array<{ w: number; v: number; has: boolean }> = [
    { w: 0.40, v: entitiesPct,  has: total > 0 },
    { w: 0.30, v: campaignsPct, has: campTotal > 0 },
    { w: 0.20, v: investPct,    has: invTotal > 0 },
    { w: 0.10, v: museumPct,    has: artifactTotal > 0 },
  ];
  const wSum = parts.filter((p) => p.has).reduce((a, p) => a + p.w, 0);
  const overallPct = wSum > 0
    ? Math.round(parts.filter((p) => p.has).reduce((a, p) => a + (p.v * p.w), 0) / wSum)
    : 0;

  // Milestone signature — only changes when a bucket count crosses a boundary.
  const signature = [
    worldSlug,
    discovered,
    campStarted,
    campDone,
    invDone,
    artifactDiscovered,
  ].join("::");

  return {
    slug: worldSlug,
    entities:       { discovered, total, pct: entitiesPct },
    campaigns:      { started: campStarted, completed: campDone, total: campTotal, pct: campaignsPct },
    investigations: { completed: invDone, total: invTotal, pct: investPct },
    museum:         { discovered: artifactDiscovered, total: artifactTotal, pct: museumPct },
    overallPct,
    signature,
  };
}

// ------------------------------------------------------------
// Continue Journey — deterministic recommender.
// ------------------------------------------------------------

const BUCKET_PRIORITY: EntityBucket[] = ["state", "figure", "city", "battle", "event", "landmark", "artifact"];

function campaignSortKey(row: { data: any } | null): number {
  const d = row?.data ?? {};
  const co = typeof d.chronological_order === "number" ? d.chronological_order : null;
  if (co != null && Number.isFinite(co)) return co;
  const sy = typeof d.sort_year === "number" ? d.sort_year : null;
  if (sy != null && Number.isFinite(sy)) return 1_000_000 + sy;
  return Number.POSITIVE_INFINITY;
}

export function pickContinueJourney(
  worldSlug: string,
  inputs: {
    index: Map<string, WorldEntityIndex>;
    discovered: Set<string>;
    cloudCampaign: Map<string, Set<string>>;
    investigationsCompleted: string[];
  },
): Recommendation {
  const idx = inputs.index.get(worldSlug);
  if (!idx) return { kind: "world_complete" };

  // Gather campaign rows once, sorted deterministically.
  const campRows = idx.campaignIds
    .map((id) => ({ id, row: findCampaignRow(id) }))
    .filter((x): x is { id: string; row: { data: any } } => !!x.row)
    .sort((a, b) => {
      const ka = campaignSortKey(a.row); const kb = campaignSortKey(b.row);
      if (ka !== kb) return ka - kb;
      return String(a.row.data?.slug ?? a.id).localeCompare(String(b.row.data?.slug ?? b.id));
    });

  // 1. Resume in-flight campaign — has some completed chapters but not all.
  for (const { id, row } of campRows) {
    const chapters = campaignChapters(row).sort(
      (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
    );
    if (chapters.length === 0) continue;
    const cloudDone = inputs.cloudCampaign.get(id) ?? new Set<string>();
    const local = getCampaignProgress(id);
    let doneN = 0; let firstUndone: string | null = null;
    for (const ch of chapters) {
      const done = cloudDone.has(ch.id) || !!local.chapters[ch.id]?.completed;
      if (done) doneN++;
      else if (firstUndone == null) firstUndone = ch.id;
    }
    if (doneN > 0 && doneN < chapters.length && firstUndone) {
      return {
        kind: "campaign_resume",
        campaignId: id,
        campaignSlug: String(row.data?.slug ?? id),
        chapterId: firstUndone,
        title: String(row.data?.title ?? ""),
        to: {
          path: "/campaigns/imported/$id/chapter/$chapter",
          params: { id: String(row.data?.slug ?? id), chapter: firstUndone },
        },
      };
    }
  }

  // 2. Start first uncompleted campaign (fully untouched OR first in order).
  for (const { id, row } of campRows) {
    const chapters = campaignChapters(row);
    if (chapters.length === 0) continue;
    const cloudDone = inputs.cloudCampaign.get(id) ?? new Set<string>();
    const local = getCampaignProgress(id);
    const fullDone = chapters.every((ch) => cloudDone.has(ch.id) || !!local.chapters[ch.id]?.completed);
    if (fullDone) continue;
    return {
      kind: "campaign_start",
      campaignId: id,
      campaignSlug: String(row.data?.slug ?? id),
      title: String(row.data?.title ?? ""),
      to: { path: "/campaigns/imported/$id", params: { id: String(row.data?.slug ?? id) } },
    };
  }

  // 3. Next unfinished investigation.
  const invDoneSet = new Set(inputs.investigationsCompleted);
  const invs = (localInvestigations() as Array<{ slug: string; title: string; difficulty?: string; enabled?: boolean }>)
    .filter((r) => r?.enabled !== false && idx.investigationSlugs.includes(r.slug))
    .sort((a, b) => {
      const rank = (d?: string) => d === "easy" ? 0 : d === "medium" ? 1 : d === "hard" ? 2 : 3;
      const da = rank(a.difficulty); const db = rank(b.difficulty);
      if (da !== db) return da - db;
      return a.slug.localeCompare(b.slug);
    });
  for (const inv of invs) {
    if (!invDoneSet.has(inv.slug)) {
      return {
        kind: "investigation",
        slug: inv.slug,
        title: inv.title,
        to: { path: "/investigation/$id", params: { id: inv.slug } },
      };
    }
  }

  // 4. Highest-priority undiscovered entity (non-artifact).
  for (const bucket of BUCKET_PRIORITY) {
    if (bucket === "artifact") continue;
    const pool = [...idx.byBucket[bucket]]
      .filter((e) => !inputs.discovered.has(e.slug.toLowerCase()))
      .sort((a, b) => {
        const ka = entitySortKey(a); const kb = entitySortKey(b);
        if (ka !== kb) return ka - kb;
        return a.slug.localeCompare(b.slug);
      });
    if (pool.length > 0) {
      const e = pool[0];
      return {
        kind: "entity",
        bucket,
        slug: e.slug,
        title: e.title,
        to: { path: "/encyclopedia/entity/$id", params: { id: e.slug } },
      };
    }
  }

  // 5. Next artifact.
  const artifacts = [...idx.byBucket.artifact]
    .filter((e) => !inputs.discovered.has(e.slug.toLowerCase()))
    .sort((a, b) => {
      const ka = entitySortKey(a); const kb = entitySortKey(b);
      if (ka !== kb) return ka - kb;
      return a.slug.localeCompare(b.slug);
    });
  if (artifacts.length > 0) {
    const e = artifacts[0];
    return {
      kind: "artifact",
      slug: e.slug,
      title: e.title,
      to: { path: "/encyclopedia/entity/$id", params: { id: e.slug } },
    };
  }

  // 6. World complete.
  return { kind: "world_complete" };
}

// ------------------------------------------------------------
// Dynamic section ranking with UX stability.
//
// - Sections ranked by "gap" (1 - completionRatio).
// - Sections with no content (total=0) drop to the end.
// - Tie-break: absolute remaining desc, then a fixed lexicographic
//   fallback so equal-gap sections never oscillate.
// - Consumers call useStableSectionOrder(rank, signature): the
//   returned order is memoised until the milestone signature
//   changes, guaranteeing no re-order during pure re-renders.
// ------------------------------------------------------------

const SECTION_FALLBACK_ORDER: SectionKey[] = ["campaigns", "encyclopedia", "investigations", "museum"];

export function rankWorldSections(p: WorldProgress): SectionKey[] {
  type Row = { key: SectionKey; gap: number; remaining: number; hasContent: boolean };
  const rows: Row[] = [
    { key: "campaigns",      gap: 1 - (p.campaigns.pct / 100),      remaining: Math.max(0, p.campaigns.total - p.campaigns.completed), hasContent: p.campaigns.total > 0 },
    { key: "encyclopedia",   gap: 1 - (p.entities.pct / 100),       remaining: Math.max(0, p.entities.total - p.entities.discovered),  hasContent: p.entities.total > 0 },
    { key: "investigations", gap: 1 - (p.investigations.pct / 100), remaining: Math.max(0, p.investigations.total - p.investigations.completed), hasContent: p.investigations.total > 0 },
    { key: "museum",         gap: 1 - (p.museum.pct / 100),         remaining: Math.max(0, p.museum.total - p.museum.discovered),      hasContent: p.museum.total > 0 },
  ];

  rows.sort((a, b) => {
    // Empty sections always last (stable).
    if (a.hasContent !== b.hasContent) return a.hasContent ? -1 : 1;
    // Completed sections (gap≈0) after unfinished ones.
    const aDone = a.gap <= 0.0001; const bDone = b.gap <= 0.0001;
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (Math.abs(a.gap - b.gap) > 0.02) return b.gap - a.gap;
    if (a.remaining !== b.remaining) return b.remaining - a.remaining;
    return SECTION_FALLBACK_ORDER.indexOf(a.key) - SECTION_FALLBACK_ORDER.indexOf(b.key);
  });

  return rows.map((r) => r.key);
}

/**
 * Milestone-gated section order.
 *
 * Only recomputes when `signature` changes (which only happens on
 * meaningful completions). Pure re-renders return the exact same
 * array reference so no visual jump can occur mid-scroll.
 */
export function useStableSectionOrder(current: SectionKey[], signature: string): SectionKey[] {
  const ref = useRef<{ sig: string; order: SectionKey[] }>({ sig: "", order: SECTION_FALLBACK_ORDER });
  if (ref.current.sig !== signature) {
    ref.current = { sig: signature, order: current };
  }
  return ref.current.order;
}

// ------------------------------------------------------------
// Convenience hook: everything a world page needs, in one call.
// ------------------------------------------------------------

export function useWorldProgress(worldSlug: string) {
  const { profile } = useProfile();
  const discovered = useDiscoveredSlugs();
  const cloudCampaign = useCloudCampaignProgress();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    ensureLocalSnapshotLoaded().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  return useMemo(() => {
    if (!ready) {
      const empty: WorldProgress = {
        slug: worldSlug,
        entities: { discovered: 0, total: 0, pct: 0 },
        campaigns: { started: 0, completed: 0, total: 0, pct: 0 },
        investigations: { completed: 0, total: 0, pct: 0 },
        museum: { discovered: 0, total: 0, pct: 0 },
        overallPct: 0,
        signature: `${worldSlug}::pending`,
      };
      return {
        ready: false,
        index: new Map<string, WorldEntityIndex>(),
        progress: empty,
        recommendation: { kind: "world_complete" } as Recommendation,
        rankedSections: SECTION_FALLBACK_ORDER,
      };
    }
    const index = buildWorldIndex();
    const inputs = {
      index,
      discovered,
      cloudCampaign,
      investigationsCompleted: profile.investigationsCompleted ?? [],
    };
    const progress = computeWorldProgress(worldSlug, inputs);
    const recommendation = pickContinueJourney(worldSlug, inputs);
    const rankedSections = rankWorldSections(progress);
    return { ready: true, index, progress, recommendation, rankedSections };
  }, [ready, worldSlug, discovered, cloudCampaign, profile.investigationsCompleted]);
}

/** Compact per-world progress for the index page. */
export function useAllWorldsProgress() {
  const { profile } = useProfile();
  const discovered = useDiscoveredSlugs();
  const cloudCampaign = useCloudCampaignProgress();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    ensureLocalSnapshotLoaded().then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  return useMemo(() => {
    if (!ready) return { ready: false, byWorld: new Map<string, { progress: WorldProgress; recommendation: Recommendation }>() };
    const index = buildWorldIndex();
    const inputs = {
      index,
      discovered,
      cloudCampaign,
      investigationsCompleted: profile.investigationsCompleted ?? [],
    };
    const byWorld = new Map<string, { progress: WorldProgress; recommendation: Recommendation }>();
    for (const h of WORLD_HUBS) {
      const progress = computeWorldProgress(h.slug, inputs);
      const recommendation = pickContinueJourney(h.slug, inputs);
      byWorld.set(h.slug, { progress, recommendation });
    }
    return { ready: true, byWorld };
  }, [ready, discovered, cloudCampaign, profile.investigationsCompleted]);
}
