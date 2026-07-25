// ============================================================
// /admin/investigations — Phase B management list
//
// - Uses admin-only RPCs (admin_list_investigations,
//   admin_get_investigation_full, admin_set_investigation_enabled).
//   The old unsafe raw INSERT/UPDATE/DELETE editor has been removed.
// - Reuses the canonical world resolver (`buildWorldIndex`) instead
//   of duplicating investigation → World mapping.
// - Uses the shared boundary normalizer for read-only display of
//   legacy `coins` → `dinars` and legacy object related_entities.
//   Never mutates DB rows on view.
// - "Preview" opens a read-only inspector.
// - "Edit" navigates to the (future) structured editor placeholder.
// - "Duplicate" and "Delete" are intentionally disabled until the
//   stable-ID-aware paths land in Phase C/D.
// - `profiles.investigations_completed` is deprecated (never
//   authoritative); NOT surfaced here. Phase G will establish real
//   server progress and add completion statistics.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Search, Upload, RefreshCw, Eye, EyeOff, Copy, Trash2,
  CheckCircle2, AlertTriangle, PenSquare, X, ChevronDown, ChevronUp,
  Info, Filter, ExternalLink, Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import {
  buildWorldIndex,
  invalidateWorldIndex,
} from "@/lib/worlds-progress";
import { ensureLocalSnapshotLoaded } from "@/lib/local-first-store";
import { WORLD_HUBS, WORLD_ERA } from "@/lib/worlds";
import {
  normalizeInvestigationRow,
  summarizeReward,
  type InvestigationBoundaryWarning,
} from "@/lib/investigations-normalize";
import { onInvestigationPublished } from "@/lib/investigations/adminApi";
import { InvestigationExportDialog } from "@/components/admin/InvestigationExportDialog";
import { InvestigationImportDialog } from "@/components/admin/InvestigationImportDialog";
import { GOLDEN_TEMPLATE_LABEL, isGoldenTemplate } from "@/lib/investigations/golden-template";




