// ============================================================
// Admin Encyclopedia Cleanup Tool — post-LC1 content sprint.
// ------------------------------------------------------------
// Single-screen workshop for cleaning, merging, redirecting,
// and enriching encyclopedia entities without manual DB work.
//
// What it does:
//   • Search by title / slug / id / type / era / status / quality
//   • Quality signals per entity (good / weak / empty / dup / orphan)
//   • Inline JSON editor with schema-integrity validation
//   • Duplicate scan via shared Arabic normalizer (entityNameKeys)
//   • Safe soft-merge: canonical wins, metadata preserved,
//     atlas links + campaign slug refs repointed, redirect recorded
//   • Slug redirects via metadata.redirect_from
//   • Archive (enabled=false + metadata.archived) preferred over delete
//   • Bulk: scan duplicates / empty / weak, CSV export, mark reviewed
//   • Every destructive action writes admin_audit_log
//
// Limitations (called out in UI):
//   • Notification deep_links carrying old slugs are NOT rewritten
//     (low volume; admin can re-send). Redirects make them functional.
//   • Museum/artifact linkage lives inside entity metadata, so it
//     moves with the entity automatically; no extra wiring needed.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Archive, ArrowUpRight, BadgeCheck, BookOpen, CheckCircle2, Copy, CornerDownRight,
  Download, Eye, FileText, FileWarning, Filter, Link2, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Save,
  Search, Shield, Sparkles, Trash2, X,
} from "lucide-react";


