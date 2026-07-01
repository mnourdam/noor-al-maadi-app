// Phase 2.5 — Bulk APS Review workshop.
// Render all review/unverified atlas entities on the master raster at once,
// allow dragging pins to correct APS positions, batch verify / publish / hide
// from one screen. Player /map is unaffected — only published+verified rows
// are exposed via RLS to anon/auth.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, BookOpen, Check, Copy, ExternalLink, Eye, EyeOff, MapPin, PinOff, RefreshCw, Save, Search, ShieldCheck, Star, Trash2, Upload,
} from "lucide-react";
import { findAtlasDuplicateGroups, DUP_REASON_AR, type AtlasDuplicateGroup } from "@/lib/atlas/atlas-duplicates";
import { normalizeArabic } from "@/lib/atlas/atlas-search";
import { toast } from "sonner";
import { AdminGate } from "@/lib/admin-guard";
import { supabase } from "@/integrations/supabase/client";
import {
  KIND_LABEL_AR, STATUS_LABEL_AR,
  LC1_ATLAS_VISIBLE_KINDS,
  isLc1VisibleAtlasKind,
  listAllAtlasEntities, updateAtlasEntity,
  type AtlasEntityKind, type AtlasEntityRow,
} from "@/lib/atlas-entities";
import {
  ensureAtlasDraftsForEncyclopedia,
  listNeedsPlacement,
  placeAtlasDraft,
  type NeedsPlacementRow,
} from "@/lib/atlas-needs-placement";

import { ATLAS_BASE_URL } from "@/lib/atlas/atlas-source";
import { ATLAS_V1_PIXEL_SIZE } from "@/data/atlas-anchors";
import { geoToAps } from "@/lib/atlas/transform";
import { ERAS } from "@/lib/app-constants";

const RASTER = ATLAS_V1_PIXEL_SIZE;
const ERA_LABEL: Record<string, string> = Object.fromEntries(ERAS.map((e) => [e.id, e.name]));
const eraLabel = (id: string | null | undefined) => (id ? ERA_LABEL[id] ?? id : "—");

// Atlas is a dedicated *geographic* atlas: only these kinds ever appear in
// the review workflows. Legacy non-geographic rows stay in the DB but are
// hidden by default (toggle "إظهار أنواع قديمة" to inspect them).
const ATLAS_KIND_ORDER: AtlasEntityKind[] = ["region", "place", "battle"];
const DUP_KIND_FILTERS: Array<{ value: AtlasEntityKind | "all"; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "region", label: "الدول والأقاليم" },
  { value: "place", label: "المدن" },
  { value: "battle", label: "المعارك" },
];