export const Route = createFileRoute("/admin/investigations/")({
  head: () => ({
    meta: [
      { title: "إدارة التحقيقات — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AdminInvestigationsPage /></AdminGate>,
});

// ------------------------------------------------------------
// Types matching the admin_list_investigations RPC row.
// ------------------------------------------------------------
interface ListRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  difficulty: string | null;
  enabled: boolean;
  reward: Record<string, unknown> | null;
  step_count: number;
  question_count: number;
  related_count: number;
  related_entities: unknown[]; // may contain legacy objects
  created_at: string;
  updated_at: string;
}

interface RowView {
  raw: ListRow;
  warnings: InvestigationBoundaryWarning[];
  hasLegacy: boolean;
  hasBlocking: boolean;
  reward: ReturnType<typeof summarizeReward>;
  worldSlug: string | null;
  eraSlug: string | null;
  /** Row-level enrichment / render failure — never crashes the page. */
  renderError: string | null;
}

type SortKey = "updated_at" | "created_at" | "title" | "difficulty";
type SortDir = "asc" | "desc";
type Toast = { kind: "ok" | "err"; msg: string };

/** Structured diagnostic codes shown to admins — never leak SQL internals. */
type DiagCode =
  | "RPC_PERMISSION_DENIED"
  | "RPC_SHAPE_MISMATCH"
  | "RPC_NETWORK_ERROR"
  | "NORMALIZATION_FAILED"
  | "WORLD_MAPPING_FAILED"
  | "ROW_RENDER_FAILED"
  | "UNKNOWN";

interface DiagInfo {
  code: DiagCode;
  hint: string;
  supabaseCode?: string;
}

function classifyRpcError(e: unknown): DiagInfo {
  const err = (e ?? {}) as { code?: string; message?: string; details?: string };
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  if (code === "42501" || msg.includes("not authorized") || msg.includes("permission denied")) {
    return { code: "RPC_PERMISSION_DENIED", supabaseCode: code, hint: "الجلسة الحالية لا تملك صلاحية مشرف محتوى." };
  }
  if (code === "PGRST202" || code === "PGRST200" || msg.includes("could not find") || msg.includes("schema cache")) {
    return { code: "RPC_SHAPE_MISMATCH", supabaseCode: code, hint: "توقيع الـ RPC لا يطابق ما تنتظره الواجهة." };
  }
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return { code: "RPC_NETWORK_ERROR", supabaseCode: code, hint: "تعذّر الاتصال بخدمة قاعدة البيانات." };
  }
  return { code: "UNKNOWN", supabaseCode: code, hint: err.message ?? "خطأ غير معروف." };
}

const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const DIFFICULTY_LABEL: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };

function AdminInvestigationsPage() {
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [diag, setDiag] = useState<DiagInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [worldReady, setWorldReady] = useState(false);
  const [worldErr, setWorldErr] = useState<string | null>(null);

  // Filters.
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<"" | typeof DIFFICULTIES[number]>("");
  const [worldFilter, setWorldFilter] = useState<string>(""); // "", "__none__", or a world slug
  const [statusFilter, setStatusFilter] = useState<"" | "enabled" | "disabled">("");
  const [templateFilter, setTemplateFilter] = useState<"" | "only" | "hide">("");


  // Sort.
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [preview, setPreview] = useState<string | null>(null); // slug for preview
  const [previewData, setPreviewData] = useState<unknown | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  // Export: selection set + active export scope (null ids = whole library).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportScope, setExportScope] = useState<{ ids: string[] | null; label: string } | null>(null);
  // Editorial re-import (upsert by id/slug, partial-safe).
  const [importOpen, setImportOpen] = useState(false);




  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3200);
  };

  // Load list + prime the local snapshot so buildWorldIndex resolves.
  const refresh = async () => {
    setBusy(true);
    setErr(null);
    setDiag(null);
    setWorldErr(null);
    try {
      try {
        await ensureLocalSnapshotLoaded();
        invalidateWorldIndex();
      } catch (worldE: any) {
        // World enrichment is best-effort; never block the admin list.
        setWorldErr(worldE?.message ?? String(worldE));
      }
      setWorldReady(true);
      const { data, error } = await supabase
        .rpc("admin_list_investigations" as any);
      if (error) throw error;
      setRows(Array.isArray(data) ? (data as ListRow[]) : []);
    } catch (e: any) {
      const info = classifyRpcError(e);
      setDiag(info);
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Refresh the list whenever an investigation is drafted/published (this
  // tab or any other tab). Mirrors the campaigns admin behavior.
  useEffect(() => onInvestigationPublished(() => { refresh(); }), []);


  // --- Enrich rows via the shared boundary normalizer (display only).
  const worldBySlug = useMemo(() => {
    if (!worldReady) return new Map<string, string>();
    const map = new Map<string, string>();
    try {
      const index = buildWorldIndex();
      for (const [worldSlug, entry] of index) {
        for (const invSlug of entry.investigationSlugs) map.set(invSlug, worldSlug);
      }
    } catch (e: any) {
      // Never crash the page if the world index build fails.
      setWorldErr(e?.message ?? String(e));
    }
    return map;
  }, [worldReady, rows]);

  const enriched = useMemo<RowView[]>(() => {
    if (!rows) return [];
    return rows.map((r): RowView => {
      // Per-row defensive normalization. One bad row must never take down
      // the entire administration page.
      try {
        const normalized = normalizeInvestigationRow({
          related_entities: r?.related_entities,
          reward: r?.reward,
        });
        const reward = summarizeReward(r?.reward);
        let worldSlug: string | null = null;
        try {
          worldSlug = (r?.slug ? worldBySlug.get(r.slug) : null) ?? null;
        } catch { worldSlug = null; }
        const eraSlug = worldSlug ? (WORLD_ERA[worldSlug] ?? worldSlug) : null;
        return {
          raw: r,
          warnings: normalized.warnings,
          hasLegacy: normalized.hasLegacy,
          hasBlocking: normalized.hasBlockingIssue,
          reward,
          worldSlug,
          eraSlug,
          renderError: null,
        };
      } catch (rowE: any) {
        return {
          raw: r,
          warnings: [{ kind: "related_entities_malformed", detail: rowE?.message ?? "row enrichment failed" }],
          hasLegacy: false,
          hasBlocking: true,
          reward: { unlocks: 0, legacyCoins: false, conflict: false },
          worldSlug: null,
          eraSlug: null,
          renderError: `ROW_RENDER_FAILED: ${rowE?.message ?? String(rowE)}`,
        };
      }
    });
  }, [rows, worldBySlug]);

  // --- Filters + sort.
  const visible = useMemo<RowView[]>(() => {
    const q = search.trim().toLowerCase();
    let out = enriched.filter((v) => {
      const r = v.raw;
      if (q) {
        const hay = `${r.title ?? ""} ${r.subtitle ?? ""} ${r.slug ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (difficulty && (r.difficulty ?? "") !== difficulty) return false;
      if (statusFilter === "enabled" && !r.enabled) return false;
      if (statusFilter === "disabled" && r.enabled) return false;
      if (worldFilter === "__none__") {
        if (v.worldSlug) return false;
      } else if (worldFilter) {
        if (v.worldSlug !== worldFilter) return false;
      }
      const golden = isGoldenTemplate(r);
      if (templateFilter === "only" && !golden) return false;
      if (templateFilter === "hide" && golden) return false;
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const ar = a.raw, br = b.raw;
      switch (sortKey) {
        case "title": return (ar.title ?? "").localeCompare(br.title ?? "", "ar") * dir;
        case "difficulty":
          return (DIFFICULTIES.indexOf(ar.difficulty as any) - DIFFICULTIES.indexOf(br.difficulty as any)) * dir;
        case "created_at": return ((Date.parse(ar.created_at ?? "") || 0) - (Date.parse(br.created_at ?? "") || 0)) * dir;
        case "updated_at":
        default: return ((Date.parse(ar.updated_at ?? "") || 0) - (Date.parse(br.updated_at ?? "") || 0)) * dir;
      }
    });
    return out;
  }, [enriched, search, difficulty, worldFilter, statusFilter, sortKey, sortDir]);

  // --- Stats (Phase B: only DB-provable numbers).
  const stats = useMemo(() => {
    const byDifficulty: Record<string, number> = { easy: 0, medium: 0, hard: 0, unknown: 0 };
    const byWorld: Record<string, number> = {};
    let enabled = 0, disabled = 0, malformed = 0, legacy = 0;
    for (const v of enriched) {
      const d = (v.raw.difficulty ?? "").toLowerCase();
      byDifficulty[d in byDifficulty ? d : "unknown"]++;
      const w = v.worldSlug ?? "__none__";
      byWorld[w] = (byWorld[w] ?? 0) + 1;
      if (v.raw.enabled) enabled++; else disabled++;
      if (v.hasBlocking) malformed++;
      if (v.hasLegacy) legacy++;
    }
    return { total: enriched.length, enabled, disabled, malformed, legacy, byDifficulty, byWorld };
  }, [enriched]);

  // --- Actions.
  const toggleEnabled = async (r: ListRow) => {
    try {
      const { error } = await supabase.rpc("admin_set_investigation_enabled" as any, {
        p_id: r.id,
        p_enabled: !r.enabled,
      });
      if (error) throw error;
      notify("ok", !r.enabled ? "تم تفعيل التحقيق." : "تم تعطيل التحقيق.");
      refresh();
    } catch (e: any) {
      notify("err", e?.message ?? "تعذّر تحديث الحالة.");
    }
  };

  const openPreview = async (slug: string) => {
    setPreview(slug);
    setPreviewData(null);
    setPreviewErr(null);
    try {
      const { data, error } = await supabase.rpc("admin_get_investigation_full" as any, {
        p_id_or_slug: slug,
      });
      if (error) throw error;
      setPreviewData(data);
    } catch (e: any) {
      setPreviewErr(e?.message ?? "تعذّر التحميل.");
    }
  };

  const clearFilters = () => {
    setSearch(""); setDifficulty(""); setWorldFilter(""); setStatusFilter("");
  };
  const anyFilterActive = !!(search || difficulty || worldFilter || statusFilter);

  // --- Export selection helpers.
  const visibleIds = useMemo(() => visible.map((v) => v.raw?.id).filter(Boolean) as string[], [visible]);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    return next;
  });



  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Search className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">إدارة التحقيقات</h1>
              <p className="text-sm text-slate-400">قراءة آمنة عبر واجهات المشرف — التحرير المباشر معطّل حتى المحرّر المنظم.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              ← لوحة الإدارة
            </Link>
            <button onClick={refresh} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> تحديث
            </button>
            <button
              onClick={() => setExportScope({ ids: null, label: `المكتبة كاملة (${enriched.length})` })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10">
              <Download className="h-3.5 w-3.5" /> تصدير المكتبة
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/10">
              <Upload className="h-3.5 w-3.5" /> استيراد تحقيق (تحديث آمن)
            </button>
            <Link to="/admin/import" search={{ type: "investigations" } as any}
              title="المسار القديم — إنشاء دفعات فقط"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-amber-400 hover:text-amber-300">
              <Upload className="h-3.5 w-3.5" /> استيراد قديم

            </Link>
          </div>
        </header>


        <StatsPanel stats={stats} />

        {/* Filters */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="h-3.5 w-3.5" /> مرشحات
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالعنوان أو slug…"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-amber-400/50"
            />
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm">
              <option value="">كل الصعوبات</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
            </select>
            <select value={worldFilter} onChange={(e) => setWorldFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm">
              <option value="">كل العوالم</option>
              <option value="__none__">بدون عالم</option>
              {WORLD_HUBS.map((h) => (
                <option key={h.slug} value={h.slug}>{h.glyph} {h.slug} · {WORLD_ERA[h.slug] ?? h.slug}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm">
              <option value="">مفعّل ومعطّل</option>
              <option value="enabled">مفعّل فقط</option>
              <option value="disabled">معطّل فقط</option>
            </select>
          </div>
          {anyFilterActive && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              {search && <Chip onRemove={() => setSearch("")}>بحث: {search}</Chip>}
              {difficulty && <Chip onRemove={() => setDifficulty("")}>صعوبة: {DIFFICULTY_LABEL[difficulty]}</Chip>}
              {worldFilter === "__none__"
                ? <Chip onRemove={() => setWorldFilter("")}>بدون عالم</Chip>
                : worldFilter && <Chip onRemove={() => setWorldFilter("")}>عالم: {worldFilter}</Chip>}
              {statusFilter && <Chip onRemove={() => setStatusFilter("")}>{statusFilter === "enabled" ? "مفعّل" : "معطّل"}</Chip>}
              <button onClick={clearFilters}
                className="rounded-full border border-slate-700 px-2 py-0.5 text-slate-400 hover:border-amber-400/40 hover:text-amber-300">
                مسح الكل
              </button>
            </div>
          )}
        </section>

        {err && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span>تعذّر التحميل.</span>
              {diag && (
                <span className="rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] text-red-100">
                  {diag.code}{diag.supabaseCode ? ` · ${diag.supabaseCode}` : ""}
                </span>
              )}
            </div>
            {diag?.hint && <div className="mt-1 text-xs text-red-100/80">{diag.hint}</div>}
            {import.meta.env.DEV && (
              <details className="mt-2 text-[11px] text-red-100/70">
                <summary className="cursor-pointer">تفاصيل تشخيصية</summary>
                <pre className="mt-1 overflow-auto whitespace-pre-wrap" dir="ltr">{err}</pre>
              </details>
            )}
          </div>
        )}

        {worldErr && !err && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-200">
            <span className="me-1 rounded border border-amber-400/40 bg-amber-500/10 px-1 py-0.5 font-mono text-[10px]">WORLD_MAPPING_FAILED</span>
            تعذّر تحميل ربط العوالم — سيتم عرض الصفوف دون تعيين عالم.
          </div>
        )}


        {rows === null && !err && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">جارٍ التحميل…</div>
        )}

        {rows && visible.length === 0 && (
          <div className="rounded-xl border border-dashed border-amber-500/30 bg-slate-900/40 p-10 text-center">
            <Search className="mx-auto mb-3 h-8 w-8 text-amber-400/70" />
            <p className="text-base font-semibold text-amber-100">
              {rows.length === 0 ? "لا توجد تحقيقات بعد" : "لا توجد نتائج مطابقة"}
            </p>
            {rows.length === 0 && (
              <p className="mt-1 text-sm text-slate-400">استورد JSON للبدء.</p>
            )}
          </div>
        )}

        {visible.length > 0 && (
          <>
            {/* Bulk selection toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-slate-300">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                    className="h-3.5 w-3.5 accent-amber-400" />
                  تحديد المعروض ({visibleIds.length})
                </label>
                <span className="text-slate-400">
                  محدّد: <b className="text-amber-200">{selected.size}</b>
                </span>
                {selected.size > 0 && (
                  <button onClick={() => setSelected(new Set())} className="text-slate-400 hover:text-amber-300">
                    إلغاء التحديد
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={selected.size === 0}
                  onClick={() => setExportScope({ ids: [...selected], label: `التحقيقات المحدّدة (${selected.size})` })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-2.5 py-1 text-amber-200 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600">
                  <Download className="h-3.5 w-3.5" /> تصدير المحدّد
                </button>
                <button
                  disabled={visibleIds.length === 0}
                  onClick={() => setExportScope({ ids: visibleIds, label: `النتائج المعروضة (${visibleIds.length})` })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300 hover:border-amber-400 hover:text-amber-300 disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" /> تصدير النتائج المعروضة
                </button>
              </div>
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-900/80 text-xs text-slate-400">
                  <tr>
                    <th className="px-3 py-2">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible}
                        aria-label="تحديد الكل" className="h-3.5 w-3.5 accent-amber-400" />
                    </th>
                    <SortHeader label="العنوان" k="title" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortDir === "asc" ? "desc" : "asc"); }} />
                    <th className="px-3 py-2">Slug</th>
                    <SortHeader label="صعوبة" k="difficulty" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortDir === "asc" ? "desc" : "asc"); }} />
                    <th className="px-3 py-2">عالم / عصر</th>
                    <th className="px-3 py-2">محتوى</th>
                    <th className="px-3 py-2">مكافأة</th>
                    <th className="px-3 py-2">الحالة</th>
                    <SortHeader label="حُدّث" k="updated_at" sortKey={sortKey} sortDir={sortDir} onSort={(k) => { setSortKey(k); setSortDir(sortDir === "asc" ? "desc" : "asc"); }} />
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {visible.map((v) => (
                    <SafeRow
                      key={v.raw?.id ?? v.raw?.slug ?? Math.random()}
                      view={v}
                      selected={!!v.raw?.id && selected.has(v.raw.id)}
                      onSelect={() => v.raw?.id && toggleOne(v.raw.id)}
                      onExport={() => v.raw?.id && setExportScope({ ids: [v.raw.id], label: v.raw.slug })}
                      onPreview={() => openPreview(v.raw.slug)}
                      onToggle={() => toggleEnabled(v.raw)}
                    />
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

      </div>

      {preview && (
        <PreviewModal
          slug={preview}
          data={previewData}
          error={previewErr}
          onClose={() => { setPreview(null); setPreviewData(null); setPreviewErr(null); }}
        />
      )}

      {exportScope && (
        <InvestigationExportDialog
          ids={exportScope.ids}
          scopeLabel={exportScope.label}
          onClose={() => setExportScope(null)}
        />
      )}

      {importOpen && (
        <InvestigationImportDialog
          onClose={() => setImportOpen(false)}
          onImported={() => { refresh(); }}
        />
      )}




      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2 text-sm shadow-xl ${
          toast.kind === "ok"
            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
            : "border-red-400/40 bg-red-500/15 text-red-100"
        }`}>
          {toast.kind === "ok"
            ? <CheckCircle2 className="me-1 inline h-4 w-4" />
            : <AlertTriangle className="me-1 inline h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Sub-components.
// ------------------------------------------------------------
function StatsPanel({ stats }: { stats: {
  total: number; enabled: number; disabled: number; malformed: number; legacy: number;
  byDifficulty: Record<string, number>; byWorld: Record<string, number>;
} }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40">
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-300">الإجمالي: <b className="text-amber-200">{stats.total}</b></span>
          <span className="text-emerald-300">مفعّل: {stats.enabled}</span>
          <span className="text-slate-400">معطّل: {stats.disabled}</span>
          {stats.legacy > 0 && <span className="text-amber-300">صيغة قديمة: {stats.legacy}</span>}
          {stats.malformed > 0 && <span className="text-red-300">تحذيرات: {stats.malformed}</span>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-300">
          <div className="mb-2 flex flex-wrap gap-2">
            {DIFFICULTIES.map((d) => (
              <span key={d} className="rounded-full border border-slate-700 px-2 py-0.5">
                {DIFFICULTY_LABEL[d]}: {stats.byDifficulty[d] ?? 0}
              </span>
            ))}
            {(stats.byDifficulty.unknown ?? 0) > 0 && (
              <span className="rounded-full border border-slate-700 px-2 py-0.5">غير محدّد: {stats.byDifficulty.unknown}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byWorld)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([w, n]) => (
                <span key={w} className="rounded-full border border-slate-700 px-2 py-0.5">
                  {w === "__none__" ? "بدون عالم" : w}: {n}
                </span>
              ))}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500">
            <Info className="mt-0.5 h-3 w-3" />
            لا تُعرض إحصائيات إكمال اللاعبين — تعتمد على مصدر تقدم من الخادم (المرحلة G).
          </p>
        </div>
      )}
    </section>
  );
}

function SortHeader({ label, k, sortKey, sortDir, onSort }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="px-3 py-2">
      <button onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 ${active ? "text-amber-300" : "text-slate-400 hover:text-amber-200"}`}>
        {label}
        {active ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </button>
    </th>
  );
}

// Per-row error boundary — guarantees one malformed row cannot black-hole
// the whole administration dashboard.
class SafeRow extends React.Component<
  {
    view: RowView;
    selected: boolean;
    onSelect: () => void;
    onExport: () => void;
    onPreview: () => void;
    onToggle: () => void;
  },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error("[admin.investigations] row render failed", err, this.props.view?.raw);
  }
  render() {
    const { view, selected, onSelect, onExport, onPreview, onToggle } = this.props;
    const combinedError = this.state.error ?? view.renderError;
    if (combinedError) {
      const r = view.raw ?? ({} as ListRow);
      return (
        <tr className="bg-red-950/20">
          <td colSpan={10} className="px-3 py-2 text-xs text-red-200">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px]">
                ROW_RENDER_FAILED
              </span>
              <span className="font-mono text-[11px]">{r.slug ?? r.id ?? "—"}</span>
              <span className="text-red-100/80">تعذّر عرض هذا الصف — بقية الصفوف تعمل بشكل طبيعي.</span>
              {r.id && (
                <button onClick={onExport} className="rounded border border-red-400/40 px-1.5 py-0.5 text-[10px] text-red-100 hover:bg-red-500/10">
                  تصدير للتشخيص
                </button>
              )}
            </div>
            {import.meta.env.DEV && (
              <pre dir="ltr" className="mt-1 overflow-auto whitespace-pre-wrap text-[10px] text-red-100/70">{combinedError}</pre>
            )}
          </td>
        </tr>
      );
    }
    return (
      <Row view={view} selected={selected} onSelect={onSelect}
        onExport={onExport} onPreview={onPreview} onToggle={onToggle} />
    );
  }
}





function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
      {children}
      <button onClick={onRemove} className="text-amber-200/70 hover:text-amber-100">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function Row({ view, selected, onSelect, onExport, onPreview, onToggle }: {
  view: RowView; selected: boolean; onSelect: () => void; onExport: () => void;
  onPreview: () => void; onToggle: () => void;
}) {
  const r = view.raw;
  const rw = view.reward;
  return (
    <tr className={`hover:bg-slate-900/60 ${selected ? "bg-amber-500/5" : ""}`}>
      <td className="px-3 py-2">
        <input type="checkbox" checked={selected} onChange={onSelect}
          aria-label={`تحديد ${r.slug}`} className="h-3.5 w-3.5 accent-amber-400" />
      </td>
      <td className="px-3 py-2">

        <div className="flex items-center gap-2">
          <div>
            <div className="font-medium text-slate-100">{r.title}</div>
            {r.subtitle && <div className="text-xs text-slate-400">{r.subtitle}</div>}
          </div>
          {view.hasBlocking && (
            <span title={view.warnings.map((w) => w.detail ?? w.kind).join(" · ")}
              className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-200">
              تحذير
            </span>
          )}
          {view.hasLegacy && !view.hasBlocking && (
            <span title={view.warnings.map((w) => w.detail ?? w.kind).join(" · ")}
              className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
              صيغة قديمة
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-slate-400" dir="ltr">{r.slug}</td>
      <td className="px-3 py-2 text-xs text-amber-300">{DIFFICULTY_LABEL[r.difficulty ?? ""] ?? r.difficulty ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-slate-300">
        {view.worldSlug ? (
          <>
            <div>{view.worldSlug}</div>
            <div className="text-[10px] text-slate-500">{view.eraSlug}</div>
          </>
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-slate-300">
        <div>خطوات {r.step_count}</div>
        <div className="text-[10px] text-slate-500">أسئلة {r.question_count} · مراجع {r.related_count}</div>
      </td>
      <td className="px-3 py-2 text-xs text-slate-300">
        {rw.xp ? <span className="me-1">XP+{rw.xp}</span> : null}
        {typeof rw.dinars === "number" ? <span className="me-1">🪙{rw.dinars}</span> : null}
        {rw.hearts ? <span className="me-1">❤️{rw.hearts}</span> : null}
        {rw.unlocks > 0 ? <span className="me-1">🎁{rw.unlocks}</span> : null}
      </td>
      <td className="px-3 py-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
          r.enabled
            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
            : "border-slate-600 bg-slate-800 text-slate-400"
        }`}>{r.enabled ? "مفعّل" : "معطّل"}</span>
      </td>
      <td className="px-3 py-2 text-[11px] text-slate-500">{formatDate(r.updated_at)}</td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1.5">
          <IconBtn onClick={onPreview} icon={Eye} label="معاينة" />
          <IconBtn onClick={onExport} icon={Download} label="تصدير" title="تصدير هذا التحقيق (JSON + CSV + تقرير)" />

          <Link to="/admin/investigations/$id/edit" params={{ id: r.id }}
            title="تحرير في المحرّر المنظم"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 text-slate-300 hover:border-amber-400 hover:text-amber-300">
            <PenSquare className="h-3.5 w-3.5" />
          </Link>
          <IconBtn onClick={() => { /* Phase C/D */ }}
            icon={Copy} label="نسخ" disabled title="سيتاح بعد استقرار المعرّفات — المرحلة C/D" />
          <IconBtn onClick={onToggle} icon={r.enabled ? EyeOff : Eye}
            label={r.enabled ? "تعطيل" : "تفعيل"} />
          <IconBtn onClick={() => { /* removed */ }}
            icon={Trash2} label="حذف" disabled danger
            title="الحذف المباشر غير آمن — سيُستبدل بمسار مدقّق لاحقًا" />
        </div>
      </td>
    </tr>
  );
}

function PreviewModal({ slug, data, error, onClose }: {
  slug: string; data: unknown | null; error: string | null; onClose: () => void;
}) {
  const pretty = useMemo(() => {
    if (!data) return null;
    try { return JSON.stringify(data, null, 2); } catch { return String(data); }
  }, [data]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 p-6 text-slate-100 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-amber-100">معاينة</h2>
            <p className="mt-0.5 font-mono text-xs text-slate-400" dir="ltr">{slug}</p>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/investigation/${slug}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <ExternalLink className="h-3 w-3" /> فتح في اللعبة
            </a>
            <button onClick={onClose} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-amber-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
        )}
        {!data && !error && <div className="text-sm text-slate-400">جارٍ التحميل…</div>}
        {pretty && (
          <pre dir="ltr" className="max-h-[70vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-[11px] leading-snug text-slate-200">
{pretty}
          </pre>
        )}
      </div>
    </div>
  );
}

function IconBtn({ onClick, icon: Icon, label, danger, disabled, title }: {
  onClick: () => void; icon: any; label: string; danger?: boolean; disabled?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title ?? label}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition ${
        disabled
          ? "cursor-not-allowed border-slate-800 text-slate-600"
          : danger
          ? "border-red-400/30 text-red-300 hover:bg-red-500/10"
          : "border-slate-700 text-slate-300 hover:border-amber-400/40 hover:text-amber-300"
      }`}>
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}