import { EncyclopediaEntityPreview } from "@/components/admin/EncyclopediaEntityPreview";
import { EncyclopediaEntityImageUploader } from "@/components/admin/EncyclopediaEntityImageUploader";
import { OrphanRelationEditor } from "@/components/admin/OrphanRelationEditor";
import { supabase } from "@/integrations/supabase/client";
import {
  entityNameKeys, normalizeArabicName, normalizeSlugKey,
} from "@/lib/arabic-normalize";
import { scoreEntity, scoreColor } from "@/lib/encyclopedia-quality";
import { findRicherDuplicate, richness } from "@/lib/encyclopedia-canonical";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/encyclopedia-cleanup/")({
  head: () => ({
    meta: [
      { title: "تنظيف الموسوعة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CleanupWorkshop,
});

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------
type EntityRow = {
  id: string;
  entity_type: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  body: any;
  metadata: any;
  enabled: boolean;
  updated_at: string;
  timeline_year: number | null;
  timeline_category: string | null;
  image_url: string | null;
  image_path: string | null;
  image_credit: string | null;
  image_source: string | null;
};

type Quality = "good" | "weak" | "empty" | "duplicate" | "orphaned";
type FilterKey =
  | "all" | "needs-cleanup" | "needs-content" | "complete" | "dedupe-pending"
  | "figure" | "city" | "landmark" | "battle" | "event"
  | "artifact" | "state" | "empty" | "weak" | "duplicate" | "stub" | "archived"
  | "no-image" | "has-image" | "no-sources" | "no-overview" | "no-atlas" | "no-campaign";

// ------------------------------------------------------------
// Cleanup workflow predicates
// ------------------------------------------------------------
// A row is considered "resolved" once it has been touched by the cleanup
// workflow in any way: archived as a duplicate, redirected to a canonical,
// hidden as a duplicate, explicitly marked resolved, or absorbed duplicates
// itself (canonical with a merged_from trail). Resolved rows must never
// appear in the "Needs Cleanup" queue.
function isCleanupResolved(r: { enabled: boolean; metadata: any }): boolean {
  const m: any = r.metadata || {};
  if (r.enabled === false) return true;
  if (m.archived === true) return true;
  if (m.hidden_duplicate === true) return true;
  if (typeof m.canonical_id === "string" && m.canonical_id) return true;
  if (m.cleanup_resolved === true) return true;
  if (Array.isArray(m.merged_from) && m.merged_from.length > 0) return true;
  return false;
}

// A row "needs cleanup" if it is still live AND it either (a) sits in an
// unresolved duplicate group with another live sibling, or (b) is empty /
// weak quality. Plain "good" entries with no duplicates do NOT clutter the
// queue — the goal is a remaining-work view, not a full list.
function rowNeedsCleanup(
  r: EntityRow,
  liveDupIds: Set<string>,
  quality: Quality,
): boolean {
  if (isCleanupResolved(r)) return false;
  if (liveDupIds.has(r.id)) return true;
  if (quality === "empty" || quality === "weak") return true;
  return false;
}

// ------------------------------------------------------------
// Pipeline stage predicates — drive the three first-class chips:
//   needs-cleanup → needs-content → complete.
//
// A row is "final canonical" when it is published and not pointing
// elsewhere: enabled, not archived, not hidden duplicate, no
// metadata.canonical_id redirect. These are the only rows that can
// move through the content pipeline.
//
// "Real content" = the entity has an actual `body` payload beyond the
// basic metadata (title/slug/subtitle/summary). We do NOT measure
// character counts: brief but complete entries (small artifacts,
// landmarks, short events…) must qualify as complete.
//
// A body counts as real when it is:
//   • a non-empty string, OR
//   • an object containing at least one meaningful article field
//     (overview / sections / blocks / timeline / facts / related /
//      sources) that is itself non-empty.
//
// Placeholder/stub markers in metadata still force a "needs content"
// verdict regardless of body shape.
// ------------------------------------------------------------
function isRedirected(r: { metadata: any }): boolean {
  const m: any = r.metadata || {};
  return typeof m.canonical_id === "string" && m.canonical_id.length > 0;
}

function isArchivedOrHidden(r: { enabled: boolean; metadata: any }): boolean {
  const m: any = r.metadata || {};
  if (r.enabled === false) return true;
  if (m.archived === true) return true;
  if (m.hidden_duplicate === true) return true;
  return false;
}

function isFinalCanonical(r: EntityRow): boolean {
  return !isArchivedOrHidden(r) && !isRedirected(r);
}

function hasRealBody(body: any): boolean {
  if (body == null) return false;
  if (typeof body === "string") return body.trim().length > 0;
  if (typeof body !== "object" || Array.isArray(body)) return false;
  const b = body as Record<string, any>;
  if (typeof b.overview === "string" && b.overview.trim().length > 0) return true;
  for (const key of ["sections", "blocks", "timeline", "facts", "sources"]) {
    const v = b[key];
    if (Array.isArray(v) && v.length > 0) return true;
  }
  if (b.related && typeof b.related === "object") {
    for (const v of Object.values(b.related)) {
      if (Array.isArray(v) && v.length > 0) return true;
    }
  }
  return false;
}

// Completeness threshold rule:
//   score > 50  → approved / complete
//   score ≤ 50  → needs content
// This applies uniformly to figures, cities, landmarks, battles, events,
// states AND artifacts. Artifacts have a lighter content model, but they
// naturally hit the same threshold sooner because the scoring rubric is
// generous with what they already provide (image, aliases, atlas link,
// short overview) — no per-type override is required.
const APPROVAL_SCORE_THRESHOLD = 50;
const ARTIFACT_APPROVAL_SCORE_THRESHOLD = 47;

function hasRealContent(r: EntityRow, score: number): boolean {
  // Artifacts: PURE score gate for the cleanup dashboard. No metadata flag
  // (needs_content, placeholder, stub, auto_generated, missing image, missing
  // atlas link, short body, missing sources) may keep an artifact scored > 50
  // out of "مكتمل" or inside "يحتاج محتوى". This only affects the cleanup
  // dashboard filters — the player encyclopedia still shows all published
  // artifacts regardless of score.
  if (r.entity_type === "artifact") return score >= ARTIFACT_APPROVAL_SCORE_THRESHOLD;
  const m: any = r.metadata || {};
  // Explicit moderator overrides always win (non-artifact types only).
  if (m.content_verified === true) return true;
  if (m.needs_content === true) return false;
  if (m.placeholder === true || m.stub === true || m.auto_generated === true) return false;
  return score > APPROVAL_SCORE_THRESHOLD;
}


function needsContent(r: EntityRow, score: number): boolean {
  return isFinalCanonical(r) && !hasRealContent(r, score);
}

function isComplete(r: EntityRow, score: number): boolean {
  return isFinalCanonical(r) && hasRealContent(r, score);
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function bodyText(body: any): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body)
      .replace(/[{}\[\]",]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch { return ""; }
}

function hasSections(body: any): boolean {
  if (!body || typeof body !== "object") return false;
  if (Array.isArray(body.sections) && body.sections.length > 0) return true;
  if (Array.isArray(body.blocks) && body.blocks.length > 0) return true;
  return false;
}

function hasSources(meta: any, body: any): boolean {
  const m = meta || {}; const b = body || {};
  return (Array.isArray(m.sources) && m.sources.length > 0)
      || (Array.isArray(b.sources) && b.sources.length > 0);
}

function hasImage(meta: any, row?: { image_url?: string | null }): boolean {
  const m = meta || {};
  if (row && typeof row.image_url === "string" && row.image_url.trim()) return true;
  return Boolean(m.image || m.image_url || m.hero_image || m.thumbnail);
}

function classifyQuality(r: EntityRow, isDup: boolean, isOrphan: boolean): Quality {
  if (isDup) return "duplicate";
  const len = (r.summary ?? "").length + bodyText(r.body).length;
  if (len < 40) return "empty";
  if (len < 280 || (!hasSections(r.body) && !hasSources(r.metadata, r.body))) return "weak";
  if (isOrphan) return "orphaned";
  return "good";
}

const QUALITY_META: Record<Quality, { label: string; tone: string }> = {
  good:        { label: "جيد",       tone: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  weak:        { label: "ضعيف",      tone: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  empty:       { label: "فارغ",      tone: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
  duplicate:   { label: "مكرر محتمل", tone: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30" },
  orphaned:    { label: "يتيم",      tone: "bg-slate-500/10 text-slate-300 border-slate-500/30" },
};

// Single-badge state, computed per row. Priority: redirect > archive > duplicate > quality > approved.
// "approved" MUST agree with hasRealContent()/needsContent() — otherwise the
// dashboard shows an "approved" badge while the same row is still listed under
// "يحتاج محتوى". We therefore gate the final "approved" verdict on the same
// score threshold (with the same moderator overrides) used by the pipeline.
type PrimaryState = "redirected" | "archived" | "duplicate" | "empty" | "weak" | "approved";

function primaryState(r: EntityRow, isDup: boolean, quality: Quality, score: number): PrimaryState {
  const meta: any = r.metadata || {};
  if (typeof meta.canonical_id === "string" && meta.canonical_id) return "redirected";
  if (meta.archived === true || r.enabled === false) return "archived";
  if (isDup) return "duplicate";
  // Score-based approval gate — must run BEFORE quality-based weak/empty
  // labels, otherwise an artifact with score 60 but a short body still
  // renders as "ضعيف" and contradicts the needs-content filter.
  if (hasRealContent(r, score)) return "approved";
  if (quality === "empty") return "empty";
  return "weak";
}

const STATE_META: Record<PrimaryState, { label: string; tone: string }> = {
  approved:   { label: "معتمد",       tone: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  archived:   { label: "مؤرشف",       tone: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  redirected: { label: "محوّل",        tone: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  duplicate:  { label: "مكرر محتمل",  tone: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30" },
  empty:      { label: "فارغ",        tone: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
  weak:       { label: "ضعيف",        tone: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
};

const TYPE_LABEL: Record<string, string> = {
  figure: "شخصية", city: "مدينة", landmark: "معلم", battle: "معركة",
  event: "حدث", artifact: "أثر", state: "دولة",
};


async function logAudit(action: string, detail: Record<string, unknown>, reason?: string) {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("admin_audit_log" as any).insert({
      actor_id: data.user?.id ?? null,
      actor_email: data.user?.email ?? null,
      action,
      detail,
      reason: reason ?? null,
    });
  } catch { /* audit must never block the actual operation */ }
}

// ------------------------------------------------------------
// Hard DB verification — re-fetch the row by id and confirm
// that the expected fields actually contain the new values.
// Returns { ok, row, diff } where diff lists fields that did
// NOT persist as expected. Used by every admin mutation.
// ------------------------------------------------------------
type VerifyExpect = Partial<{
  enabled: boolean;
  title: string | null;
  slug: string;
  subtitle: string | null;
  summary: string | null;
  body: any;
  // metadata is compared as a deep subset of keys actually provided.
  metadata: Record<string, unknown>;
}>;

// Order-independent deep equality. Postgres JSONB does NOT preserve key
// order on round-trip, so a naive JSON.stringify compare falsely flags
// `body` / `metadata` as unsaved whenever the server reorders keys.
function canonicalize(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    out[k] = canonicalize((v as Record<string, unknown>)[k]);
  }
  return out;
}
function deepEqualJson(a: unknown, b: unknown): boolean {
  try { return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b)); } catch { return false; }
}

async function verifyDbUpdate(id: string, expect: VerifyExpect): Promise<{
  ok: boolean; row: any | null; diff: string[]; error?: string;
}> {
  const { data, error } = await supabase
    .from("encyclopedia_entities" as any)
    .select("id,enabled,title,slug,subtitle,summary,body,metadata,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, row: null, diff: ["<fetch failed>"], error: error.message };
  if (!data) return { ok: false, row: null, diff: ["<row not found>"], error: "row missing" };
  const row: any = data;
  const diff: string[] = [];
  for (const [k, v] of Object.entries(expect)) {
    if (k === "metadata") {
      const md = row.metadata ?? {};
      for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) {
        if (mv === undefined) continue;
        // "null" in expected means "must be absent or null".
        if (mv === null) {
          if (md[mk] != null) diff.push(`metadata.${mk}`);
          continue;
        }
        if (!deepEqualJson(md[mk], mv)) diff.push(`metadata.${mk}`);
      }
    } else if (!deepEqualJson(row[k], v)) {
      diff.push(k);
    }
  }
  return { ok: diff.length === 0, row, diff };
}

function devLog(action: string, payload: Record<string, unknown>) {
  if (typeof import.meta !== "undefined" && (import.meta as any).env?.DEV) {
    // eslint-disable-next-line no-console
    console.log(`[cleanup:${action}]`, payload);
  }
}

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------
function CleanupWorkshop() {
  const [rows, setRows] = useState<EntityRow[]>([]);
  const rowsRef = useRef<EntityRow[]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [pipeline, setPipeline] = useState<"any" | "needs-cleanup" | "needs-content" | "complete">("any");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  const showToast = (text: string, tone: "ok" | "err" = "ok") => setToast({ text, tone });
  const [atlasLinks, setAtlasLinks] = useState<Map<string, number>>(new Map());
  const [campaignSlugs, setCampaignSlugs] = useState<Map<string, number>>(new Map());
  const [mergeFor, setMergeFor] = useState<EntityRow | null>(null);
  // Bulk multi-select — persists across scroll/pagination, cleared when
  // filters/search/pipeline change so selections never carry into a set
  // of cards the user can no longer see.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());

  const refresh = async () => {
    setLoading(true); setErr(null);
    try {
      // PostgREST caps a single response at ~1000 rows regardless of .limit(),
      // so we MUST page through every row. The cleanup workshop is the source
      // of truth for the entire encyclopedia — including archived/disabled.
      const PAGE = 1000;
      const all: EntityRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("encyclopedia_entities" as any)
          .select("id,entity_type,slug,title,subtitle,summary,body,metadata,enabled,updated_at,timeline_year,timeline_category,image_url,image_path,image_credit,image_source")
          .order("updated_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as unknown as EntityRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        if (all.length > 20000) break; // safety guard
      }
      const data = all;
      setRows(all);

      // Linkage maps (best-effort).
      try {
        const { data: a } = await supabase
          .from("atlas_entities" as any)
          .select("encyclopedia_entity_id");
        const am = new Map<string, number>();
        for (const r of (a ?? []) as unknown as { encyclopedia_entity_id: string | null }[]) {
          if (!r.encyclopedia_entity_id) continue;
          am.set(r.encyclopedia_entity_id, (am.get(r.encyclopedia_entity_id) ?? 0) + 1);
        }
        setAtlasLinks(am);
      } catch { /* atlas optional */ }

      try {
        const { data: c } = await supabase.from("admin_campaigns" as any).select("data");
        const cm = new Map<string, number>();
        const blob = JSON.stringify(selectCampaignRows((c ?? []) as any[]));
        // Count slug occurrences cheaply.
        for (const row of (data ?? []) as unknown as EntityRow[]) {
          if (!row.slug) continue;
          const safe = row.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const re = new RegExp(`[:"\\/]${safe}(?=[^a-z0-9-]|$)`, "g");
          const m = blob.match(re);
          if (m && m.length) cm.set(row.id, m.length);
        }
        setCampaignSlugs(cm);
      } catch { /* campaigns optional */ }
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  // ------------------------------------------------------------
  // Duplicate index — group entities by normalized key.
  // ------------------------------------------------------------
  const dupGroups = useMemo(() => {
    const map = new Map<string, EntityRow[]>();
    for (const r of rows) {
      const keys = entityNameKeys({ title: r.title, subtitle: r.subtitle, metadata: r.metadata });
      keys.push(normalizeArabicName(r.title));
      const slugKey = normalizeSlugKey(r.slug);
      const composite = `${r.entity_type}::${keys[0] ?? slugKey}`;
      if (!composite.endsWith("::")) {
        const arr = map.get(composite) ?? [];
        arr.push(r);
        map.set(composite, arr);
      }
    }
    // Only keep groups with >1 entry.
    const groups = new Map<string, string[]>(); // composite → ids
    for (const [k, arr] of map.entries()) {
      if (arr.length > 1) groups.set(k, arr.map((x) => x.id));
    }
    return groups;
  }, [rows]);

  const dupIds = useMemo(() => {
    const s = new Set<string>();
    for (const ids of dupGroups.values()) ids.forEach((i) => s.add(i));
    return s;
  }, [dupGroups]);

  // ------------------------------------------------------------
  // Live duplicate groups — a cleanup group is "open" only while it still
  // has 2+ unresolved members. As soon as a merge marks all but one as
  // hidden/redirected (and stamps the canonical with merged_from), the
  // group falls out of this set and disappears from "Needs Cleanup".
  // ------------------------------------------------------------
  const liveDupIds = useMemo(() => {
    const live = new Set<string>();
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    for (const ids of dupGroups.values()) {
      const liveMembers = ids
        .map((id) => byId.get(id))
        .filter((r): r is EntityRow => !!r && !isCleanupResolved(r));
      if (liveMembers.length >= 2) {
        for (const r of liveMembers) live.add(r.id);
      }
    }
    return live;
  }, [rows, dupGroups]);

  // Completeness score for a row using the same rubric as the cards.
  // Feeds needsContent / isComplete which now gate on score > 50.
  const scoreOf = (r: EntityRow) => scoreEntity({
    summary: r.summary, body: r.body, metadata: r.metadata,
    atlasLinks: atlasLinks.get(r.id) ?? 0,
    campaignRefs: campaignSlugs.get(r.id) ?? 0,
  });

  // Count of items still requiring a human decision — drives the badge
  // next to the "Needs Cleanup" chip and updates live after every merge.
  const needsCleanupCount = useMemo(() => {
    let n = 0;
    for (const r of rows) {
      const isOrphan = !(atlasLinks.get(r.id) || campaignSlugs.get(r.id));
      const quality = classifyQuality(r, dupIds.has(r.id), isOrphan);
      if (rowNeedsCleanup(r, liveDupIds, quality)) n++;
    }
    return n;
  }, [rows, liveDupIds, dupIds, atlasLinks, campaignSlugs]);

  // Pipeline-stage counts — drive the "needs content" and "complete"
  // first-class chips. Both operate only on final canonical entities,
  // so archived / hidden / redirected rows never leak in. Duplicates that
  // still require dedupe are excluded from "needs content" so admins fix
  // duplication first, then enrich the surviving canonical entity.
  // "dedupe-pending" surfaces only entities that are part of an OPEN duplicate
  // group (2+ live siblings). Archived rows, hidden/redirected duplicates, and
  // canonicals whose group has already collapsed to a single survivor are all
  // excluded automatically because they are not in liveDupIds.
  const dedupePendingCount = useMemo(
    () => rows.reduce((n, r) => (liveDupIds.has(r.id) ? n + 1 : n), 0),
    [rows, liveDupIds],
  );

  // "needs-content" targets ONLY active canonical entities that still lack
  // real content. needsContent() already excludes archived / hidden /
  // redirected rows via isFinalCanonical. We additionally exclude any row
  // still sitting in an OPEN duplicate group (liveDupIds) so admins finish
  // dedupe first — but canonical winners of a completed merge remain
  // visible so they can be enriched.
  const needsContentCount = useMemo(
    () => rows.reduce(
      (n, r) => (needsContent(r, scoreOf(r)) && !liveDupIds.has(r.id) ? n + 1 : n),
      0,
    ),
    [rows, liveDupIds, atlasLinks, campaignSlugs],
  );

  const completeCount = useMemo(
    () => rows.reduce((n, r) => (isComplete(r, scoreOf(r)) ? n + 1 : n), 0),
    [rows, atlasLinks, campaignSlugs],
  );

  // ------------------------------------------------------------
  // Filter + search
  // ------------------------------------------------------------
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const nNorm = normalizeArabicName(needle);
    return rows.filter((r) => {
      const isOrphan = !(atlasLinks.get(r.id) || campaignSlugs.get(r.id));
      const quality = classifyQuality(r, dupIds.has(r.id), isOrphan);
      const archived = r.metadata?.archived === true || r.enabled === false;

      const isDup = dupIds.has(r.id);
      const dedupePending = liveDupIds.has(r.id) && !isCleanupResolved(r);

      // Pipeline filter (ANDs with type/quality chips below).
      const rScore = scoreOf(r);
      if (pipeline === "needs-cleanup" && !rowNeedsCleanup(r, liveDupIds, quality)) return false;
      if (pipeline === "needs-content" && (!needsContent(r, rScore) || liveDupIds.has(r.id))) return false;
      if (pipeline === "complete" && !isComplete(r, rScore)) return false;

      // Type / quality / linkage chips
      switch (filter) {
        case "all": break;
        case "needs-cleanup":
          if (!rowNeedsCleanup(r, liveDupIds, quality)) return false;
          break;
        case "needs-content":
          if (!needsContent(r, rScore) || liveDupIds.has(r.id)) return false;

          break;
        case "dedupe-pending":
          if (!dedupePending) return false;
          break;
        case "complete":
          if (!isComplete(r, rScore)) return false;
          break;
        case "empty": if (quality !== "empty") return false; break;
        case "weak":  if (quality !== "weak") return false; break;
        case "stub":  if (quality !== "empty" && quality !== "weak") return false; break;
        case "duplicate": if (!isDup) return false; break;
        case "archived":  if (!archived) return false; break;
        case "no-image":    if (hasImage(r.metadata, r)) return false; break;
        case "has-image":   if (!hasImage(r.metadata, r)) return false; break;
        case "no-sources":  if (hasSources(r.metadata, r.body)) return false; break;
        case "no-overview": if ((r.summary ?? "").trim().length >= 20) return false; break;
        case "no-atlas":    if ((atlasLinks.get(r.id) ?? 0) > 0) return false; break;
        case "no-campaign": if ((campaignSlugs.get(r.id) ?? 0) > 0) return false; break;
        default: if (r.entity_type !== filter) return false;
      }

      if (!needle) return true;
      if (r.id === needle) return true;
      if (r.slug.toLowerCase().includes(needle)) return true;
      if (r.title.toLowerCase().includes(needle)) return true;
      if (normalizeArabicName(r.title).includes(nNorm)) return true;
      const aliases: string[] = Array.isArray(r.metadata?.aliases) ? r.metadata.aliases : [];
      if (aliases.some((a) => normalizeArabicName(a).includes(nNorm))) return true;
      return false;
    }).slice(0, 400);
  }, [rows, filter, pipeline, q, dupIds, liveDupIds, atlasLinks, campaignSlugs]);

  // Changing the active filter or pipeline clears the current selection;
  // search only affects visible cards and does NOT reset selection.
  useEffect(() => { setSelectedIds(new Set()); }, [filter, pipeline]);

  // Derived selection helpers for the sticky bar + "Select All" checkbox.
  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const visibleSelectedCount = useMemo(
    () => filteredIds.reduce((n, id) => (selectedIds.has(id) ? n + 1 : n), 0),
    [filteredIds, selectedIds],
  );
  const allVisibleSelected = filteredIds.length > 0 && visibleSelectedCount === filteredIds.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });
  };

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  // ------------------------------------------------------------
  // CSV export (currently filtered view — quick triage)
  // ------------------------------------------------------------
  const exportCsv = () => {
    const cols = ["id","type","slug","title","quality","atlas_links","campaign_refs","enabled","updated_at"];
    const lines = [cols.join(",")];
    for (const r of filtered) {
      const isOrphan = !(atlasLinks.get(r.id) || campaignSlugs.get(r.id));
      const quality = classifyQuality(r, dupIds.has(r.id), isOrphan);
      const cells = [
        r.id, r.entity_type, r.slug,
        `"${(r.title ?? "").replace(/"/g, '""')}"`,
        quality,
        String(atlasLinks.get(r.id) ?? 0),
        String(campaignSlugs.get(r.id) ?? 0),
        String(r.enabled),
        r.updated_at,
      ];
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `encyclopedia-cleanup-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ------------------------------------------------------------
  // Full cleanup dataset export — JSON + CSV.
  // Operates on the FULL loaded set (rows), not the filtered view.
  // Groups entities by cleanup category. Read-only.
  // ------------------------------------------------------------
  const buildFullExport = () => {
    // Pick canonical per duplicate group (richest wins).
    const groupCanonical = new Map<string, EntityRow>();
    for (const [key, ids] of dupGroups.entries()) {
      const members = ids
        .map((id) => rows.find((r) => r.id === id))
        .filter((x): x is EntityRow => !!x);
      if (members.length === 0) continue;
      let best = members[0];
      let bestScore = richness(best as any);
      for (const m of members.slice(1)) {
        const s = richness(m as any);
        if (s > bestScore) { best = m; bestScore = s; }
      }
      groupCanonical.set(key, best);
    }
    const idToGroupKey = new Map<string, string>();
    for (const [key, ids] of dupGroups.entries()) {
      for (const id of ids) idToGroupKey.set(id, key);
    }

    const enrich = (r: EntityRow) => {
      const atlas = atlasLinks.get(r.id) ?? 0;
      const camps = campaignSlugs.get(r.id) ?? 0;
      const isOrphan = !(atlas || camps);
      const quality = classifyQuality(r, dupIds.has(r.id), isOrphan);
      const score = scoreEntity({
        summary: r.summary, body: r.body, metadata: r.metadata,
        atlasLinks: atlas, campaignRefs: camps,
      });
      const bucket = score >= 80 ? "green" : score >= 50 ? "yellow" : "red";
      const meta: any = r.metadata || {};
      const archived = meta.archived === true || r.enabled === false;
      const bodyLen = bodyText(r.body).length;
      const aliases: string[] = Array.isArray(meta.aliases) ? meta.aliases : [];
      let canonical_id: string | null = typeof meta.canonical_id === "string" ? meta.canonical_id : null;
      let canonical_slug: string | null = null;
      if (canonical_id) {
        canonical_slug = rows.find((x) => x.id === canonical_id)?.slug ?? null;
      } else {
        const key = idToGroupKey.get(r.id);
        if (key) {
          const win = groupCanonical.get(key);
          if (win && win.id !== r.id) { canonical_id = win.id; canonical_slug = win.slug; }
        }
      }
      return {
        id: r.id,
        title: r.title,
        slug: r.slug,
        entity_type: r.entity_type,
        subtitle: r.subtitle,
        summary: r.summary,
        body_length: bodyLen,
        has_body: bodyLen > 0,
        has_sections: hasSections(r.body),
        has_sources: hasSources(r.metadata, r.body),
        has_image: hasImage(r.metadata, r),
        has_atlas_link: atlas > 0,
        has_campaign_reference: camps > 0,
        atlas_links: atlas,
        campaign_references: camps,
        quality_score: score,
        quality_bucket: bucket,
        quality_label: quality,
        duplicate_risk: dupIds.has(r.id),
        canonical_id,
        canonical_slug,
        archived,
        enabled: r.enabled,
        aliases,
        era: meta.era ?? meta.period ?? null,
        world: meta.world ?? meta.world_slug ?? null,
        state: meta.state ?? meta.state_slug ?? null,
        timeline_year: r.timeline_year,
        timeline_category: r.timeline_category,
        created_at: meta.created_at ?? null,
        updated_at: r.updated_at,
      };
    };

    const categorize = (e: ReturnType<typeof enrich>): string[] => {
      const cats: string[] = [];
      if (e.quality_label === "empty") cats.push("empty");
      if (e.quality_label === "weak") cats.push("weak");
      if (!e.has_image) cats.push("missing_image");
      if (!e.has_sources) cats.push("missing_sources");
      if (!e.summary || e.summary.trim().length < 20) cats.push("missing_overview");
      if (!e.has_atlas_link) cats.push("missing_atlas");
      if (!e.has_campaign_reference) cats.push("missing_campaign_reference");
      if (e.duplicate_risk) cats.push("duplicates");
      if (e.archived) cats.push("archived");
      return cats;
    };

    const enriched = rows.map(enrich);
    const tagged = enriched.map((e) => ({ ...e, categories: categorize(e) }));

    const groups: Record<string, typeof enriched> = {
      empty: [], weak: [], missing_image: [], missing_sources: [],
      missing_overview: [], missing_atlas: [], missing_campaign_reference: [],
      duplicates: [], archived: [], all: enriched,
    };
    for (const e of tagged) {
      for (const c of e.categories) {
        if (groups[c]) groups[c].push(e);
      }
    }
    const totals: Record<string, number> = { all: enriched.length };
    for (const k of Object.keys(groups)) if (k !== "all") totals[k] = groups[k].length;

    return { tagged, groups, totals };
  };

  const downloadBlob = (data: BlobPart, mime: string, name: string) => {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const todayStamp = () => new Date().toISOString().slice(0, 10);

  const exportFullJson = () => {
    try {
      const { groups, totals } = buildFullExport();
      const payload = { generated_at: new Date().toISOString(), totals, groups };
      downloadBlob(
        JSON.stringify(payload, null, 2),
        "application/json;charset=utf-8",
        `irth-encyclopedia-cleanup-${todayStamp()}.json`,
      );
      showToast(`تم تصدير ${totals.all} كيان كـ JSON`);
    } catch (e: any) {
      showToast("فشل التصدير: " + (e?.message || e), "err");
    }
  };

  const exportFullCsv = () => {
    try {
      const { tagged } = buildFullExport();
      const cols = [
        "category","id","title","slug","entity_type","subtitle","summary",
        "body_length","has_body","has_sections","has_sources","has_image",
        "has_atlas_link","has_campaign_reference","quality_score","quality_bucket",
        "duplicate_risk","canonical_id","canonical_slug","archived","enabled",
        "aliases","era","world","state","created_at","updated_at",
      ];
      const esc = (v: unknown): string => {
        if (v == null) return "";
        const s = Array.isArray(v) ? v.join(" | ") : String(v);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const lines = [cols.join(",")];
      for (const e of tagged) {
        const cats = e.categories.length ? e.categories : ["uncategorized"];
        for (const cat of cats) {
          lines.push([
            esc(cat), e.id, esc(e.title), esc(e.slug), esc(e.entity_type),
            esc(e.subtitle), esc(e.summary), e.body_length, e.has_body, e.has_sections,
            e.has_sources, e.has_image, e.has_atlas_link, e.has_campaign_reference,
            e.quality_score, esc(e.quality_bucket), e.duplicate_risk,
            esc(e.canonical_id), esc(e.canonical_slug), e.archived, e.enabled,
            esc(e.aliases), esc(e.era), esc(e.world), esc(e.state),
            esc(e.created_at), esc(e.updated_at),
          ].join(","));
        }
      }
      downloadBlob(
        "\uFEFF" + lines.join("\n"),
        "text/csv;charset=utf-8",
        `irth-encyclopedia-cleanup-${todayStamp()}.csv`,
      );
      showToast(`تم تصدير ${tagged.length} كيان كـ CSV`);
    } catch (e: any) {
      showToast("فشل التصدير: " + (e?.message || e), "err");
    }
  };

  // ------------------------------------------------------------
  // Save edits from JSON editor (with hard DB verification)
  // ------------------------------------------------------------
  const saveEntity = async (id: string, patch: Partial<EntityRow>) => {
    setBusy(id);
    devLog("save:start", { id, patch });
    try {
      const upd = await supabase.from("encyclopedia_entities" as any).update(patch).eq("id", id).select("id").maybeSingle();
      devLog("save:response", { id, error: upd.error, returned: upd.data });
      if (upd.error) {
        showToast("فشل الحفظ (قاعدة البيانات): " + upd.error.message, "err");
        return;
      }
      const expected: VerifyExpect = {};
      if (patch.title !== undefined) expected.title = patch.title ?? null;
      if (patch.slug !== undefined) expected.slug = patch.slug as string;
      if (patch.subtitle !== undefined) expected.subtitle = patch.subtitle ?? null;
      if (patch.summary !== undefined) expected.summary = patch.summary ?? null;
      if (patch.body !== undefined) expected.body = patch.body;
      if (patch.metadata !== undefined && patch.metadata && typeof patch.metadata === "object") {
        expected.metadata = patch.metadata as Record<string, unknown>;
      }
      const v = await verifyDbUpdate(id, expected);
      devLog("save:verify", { id, ok: v.ok, diff: v.diff, dbRow: v.row });
      if (!v.ok) {
        // eslint-disable-next-line no-console
        console.warn("[cleanup:save:verify-failed]", {
          id, diff: v.diff,
          expectedBody: expected.body,
          dbBody: v.row?.body,
        });
        showToast(`فشل التحقق من الحفظ — حقول لم تُحفظ: ${v.diff.join(", ") || "?"}${v.error ? " · " + v.error : ""}`, "err");
        return;
      }
      await logAudit("encyclopedia.update", { id, fields: Object.keys(patch), verified: true });
      showToast("تم الحفظ في قاعدة البيانات ✓");
      await refresh();
    } catch (e: any) {
      showToast("فشل الحفظ: " + (e?.message || e), "err");
    } finally { setBusy(null); }
  };

  // ------------------------------------------------------------
  // Archive — hide from players, keep restorable (verified)
  // ------------------------------------------------------------
  const archiveEntity = async (r: EntityRow) => {
    if (!confirm(`أرشفة «${r.title}»؟ لن تظهر للزوّار لكنها قابلة للاستعادة.`)) return;
    setBusy(r.id);
    const archived_at = new Date().toISOString();
    const meta = { ...(r.metadata || {}), archived: true, archived_at };
    devLog("archive:start", { id: r.id, slug: r.slug, expected: { enabled: false, "metadata.archived": true } });
    try {
      const upd = await supabase.from("encyclopedia_entities" as any)
        .update({ metadata: meta, enabled: false }).eq("id", r.id).select("id").maybeSingle();
      devLog("archive:response", { id: r.id, error: upd.error });
      if (upd.error) { showToast("فشل الأرشفة (قاعدة البيانات): " + upd.error.message, "err"); return; }
      const v = await verifyDbUpdate(r.id, { enabled: false, metadata: { archived: true, archived_at } });
      devLog("archive:verify", { id: r.id, ok: v.ok, diff: v.diff, dbRow: v.row });
      if (!v.ok) {
        showToast(`فشل التحقق من الأرشفة — لم تُحفظ: ${v.diff.join(", ")}`, "err");
        return;
      }
      await logAudit("encyclopedia.archive", { id: r.id, slug: r.slug, verified: true });
      showToast("تمت الأرشفة وتأكّد الحفظ ✓");
      await refresh();
    } catch (e: any) { showToast("فشل: " + (e?.message || e), "err"); }
    finally { setBusy(null); }
  };

  // ------------------------------------------------------------
  // Approve — restore an archived/redirected entity to live state
  // ------------------------------------------------------------
  const approveEntity = async (r: EntityRow) => {
    setBusy(r.id);
    const meta: any = { ...(r.metadata || {}) };
    delete meta.archived;
    delete meta.archived_at;
    delete meta.hidden_duplicate;
    delete meta.hidden_at;
    delete meta.canonical_id;
    delete meta.canonical_slug;
    meta.canonical = true;
    devLog("approve:start", { id: r.id, slug: r.slug });
    try {
      const upd = await supabase.from("encyclopedia_entities" as any)
        .update({ metadata: meta, enabled: true }).eq("id", r.id).select("id").maybeSingle();
      devLog("approve:response", { id: r.id, error: upd.error });
      if (upd.error) { showToast("فشل الاعتماد (قاعدة البيانات): " + upd.error.message, "err"); return; }
      const v = await verifyDbUpdate(r.id, {
        enabled: true,
        metadata: { archived: null, canonical_id: null, hidden_duplicate: null, canonical: true },
      });
      devLog("approve:verify", { id: r.id, ok: v.ok, diff: v.diff, dbRow: v.row });
      if (!v.ok) {
        showToast(`فشل التحقق من الاعتماد — لم تُحفظ: ${v.diff.join(", ")}`, "err");
        return;
      }
      await logAudit("encyclopedia.approve", { id: r.id, slug: r.slug, verified: true });
      showToast("تم الاعتماد — ظاهر للاعبين وتأكّد الحفظ ✓");
      await refresh();
    } catch (e: any) { showToast("فشل الاعتماد: " + (e?.message || e), "err"); }
    finally { setBusy(null); }
  };

  // ------------------------------------------------------------
  // Cleanup-stage shortcuts — only resolve the cleanup workflow.
  // They never touch duplicate/redirect metadata; the content stage
  // remains independent.
  //
  // fullyApproveCleanup → entity is already canonical AND its content
  //   is good enough as-is. Marks cleanup_resolved + content_verified
  //   so it lands in "مكتمل" immediately.
  //
  // markNeedsContentOnly → entity is canonical but body is still
  //   missing/weak. Marks cleanup_resolved + needs_content so it leaves
  //   "يحتاج تنظيف" and lands in "يحتاج محتوى".
  // ------------------------------------------------------------
  const computeStage = (r: { enabled: boolean; metadata: any; body: any }):
    "needs-cleanup-candidate" | "needs-content" | "complete" | "resolved-other" => {
    const row = r as EntityRow;
    if (!isFinalCanonical(row)) return "resolved-other";
    return hasRealContent(row, scoreOf(row)) ? "complete" : "needs-content";
  };

  const snapshotCounts = (list: EntityRow[]) => {
    let nc = 0, content = 0, done = 0;
    for (const r of list) {
      const isOrphan = !(atlasLinks.get(r.id) || campaignSlugs.get(r.id));
      const quality = classifyQuality(r, dupIds.has(r.id), isOrphan);
      const s = scoreOf(r);
      if (rowNeedsCleanup(r, liveDupIds, quality)) nc++;
      if (needsContent(r, s)) content++;
      if (isComplete(r, s)) done++;
    }
    return { needsCleanup: nc, needsContent: content, complete: done };
  };

  const fullyApproveCleanup = async (r: EntityRow) => {
    setBusy(r.id);
    const stamp = new Date().toISOString();
    const meta: any = { ...(r.metadata || {}) };
    meta.cleanup_resolved = true;
    meta.cleanup_resolved_at = stamp;
    meta.content_verified = true;
    meta.content_verified_at = stamp;
    delete meta.needs_content;
    delete meta.needs_content_at;
    const oldStage = computeStage(r);
    const countsBefore = snapshotCounts(rows);
    try {
      const upd = await supabase.from("encyclopedia_entities" as any)
        .update({ metadata: meta }).eq("id", r.id).select("id").maybeSingle();
      if (upd.error) { showToast("فشل الاعتماد التام: " + upd.error.message, "err"); return; }
      const v = await verifyDbUpdate(r.id, {
        metadata: { cleanup_resolved: true, content_verified: true, needs_content: null },
      });
      if (!v.ok) { showToast(`فشل التحقق — لم تُحفظ: ${v.diff.join(", ")}`, "err"); return; }
      const newStage = computeStage(v.row);
      const hasBodyResult = hasRealBody(v.row?.body);
      await logAudit("encyclopedia.cleanup.fully_approve", { id: r.id, slug: r.slug, verified: true, newStage });
      await refresh();
      const countsAfter = snapshotCounts(rowsRef.current);
      devLog("fullyApprove", {
        id: r.id, title: r.title, action: "fullyApprove",
        oldStage, hasBodyResult, newStage, countsBefore, countsAfter,
      });
      showToast(
        newStage === "complete"
          ? `اعتمدت «${r.title}» — انتقلت إلى مكتمل ✓`
          : `اعتمدت «${r.title}» — انتقلت إلى «يحتاج محتوى» (لا يوجد محتوى فعلي) ✓`,
      );
    } catch (e: any) { showToast("فشل: " + (e?.message || e), "err"); }
    finally { setBusy(null); }
  };

  const markNeedsContentOnly = async (r: EntityRow) => {
    setBusy(r.id);
    const stamp = new Date().toISOString();
    const meta: any = { ...(r.metadata || {}) };
    meta.cleanup_resolved = true;
    meta.cleanup_resolved_at = stamp;
    meta.needs_content = true;
    meta.needs_content_at = stamp;
    delete meta.content_verified;
    delete meta.content_verified_at;
    const oldStage = computeStage(r);
    const countsBefore = snapshotCounts(rows);
    try {
      const upd = await supabase.from("encyclopedia_entities" as any)
        .update({ metadata: meta }).eq("id", r.id).select("id").maybeSingle();
      if (upd.error) { showToast("فشل النقل: " + upd.error.message, "err"); return; }
      const v = await verifyDbUpdate(r.id, {
        metadata: { cleanup_resolved: true, needs_content: true, content_verified: null },
      });
      if (!v.ok) { showToast(`فشل التحقق — لم تُحفظ: ${v.diff.join(", ")}`, "err"); return; }
      const newStage = computeStage(v.row);
      const hasBodyResult = hasRealBody(v.row?.body);
      await logAudit("encyclopedia.cleanup.mark_needs_content", { id: r.id, slug: r.slug, verified: true, newStage });
      await refresh();
      const countsAfter = snapshotCounts(rowsRef.current);
      devLog("markNeedsContent", {
        id: r.id, title: r.title, action: "markNeedsContent",
        oldStage, hasBodyResult, newStage, countsBefore, countsAfter,
      });
      if (newStage !== "needs-content") {
        showToast(`تحذير: لم تنتقل إلى «يحتاج محتوى» — الحالة الفعلية: ${newStage}`, "err");
      } else {
        showToast(`نُقل «${r.title}» إلى «يحتاج محتوى» ✓`);
      }
    } catch (e: any) { showToast("فشل: " + (e?.message || e), "err"); }
    finally { setBusy(null); }
  };

  // ------------------------------------------------------------
  // Bulk actions — apply "Mark as Needs Content" or "Fully Approve"
  // to every currently-selected row. Each row's own metadata is
  // preserved (merged, not replaced) so we don't clobber unrelated
  // flags. Runs updates in small parallel batches for responsiveness,
  // then a single refresh() re-pulls the truth.
  // ------------------------------------------------------------
  type BulkKind = "fully-approve" | "needs-content";
  const applyBulkStamp = (meta: any, kind: BulkKind, stamp: string) => {
    const m: any = { ...(meta || {}) };
    m.cleanup_resolved = true;
    m.cleanup_resolved_at = stamp;
    if (kind === "fully-approve") {
      m.content_verified = true;
      m.content_verified_at = stamp;
      delete m.needs_content;
      delete m.needs_content_at;
    } else {
      m.needs_content = true;
      m.needs_content_at = stamp;
      delete m.content_verified;
      delete m.content_verified_at;
    }
    return m;
  };

  const runBulk = async (kind: BulkKind) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (ids.length > 20) {
      const label = kind === "fully-approve" ? "الاعتماد التام" : "النقل إلى «يحتاج محتوى»";
      if (!confirm(`تأكيد ${label} لعدد ${ids.length} كياناً؟`)) return;
    }
    setBulkBusy(true);
    const stamp = new Date().toISOString();
    const byId = new Map(rowsRef.current.map((r) => [r.id, r] as const));
    let ok = 0;
    let fail = 0;
    const CHUNK = 8;
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const results = await Promise.all(slice.map(async (id) => {
          const row = byId.get(id);
          if (!row) return false;
          const meta = applyBulkStamp(row.metadata, kind, stamp);
          const { error } = await supabase
            .from("encyclopedia_entities" as any)
            .update({ metadata: meta })
            .eq("id", id);
          return !error;
        }));
        for (const r of results) { if (r) ok++; else fail++; }
      }
      await logAudit(
        kind === "fully-approve"
          ? "encyclopedia.cleanup.bulk_fully_approve"
          : "encyclopedia.cleanup.bulk_mark_needs_content",
        { count: ids.length, ok, fail },
      );
      clearSelection();
      await refresh();
      const verb = kind === "fully-approve" ? "اعتماد" : "نقل إلى «يحتاج محتوى»";
      if (fail === 0) showToast(`تم ${verb} ${ok} كياناً ✓`);
      else showToast(`تم ${verb} ${ok} — فشل ${fail}`, fail > ok ? "err" : "ok");
    } catch (e: any) {
      showToast("فشل الإجراء الجماعي: " + (e?.message || e), "err");
    } finally { setBulkBusy(false); }
  };


  // ------------------------------------------------------------
  // Delete (only if no references) — verified by re-fetching
  // ------------------------------------------------------------
  const deleteEntity = async (r: EntityRow) => {
    const refs = (atlasLinks.get(r.id) ?? 0) + (campaignSlugs.get(r.id) ?? 0);
    if (refs > 0) {
      showToast(`لا يمكن الحذف: توجد ${refs} مرجع. استخدم الأرشفة أو الدمج بدلاً من ذلك.`, "err");
      return;
    }
    if (!confirm(`حذف نهائي لـ«${r.title}»؟ لا يمكن التراجع.`)) return;
    setBusy(r.id);
    devLog("delete:start", { id: r.id, slug: r.slug });
    try {
      const del = await supabase.from("encyclopedia_entities" as any).delete().eq("id", r.id).select("id");
      devLog("delete:response", { id: r.id, error: del.error, returned: del.data });
      if (del.error) { showToast("فشل الحذف (قاعدة البيانات): " + del.error.message, "err"); return; }
      const { data: still } = await supabase.from("encyclopedia_entities" as any).select("id").eq("id", r.id).maybeSingle();
      devLog("delete:verify", { id: r.id, stillExists: !!still });
      if (still) {
        showToast("فشل التحقق من الحذف — الصف لا يزال موجوداً في قاعدة البيانات", "err");
        return;
      }
      await logAudit("encyclopedia.delete", { id: r.id, slug: r.slug, title: r.title, verified: true });
      showToast("تم الحذف وتأكّد ✓");
      if (selectedId === r.id) setSelectedId(null);
      await refresh();
    } catch (e: any) { showToast("فشل: " + (e?.message || e), "err"); }
    finally { setBusy(null); }
  };

  // ------------------------------------------------------------
  // Safe merge (canonical wins, dup hidden + redirect) — verified
  // ------------------------------------------------------------
  const mergeInto = async (dup: EntityRow, canonical: EntityRow) => {
    if (dup.id === canonical.id) { showToast("لا يمكن دمج كيان مع نفسه", "err"); return; }
    if (!confirm(`دمج «${dup.title}» داخل «${canonical.title}»؟ سيتم إخفاء المكرر وتحويل الروابط.`)) return;
    setBusy(dup.id);
    try {
      // 1) Enrich canonical from duplicate when canonical fields are empty.
      const canMeta: any = { ...(canonical.metadata || {}) };
      const dupMeta: any = { ...(dup.metadata || {}) };
      const patch: Partial<EntityRow> = {};
      if (!canonical.summary && dup.summary) patch.summary = dup.summary;
      if (!canonical.subtitle && dup.subtitle) patch.subtitle = dup.subtitle;
      if ((!canonical.body || Object.keys(canonical.body || {}).length === 0) && dup.body) {
        patch.body = dup.body;
      }
      if (!hasImage(canMeta) && hasImage(dupMeta)) {
        canMeta.image = dupMeta.image ?? dupMeta.image_url ?? dupMeta.hero_image ?? canMeta.image;
      }
      // 2) Merge alias arrays.
      const mergeArr = (a: any, b: any) => {
        const set = new Set<string>();
        for (const v of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
          if (typeof v === "string" && v.trim()) set.add(v.trim());
        }
        return [...set];
      };
      canMeta.aliases = mergeArr(canMeta.aliases, dupMeta.aliases);
      if (dup.title && !canMeta.aliases.includes(dup.title)) canMeta.aliases.push(dup.title);
      canMeta.sources = mergeArr(canMeta.sources, dupMeta.sources);
      canMeta.related = mergeArr(canMeta.related, dupMeta.related);

      // 3) Slug redirect map on canonical.
      const redirects: string[] = Array.isArray(canMeta.redirect_from) ? [...canMeta.redirect_from] : [];
      if (dup.slug && !redirects.includes(dup.slug)) redirects.push(dup.slug);
      canMeta.redirect_from = redirects;

      // 4) Provenance trail.
      const mergedFrom: any[] = Array.isArray(canMeta.merged_from) ? [...canMeta.merged_from] : [];
      mergedFrom.push({
        id: dup.id, slug: dup.slug, title: dup.title, merged_at: new Date().toISOString(),
      });
      canMeta.merged_from = mergedFrom;
      canMeta.canonical = true;

      patch.metadata = canMeta;

      devLog("merge:start", { canonical_id: canonical.id, duplicate_id: dup.id });

      const r1 = await supabase.from("encyclopedia_entities" as any)
        .update(patch).eq("id", canonical.id).select("id").maybeSingle();
      devLog("merge:canonical-response", { error: r1.error });
      if (r1.error) { showToast("فشل تحديث الكيان المعتمد: " + r1.error.message, "err"); return; }

      // 5) Hide duplicate, point at canonical.
      const dupMetaNew = {
        ...dupMeta,
        canonical_id: canonical.id,
        canonical_slug: canonical.slug,
        hidden_duplicate: true,
        hidden_at: new Date().toISOString(),
      };
      const r2 = await supabase.from("encyclopedia_entities" as any)
        .update({ enabled: false, metadata: dupMetaNew }).eq("id", dup.id).select("id").maybeSingle();
      devLog("merge:duplicate-response", { error: r2.error });
      if (r2.error) { showToast("فشل إخفاء المكرر: " + r2.error.message, "err"); return; }

      // Hard verification of both rows.
      const vCan = await verifyDbUpdate(canonical.id, {
        metadata: { redirect_from: canMeta.redirect_from, canonical: true },
      });
      const vDup = await verifyDbUpdate(dup.id, {
        enabled: false,
        metadata: {
          canonical_id: canonical.id,
          canonical_slug: canonical.slug,
          hidden_duplicate: true,
        },
      });
      devLog("merge:verify", { canonical: vCan, duplicate: vDup });
      if (!vCan.ok || !vDup.ok) {
        const fail = [
          !vCan.ok ? `canonical: ${vCan.diff.join(",")}` : "",
          !vDup.ok ? `duplicate: ${vDup.diff.join(",")}` : "",
        ].filter(Boolean).join(" · ");
        showToast(`فشل التحقق من الدمج — ${fail}`, "err");
        return;
      }

      // 6) Repoint atlas links.
      const { error: aErr } = await supabase
        .from("atlas_entities" as any)
        .update({ encyclopedia_entity_id: canonical.id })
        .eq("encyclopedia_entity_id", dup.id);
      if (aErr) { showToast("الدمج تم لكن فشل تحويل روابط الأطلس: " + aErr.message, "err"); }

      // 7) Repoint campaign references by slug (string-level, safe boundary).
      try {
        const { data: camps } = await supabase.from("admin_campaigns" as any).select("id,data");
        const safe = dup.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(:|"|/)${safe}(?=[^a-z0-9-]|$)`, "g");
        for (const c of selectCampaignRows((camps ?? []) as unknown as { id: string; data: any }[])) {
          const s = JSON.stringify(c.data);
          const next = s.replace(re, `$1${canonical.slug}`);
          if (next !== s) {
            let parsed: any; try { parsed = JSON.parse(next); } catch { continue; }
            await supabase.from("admin_campaigns" as any).update({ data: parsed }).eq("id", c.id);
          }
        }
      } catch { /* best-effort */ }

      await logAudit("encyclopedia.merge", {
        canonical_id: canonical.id, canonical_slug: canonical.slug,
        duplicate_id: dup.id, duplicate_slug: dup.slug, verified: true,
      });

      showToast(`تم الدمج وتأكّد الحفظ: «${dup.title}» → «${canonical.title}» ✓`);
      setMergeFor(null);
      if (selectedId === dup.id) setSelectedId(canonical.id);
      await refresh();
    } catch (e: any) {
      showToast("فشل الدمج: " + (e?.message || e), "err");
    } finally { setBusy(null); }
  };

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-5">
        <Header onRefresh={refresh} onExport={exportCsv}
                onExportFullJson={exportFullJson} onExportFullCsv={exportFullCsv}
                loading={loading}
                rowCount={rows.length} dupCount={dupIds.size} />

        {err && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            <AlertTriangle className="me-2 inline size-4" /> {err}
          </div>
        )}

        <Toolbar
          q={q} setQ={setQ}
          filter={filter} setFilter={setFilter}
          pipeline={pipeline} setPipeline={setPipeline}
          needsCleanupCount={needsCleanupCount}
          needsContentCount={needsContentCount}
          completeCount={completeCount}
          dedupePendingCount={dedupePendingCount}
        />
        <MissingContentStrip rows={rows} atlasLinks={atlasLinks} campaignSlugs={campaignSlugs} dupIds={dupIds} onFilter={setFilter} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Results list */}
          <div className="space-y-2">
            {/* Select-all row — applies only to the currently filtered / searched cards. */}
            {!loading && filtered.length > 0 && (
              <label className="flex items-center justify-between gap-2 rounded-md border border-slate-700/60 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-300">
                <span className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-amber-400"
                    checked={allVisibleSelected}
                    ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
                    onChange={toggleSelectAllVisible}
                  />
                  <span>تحديد الكل ({filtered.length})</span>
                </span>
                {selectedIds.size > 0 && (
                  <span className="text-[10px] text-amber-200">
                    محدد: {selectedIds.size}
                  </span>
                )}
              </label>
            )}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-400">
                لا توجد نتائج مطابقة.
              </div>
            )}
            {filtered.map((r) => {
              const isOrphan = !(atlasLinks.get(r.id) || campaignSlugs.get(r.id));
              const q = classifyQuality(r, dupIds.has(r.id), isOrphan);
              const state = primaryState(r, dupIds.has(r.id), q, scoreOf(r));
              const cid = typeof r.metadata?.canonical_id === "string" ? r.metadata.canonical_id : null;
              const canonicalTitle = cid ? (rows.find((x) => x.id === cid)?.title ?? null) : null;
              const inCleanupQueue = rowNeedsCleanup(r, liveDupIds, q);
              return (
                <ResultRow
                  key={r.id}
                  row={r}
                  state={state}
                  canonicalTitle={canonicalTitle}
                  atlas={atlasLinks.get(r.id) ?? 0}
                  camps={campaignSlugs.get(r.id) ?? 0}
                  active={selectedId === r.id}
                  onOpen={() => setSelectedId(r.id)}
                  inCleanupQueue={inCleanupQueue}
                  busy={busy === r.id}
                  onFullyApprove={() => fullyApproveCleanup(r)}
                  onMarkNeedsContent={() => markNeedsContentOnly(r)}
                  selected={selectedIds.has(r.id)}
                  onToggleSelect={() => toggleSelect(r.id)}
                />
              );
            })}


          </div>


          {/* Editor */}
          <div className="lg:sticky lg:top-4">
            {!selected && (
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
                اختر كياناً من القائمة لتحريره.
              </div>
            )}
            {selected && (
              <Editor
                key={selected.id}
                row={selected}
                allRows={rows}
                busy={busy === selected.id}
                onSave={(patch) => saveEntity(selected.id, patch)}
                onApprove={() => approveEntity(selected)}
                onArchive={() => archiveEntity(selected)}
                onDelete={() => deleteEntity(selected)}
                onOpenMerge={() => setMergeFor(selected)}
                onJumpTo={(id) => setSelectedId(id)}
                onRefresh={() => { void refresh(); }}

                duplicates={
                  // Suggest other rows that share normalized title within the same type.
                  rows.filter((x) => x.id !== selected.id
                    && x.entity_type === selected.entity_type
                    && normalizeArabicName(x.title) === normalizeArabicName(selected.title))
                }
                atlasCount={atlasLinks.get(selected.id) ?? 0}
                campaignCount={campaignSlugs.get(selected.id) ?? 0}
              />
            )}
          </div>
        </div>
      </div>

      {mergeFor && (
        <MergeDialog
          source={mergeFor}
          rows={rows.filter((x) => x.entity_type === mergeFor.entity_type && x.id !== mergeFor.id && x.enabled)}
          onClose={() => setMergeFor(null)}
          onConfirm={(canonical) => mergeInto(mergeFor, canonical)}
        />
      )}

      {selectedIds.size > 0 && (
        <div
          dir="rtl"
          role="region"
          aria-label="شريط الإجراءات الجماعية"
          className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[95vw] flex-wrap items-center justify-center gap-2 rounded-full border border-amber-400/50 bg-slate-950/95 px-3 py-2 text-xs text-slate-100 shadow-2xl backdrop-blur"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
            <BadgeCheck className="size-3.5" />
            {selectedIds.size} محدد
          </span>
          <button
            onClick={() => void runBulk("needs-content")}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1 rounded-full border border-sky-400/50 bg-sky-500/15 px-3 py-1 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
          >
            {bulkBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
            وسم كـ «يحتاج محتوى»
          </button>
          <button
            onClick={() => void runBulk("fully-approve")}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {bulkBusy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            اعتماد تام
          </button>
          <button
            onClick={clearSelection}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1 rounded-full border border-slate-600/60 bg-slate-800/60 px-3 py-1 text-[11px] text-slate-200 hover:bg-slate-700/60 disabled:opacity-50"
          >
            <X className="size-3.5" /> إلغاء التحديد
          </button>
        </div>
      )}


      {toast && (
        <div
          role="status"
          className={`fixed inset-x-0 bottom-6 mx-auto w-fit max-w-md rounded-full border px-4 py-2 text-sm shadow-lg backdrop-blur ${
            toast.tone === "err"
              ? "border-rose-400/40 bg-rose-950/90 text-rose-100"
              : "border-emerald-400/40 bg-emerald-950/90 text-emerald-100"
          }`}>
          {toast.text}
          <button onClick={() => setToast(null)} className="ms-3 opacity-70 hover:opacity-100">
            <X className="inline size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Header
// ------------------------------------------------------------
function Header({ onRefresh, onExport, onExportFullJson, onExportFullCsv, loading, rowCount, dupCount }: {
  onRefresh: () => void; onExport: () => void;
  onExportFullJson: () => void; onExportFullCsv: () => void;
  loading: boolean; rowCount: number; dupCount: number;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
      <div className="flex items-center gap-3">
        <Shield className="size-6 text-amber-400" />
        <div>
          <h1 className="text-xl font-bold text-amber-100">تنظيف الموسوعة</h1>
          <p className="text-xs text-slate-400">
            {rowCount} كيان · {dupCount} مكرر محتمل ·{" "}
            <Link to="/admin" className="underline hover:text-amber-200">العودة للوحة</Link>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onExportFullJson} disabled={loading || rowCount === 0}
          title="تصدير الدفعة الكاملة (كل الكيانات، مجمّعة حسب الفئة) كملف JSON"
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">
          <Download className="size-3.5" /> تصدير JSON شامل
        </button>
        <button onClick={onExportFullCsv} disabled={loading || rowCount === 0}
          title="تصدير الدفعة الكاملة كملف CSV (صف لكل كيان × فئة)"
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">
          <Download className="size-3.5" /> تصدير CSV شامل
        </button>
        <button onClick={onExport}
          title="تصدير النتائج الظاهرة فقط (بعد الفلترة)"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-600/50 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/60">
          <Download className="size-3.5" /> تصدير النتائج المعروضة
        </button>
        <button onClick={onRefresh} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------
// Toolbar (search + filter chips)
// ------------------------------------------------------------
type PipelineKey = "any" | "needs-cleanup" | "needs-content" | "complete";

function Toolbar({
  q, setQ, filter, setFilter,
  pipeline, setPipeline,
  needsCleanupCount, needsContentCount, completeCount,
  dedupePendingCount,
}: {
  q: string; setQ: (v: string) => void;
  filter: FilterKey; setFilter: (v: FilterKey) => void;
  pipeline: PipelineKey; setPipeline: (v: PipelineKey) => void;
  needsCleanupCount: number;
  needsContentCount: number;
  completeCount: number;
  dedupePendingCount: number;
}) {
  const restChips: { key: FilterKey; label: string }[] = [
    { key: "all", label: "الكل" },
    { key: "dedupe-pending", label: `معالجة إزالة التكرار (${dedupePendingCount})` },
    { key: "figure", label: "شخصيات" },
    { key: "city", label: "مدن" },
    { key: "landmark", label: "معالم" },
    { key: "battle", label: "معارك" },
    { key: "event", label: "أحداث" },
    { key: "artifact", label: "آثار" },
    { key: "state", label: "دول" },
    { key: "empty", label: "فارغ" },
    { key: "weak", label: "ضعيف" },
    { key: "stub", label: "مختصرات" },
    { key: "duplicate", label: "مكررات" },
    { key: "archived", label: "مؤرشف" },
  ];

  // Three pipeline stages — first-class chips with live counts.
  // Visual identity: amber (cleanup) → sky (content) → emerald (complete).
  const stages: {
    key: Exclude<PipelineKey, "any">;
    label: string;
    count: number;
    dot: string;
    active: string;
    idle: string;
    badgeActive: string;
    badgeIdle: string;
  }[] = [
    {
      key: "needs-cleanup",
      label: "يحتاج تنظيف",
      count: needsCleanupCount,
      dot: "bg-amber-300 shadow-[0_0_8px_rgba(253,224,71,0.9)]",
      active: "border-amber-300 bg-amber-500/25 text-amber-50 shadow-amber-500/30",
      idle: "border-amber-400/70 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
      badgeActive: "bg-amber-950 text-amber-50",
      badgeIdle: "bg-amber-400/30 text-amber-50",
    },
    {
      key: "needs-content",
      label: "يحتاج محتوى",
      count: needsContentCount,
      dot: "bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.9)]",
      active: "border-sky-300 bg-sky-500/25 text-sky-50 shadow-sky-500/30",
      idle: "border-sky-400/70 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20",
      badgeActive: "bg-sky-950 text-sky-50",
      badgeIdle: "bg-sky-400/30 text-sky-50",
    },
    {
      key: "complete",
      label: "مكتمل",
      count: completeCount,
      dot: "bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]",
      active: "border-emerald-300 bg-emerald-500/25 text-emerald-50 shadow-emerald-500/30",
      idle: "border-emerald-400/70 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20",
      badgeActive: "bg-emerald-950 text-emerald-50",
      badgeIdle: "bg-emerald-400/30 text-emerald-50",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث بالاسم أو slug أو id…"
          className="w-full rounded-lg border border-slate-700/60 bg-slate-900/50 px-3 py-2 pe-10 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
        />
      </div>

      {/* Pipeline row — the three production stages. Toggling a chip
          again returns to "any" so the user is never stuck inside one stage. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-slate-500">المسار</span>
        {stages.map((s) => {
          const isActive = pipeline === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setPipeline(isActive ? "any" : s.key)}
              className={`inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-xs font-semibold shadow-sm transition ${
                isActive ? s.active : s.idle
              }`}
            >
              <span className={`inline-block size-1.5 rounded-full ${s.dot}`} />
              <span>{s.label}</span>
              <span
                className={`inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                  isActive ? s.badgeActive : s.badgeIdle
                }`}
              >
                {s.count}
              </span>
            </button>
          );
        })}
        {pipeline !== "any" && (
          <button
            onClick={() => setPipeline("any")}
            className="ms-1 inline-flex items-center gap-1 rounded-full border border-slate-700/60 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-800/60"
            title="إلغاء فلتر المسار"
          >
            <X className="size-3" /> إلغاء المسار
          </button>
        )}
      </div>

      {/* Type / quality chips — combine with the pipeline filter above. */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="size-3.5 text-slate-500" />
        {restChips.map((c) => {
          const isActive = filter === c.key;
          return (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                isActive
                  ? "border-amber-400/60 bg-amber-500/20 text-amber-100"
                  : "border-slate-700/60 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60"
              }`}>
              <span>{c.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}



// ------------------------------------------------------------
// Result row
// ------------------------------------------------------------
function ResultRow({
  row, state, canonicalTitle, atlas, camps, active, onOpen,
  inCleanupQueue = false, busy = false, onFullyApprove, onMarkNeedsContent,
  selected = false, onToggleSelect,
}: {
  row: EntityRow; state: PrimaryState; canonicalTitle: string | null;
  atlas: number; camps: number;
  active: boolean; onOpen: () => void;
  inCleanupQueue?: boolean;
  busy?: boolean;
  onFullyApprove?: () => void;
  onMarkNeedsContent?: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const sm = STATE_META[state];
  const bodyLen = (row.summary ?? "").length + bodyText(row.body).length;
  const score = scoreEntity({
    summary: row.summary, body: row.body, metadata: row.metadata,
    atlasLinks: atlas, campaignRefs: camps,
  });
  const stateLabel = state === "redirected" && canonicalTitle
    ? `محوّل → ${canonicalTitle}`
    : sm.label;
  const stop = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn?.();
  };
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
      className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-start transition ${
        selected
          ? "border-amber-400/70 bg-amber-500/15 ring-1 ring-amber-400/30"
          : active ? "border-amber-400/60 bg-amber-500/10" : "border-slate-700/60 bg-slate-900/40 hover:bg-slate-800/60"
      }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-amber-400"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label="تحديد"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{row.title}</p>
            <p className="truncate font-mono text-[10px] text-slate-500">
              {TYPE_LABEL[row.entity_type] ?? row.entity_type} · {row.slug}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] tabular-nums ${scoreColor(score)}`}>{score}%</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] max-w-[160px] truncate ${sm.tone}`} title={stateLabel}>
            {stateLabel}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
        <Chip>{bodyLen} حرف</Chip>
        {atlas > 0 && <Chip tone="ok">أطلس×{atlas}</Chip>}
        {camps > 0 && <Chip tone="ok">حملات×{camps}</Chip>}
      </div>


      {inCleanupQueue && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-700/40 pt-2">
          <span className="me-1 text-[10px] uppercase tracking-wider text-slate-500">إجراءات سريعة</span>
          <button
            onClick={stop(onFullyApprove)}
            disabled={busy}
            title="هذا الكيان نظيف ومحتواه جيد — انقله مباشرة إلى «مكتمل»"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-400/50 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <BadgeCheck className="size-3" />}
            اعتماد تام
          </button>
          <button
            onClick={stop(onMarkNeedsContent)}
            disabled={busy}
            title="لا يوجد تكرار — لكن المحتوى ينقصه. انقله إلى «يحتاج محتوى»"
            className="inline-flex items-center gap-1 rounded-md border border-sky-400/50 bg-sky-500/15 px-2 py-1 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <FileText className="size-3" />}
            يحتاج محتوى
          </button>
        </div>
      )}
    </div>
  );
}



function Chip({ children, tone }: { children: React.ReactNode; tone?: "ok" | "warn" }) {
  const cls = tone === "ok"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : tone === "warn"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
    : "border-slate-700/60 bg-slate-800/60";
  return <span className={`rounded-full border px-1.5 py-0.5 ${cls}`}>{children}</span>;
}

// ------------------------------------------------------------
// Editor (JSON pane + structured controls)
// ------------------------------------------------------------
function Editor({ row, allRows, busy, onSave, onApprove, onArchive, onDelete, onOpenMerge, onJumpTo, onRefresh, duplicates, atlasCount, campaignCount }: {
  row: EntityRow; allRows: EntityRow[]; busy: boolean;
  onSave: (patch: Partial<EntityRow>) => void;
  onApprove: () => void;
  onArchive: () => void; onDelete: () => void; onOpenMerge: () => void;
  onJumpTo: (id: string) => void;
  onRefresh: () => void;
  duplicates: EntityRow[]; atlasCount: number; campaignCount: number;
}) {

  const [title, setTitle] = useState(row.title);
  const [slug, setSlug] = useState(row.slug);
  const [subtitle, setSubtitle] = useState(row.subtitle ?? "");
  const [summary, setSummary] = useState(row.summary ?? "");
  const [bodyText, setBodyText] = useState(() => JSON.stringify(row.body ?? {}, null, 2));
  const [metaText, setMetaText] = useState(() => JSON.stringify(row.metadata ?? {}, null, 2));
  const [bodyErr, setBodyErr] = useState<string | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");

  // Live preview: keep the last successfully-parsed body/metadata so a
  // mid-keystroke invalid JSON state doesn't blank the preview.
  const [lastBody, setLastBody] = useState<any>(row.body ?? {});
  const [lastMeta, setLastMeta] = useState<any>(row.metadata ?? {});
  const [previewStale, setPreviewStale] = useState(false);

  useEffect(() => {
    try {
      const b = JSON.parse(bodyText);
      if (b && typeof b === "object" && !Array.isArray(b)) setLastBody(b);
    } catch { setPreviewStale(true); return; }
    try {
      const m = JSON.parse(metaText);
      if (m && typeof m === "object" && !Array.isArray(m)) setLastMeta(m);
      setPreviewStale(false);
    } catch { setPreviewStale(true); }
  }, [bodyText, metaText]);

  const titleRef = useRef(title);
  titleRef.current = title;

  const validate = (): Partial<EntityRow> | null => {
    let body: any; let metadata: any;
    try { body = JSON.parse(bodyText); setBodyErr(null); }
    catch (e: any) { setBodyErr("JSON غير صالح: " + e.message); return null; }
    try { metadata = JSON.parse(metaText); setMetaErr(null); }
    catch (e: any) { setMetaErr("JSON غير صالح: " + e.message); return null; }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      setBodyErr("body يجب أن يكون كائن JSON"); return null;
    }
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      setMetaErr("metadata يجب أن يكون كائن JSON"); return null;
    }
    if (!title.trim()) return null;
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setMetaErr("slug غير صالح (حروف صغيرة وأرقام وشرطات فقط)"); return null;
    }
    return {
      title: title.trim(),
      slug,
      subtitle: subtitle.trim() || null,
      summary: summary.trim() || null,
      body,
      metadata,
    };
  };

  const save = () => {
    const patch = validate();
    if (patch) onSave(patch);
  };

  const previewEntity = {
    entity_type: row.entity_type,
    title: title || row.title,
    subtitle: subtitle || row.subtitle,
    summary,
    body: lastBody,
    metadata: lastMeta,
  };

  const editorPane = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="العنوان">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm" />
        </Field>
        <Field label="slug">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} dir="ltr"
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-sm" />
        </Field>
      </div>
      <Field label="عنوان فرعي">
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm" />
      </Field>
      <Field label="ملخص">
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3}
          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm" />
      </Field>
      <Field label="body (JSON)">
        <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={10} dir="ltr"
          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[11px] leading-5" />
        {bodyErr && <p className="mt-1 text-[11px] text-rose-300"><FileWarning className="me-1 inline size-3" />{bodyErr}</p>}
      </Field>
      <Field label="metadata (JSON)">
        <textarea value={metaText} onChange={(e) => setMetaText(e.target.value)} rows={8} dir="ltr"
          className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[11px] leading-5" />
        {metaErr && <p className="mt-1 text-[11px] text-rose-300"><FileWarning className="me-1 inline size-3" />{metaErr}</p>}
      </Field>
    </div>
  );

  const previewPane = (
    <div className="space-y-2">
      {previewStale && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
          <AlertTriangle className="me-1 inline size-3.5" />
          صيغة JSON غير صحيحة — سيتم عرض آخر نسخة صالحة.
        </div>
      )}
      <div className="max-h-[80vh] overflow-y-auto rounded-xl border border-slate-700/60 bg-black/40">
        <EncyclopediaEntityPreview entity={previewEntity} />
      </div>
    </div>
  );

  // Compute current state for the action banner.
  const meta: any = row.metadata || {};
  const isRedirected = typeof meta.canonical_id === "string" && !!meta.canonical_id;
  const isArchived = !isRedirected && (meta.archived === true || row.enabled === false);
  const isLive = !isRedirected && !isArchived;

  return (
    <div className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
      {/* Header: id + secondary actions (save / delete) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/40 pb-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <BookOpen className="size-3.5" />
          <span className="font-mono">{row.id.slice(0, 8)}…</span>
          <button onClick={() => navigator.clipboard.writeText(row.id)}
            className="rounded p-1 hover:bg-slate-800" title="نسخ id">
            <Copy className="size-3" />
          </button>
          <span className={`ms-2 rounded-full border px-2 py-0.5 text-[10px] ${
            isRedirected ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
            : isArchived ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          }`}>
            {isRedirected ? "محوّل" : isArchived ? "مؤرشف" : "معتمد"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={save} disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-slate-600/60 bg-slate-800/60 px-2 py-1 text-xs text-slate-100 hover:bg-slate-700/60 disabled:opacity-50"
            title="حفظ تعديلات JSON/الحقول">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} حفظ
          </button>
          <button onClick={onDelete} disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
            title="حذف نهائي — لا يمكن التراجع">
            <Trash2 className="size-3.5" /> حذف
          </button>
        </div>
      </div>

      {/* Three primary state actions */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={onApprove} disabled={busy || isLive}
          title="إظهار الكيان للاعبين — يلغي الأرشفة أو التحويل"
          className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3 text-xs transition ${
            isLive
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200/70 cursor-default"
              : "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
          } disabled:opacity-60`}>
          {isLive ? <CheckCircle2 className="size-4" /> : <RotateCcw className="size-4" />}
          <span className="font-semibold">اعتماد</span>
          <span className="text-[10px] opacity-80">{isLive ? "ظاهر للاعبين" : "استعادة وإظهار"}</span>
        </button>
        <button onClick={onArchive} disabled={busy || isArchived}
          title="إخفاء من اللاعبين دون تحويل — قابل للاستعادة"
          className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-3 text-xs transition ${
            isArchived
              ? "border-amber-500/30 bg-amber-500/5 text-amber-200/70 cursor-default"
              : "border-amber-500/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
          } disabled:opacity-60`}>
          <Archive className="size-4" />
          <span className="font-semibold">أرشفة</span>
          <span className="text-[10px] opacity-80">{isArchived ? "مخفي حالياً" : "إخفاء بدون تحويل"}</span>
        </button>
        <button onClick={onOpenMerge} disabled={busy}
          title="اختر الكيان المعتمد ليصبح هذا تحويلة إليه"
          className="flex flex-col items-center justify-center gap-1 rounded-lg border border-sky-500/50 bg-sky-500/15 px-3 py-3 text-xs text-sky-100 transition hover:bg-sky-500/25 disabled:opacity-60">
          <CornerDownRight className="size-4" />
          <span className="font-semibold">تحويل</span>
          <span className="text-[10px] opacity-80">{isRedirected ? "تغيير الهدف" : "ربط مع كيان معتمد"}</span>
        </button>
      </div>



      {(() => {
        const cid = typeof row.metadata?.canonical_id === "string" ? row.metadata.canonical_id : null;
        if (!cid) return null;
        const target = allRows.find((x) => x.id === cid);
        const cslug = target?.slug ?? (typeof row.metadata?.canonical_slug === "string" ? row.metadata.canonical_slug : null);
        return (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-100">
            <div className="flex items-center gap-1.5 min-w-0">
              <CornerDownRight className="size-3.5 shrink-0" />
              <span className="truncate">
                محوّل إلى:{" "}
                <span className="font-semibold">{target?.title ?? cslug ?? cid}</span>
                {cslug && <span dir="ltr" className="ms-1 font-mono text-[10px] text-emerald-200/80">({cslug})</span>}
              </span>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {target && (
                <button onClick={() => onJumpTo(target.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-400/50 bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/25">
                  <Pencil className="size-3" /> فتح للتحرير
                </button>
              )}
              {cslug && (
                <Link to="/encyclopedia/entity/$id" params={{ id: cslug }} target="_blank"
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-400/50 bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/25">
                  <ArrowUpRight className="size-3" /> فتح الكيان المعتمد
                </Link>
              )}
            </div>
          </div>
        );
      })()}

      {duplicates.length > 0 && (
        <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 p-2 text-xs text-fuchsia-200">
          <Sparkles className="me-1 inline size-3.5" />
          مكرر محتمل ({duplicates.length}): يتشاركون نفس الاسم القياسي. افتح «دمج» لاختيار القياسي.
        </div>
      )}
      {(() => {
        const richer = findRicherDuplicate(row as any, duplicates as any);
        if (!richer) return null;
        return (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" />
              <span>
                هذا العنصر له نسخة أغنى:&nbsp;
                <span dir="ltr" className="font-mono">{richer.slug}</span>
                &nbsp;(درجة {richness(richer as any)} مقابل {richness(row as any)}).
              </span>
            </div>
            <Link
              to="/encyclopedia/entity/$id"
              params={{ id: richer.slug }}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-amber-500/15 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/25"
            >
              <ArrowUpRight className="size-3.5" /> افتح القانوني
            </Link>
          </div>
        );
      })()}
      {(atlasCount > 0 || campaignCount > 0) && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2 text-xs text-sky-200">
          مرتبط بـ {atlasCount} نقطة أطلس و{campaignCount} مرجع في الحملات.
        </div>
      )}

      <RelationsPanel
        row={row}
        allRows={allRows}
        busy={busy}
        onSave={onSave}
        onJumpTo={onJumpTo}
      />

      <EncyclopediaEntityImageUploader
        entityId={row.id}
        entityType={row.entity_type}
        entityTitle={row.title}
        initial={{
          image_url: row.image_url ?? null,
          image_path: row.image_path ?? null,
          image_credit: row.image_credit ?? null,
          image_source: row.image_source ?? null,
        }}
        onChange={onRefresh}
      />





      {/* Tabs — visible on small screens. On lg+ both panes show side-by-side. */}
      <div className="flex items-center gap-1 lg:hidden">
        <button onClick={() => setView("edit")}
          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition ${
            view === "edit"
              ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
              : "border-slate-700/60 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60"
          }`}>
          <Pencil className="size-3.5" /> تحرير
        </button>
        <button onClick={() => setView("preview")}
          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition ${
            view === "preview"
              ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
              : "border-slate-700/60 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60"
          }`}>
          <Eye className="size-3.5" /> معاينة
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={view === "edit" ? "" : "hidden lg:block"}>{editorPane}</div>
        <div className={view === "preview" ? "" : "hidden lg:block"}>{previewPane}</div>
      </div>

      {Array.isArray(row.metadata?.redirect_from) && row.metadata.redirect_from.length > 0 && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-200">
          <CheckCircle2 className="me-1 inline size-3.5" />
          تحويلات نشطة: {row.metadata.redirect_from.map((s: string) => (
            <span key={s} dir="ltr" className="mx-1 font-mono">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase tracking-wider text-slate-400">{label}</span>
      {children}
    </label>
  );
}

// ------------------------------------------------------------
// Merge dialog
// ------------------------------------------------------------
function MergeDialog({ source, rows, onClose, onConfirm }: {
  source: EntityRow; rows: EntityRow[];
  onClose: () => void; onConfirm: (canonical: EntityRow) => void;
}) {
  const [query, setQuery] = useState(source.title);
  const candidates = useMemo(() => {
    const n = normalizeArabicName(query);
    return rows
      .map((r) => ({ r, score: normalizeArabicName(r.title) === n ? 100
        : normalizeArabicName(r.title).includes(n) ? 60
        : r.slug.includes(query) ? 40 : 0 }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((x) => x.r);
  }, [rows, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-950 p-5 text-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-200">
            <CornerDownRight className="size-5" /> تحويل إلى الكيان المعتمد
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <X className="size-5" />
          </button>
        </div>
        <p className="text-sm text-slate-300">
          المصدر: <span className="font-semibold">{source.title}</span>{" "}
          <span dir="ltr" className="font-mono text-xs text-slate-500">({source.slug})</span>
        </p>
        <p className="mt-2 text-xs text-slate-400">
          اختر الكيان القياسي. سيتم: حفظ المحتوى المفيد، دمج الأسماء البديلة والمصادر،
          تحويل روابط الأطلس والحملات، تسجيل slug القديم كتحويلة، وإخفاء المصدر.
        </p>
        <div className="mt-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن القياسي…"
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
        </div>
        <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pe-1">
          {candidates.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-slate-500">لا توجد كيانات مرشحة.</p>
          )}
          {candidates.map((c) => (
            <button key={c.id} onClick={() => onConfirm(c)}
              className="flex w-full items-center justify-between gap-3 rounded border border-slate-700/60 bg-slate-900/40 p-2 text-start hover:border-emerald-400/60 hover:bg-emerald-500/10">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.title}</p>
                <p dir="ltr" className="truncate font-mono text-[10px] text-slate-500">{c.slug}</p>
              </div>
              <span className="shrink-0 text-[10px] text-emerald-300">اختيار</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Missing-content dashboard strip
// ------------------------------------------------------------
function MissingContentStrip({ rows, atlasLinks, campaignSlugs, dupIds, onFilter }: {
  rows: EntityRow[];
  atlasLinks: Map<string, number>;
  campaignSlugs: Map<string, number>;
  dupIds: Set<string>;
  onFilter: (k: FilterKey) => void;
}) {
  const stats = useMemo(() => {
    let empty = 0, weak = 0, noImage = 0, noSources = 0, noOverview = 0, noAtlas = 0, noCamp = 0;
    for (const r of rows) {
      const isOrphan = !(atlasLinks.get(r.id) || campaignSlugs.get(r.id));
      const q = classifyQuality(r, dupIds.has(r.id), isOrphan);
      if (q === "empty") empty++;
      if (q === "weak") weak++;
      if (!hasImage(r.metadata, r)) noImage++;
      if (!hasSources(r.metadata, r.body)) noSources++;
      if ((r.summary ?? "").trim().length < 20) noOverview++;
      if (!(atlasLinks.get(r.id) ?? 0)) noAtlas++;
      if (!(campaignSlugs.get(r.id) ?? 0)) noCamp++;
    }
    return { empty, weak, noImage, noSources, noOverview, noAtlas, noCamp };
  }, [rows, atlasLinks, campaignSlugs, dupIds]);

  const cards: { label: string; value: number; filter: FilterKey; tone: string }[] = [
    { label: "كيانات فارغة",        value: stats.empty,      filter: "empty",       tone: "border-rose-500/40 bg-rose-500/5 text-rose-200" },
    { label: "كيانات ضعيفة",        value: stats.weak,       filter: "weak",        tone: "border-amber-500/40 bg-amber-500/5 text-amber-200" },
    { label: "بدون صورة",           value: stats.noImage,    filter: "no-image",    tone: "border-fuchsia-500/40 bg-fuchsia-500/5 text-fuchsia-200" },
    { label: "لديه صورة",           value: rows.length - stats.noImage, filter: "has-image", tone: "border-emerald-500/40 bg-emerald-500/5 text-emerald-200" },
    { label: "بدون مصادر",          value: stats.noSources,  filter: "no-sources",  tone: "border-sky-500/40 bg-sky-500/5 text-sky-200" },
    { label: "بدون ملخص",           value: stats.noOverview, filter: "no-overview", tone: "border-amber-500/40 bg-amber-500/5 text-amber-200" },
    { label: "بدون رابط أطلس",      value: stats.noAtlas,    filter: "no-atlas",    tone: "border-emerald-500/40 bg-emerald-500/5 text-emerald-200" },
    { label: "بدون مرجع في الحملات", value: stats.noCamp,     filter: "no-campaign", tone: "border-slate-600/60 bg-slate-900/40 text-slate-200" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
      {cards.map((c) => (
        <button key={c.label} onClick={() => onFilter(c.filter)}
          className={`rounded-xl border px-3 py-2 text-start transition hover:brightness-110 ${c.tone}`}>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] opacity-80">{c.label}</span>
            <span className="text-lg font-bold tabular-nums">{c.value}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// Relations panel — shows current explicit relations and opens
// the OrphanRelationEditor to add more. Removals persist through
// the parent's saveEntity() so audit/verify/refresh all run.
// ------------------------------------------------------------
function RelationsPanel({
  row, allRows, busy, onSave, onJumpTo,
}: {
  row: EntityRow;
  allRows: EntityRow[];
  busy: boolean;
  onSave: (patch: Partial<EntityRow>) => void;
  onJumpTo: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const meta: any = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const currentSlugs: string[] = Array.isArray(meta.related_entities)
    ? meta.related_entities.filter((s: unknown): s is string => typeof s === "string" && !!s)
    : [];

  // Legacy mirrors we only surface for visibility — writes go to related_entities.
  const legacy: string[] = [];
  for (const key of ["related", "relationships"]) {
    const v = meta[key];
    if (Array.isArray(v)) for (const s of v) if (typeof s === "string" && s && !currentSlugs.includes(s)) legacy.push(s);
  }

  const bySlug = useMemo(() => {
    const m = new Map<string, EntityRow>();
    for (const r of allRows) m.set(r.slug.toLowerCase(), r);
    return m;
  }, [allRows]);

  const removeSlug = (slug: string) => {
    const next = currentSlugs.filter((s) => s !== slug);
    onSave({ metadata: { ...meta, related_entities: next } as any });
  };

  const commitAdd = async (mergedSlugs: string[]) => {
    onSave({ metadata: { ...meta, related_entities: mergedSlugs } as any });
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-amber-100">الروابط الصريحة</h3>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200">
            {currentSlugs.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
        >
          <Plus className="size-3.5" /> إضافة روابط
        </button>
      </div>

      {currentSlugs.length === 0 ? (
        <p className="rounded-md border border-dashed border-amber-500/30 bg-slate-950/40 px-3 py-4 text-center text-xs text-slate-400">
          لا توجد روابط صريحة حتى الآن — استخدم «إضافة روابط» لاختيار كيانات مقترحة أو البحث اليدوي.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {currentSlugs.map((slug) => {
            const target = bySlug.get(slug.toLowerCase());
            return (
              <li
                key={slug}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-600/60 bg-slate-900/70 py-1 ps-2 pe-1 text-[11px]"
              >
                {target ? (
                  <button
                    type="button"
                    onClick={() => onJumpTo(target.id)}
                    className="max-w-[180px] truncate text-slate-100 hover:text-amber-200"
                    title="فتح للتحرير"
                  >
                    {target.title}
                  </button>
                ) : (
                  <span dir="ltr" className="max-w-[180px] truncate font-mono text-rose-200" title="Slug غير موجود">
                    {slug}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeSlug(slug)}
                  disabled={busy}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-50"
                  title="إزالة الرابط"
                >
                  <X className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {legacy.length > 0 && (
        <p className="mt-2 text-[10px] text-slate-500">
          روابط قديمة في <code>metadata.related</code> / <code>relationships</code>:{" "}
          {legacy.map((s) => (
            <span key={s} dir="ltr" className="mx-0.5 rounded bg-slate-800/60 px-1 font-mono">{s}</span>
          ))}{" "}
          — احفظ عبر «إضافة روابط» لتوحيدها تحت <code>related_entities</code>.
        </p>
      )}

      {open && (
        <OrphanRelationEditor
          entity={row as any}
          allRows={allRows as any}
          onClose={() => setOpen(false)}
          onSaved={() => { /* parent onSave already refreshes */ }}
          onCommit={commitAdd}
        />
      )}
    </div>
  );
}