export const Route = createFileRoute("/admin/atlas-review")({
  head: () => ({
    meta: [
      { title: "مراجعة كيانات الأطلس — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate><AtlasReviewPage /></AdminGate>
  ),
});

type LocalPos = { x: number; y: number };

function AtlasReviewPage() {
  const [rows, setRows] = useState<AtlasEntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<AtlasEntityKind | "all">("all");
  const [era, setEra] = useState<string>("all");
  const [batch, setBatch] = useState<string>("all");
  const [onlyUnverified, setOnlyUnverified] = useState(true);
  const [showRemoved, setShowRemoved] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AtlasEntityRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [showLegacyKinds, setShowLegacyKinds] = useState(false);

  // Selection + drafts
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, LocalPos>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Atlas Coverage — Needs Placement tab.
  const [tab, setTab] = useState<"review" | "needs" | "duplicates">("review");
  const [dupSearch, setDupSearch] = useState("");
  const [dupKind, setDupKind] = useState<AtlasEntityKind | "all">("all");
  const [needsRows, setNeedsRows] = useState<NeedsPlacementRow[] | null>(null);
  const [needsLoading, setNeedsLoading] = useState(false);
  const [needsError, setNeedsError] = useState<string | null>(null);
  const [needsSearch, setNeedsSearch] = useState("");
  const [needsType, setNeedsType] = useState<string>("all");
  const [placementId, setPlacementId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  // Stage
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapSize, setWrapSize] = useState({ w: 1, h: 1 });
  const [scale, setScale] = useState(0.06);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await listAllAtlasEntities()); }
    catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const reloadNeeds = useCallback(async () => {
    setNeedsLoading(true); setNeedsError(null);
    try { setNeedsRows(await listNeedsPlacement()); }
    catch (e: any) { setNeedsError(e.message ?? String(e)); }
    finally { setNeedsLoading(false); }
  }, []);
  useEffect(() => {
    if (tab === "needs" && needsRows == null) void reloadNeeds();
  }, [tab, needsRows, reloadNeeds]);

  const filteredNeeds = useMemo(() => {
    const q = needsSearch.trim().toLowerCase();
    return (needsRows ?? []).filter((r) => {
      if (!showLegacyKinds && !isLc1VisibleAtlasKind(r.kind)) return false;
      if (needsType !== "all" && r.kind !== needsType) return false;

      if (q && !`${r.title} ${r.slug}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [needsRows, needsSearch, needsType, showLegacyKinds]);


  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const update = () => setWrapSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    update();
    const ro = new ResizeObserver(update); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current || wrapSize.w < 10) return;
    didFit.current = true;
    const sx = wrapSize.w / RASTER.width;
    const sy = wrapSize.h / RASTER.height;
    const s = Math.min(sx, sy) * 0.96;
    setScale(s);
    setTx((wrapSize.w - RASTER.width * s) / 2);
    setTy((wrapSize.h - RASTER.height * s) / 2);
  }, [wrapSize]);

  // Batches available
  const batches = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const b = (r.metadata as any)?.import_batch as string | undefined;
      if (b) set.add(b);
    }
    return Array.from(set).sort();
  }, [rows]);

  // Working set (review filter)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      // Atlas is geographic-only. Hide legacy artifact/figure/event/route rows
      // by default so they never re-surface in normal review workflows.
      if (!showLegacyKinds && !isLc1VisibleAtlasKind(r.kind)) return false;
      if (showRemoved) {
        if (r.status !== "retired") return false;
      } else {
        if (r.status === "retired") return false;
        if (onlyUnverified) {
          if (r.aps_verified && r.status === "published") return false;
        }
      }
      if (kind !== "all" && r.kind !== kind) return false;
      if (era !== "all" && r.era !== era) return false;
      if (batch !== "all" && (r.metadata as any)?.import_batch !== batch) return false;
      if (q && !`${r.name_ar} ${r.name_en ?? ""} ${r.slug}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, kind, era, batch, onlyUnverified, showRemoved, showLegacyKinds]);

  // Duplicate detection — clusters across the geographic atlas dataset.
  const geoRows = useMemo(
    () => (showLegacyKinds ? rows : rows.filter((r) => isLc1VisibleAtlasKind(r.kind))),
    [rows, showLegacyKinds],
  );
  const duplicateGroups = useMemo(() => findAtlasDuplicateGroups(geoRows), [geoRows]);
  const filteredDupGroups = useMemo(() => {
    const q = normalizeArabic(dupSearch);
    return duplicateGroups.filter((g) => {
      if (dupKind !== "all" && !g.items.some((it) => it.kind === dupKind)) return false;
      if (q && !g.items.some((it) => normalizeArabic(`${it.name_ar} ${it.name_en ?? ""} ${it.slug}`).includes(q))) return false;
      return true;
    });
  }, [duplicateGroups, dupSearch, dupKind]);
  const duplicateItemCount = useMemo(
    () => duplicateGroups.reduce((sum, g) => sum + g.items.length, 0),
    [duplicateGroups],
  );
  // Per-kind counts across ALL duplicate groups — powers chip badges.
  const dupKindCounts = useMemo(() => {
    const counts: Partial<Record<AtlasEntityKind, number>> = {};
    for (const g of duplicateGroups) for (const it of g.items) {
      counts[it.kind] = (counts[it.kind] ?? 0) + 1;
    }
    return counts;
  }, [duplicateGroups]);
  const removedCount = useMemo(() => rows.filter((r) => r.status === "retired").length, [rows]);

  // When the review-tab search string matches a real duplicate cluster,
  // surface a compact warning so the admin can jump straight to cleanup.
  const searchDupWarning = useMemo(() => {
    const q = normalizeArabic(search);
    if (!q) return null;
    const hits = duplicateGroups.filter((g) =>
      g.items.some((it) => normalizeArabic(it.name_ar).includes(q)),
    );
    const total = hits.reduce((s, g) => s + g.items.length, 0);
    if (hits.length === 0 || total < 2) return null;
    return { groups: hits.length, total };
  }, [search, duplicateGroups]);


  // Drag handlers — convert client px → APS via current transform
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    start: { cx: number; cy: number; ax: number; ay: number };
    moved: boolean;
  } | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  const clientToAps = (cx: number, cy: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: (cx - rect.left - tx) / scale, y: (cy - rect.top - ty) / scale };
  };

  const onPinDown = (e: React.PointerEvent, r: AtlasEntityRow) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const cur = drafts[r.id] ?? { x: r.aps_x, y: r.aps_y };
    dragRef.current = {
      id: r.id, pointerId: e.pointerId,
      start: { cx: e.clientX, cy: e.clientY, ax: cur.x, ay: cur.y },
      moved: false,
    };
    setFocusedId(r.id);
  };
  const onPinMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d || d.pointerId !== e.pointerId) return;
    const dx = (e.clientX - d.start.cx) / scale;
    const dy = (e.clientY - d.start.cy) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) d.moved = true;
    const nx = Math.max(0, Math.min(RASTER.width - 1, Math.round(d.start.ax + dx)));
    const ny = Math.max(0, Math.min(RASTER.height - 1, Math.round(d.start.ay + dy)));
    setDrafts((p) => ({ ...p, [d.id]: { x: nx, y: ny } }));
  };
  const onPinUp = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const onStageDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.role !== "stage") return;
    wrapRef.current?.setPointerCapture(e.pointerId);
    panRef.current = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
  };
  const onStageMove = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.x;
    const dy = e.clientY - panRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) panRef.current.moved = true;
    setTx(panRef.current.tx + dx);
    setTy(panRef.current.ty + dy);
  };
  const onStageUp = (e: React.PointerEvent) => {
    const p = panRef.current;
    panRef.current = null;
    // Click-to-place: requires an active Needs Placement selection,
    // a non-drag click, and a tap that started on the stage layer.
    if (!p || p.moved) return;
    if (!placementId) return;
    const row = (needsRows ?? []).find((r) => r.id === placementId);
    if (!row) return;
    const aps = clientToAps(e.clientX, e.clientY);
    if (aps.x < 0 || aps.y < 0 || aps.x > RASTER.width || aps.y > RASTER.height) return;
    if (!confirm(`وضع "${row.title}" عند APS ${Math.round(aps.x)}, ${Math.round(aps.y)}؟`)) return;
    setPlacing(true);
    placeAtlasDraft({ atlasId: row.id, aps })
      .then((updated: AtlasEntityRow) => {
        setRows((rs) => {
          const exists = rs.some((r) => r.id === updated.id);
          return exists ? rs.map((r) => (r.id === updated.id ? updated : r)) : [updated, ...rs];
        });
        setNeedsRows((rs) => (rs ?? []).filter((r) => r.id !== row.id));
        setPlacementId(null);
        setFocusedId(updated.id);
      })

      .catch((err: any) => alert(`فشل التموضع: ${err.message ?? err}`))
      .finally(() => setPlacing(false));
  };


  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const step = Math.min(0.25, Math.abs(e.deltaY) * 0.0015);
      const factor = e.deltaY < 0 ? 1 + step : 1 / (1 + step);
      setScale((prev) => {
        const next = Math.max(0.01, Math.min(8, prev * factor));
        const k = next / prev;
        setTx((tx0) => sx - (sx - tx0) * k);
        setTy((ty0) => sy - (sy - ty0) * k);
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Mutations
  const flagSaving = (id: string, on: boolean) =>
    setSavingIds((p) => { const n = new Set(p); on ? n.add(id) : n.delete(id); return n; });

  const saveOne = async (id: string, opts?: { verify?: boolean; publish?: boolean; clearDraft?: boolean }) => {
    const row = rows.find((r) => r.id === id); if (!row) return;
    const draft = drafts[id];
    const patch: any = {};
    if (draft && (draft.x !== row.aps_x || draft.y !== row.aps_y)) {
      patch.aps_x = draft.x; patch.aps_y = draft.y;
    }
    if (opts?.verify) {
      const { data: ures } = await supabase.auth.getUser();
      patch.aps_verified = true;
      patch.aps_verified_by = ures.user?.id ?? null;
    }
    if (opts?.publish) patch.status = "published";
    if (Object.keys(patch).length === 0) return;
    flagSaving(id, true);
    try {
      const updated = await updateAtlasEntity(id, patch);
      setRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
      if (opts?.clearDraft !== false) setDrafts((p) => { const n = { ...p }; delete n[id]; return n; });
    } catch (e: any) {
      alert(`فشل الحفظ (${row.name_ar}): ${e.message ?? e}`);
    } finally {
      flagSaving(id, false);
    }
  };

  const saveAllDrafts = async () => {
    const ids = Object.keys(drafts);
    for (const id of ids) await saveOne(id);
  };

  const batchAction = async (action: "verify" | "publish" | "verify+publish" | "reset" | "hide") => {
    const ids = Array.from(selected);
    if (ids.length === 0) { alert("اختر عناصر أولاً"); return; }
    if (!confirm(`تطبيق "${action}" على ${ids.length} عنصر؟`)) return;
    for (const id of ids) {
      const row = rows.find((r) => r.id === id); if (!row) continue;
      try {
        if (action === "reset") {
          // recompute APS from lat/lon (TPS suggestion)
          if (row.lat == null || row.lon == null) continue;
          const aps = geoToAps(row.lon, row.lat);
          setDrafts((p) => ({ ...p, [id]: { x: Math.round(aps.x), y: Math.round(aps.y) } }));
          continue;
        }
        if (action === "hide") {
          const updated = await updateAtlasEntity(id, { status: "retired" });
          setRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
          continue;
        }
        const verify = action === "verify" || action === "verify+publish";
        const publish = action === "publish" || action === "verify+publish";
        await saveOne(id, { verify, publish });
      } catch (e: any) {
        alert(`فشل (${row.name_ar}): ${e.message ?? e}`);
      }
    }
    setSelected(new Set());
  };

  const toggleSelect = (id: string) =>
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAllVisible = () => setSelected(new Set(filtered.map((r) => r.id)));
  const clearSelection = () => setSelected(new Set());

  // Soft-remove an atlas marker only. Does NOT touch the linked
  // encyclopedia_entities row — the article and its content are preserved.
  // We flip status='retired'; player Atlas only exposes published+verified.
  const confirmRemoveFromAtlas = async () => {
    const row = removeTarget;
    if (!row) return;
    setRemoving(true);
    try {
      const updated = await updateAtlasEntity(row.id, { status: "retired" });
      setRows((rs) => rs.map((r) => (r.id === row.id ? updated : r)));
      setRemoveTarget(null);
      toast.success("أُزيل من الأطلس. محتوى الموسوعة لم يتغيّر.");
    } catch (e: any) {
      toast.error(`فشل الإزالة: ${e.message ?? e}`);
    } finally {
      setRemoving(false);
    }
  };

  // Duplicate cleanup: keep the picked atlas row visible and soft-remove
  // every other row in the same group. Never touches encyclopedia content.
  const [keepBusyGroup, setKeepBusyGroup] = useState<string | null>(null);
  const keepOnlyInGroup = async (group: AtlasDuplicateGroup, keepId: string) => {
    const others = group.items.filter((it) => it.id !== keepId && it.status !== "retired");
    if (others.length === 0) { toast.info("لا توجد نسخ إضافية لإزالتها."); return; }
    if (!confirm(`إبقاء عنصر واحد وإزالة ${others.length} من الأطلس؟ لن تتأثر الموسوعة.`)) return;
    setKeepBusyGroup(group.key);
    try {
      for (const it of others) {
        const updated = await updateAtlasEntity(it.id, { status: "retired" });
        setRows((rs) => rs.map((r) => (r.id === it.id ? updated : r)));
      }
      toast.success(`أُبقي عنصر واحد وأُزيل ${others.length} من الأطلس.`);
    } catch (e: any) {
      toast.error(`فشل الإزالة: ${e.message ?? e}`);
    } finally {
      setKeepBusyGroup(null);
    }
  };

  const dirtyCount = Object.keys(drafts).length;

  return (
    <div dir="rtl" className="fixed inset-0 flex flex-col bg-stone-950 text-stone-100">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-stone-800 bg-stone-900 px-3 py-2">
        <Link to="/admin" className="inline-flex items-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] hover:bg-stone-700">
          <ArrowRight className="size-3.5" /> الإدارة
        </Link>
        <h1 className="text-sm font-bold text-amber-100">مراجعة الأطلس الجماعية</h1>
        <span className="text-[11px] text-stone-400">
          {filtered.length} عنصر · {dirtyCount} تغيير غير محفوظ
        </span>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="rounded border border-stone-700 bg-stone-950 px-2 py-0.5 text-stone-300">
            الإجمالي: <b className="text-amber-100">{rows.length}</b>
          </span>
          <button
            onClick={() => setTab("duplicates")}
            className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200 hover:bg-amber-500/20"
            title="عرض التكرارات"
          >
            <Copy className="ml-1 inline size-3" />
            {duplicateGroups.length} مجموعة · {duplicateItemCount} عنصر مكرر
          </button>
          <span className="rounded border border-rose-900/60 bg-rose-950/30 px-2 py-0.5 text-rose-200">
            مُزال: <b>{removedCount}</b>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 text-[11px]">
          <button onClick={reload} className="inline-flex items-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1 hover:bg-stone-700">
            <RefreshCw className="size-3.5" /> تحديث
          </button>
          <button disabled={dirtyCount === 0} onClick={saveAllDrafts}
            className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1 font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-40">
            <Save className="size-3.5" /> حفظ كل المواقع ({dirtyCount})
          </button>
        </div>
      </header>

      {/* Batch action bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-800 bg-stone-900/70 px-3 py-2 text-[11px]">
        <span className="font-bold text-amber-200">المحدد: {selected.size}</span>
        <button onClick={selectAllVisible} className="rounded border border-stone-700 bg-stone-800 px-2 py-1 hover:bg-stone-700">تحديد الكل المرئي</button>
        <button onClick={clearSelection} className="rounded border border-stone-700 bg-stone-800 px-2 py-1 hover:bg-stone-700">إلغاء</button>
        <span className="mx-2 h-4 w-px bg-stone-700" />
        <button onClick={() => batchAction("verify")} className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 font-bold hover:bg-emerald-600"><ShieldCheck className="size-3.5" /> تأكيد</button>
        <button onClick={() => batchAction("publish")} className="inline-flex items-center gap-1 rounded bg-sky-700 px-2 py-1 font-bold hover:bg-sky-600"><Upload className="size-3.5" /> نشر</button>
        <button onClick={() => batchAction("verify+publish")} className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-1 font-bold text-stone-950 hover:bg-amber-500"><Check className="size-3.5" /> تأكيد ونشر</button>
        <button onClick={() => batchAction("reset")} className="inline-flex items-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1 hover:bg-stone-700"><RefreshCw className="size-3.5" /> إعادة لاقتراح TPS</button>
        <button onClick={() => batchAction("hide")} className="inline-flex items-center gap-1 rounded border border-rose-800 bg-rose-900/40 px-2 py-1 text-rose-200 hover:bg-rose-900/70"><EyeOff className="size-3.5" /> إخفاء</button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Side list */}
        <aside className="flex w-80 flex-col border-l border-stone-800 bg-stone-900/40">
          {/* Tab toggle: review pool ↔ needs placement pool. */}
          <div className="flex border-b border-stone-800 bg-stone-900/60 text-[11px] font-bold">
            <button
              onClick={() => setTab("review")}
              className={`flex-1 px-2 py-1.5 ${tab === "review" ? "bg-stone-800 text-amber-100" : "text-stone-400 hover:bg-stone-800/50"}`}
            >
              للمراجعة ({rows.length})
            </button>
            <button
              onClick={() => setTab("needs")}
              className={`flex-1 px-2 py-1.5 ${tab === "needs" ? "bg-stone-800 text-amber-100" : "text-stone-400 hover:bg-stone-800/50"}`}
            >
              تحتاج إلى تموضع{needsRows ? ` (${needsRows.length})` : ""}
            </button>
            <button
              onClick={() => setTab("duplicates")}
              className={`flex-1 px-2 py-1.5 ${tab === "duplicates" ? "bg-stone-800 text-amber-100" : "text-stone-400 hover:bg-stone-800/50"}`}
            >
              التكرارات ({duplicateGroups.length})
            </button>
          </div>


          {tab === "review" && (
            <>
              {/* Filters */}
              <div className="space-y-2 border-b border-stone-800 p-2">
                <div className="flex items-center gap-2 rounded border border-stone-700 bg-stone-950 px-2 py-1.5">
                  <Search className="size-3.5 opacity-60" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث بالاسم أو slug..."
                    className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
                </div>
                {searchDupWarning && (
                  <button
                    onClick={() => { setDupSearch(search); setTab("duplicates"); }}
                    className="flex w-full items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-right text-[11px] font-bold text-amber-200 hover:bg-amber-500/20"
                  >
                    <Copy className="size-3.5" />
                    تم العثور على {searchDupWarning.total} عناصر متشابهة — راجع التكرارات
                  </button>
                )}
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <select value={kind} onChange={(e) => setKind(e.target.value as any)}
                    className="rounded border border-stone-700 bg-stone-950 px-2 py-1">
                    <option value="all">كل الأنواع</option>
                    {ATLAS_KIND_ORDER.map((k) => (
                      <option key={k} value={k}>{KIND_LABEL_AR[k]}</option>
                    ))}
                  </select>
                  <select value={era} onChange={(e) => setEra(e.target.value)}
                    className="rounded border border-stone-700 bg-stone-950 px-2 py-1">
                    <option value="all">كل العصور</option>
                    {ERAS.map((er) => <option key={er.id} value={er.id}>{er.name}</option>)}
                  </select>
                  <select value={batch} onChange={(e) => setBatch(e.target.value)}
                    className="col-span-2 rounded border border-stone-700 bg-stone-950 px-2 py-1">
                    <option value="all">كل دفعات الاستيراد</option>
                    {batches.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <label className="col-span-2 flex items-center gap-2 rounded border border-stone-700 bg-stone-950 px-2 py-1">
                    <input type="checkbox" checked={onlyUnverified} disabled={showRemoved}
                      onChange={(e) => setOnlyUnverified(e.target.checked)} />
                    <span className={showRemoved ? "opacity-50" : ""}>غير مؤكّد فقط</span>
                  </label>
                  <label className="col-span-2 flex items-center gap-2 rounded border border-rose-900/60 bg-rose-950/30 px-2 py-1 text-rose-200">
                    <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
                    <span>عرض المُزال من الأطلس فقط</span>
                  </label>
                  <label className="col-span-2 flex items-center gap-2 rounded border border-stone-700 bg-stone-950 px-2 py-1 text-stone-300">
                    <input type="checkbox" checked={showLegacyKinds} onChange={(e) => setShowLegacyKinds(e.target.checked)} />
                    <span>إظهار أنواع قديمة (آثار/شخصيات/أحداث)</span>
                  </label>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading && <div className="p-3 text-[12px] text-stone-400">جاري التحميل…</div>}
                {error && <div className="p-3 text-[12px] text-rose-300">{error}</div>}
                {!loading && filtered.length === 0 && (
                  <div className="p-3 text-[12px] text-stone-400">لا توجد عناصر مطابقة.</div>
                )}
                <ul className="divide-y divide-stone-800/80">
                  {filtered.map((r) => {
                    const dirty = !!drafts[r.id] && (drafts[r.id].x !== r.aps_x || drafts[r.id].y !== r.aps_y);
                    const isSel = selected.has(r.id);
                    const cur = drafts[r.id] ?? { x: r.aps_x, y: r.aps_y };
                    return (
                      <li key={r.id} className={`flex items-start gap-2 p-2 text-[12px] ${focusedId === r.id ? "bg-amber-500/10" : ""}`}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleSelect(r.id)} className="mt-1" />
                        <button onClick={() => { setFocusedId(r.id); centerOn(r, cur, scale, wrapSize, setTx, setTy); }}
                          className="min-w-0 flex-1 text-right">
                          <div className="truncate font-bold text-amber-100">{r.name_ar}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-stone-400">
                            <span>{KIND_LABEL_AR[r.kind]}</span>
                            <span>· {eraLabel(r.era)}</span>
                            <span>· APS {Math.round(cur.x)},{Math.round(cur.y)}</span>
                            {dirty && <span className="text-amber-300">· غُيِّر</span>}
                            <span>· {STATUS_LABEL_AR[r.status]}</span>
                            {r.aps_verified && <span className="text-emerald-300">· مؤكّد</span>}
                            {r.encyclopedia_entity_id
                              ? <span className="text-sky-300">· موسوعة ✓</span>
                              : <span className="text-stone-500">· بلا موسوعة</span>}
                          </div>
                        </button>
                        <div className="flex flex-col items-stretch gap-1">
                          <button disabled={!dirty || savingIds.has(r.id)} onClick={() => saveOne(r.id)}
                            title="حفظ هذا العنصر"
                            className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-30">
                            حفظ
                          </button>
                          {r.status !== "retired" && (
                            <button onClick={() => setRemoveTarget(r)}
                              title="إزالة من الأطلس فقط (لن تُحذف الموسوعة)"
                              className="inline-flex items-center justify-center gap-1 rounded border border-rose-700 bg-rose-900/50 px-1.5 py-0.5 text-[10px] font-bold text-rose-100 hover:bg-rose-800">
                              <Trash2 className="size-3" />
                              إزالة
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          {tab === "needs" && (
            <>
              {/* Needs Placement filters + instructions */}
              <div className="space-y-2 border-b border-stone-800 p-2">
                <p className="text-[11px] leading-relaxed text-stone-400">
                  كيانات الموسوعة المؤهلة دون موقع على الأطلس. اختر "ضع هنا" ثم انقر على الخريطة لتثبيت الموقع.
                </p>
                <div className="flex items-center gap-2 rounded border border-stone-700 bg-stone-950 px-2 py-1.5">
                  <Search className="size-3.5 opacity-60" />
                  <input value={needsSearch} onChange={(e) => setNeedsSearch(e.target.value)}
                    placeholder="بحث في عناصر بحاجة لتموضع..."
                    className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <select value={needsType} onChange={(e) => setNeedsType(e.target.value)}
                    className="flex-1 rounded border border-stone-700 bg-stone-950 px-2 py-1">
                    <option value="all">كل الأنواع</option>
                    {ATLAS_KIND_ORDER.map((k) => (
                      <option key={k} value={k}>{KIND_LABEL_AR[k]}</option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      try {
                        const { inserted } = await ensureAtlasDraftsForEncyclopedia();
                        alert(`تم إنشاء ${inserted} مسودة جديدة.`);
                        await reloadNeeds();
                        await reload();
                      } catch (e: any) {
                        alert(`فشل إنشاء المسودات: ${e.message ?? e}`);
                      }
                    }}
                    title="إنشاء مسودات للموسوعة"
                    className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-200 hover:bg-amber-500/20"
                  >
                    توليد مسودات
                  </button>
                  <button onClick={reloadNeeds} className="inline-flex items-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1 hover:bg-stone-700">
                    <RefreshCw className="size-3.5" />
                  </button>
                </div>

                {placementId && (
                  <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold">
                        وضع: {(needsRows ?? []).find((r) => r.id === placementId)?.title ?? "?"}
                      </span>
                      <button onClick={() => setPlacementId(null)} className="rounded bg-stone-800 px-2 py-0.5 text-[10px] hover:bg-stone-700">
                        إلغاء
                      </button>
                    </div>
                    <div className="mt-1 text-amber-200/70">انقر على الخريطة لتثبيت الموقع.</div>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {needsLoading && <div className="p-3 text-[12px] text-stone-400">جاري التحميل…</div>}
                {needsError && <div className="p-3 text-[12px] text-rose-300">{needsError}</div>}
                {!needsLoading && needsRows && filteredNeeds.length === 0 && (
                  <div className="p-3 text-[12px] text-stone-400">لا توجد عناصر بحاجة لتموضع.</div>
                )}
                <ul className="divide-y divide-stone-800/80">
                  {filteredNeeds.map((r) => {
                    const isPlacing = placementId === r.id;
                    return (
                      <li key={r.id} className={`flex items-start gap-2 p-2 text-[12px] ${isPlacing ? "bg-amber-500/10" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold text-amber-100">{r.title}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-stone-400">
                            <span>{r.kind_label}</span>
                            <span className="truncate">· {r.slug}</span>
                          </div>
                        </div>
                        <button
                          disabled={placing}
                          onClick={() => setPlacementId(isPlacing ? null : r.id)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold ${
                            isPlacing
                              ? "bg-amber-500 text-stone-950 hover:bg-amber-400"
                              : "border border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                          }`}
                        >
                          <MapPin className="size-3" />
                          {isPlacing ? "اختر موقع…" : "ضع هنا"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          {tab === "duplicates" && (
            <>
              <div className="space-y-2 border-b border-stone-800 p-2">
                <p className="text-[11px] leading-relaxed text-stone-400">
                  مجموعات محتملة من التكرارات على الأطلس. الإجراءات هنا لا تعدّل الموسوعة.
                </p>
                <div className="flex items-center gap-2 rounded border border-stone-700 bg-stone-950 px-2 py-1.5">
                  <Search className="size-3.5 opacity-60" />
                  <input
                    value={dupSearch}
                    onChange={(e) => setDupSearch(e.target.value)}
                    placeholder="بحث داخل التكرارات..."
                    className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-1 text-[10px] text-stone-400">
                  <span className="rounded border border-stone-700 bg-stone-950 px-1.5 py-0.5">مجموعات: <b className="text-amber-100">{duplicateGroups.length}</b></span>
                  <span className="rounded border border-stone-700 bg-stone-950 px-1.5 py-0.5">عناصر مكررة: <b className="text-amber-100">{duplicateItemCount}</b></span>
                  <span className="rounded border border-stone-700 bg-stone-950 px-1.5 py-0.5">مُزال: <b className="text-rose-200">{removedCount}</b></span>
                </div>
                <div className="flex flex-wrap gap-1" dir="rtl">
                  {DUP_KIND_FILTERS.map((f) => {
                    const active = dupKind === f.value;
                    const count = f.value === "all" ? duplicateItemCount : (dupKindCounts[f.value] ?? 0);
                    return (
                      <button
                        key={f.value}
                        onClick={() => setDupKind(f.value)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition ${
                          active
                            ? "border-amber-500/60 bg-amber-500/20 text-amber-100"
                            : "border-stone-700 bg-stone-950 text-stone-300 hover:bg-stone-900"
                        }`}
                      >
                        <span>{f.label}</span>
                        <span className={`rounded px-1 text-[9px] ${active ? "bg-amber-500/30 text-amber-50" : "bg-stone-800 text-stone-400"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredDupGroups.length === 0 && (
                  <div className="p-3 text-[12px] text-stone-400">لا توجد تكرارات مطابقة.</div>
                )}
                <ul className="divide-y divide-stone-800/80">
                  {filteredDupGroups.map((g) => (
                    <li key={g.key} className="p-2">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="truncate text-[12px] font-bold text-amber-100">{g.label}</span>
                        <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-300">{g.items.length}</span>
                        <div className="ml-auto flex flex-wrap gap-1 text-[9px]">
                          {g.reasons.map((r) => (
                            <span key={r} className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-200">
                              {DUP_REASON_AR[r]}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ul className="space-y-1">
                        {g.items.map((it) => (
                          <li key={it.id} className={`rounded border p-1.5 text-[11px] ${it.status === "retired" ? "border-rose-900/50 bg-rose-950/20 opacity-70" : "border-stone-700 bg-stone-950"} ${dupKind !== "all" && it.kind !== dupKind ? "opacity-50" : ""}`}>
                            <div className="flex items-start gap-1.5">
                              <button
                                onClick={() => { setFocusedId(it.id); setTab("review"); if (it.aps_x != null && it.aps_y != null) centerOn(it, { x: it.aps_x, y: it.aps_y }, scale, wrapSize, setTx, setTy); }}
                                className="min-w-0 flex-1 text-right"
                                title="عرض على الخريطة"
                              >
                                <div className="truncate font-bold text-amber-100">{it.name_ar}</div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-stone-400">
                                  <span>{KIND_LABEL_AR[it.kind]}</span>
                                  <span>· {eraLabel(it.era)}</span>
                                  {it.aps_x != null && it.aps_y != null && (
                                    <span>· APS {Math.round(it.aps_x)},{Math.round(it.aps_y)}</span>
                                  )}
                                  <span>· {STATUS_LABEL_AR[it.status]}</span>
                                  {it.aps_verified && <span className="text-emerald-300">· مؤكّد</span>}
                                  {it.encyclopedia_entity_id
                                    ? <span className="text-sky-300">· موسوعة ✓</span>
                                    : <span className="text-stone-500">· بلا موسوعة</span>}
                                  {(it.metadata as any)?.import_batch && (
                                    <span>· {(it.metadata as any).import_batch}</span>
                                  )}
                                </div>
                              </button>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1">
                              <button
                                disabled={keepBusyGroup === g.key || it.status === "retired"}
                                onClick={() => keepOnlyInGroup(g, it.id)}
                                title="إبقاء هذا وإزالة البقية من الأطلس"
                                className="inline-flex items-center gap-1 rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
                              >
                                <Star className="size-3" />
                                إبقاء هذا
                              </button>
                              <a
                                href={`/admin/atlas-entities?focus=${it.id}`}
                                target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded border border-stone-700 bg-stone-800 px-1.5 py-0.5 text-[10px] hover:bg-stone-700"
                                title="فتح عنصر الأطلس"
                              >
                                <ExternalLink className="size-3" />
                                الأطلس
                              </a>
                              {it.encyclopedia_entity_id && (
                                <a
                                  href={`/encyclopedia/entity/${it.encyclopedia_entity_id}`}
                                  target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded border border-sky-800 bg-sky-950/40 px-1.5 py-0.5 text-[10px] text-sky-200 hover:bg-sky-950/70"
                                  title="فتح صفحة الموسوعة"
                                >
                                  <BookOpen className="size-3" />
                                  الموسوعة
                                </a>
                              )}
                              {it.status !== "retired" && (
                                <button
                                  onClick={() => setRemoveTarget(it)}
                                  title="إزالة من الأطلس فقط"
                                  className="inline-flex items-center gap-1 rounded border border-rose-700 bg-rose-900/50 px-1.5 py-0.5 text-[10px] font-bold text-rose-100 hover:bg-rose-800"
                                >
                                  <PinOff className="size-3" />
                                  إزالة
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </aside>



        {/* Stage */}
        <main
          ref={wrapRef}
          className="relative flex-1 overflow-hidden bg-stone-900"
          style={{ touchAction: "none" }}
          onPointerDown={onStageDown}
          onPointerMove={(e) => { onStageMove(e); onPinMove(e); }}
          onPointerUp={(e) => { onStageUp(e); onPinUp(e); }}
        >
          <div
            data-role="stage"
            style={{
              position: "absolute", left: 0, top: 0,
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transformOrigin: "0 0",
              width: RASTER.width, height: RASTER.height,
              cursor: "grab",
            }}
          >
            <img data-role="stage" src={ATLAS_BASE_URL}
              width={RASTER.width} height={RASTER.height} draggable={false}
              alt="" style={{ display: "block", userSelect: "none" }} />
            {filtered.map((r) => {
              if (r.aps_x == null || r.aps_y == null) return null;
              const pos = drafts[r.id] ?? { x: r.aps_x, y: r.aps_y };

              const focused = focusedId === r.id;
              const isSel = selected.has(r.id);
              const dirty = !!drafts[r.id] && (drafts[r.id].x !== r.aps_x || drafts[r.id].y !== r.aps_y);
              const color = dirty ? "#f59e0b" : r.aps_verified ? "#10b981" : "#f43f5e";
              return (
                <div key={r.id} style={{ position: "absolute", left: pos.x, top: pos.y, pointerEvents: "auto" }}>
                  <div
                    onPointerDown={(e) => onPinDown(e, r)}
                    onClick={(e) => { e.stopPropagation(); setFocusedId(r.id); }}
                    style={{
                      position: "absolute",
                      transform: `translate(-50%, -50%) scale(${1 / scale})`,
                      cursor: "grab",
                    }}
                  >
                    <div style={{
                      width: focused ? 22 : 16, height: focused ? 22 : 16,
                      borderRadius: "50%", background: color,
                      border: `${isSel ? 3 : 2}px solid ${isSel ? "#fbbf24" : "#fff"}`,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.7)",
                    }} />
                    {focused && (
                      <div style={{
                        position: "absolute", top: -28, left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(15,23,42,0.92)", color: "#fde68a",
                        padding: "2px 6px", borderRadius: 4, fontSize: 11,
                        fontWeight: 700, whiteSpace: "nowrap", border: "1px solid #92400e",
                      }}>{r.name_ar}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-stone-950/85 px-2 py-1 font-mono text-[11px] text-amber-200">
            مقياس {(scale * 100).toFixed(0)}% · اسحب الدبّوس لتعديل APS
          </div>
        </main>
      </div>

      {removeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !removing && setRemoveTarget(null)}
        >
          <div
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-rose-800/60 bg-stone-900 p-5 shadow-2xl"
          >
            <div className="mb-2 flex items-center gap-2 text-rose-200">
              <Trash2 className="size-5" />
              <h2 className="font-display text-base font-bold">إزالة هذا العنصر من الأطلس؟</h2>
            </div>
            <p className="text-[13px] leading-7 text-stone-300">
              سيُزال العنصر من الخريطة فقط. لن يتم حذف أو تعديل صفحة الموسوعة المرتبطة.
            </p>
            <div className="mt-2 rounded border border-stone-700 bg-stone-950 p-2 text-[12px]">
              <div className="truncate font-bold text-amber-100">{removeTarget.name_ar}</div>
              <div className="text-[10px] text-stone-400">
                {KIND_LABEL_AR[removeTarget.kind]} · {removeTarget.slug}
                {removeTarget.encyclopedia_entity_id && (
                  <span className="text-sky-300"> · الموسوعة محفوظة</span>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                disabled={removing}
                onClick={() => setRemoveTarget(null)}
                className="rounded border border-stone-700 bg-stone-800 px-3 py-1.5 text-[12px] hover:bg-stone-700 disabled:opacity-40"
              >
                إلغاء
              </button>
              <button
                disabled={removing}
                onClick={confirmRemoveFromAtlas}
                className="inline-flex items-center gap-1 rounded bg-rose-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-rose-500 disabled:opacity-40"
              >
                <Trash2 className="size-3.5" />
                {removing ? "جاري الإزالة…" : "إزالة من الأطلس"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function centerOn(
  r: AtlasEntityRow,
  pos: LocalPos,
  scale: number,
  wrap: { w: number; h: number },
  setTx: (n: number) => void,
  setTy: (n: number) => void,
) {
  setTx(wrap.w / 2 - pos.x * scale);
  setTy(wrap.h / 2 - pos.y * scale);
}
