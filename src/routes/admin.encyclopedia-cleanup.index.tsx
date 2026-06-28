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
  AlertTriangle, Archive, ArrowUpRight, BookOpen, CheckCircle2, Copy, Download, Eye,
  FileWarning, Filter, GitMerge, Loader2, Pencil, RefreshCw, Save,
  Search, Shield, Sparkles, Trash2, X,
} from "lucide-react";
import { EncyclopediaEntityPreview } from "@/components/admin/EncyclopediaEntityPreview";
import { supabase } from "@/integrations/supabase/client";
import {
  entityNameKeys, normalizeArabicName, normalizeSlugKey,
} from "@/lib/arabic-normalize";
import { scoreEntity, scoreColor } from "@/lib/encyclopedia-quality";
import { findRicherDuplicate, richness } from "@/lib/encyclopedia-canonical";

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
};

type Quality = "good" | "weak" | "empty" | "duplicate" | "orphaned";
type FilterKey =
  | "all" | "figure" | "city" | "landmark" | "battle" | "event"
  | "artifact" | "state" | "empty" | "weak" | "duplicate" | "stub" | "archived"
  | "no-image" | "no-sources" | "no-overview" | "no-atlas" | "no-campaign";

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

function hasImage(meta: any): boolean {
  const m = meta || {};
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
// Component
// ------------------------------------------------------------
function CleanupWorkshop() {
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [atlasLinks, setAtlasLinks] = useState<Map<string, number>>(new Map());
  const [campaignSlugs, setCampaignSlugs] = useState<Map<string, number>>(new Map());
  const [mergeFor, setMergeFor] = useState<EntityRow | null>(null);

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
          .select("id,entity_type,slug,title,subtitle,summary,body,metadata,enabled,updated_at,timeline_year,timeline_category")
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
        const blob = JSON.stringify((c ?? []) as unknown);
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
  // Filter + search
  // ------------------------------------------------------------
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const nNorm = normalizeArabicName(needle);
    return rows.filter((r) => {
      const isOrphan = !(atlasLinks.get(r.id) || campaignSlugs.get(r.id));
      const quality = classifyQuality(r, dupIds.has(r.id), isOrphan);
      const archived = r.metadata?.archived === true || r.enabled === false;

      // Filter chip
      switch (filter) {
        case "all": break;
        case "empty": if (quality !== "empty") return false; break;
        case "weak":  if (quality !== "weak") return false; break;
        case "stub":  if (quality !== "empty" && quality !== "weak") return false; break;
        case "duplicate": if (!dupIds.has(r.id)) return false; break;
        case "archived":  if (!archived) return false; break;
        case "no-image":    if (hasImage(r.metadata)) return false; break;
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
  }, [rows, filter, q, dupIds, atlasLinks, campaignSlugs]);

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
        has_image: hasImage(r.metadata),
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
      setToast(`تم تصدير ${totals.all} كيان كـ JSON`);
    } catch (e: any) {
      setToast("فشل التصدير: " + (e?.message || e));
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
      setToast(`تم تصدير ${tagged.length} كيان كـ CSV`);
    } catch (e: any) {
      setToast("فشل التصدير: " + (e?.message || e));
    }
  };

  // ------------------------------------------------------------
  // Save edits from JSON editor
  // ------------------------------------------------------------
  const saveEntity = async (id: string, patch: Partial<EntityRow>) => {
    setBusy(id);
    try {
      const { error } = await supabase.from("encyclopedia_entities" as any).update(patch).eq("id", id);
      if (error) throw error;
      await logAudit("encyclopedia.update", { id, fields: Object.keys(patch) });
      setToast("تم الحفظ بنجاح");
      await refresh();
    } catch (e: any) {
      setToast("فشل الحفظ: " + (e?.message || e));
    } finally { setBusy(null); }
  };

  // ------------------------------------------------------------
  // Archive
  // ------------------------------------------------------------
  const archiveEntity = async (r: EntityRow) => {
    if (!confirm(`أرشفة «${r.title}»؟ لن تظهر للزوّار لكنها قابلة للاستعادة.`)) return;
    setBusy(r.id);
    try {
      const meta = { ...(r.metadata || {}), archived: true, archived_at: new Date().toISOString() };
      const { error } = await supabase.from("encyclopedia_entities" as any)
        .update({ metadata: meta, enabled: false }).eq("id", r.id);
      if (error) throw error;
      await logAudit("encyclopedia.archive", { id: r.id, slug: r.slug });
      setToast("تمت الأرشفة");
      await refresh();
    } catch (e: any) { setToast("فشل: " + (e?.message || e)); }
    finally { setBusy(null); }
  };

  // ------------------------------------------------------------
  // Delete (only if no references)
  // ------------------------------------------------------------
  const deleteEntity = async (r: EntityRow) => {
    const refs = (atlasLinks.get(r.id) ?? 0) + (campaignSlugs.get(r.id) ?? 0);
    if (refs > 0) {
      setToast(`لا يمكن الحذف: توجد ${refs} مرجع. استخدم الأرشفة أو الدمج بدلاً من ذلك.`);
      return;
    }
    if (!confirm(`حذف نهائي لـ«${r.title}»؟ لا يمكن التراجع.`)) return;
    setBusy(r.id);
    try {
      const { error } = await supabase.from("encyclopedia_entities" as any).delete().eq("id", r.id);
      if (error) throw error;
      await logAudit("encyclopedia.delete", { id: r.id, slug: r.slug, title: r.title });
      setToast("تم الحذف");
      if (selectedId === r.id) setSelectedId(null);
      await refresh();
    } catch (e: any) { setToast("فشل: " + (e?.message || e)); }
    finally { setBusy(null); }
  };

  // ------------------------------------------------------------
  // Safe merge (canonical wins, dup hidden + redirect)
  // ------------------------------------------------------------
  const mergeInto = async (dup: EntityRow, canonical: EntityRow) => {
    if (dup.id === canonical.id) { setToast("لا يمكن دمج كيان مع نفسه"); return; }
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
      // Add duplicate's own title as an alias for future fuzzy matches.
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
      const r1 = await supabase.from("encyclopedia_entities" as any)
        .update(patch).eq("id", canonical.id);
      if (r1.error) throw r1.error;

      // 5) Hide duplicate, point at canonical.
      const r2 = await supabase.from("encyclopedia_entities" as any).update({
        enabled: false,
        metadata: {
          ...dupMeta,
          canonical_id: canonical.id,
          canonical_slug: canonical.slug,
          hidden_duplicate: true,
          hidden_at: new Date().toISOString(),
        },
      }).eq("id", dup.id);
      if (r2.error) throw r2.error;

      // 6) Repoint atlas links.
      const { error: aErr } = await supabase
        .from("atlas_entities" as any)
        .update({ encyclopedia_entity_id: canonical.id })
        .eq("encyclopedia_entity_id", dup.id);
      if (aErr) throw aErr;

      // 7) Repoint campaign references by slug (string-level, safe boundary).
      try {
        const { data: camps } = await supabase.from("admin_campaigns" as any).select("id,data");
        const safe = dup.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(:|"|/)${safe}(?=[^a-z0-9-]|$)`, "g");
        for (const c of (camps ?? []) as unknown as { id: string; data: any }[]) {
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
        duplicate_id: dup.id, duplicate_slug: dup.slug,
      });

      setToast(`تم الدمج: «${dup.title}» → «${canonical.title}»`);
      setMergeFor(null);
      if (selectedId === dup.id) setSelectedId(canonical.id);
      await refresh();
    } catch (e: any) {
      setToast("فشل الدمج: " + (e?.message || e));
    } finally { setBusy(null); }
  };

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-5">
        <Header onRefresh={refresh} onExport={exportCsv} loading={loading}
                rowCount={rows.length} dupCount={dupIds.size} />

        {err && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            <AlertTriangle className="me-2 inline size-4" /> {err}
          </div>
        )}

        <Toolbar q={q} setQ={setQ} filter={filter} setFilter={setFilter} />
        <MissingContentStrip rows={rows} atlasLinks={atlasLinks} campaignSlugs={campaignSlugs} dupIds={dupIds} onFilter={setFilter} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Results list */}
          <div className="space-y-2">
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
              return (
                <ResultRow
                  key={r.id}
                  row={r}
                  quality={q}
                  atlas={atlasLinks.get(r.id) ?? 0}
                  camps={campaignSlugs.get(r.id) ?? 0}
                  active={selectedId === r.id}
                  onOpen={() => setSelectedId(r.id)}
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
                busy={busy === selected.id}
                onSave={(patch) => saveEntity(selected.id, patch)}
                onArchive={() => archiveEntity(selected)}
                onDelete={() => deleteEntity(selected)}
                onOpenMerge={() => setMergeFor(selected)}
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

      {toast && (
        <div className="fixed inset-x-0 bottom-6 mx-auto w-fit max-w-md rounded-full border border-amber-400/30 bg-slate-900/90 px-4 py-2 text-sm text-amber-100 shadow-lg backdrop-blur">
          {toast}
          <button onClick={() => setToast(null)} className="ms-3 text-slate-400 hover:text-slate-100">
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
function Header({ onRefresh, onExport, loading, rowCount, dupCount }: {
  onRefresh: () => void; onExport: () => void; loading: boolean;
  rowCount: number; dupCount: number;
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
      <div className="flex gap-2">
        <button onClick={onExport}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-600/50 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/60">
          <Download className="size-3.5" /> تصدير CSV
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
function Toolbar({ q, setQ, filter, setFilter }: {
  q: string; setQ: (v: string) => void;
  filter: FilterKey; setFilter: (v: FilterKey) => void;
}) {
  const chips: { key: FilterKey; label: string }[] = [
    { key: "all", label: "الكل" },
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
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="size-3.5 text-slate-500" />
        {chips.map((c) => (
          <button key={c.key} onClick={() => setFilter(c.key)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
              filter === c.key
                ? "border-amber-400/60 bg-amber-500/20 text-amber-100"
                : "border-slate-700/60 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60"
            }`}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Result row
// ------------------------------------------------------------
function ResultRow({ row, quality, atlas, camps, active, onOpen }: {
  row: EntityRow; quality: Quality; atlas: number; camps: number;
  active: boolean; onOpen: () => void;
}) {
  const meta = QUALITY_META[quality];
  const bodyLen = (row.summary ?? "").length + bodyText(row.body).length;
  const archived = row.metadata?.archived === true || row.enabled === false;
  const score = scoreEntity({
    summary: row.summary, body: row.body, metadata: row.metadata,
    atlasLinks: atlas, campaignRefs: camps,
  });
  return (
    <button onClick={onOpen}
      className={`w-full rounded-lg border px-3 py-2 text-start transition ${
        active ? "border-amber-400/60 bg-amber-500/10" : "border-slate-700/60 bg-slate-900/40 hover:bg-slate-800/60"
      }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{row.title}</p>
          <p className="truncate font-mono text-[10px] text-slate-500">
            {TYPE_LABEL[row.entity_type] ?? row.entity_type} · {row.slug}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] tabular-nums ${scoreColor(score)}`}>{score}%</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${meta.tone}`}>{meta.label}</span>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
        <Chip>{bodyLen} حرف</Chip>
        {hasSections(row.body) && <Chip>أقسام</Chip>}
        {hasSources(row.metadata, row.body) && <Chip>مصادر</Chip>}
        {hasImage(row.metadata) && <Chip>صورة</Chip>}
        {atlas > 0 && <Chip tone="ok">أطلس×{atlas}</Chip>}
        {camps > 0 && <Chip tone="ok">حملات×{camps}</Chip>}
        {archived && <Chip tone="warn">مؤرشف</Chip>}
      </div>
    </button>
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
function Editor({ row, busy, onSave, onArchive, onDelete, onOpenMerge, duplicates, atlasCount, campaignCount }: {
  row: EntityRow; busy: boolean;
  onSave: (patch: Partial<EntityRow>) => void;
  onArchive: () => void; onDelete: () => void; onOpenMerge: () => void;
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

  return (
    <div className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/40 pb-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <BookOpen className="size-3.5" />
          <span className="font-mono">{row.id.slice(0, 8)}…</span>
          <button onClick={() => navigator.clipboard.writeText(row.id)}
            className="rounded p-1 hover:bg-slate-800" title="نسخ id">
            <Copy className="size-3" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={onOpenMerge}
            className="inline-flex items-center gap-1 rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-1 text-xs text-fuchsia-200 hover:bg-fuchsia-500/20">
            <GitMerge className="size-3.5" /> دمج
          </button>
          <button onClick={onArchive} disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
            <Archive className="size-3.5" /> أرشفة
          </button>
          <button onClick={onDelete} disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-50">
            <Trash2 className="size-3.5" /> حذف
          </button>
          <button onClick={save} disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} حفظ
          </button>
        </div>
      </div>

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
            <GitMerge className="size-5" /> دمج داخل كيان قياسي
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
      if (!hasImage(r.metadata)) noImage++;
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
