// ============================================================
// Admin Campaign Ordering Workshop — /admin/campaign-order
// ------------------------------------------------------------
// Controls the exact order in which campaigns appear to players.
// Storage: persists `chronological_order` and `order_status`
// inside the existing `admin_campaigns.data` JSONB blob (no
// schema change required). Player-facing reads already prefer
// `chronological_order` via campaignSortKey() and the offline
// snapshot serializes the same `data` payload, so saved order
// flows to every surface (Campaigns hub, Profile, offline mode).
//
// Order_status values:
//   - "manual": admin-curated, untouched by auto passes
//   - "auto":   derived from era/year backfill
//   - "review": no era and no year — needs admin attention
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Sword, RefreshCw, Save, Wand2, GripVertical, ArrowUp, ArrowDown,
  AlertTriangle, CheckCircle2, X, ChevronRight, FileJson, FileSpreadsheet,
  ScrollText, Plus, Trash2, Pencil,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { parseHistoricalPeriodYear } from "@/lib/campaignChronology";
import { withBackfilledChronology } from "@/lib/campaignChronologyBackfill";
import { inferWorldFromMetadata } from "@/lib/contentIntegrity";
import { isDividerData } from "@/lib/campaignDividers";

export const Route = createFileRoute("/admin/campaign-order")({
  head: () => ({
    meta: [
      { title: "ترتيب الحملات — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><CampaignOrderPage /></AdminGate>,
});

// ---------- Types ----------

type Status = "draft" | "published" | "archived";
type OrderStatus = "manual" | "auto" | "review";

interface Row {
  id: string;
  slug: string | null;
  title: string;
  status: Status;
  data: any;
  createdAt: string | null;
  updatedAt: string | null;
  // Derived
  era: string;
  worldSlug: string;
  period: string;
  chapters: number;
  currentOrder: number | null;
  orderStatus: OrderStatus;
  /** True when this row is an era divider, not a playable campaign. */
  isDivider: boolean;
  /** Optional subtitle (dividers only). */
  subtitle?: string;
}

const ERA_LABELS: Record<string, string> = {
  prophetic: "السيرة النبوية",
  rashidun: "الخلافة الراشدة",
  umayyad: "الدولة الأموية",
  andalus: "الأندلس",
  abbasid: "الدولة العباسية",
  fatimid: "الدولة الفاطمية",
  seljuk: "السلاجقة",
  crusades: "الحروب الصليبية",
  zengid: "الزنكيون",
  ayyubid: "الأيوبيون",
  mongols: "المغول",
  mamluk: "المماليك",
  ottoman: "الدولة العثمانية",
  modern: "الحقبة المعاصرة",
  "": "— غير محدد —",
};

function chapterCount(d: any): number {
  return Array.isArray(d?.chapters) ? d.chapters.length : 0;
}

function pickNumber(...vals: any[]): number | null {
  for (const v of vals) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return null;
}

function deriveOrderStatus(d: any, era: string): OrderStatus {
  if (d?.order_status === "manual") return "manual";
  if (d?.order_status === "auto") return "auto";
  if (typeof d?.chronological_order === "number") return "manual";
  const parsed = parseHistoricalPeriodYear(d?.historicalPeriod ?? d?.period);
  if (!era && typeof d?.sort_year !== "number" && parsed == null) return "review";
  return "auto";
}

function toRow(c: any): Row {
  const d = c.data ?? {};
  if (isDividerData(d)) {
    return {
      id: c.id,
      slug: c.slug ?? null,
      title: String(d.title ?? c.title ?? "عصر جديد"),
      status: (c.status ?? "published") as Status,
      data: d,
      createdAt: c.created_at ?? null,
      updatedAt: c.updated_at ?? null,
      era: String(d.era ?? ""),
      worldSlug: "",
      period: "",
      chapters: 0,
      currentOrder: pickNumber(d.chronological_order),
      orderStatus: "manual",
      isDivider: true,
      subtitle: typeof d.subtitle === "string" ? d.subtitle : undefined,
    };
  }
  const inferred = inferWorldFromMetadata({
    title: c.title,
    subtitle: d.subtitle,
    historicalPeriod: d.historicalPeriod ?? d.period,
    tags: d.tags,
    category: d.category,
    description: d.description,
    worldSlug: d.worldSlug,
    era: d.era,
  });
  const era = String(d.era ?? inferred?.era ?? "");
  return {
    id: c.id,
    slug: c.slug,
    title: c.title ?? "",
    status: c.status,
    data: d,
    createdAt: c.created_at ?? null,
    updatedAt: c.updated_at ?? null,
    era,
    worldSlug: String(d.worldSlug ?? inferred?.worldSlug ?? ""),
    period: String(d.historicalPeriod ?? d.period ?? ""),
    chapters: chapterCount(d),
    currentOrder: pickNumber(d.chronological_order, d.chronologicalOrder),
    orderStatus: deriveOrderStatus(d, era),
    isDivider: false,
  };
}

// Sort by backfilled chronology (era base + year offset) so the initial
// view already approximates the historical timeline.
function initialSort(rows: Row[]): Row[] {
  const keyed = rows.map((r) => {
    const c: any = {
      chronological_order: r.currentOrder ?? undefined,
      sort_year: pickNumber(r.data?.sort_year, r.data?.sortYear) ?? undefined,
      historicalPeriod: r.period,
      era: r.era || undefined,
      worldSlug: r.worldSlug || undefined,
    };
    const bf = withBackfilledChronology(c);
    return { r, key: typeof bf.chronological_order === "number" ? bf.chronological_order : Number.POSITIVE_INFINITY };
  });
  keyed.sort((a, b) => {
    if (a.key !== b.key) return a.key - b.key;
    return a.r.title.localeCompare(b.r.title, "ar");
  });
  return keyed.map((k) => k.r);
}

// ---------- Page ----------

interface Toast { kind: "ok" | "err"; msg: string }

function CampaignOrderPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [filter, setFilter] = useState<"all" | "published" | "draft" | "review">("all");
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_campaigns" as any)
      .select("id, slug, title, status, data, created_at, updated_at")
      .limit(2000);
    if (error) { setErr(error.message); setLoading(false); return; }
    const list = ((data ?? []) as any[]).map(toRow);
    setRows(initialSort(list));
    setDirtyIds(new Set());
    setErr(null);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "review") return rows.filter((r) => r.orderStatus === "review");
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const markDirty = (ids: string[]) => {
    setDirtyIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  // ---- Reorder helpers ----
  //
  // Campaigns and section dividers are DIFFERENT entity types, so they move
  // differently:
  //   • a campaign moves as a single row (it may cross into another section,
  //     which is an explicit re-sectioning by the admin);
  //   • a divider moves as a whole SECTION BLOCK — the divider plus every
  //     campaign that belongs to it, up to the next divider.

  /** Rows [start, end) that form the section block owned by `idx` (a divider). */
  const blockRange = (list: Row[], idx: number): [number, number] => {
    let end = idx + 1;
    while (end < list.length && !list[end].isDivider) end += 1;
    return [idx, end];
  };

  /** Move a row (or its whole block, for dividers) so it starts at `insertAt`. */
  const reorderRows = (prev: Row[], fromIdx: number, insertAt: number): Row[] => {
    if (fromIdx < 0) return prev;
    const src = prev[fromIdx];
    const [s, e] = src.isDivider ? blockRange(prev, fromIdx) : [fromIdx, fromIdx + 1];
    const block = prev.slice(s, e);
    const without = [...prev.slice(0, s), ...prev.slice(e)];
    const target = Math.max(0, Math.min(without.length, insertAt > s ? insertAt - block.length : insertAt));
    return [...without.slice(0, target), ...block, ...without.slice(target)];
  };

  const applyReorder = (fromIdx: number, insertAt: number) => {
    setRows((prev) => {
      const next = reorderRows(prev, fromIdx, insertAt);
      if (next === prev) return prev;
      markDirty(next.map((r) => r.id));
      return next;
    });
  };

  const moveBy = (id: string, delta: number) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx < 0) return prev;
      const row = prev[idx];
      let insertAt: number;
      if (row.isDivider) {
        const [s, e] = blockRange(prev, idx);
        if (delta < 0) {
          // Hop above the previous block (or previous row when uncategorized).
          let p = s - 1;
          while (p > 0 && !prev[p].isDivider) p -= 1;
          insertAt = Math.max(0, p);
        } else {
          // Hop past the next whole block.
          let n = e;
          if (n < prev.length && prev[n].isDivider) {
            const [, ne] = blockRange(prev, n);
            n = ne;
          } else {
            n = Math.min(prev.length, e + 1);
          }
          insertAt = n;
        }
      } else {
        insertAt = Math.max(0, Math.min(prev.length, idx + delta + (delta > 0 ? 1 : 0)));
      }
      const next = reorderRows(prev, idx, insertAt);
      if (next === prev) return prev;
      markDirty(next.map((r) => r.id));
      return next;
    });
  };

  const moveRelative = (id: string, anchorId: string, position: "before" | "after") => {
    if (id === anchorId) return;
    setRows((prev) => {
      const from = prev.findIndex((r) => r.id === id);
      const aIdx = prev.findIndex((r) => r.id === anchorId);
      if (from < 0 || aIdx < 0) return prev;
      let insertAt = position === "before" ? aIdx : aIdx + 1;
      // Anchor is a divider and we drop "after" it → the row joins that
      // section (right below the divider), never the next section.
      if (prev[aIdx].isDivider && position === "after" && !prev[from].isDivider) {
        insertAt = aIdx + 1;
      }
      const next = reorderRows(prev, from, insertAt);
      if (next === prev) return prev;
      markDirty(next.map((r) => r.id));
      return next;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const dragged = prev[oldIndex];
      let insertAt = newIndex > oldIndex ? newIndex + 1 : newIndex;
      // Dropping a campaign onto a divider means "put me inside that
      // section", i.e. directly below the divider.
      if (!dragged.isDivider && prev[newIndex].isDivider) insertAt = newIndex + 1;
      const next = reorderRows(prev, oldIndex, insertAt);
      if (next === prev) return prev;
      markDirty(next.map((r) => r.id));
      return next;
    });
  };

  // ---- Export ----

  // Build a flat snapshot of EVERY campaign in the exact order currently
  // displayed (and persisted via Save). Position is 1-based — the same
  // sequence the player app sees through campaignSortKey().
  const buildExportRecords = () => {
    return rows.map((r, i) => {
      const d = r.data ?? {};
      return {
        chronological_order: typeof r.currentOrder === "number" ? r.currentOrder : (i + 1) * 10,
        display_position: i + 1,
        title: r.title,
        slug: r.slug ?? "",
        era: r.era ?? "",
        era_label: ERA_LABELS[r.era] ?? "",
        world: r.worldSlug ?? "",
        period: r.period ?? "",
        sort_year: pickNumber(d.sort_year, d.sortYear) ?? null,
        start_year: pickNumber(d.start_year, d.startYear) ?? null,
        end_year: pickNumber(d.end_year, d.endYear) ?? null,
        order_status: r.orderStatus,
        published: r.status === "published",
        status: r.status,
        chapter_count: r.chapters,
        order_updated_at: d.order_updated_at ?? null,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        id: r.id,
      };
    });
  };

  const downloadFile = (filename: string, mime: string, body: string) => {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const today = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const exportJson = () => {
    const records = buildExportRecords();
    const payload = {
      generated_at: new Date().toISOString(),
      total_campaigns: records.length,
      campaigns: records,
    };
    downloadFile(
      `irth-campaign-order-${today()}.json`,
      "application/json;charset=utf-8",
      JSON.stringify(payload, null, 2),
    );
    notify("ok", `تم تصدير ${records.length} حملة (JSON).`);
  };

  const exportCsv = () => {
    const records = buildExportRecords();
    if (records.length === 0) { notify("err", "لا توجد حملات للتصدير."); return; }
    const headers = Object.keys(records[0]);
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "string" ? v : String(v);
      // RFC 4180: wrap in quotes if contains comma, quote, newline; double inner quotes.
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(",")];
    for (const r of records) {
      lines.push(headers.map((h) => escape((r as any)[h])).join(","));
    }
    // BOM so Excel opens UTF-8 Arabic correctly.
    downloadFile(
      `irth-campaign-order-${today()}.csv`,
      "text/csv;charset=utf-8",
      "\ufeff" + lines.join("\r\n"),
    );
    notify("ok", `تم تصدير ${records.length} حملة (CSV).`);
  };

  // ---- Auto-order ----

  const applyAutoOrder = () => {
    const ok = typeof window !== "undefined"
      ? window.confirm("سيتم إعادة بناء الترتيب الزمني لكل الحملات وفق الخوارزمية التاريخية. هذا الإجراء سيتجاوز الترتيب اليدوي. هل تريد المتابعة؟")
      : true;
    if (!ok) return;
    setRows((prev) => {
      const next = initialSort(prev);
      // Explicit rebuild: every row becomes "auto" — that is what the
      // admin asked for. Manual order is overwritten only here.
      const updated = next.map((r) => ({ ...r, orderStatus: "auto" as OrderStatus }));
      markDirty(updated.map((r) => r.id));
      return updated;
    });
    notify("ok", "تم إعادة بناء الترتيب الزمني. اضغط حفظ لتثبيته.");
  };

  // ---- Divider CRUD ----
  //
  // Dividers are stored as `admin_campaigns` rows where `data.kind === "divider"`.
  // They participate in chronological ordering exactly like campaigns; the player
  // app treats them purely as section headers. We never auto-create them from
  // imports — the admin must add them explicitly here.

  const promptText = (label: string, initial = ""): string | null => {
    if (typeof window === "undefined") return null;
    const v = window.prompt(label, initial);
    if (v == null) return null;
    const t = v.trim();
    return t.length ? t : null;
  };

  const createDivider = async () => {
    const title = promptText("عنوان الفاصل (مثال: العصر النبوي)");
    if (!title) return;
    const subtitle = promptText("نص فرعي اختياري", "") ?? "";
    const id = `div_${Date.now().toString(36)}`;
    const data: any = {
      kind: "divider",
      title,
      subtitle: subtitle || undefined,
      chronological_order: 0,
      order_status: "manual",
      order_updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("admin_campaigns" as any)
      .insert({ id, slug: id, title, status: "published", data });
    if (error) { notify("err", `تعذّر إنشاء الفاصل: ${error.message}`); return; }
    notify("ok", "تم إنشاء الفاصل. اسحبه إلى موقعه المناسب ثم احفظ.");
    await refresh();
  };

  const renameDivider = async (row: Row) => {
    const title = promptText("عنوان الفاصل", row.title);
    if (!title) return;
    const subtitle = promptText("نص فرعي اختياري", row.subtitle ?? "") ?? "";
    const nextData = {
      ...(row.data ?? {}),
      kind: "divider",
      title,
      subtitle: subtitle || undefined,
    };
    const { error } = await supabase
      .from("admin_campaigns" as any)
      .update({ title, data: nextData, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) { notify("err", `تعذّر التعديل: ${error.message}`); return; }
    notify("ok", "تم تعديل الفاصل.");
    await refresh();
  };

  const deleteDivider = async (row: Row) => {
    const ok = typeof window !== "undefined"
      ? window.confirm(`حذف الفاصل "${row.title}"؟ لن تُحذف أي حملة.`)
      : true;
    if (!ok) return;
    const { error } = await supabase.from("admin_campaigns" as any).delete().eq("id", row.id);
    if (error) { notify("err", `تعذّر الحذف: ${error.message}`); return; }
    notify("ok", "تم حذف الفاصل.");
    await refresh();
  };


  // ---- Save ----

  const save = async () => {
    if (saving) return;
    if (dirtyIds.size === 0) { notify("ok", "لا توجد تغييرات للحفظ."); return; }
    setSaving(true);
    const ts = new Date().toISOString();
    const errs: string[] = [];
    // Assign sequential chronological_order to every row in current display order.
    // Step of 10 leaves room for future inserts.
    let saved = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!dirtyIds.has(r.id)) continue;
      const newOrder = (i + 1) * 10;
      // Any row touched by a drag / move action is, by definition, the
      // admin's manual decision and must be preserved on future imports.
      // Auto-rebuild paths set orderStatus to "auto" explicitly before
      // marking dirty, so those rows stay "auto" here.
      const nextStatus: OrderStatus = r.orderStatus === "review"
        ? "review"
        : r.orderStatus === "auto" ? "auto" : "manual";
      const nextData = {
        ...(r.data ?? {}),
        chronological_order: newOrder,
        order_status: nextStatus,
        order_updated_at: ts,
      };
      const { error } = await supabase
        .from("admin_campaigns" as any)
        .update({ data: nextData, updated_at: ts })
        .eq("id", r.id);
      if (error) errs.push(`${r.title}: ${error.message}`);
      else saved++;
    }
    setSaving(false);
    if (errs.length) {
      notify("err", `حفظ جزئي (${saved}). أخطاء: ${errs.slice(0, 2).join(" / ")}`);
    } else {
      notify("ok", `تم حفظ ترتيب ${saved} حملة.`);
    }
    await refresh();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Sword className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">ترتيب الحملات</h1>
              <p className="text-sm text-slate-400">تحكّم بالترتيب الذي يراه اللاعبون في صفحة الحملات.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin/campaigns" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <ChevronRight className="inline h-3.5 w-3.5" /> إدارة الحملات
            </Link>
            <button onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </button>
            <button onClick={exportJson} disabled={loading || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/15 disabled:opacity-40"
              title="تصدير الترتيب الكامل بصيغة JSON">
              <FileJson className="h-3.5 w-3.5" /> تصدير JSON
            </button>
            <button onClick={exportCsv} disabled={loading || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/15 disabled:opacity-40"
              title="تصدير الترتيب الكامل بصيغة CSV">
              <FileSpreadsheet className="h-3.5 w-3.5" /> تصدير CSV
            </button>
            <button onClick={applyAutoOrder}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20"
              title="إعادة بناء الترتيب الزمني لكل الحملات (يتجاوز الترتيب اليدوي)">
              <Wand2 className="h-3.5 w-3.5" /> إعادة الترتيب التلقائي
            </button>
            <button onClick={createDivider}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/15"
              title="إضافة فاصل عصر جديد">
              <Plus className="h-3.5 w-3.5" /> إضافة فاصل عصر
            </button>
            <button onClick={save} disabled={saving || dirtyIds.size === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40">
              <Save className="h-3.5 w-3.5" /> حفظ ({dirtyIds.size})
            </button>
          </div>
        </header>

        {err && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            تعذّر التحميل: {err}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(["all", "published", "draft", "review"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 ${filter === f ? "border-amber-400 bg-amber-500/10 text-amber-200" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>
              {f === "all" ? `الكل (${rows.length})`
                : f === "published" ? `منشور (${rows.filter(r => r.status === "published").length})`
                : f === "draft" ? `مسودة (${rows.filter(r => r.status === "draft").length})`
                : `مراجعة الترتيب (${rows.filter(r => r.orderStatus === "review").length})`}
            </button>
          ))}
          <span className="ms-auto text-slate-500">
            التخزين: <code className="text-slate-300">admin_campaigns.data.chronological_order</code>
          </span>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
            جاري التحميل…
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visible.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-2">
                {visible.map((r, idx) => (
                  <SortableRow
                    key={r.id}
                    row={r}
                    index={rows.indexOf(r)}
                    visibleIndex={idx}
                    dirty={dirtyIds.has(r.id)}
                    siblings={rows}
                    onMoveUp={() => moveBy(r.id, -1)}
                    onMoveDown={() => moveBy(r.id, +1)}
                    onMoveRelative={(anchor, pos) => moveRelative(r.id, anchor, pos)}
                    onRenameDivider={() => renameDivider(r)}
                    onDeleteDivider={() => deleteDivider(r)}
                  />
                ))}
                {visible.length === 0 && (
                  <li className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
                    لا توجد حملات بهذا الفلتر.
                  </li>
                )}
              </ol>
            </SortableContext>
          </DndContext>
        )}

        <footer className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs leading-loose text-slate-400">
          <p className="mb-1 text-amber-200">سياسة الترتيب</p>
          <ul className="list-disc ps-5">
            <li><span className="text-amber-200">الترتيب اليدوي هو المرجع.</span> كل سحب أو نقل تقوم به يُحفظ كـ <code className="text-slate-200">manual</code> ولن يُغيَّر تلقائياً.</li>
            <li>استيراد حملة جديدة <span className="text-amber-200">لن يُعيد ترتيب أي حملة موجودة</span>. يُحسب فقط أفضل موقع مقترح للحملة الجديدة. عند عدم اليقين تُعلَّم <code className="text-slate-200">مراجعة الترتيب</code>.</li>
            <li>إعادة استيراد حملة موجودة تحافظ على <code className="text-slate-200">chronological_order</code> و <code className="text-slate-200">order_status</code> المحفوظَين.</li>
            <li>زر <span className="text-emerald-200">إعادة الترتيب التلقائي</span> هو الإجراء الوحيد الذي يعيد بناء الترتيب لكل الحملات وفق الخوارزمية التاريخية، وهو إجراء صريح فقط.</li>
            <li>التخزين: <code className="text-slate-200">admin_campaigns.data.chronological_order</code> (بخطوة 10) و <code className="text-slate-200">data.order_status</code>.</li>
            <li>اللقطة دون اتصال تشمل نفس حقل <code className="text-slate-200">data</code> فيُحفظ الترتيب تلقائياً.</li>
          </ul>
        </footer>
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm shadow-lg ${
          toast.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-red-500/40 bg-red-500/10 text-red-200"
        }`}>
          <div className="flex items-center gap-2">
            {toast.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span>{toast.msg}</span>
            <button onClick={() => setToast(null)} className="ms-2 opacity-70 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Row ----------

interface SortableRowProps {
  row: Row;
  index: number;
  visibleIndex: number;
  dirty: boolean;
  siblings: Row[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveRelative: (anchorId: string, pos: "before" | "after") => void;
  onRenameDivider?: () => void;
  onDeleteDivider?: () => void;
}

function SortableRow({
  row, index: _index, visibleIndex, dirty, siblings, onMoveUp, onMoveDown,
  onMoveRelative, onRenameDivider, onDeleteDivider,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } as React.CSSProperties;

  // Divider rows render as elegant era headers, visually distinct from campaigns
  // but still draggable so the admin can position them in the timeline.
  if (row.isDivider) {
    return (
      <li ref={setNodeRef} style={style}
        className={`flex flex-wrap items-center gap-3 rounded-xl border bg-gradient-to-l from-amber-950/40 via-slate-900/70 to-amber-950/40 p-3 ${
          dirty ? "border-amber-400/80" : "border-amber-500/40"
        }`}>
        <button {...attributes} {...listeners}
          aria-label="سحب لإعادة الترتيب"
          className="cursor-grab touch-none rounded p-1 text-amber-300/70 hover:bg-amber-500/10 hover:text-amber-200">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="w-10 text-center text-sm font-mono text-amber-300/70">{visibleIndex + 1}</div>
        <ScrollText className="h-5 w-5 text-amber-300" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">فاصل عصر</span>
            <h3 className="truncate text-sm font-bold text-amber-100">{row.title}</h3>
          </div>
          {row.subtitle && <p className="mt-0.5 text-[11px] text-amber-200/60">{row.subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onMoveUp} aria-label="تحريك للأعلى"
            className="rounded border border-slate-700 p-1 text-slate-300 hover:border-amber-400 hover:text-amber-300">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={onMoveDown} aria-label="تحريك للأسفل"
            className="rounded border border-slate-700 p-1 text-slate-300 hover:border-amber-400 hover:text-amber-300">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          {onRenameDivider && (
            <button onClick={onRenameDivider} aria-label="إعادة تسمية الفاصل"
              className="rounded border border-slate-700 p-1 text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDeleteDivider && (
            <button onClick={onDeleteDivider} aria-label="حذف الفاصل"
              className="rounded border border-rose-500/40 p-1 text-rose-300 hover:bg-rose-500/10">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </li>
    );
  }

  const eraLabel = ERA_LABELS[row.era] ?? row.era;
  const badge = row.orderStatus === "manual" ? { t: "مرتب يدوياً", c: "border-amber-400/40 bg-amber-500/10 text-amber-200" }
    : row.orderStatus === "auto" ? { t: "مرتب تلقائياً", c: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" }
    : { t: "مراجعة الترتيب", c: "border-rose-400/40 bg-rose-500/10 text-rose-200" };

  return (
    <li ref={setNodeRef} style={style}
      className={`flex flex-wrap items-center gap-3 rounded-xl border bg-slate-900/60 p-3 ${
        dirty ? "border-amber-400/60" : "border-slate-800"
      }`}>
      <button {...attributes} {...listeners}
        aria-label="سحب لإعادة الترتيب"
        className="cursor-grab touch-none rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-amber-300">
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="w-10 text-center text-sm font-mono text-slate-400">{visibleIndex + 1}</div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-bold text-amber-100">{row.title}</h3>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${badge.c}`}>{badge.t}</span>
          {row.status !== "published" && (
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">{row.status}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          <span>{eraLabel}</span>
          {row.period && <span>• {row.period}</span>}
          <span>• {row.chapters} فصول</span>
          {row.slug && <span>• <code className="text-slate-400">{row.slug}</code></span>}
          {row.currentOrder != null && <span>• ترتيب محفوظ: {row.currentOrder}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button onClick={onMoveUp} aria-label="تحريك للأعلى"
          className="rounded border border-slate-700 p-1 text-slate-300 hover:border-amber-400 hover:text-amber-300">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button onClick={onMoveDown} aria-label="تحريك للأسفل"
          className="rounded border border-slate-700 p-1 text-slate-300 hover:border-amber-400 hover:text-amber-300">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <RelativeMover row={row} siblings={siblings} onMoveRelative={onMoveRelative} />
      </div>
    </li>
  );
}


function RelativeMover({ row, siblings, onMoveRelative }: { row: Row; siblings: Row[]; onMoveRelative: SortableRowProps["onMoveRelative"] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"before" | "after">("before");
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:border-amber-400 hover:text-amber-300">
        نقل إلى…
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-950/95 p-2 shadow-2xl">
          <div className="mb-2 flex gap-1 text-[10px]">
            {(["before", "after"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 rounded px-2 py-1 ${mode === m ? "bg-amber-500/20 text-amber-200" : "text-slate-400 hover:text-slate-200"}`}>
                {m === "before" ? "قبل" : "بعد"}
              </button>
            ))}
          </div>
          <select autoFocus
            onChange={(e) => {
              const id = e.target.value;
              if (id) { onMoveRelative(id, mode); setOpen(false); }
            }}
            defaultValue=""
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">
            <option value="" disabled>اختر حملة مرجعية…</option>
            {siblings.filter((s) => s.id !== row.id).map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <button onClick={() => setOpen(false)}
            className="mt-2 w-full rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200">
            إلغاء
          </button>
        </div>
      )}
    </div>
  );
}
