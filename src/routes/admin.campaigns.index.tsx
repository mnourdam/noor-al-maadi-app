import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Sword, Plus, Trash2, Copy, Eye, EyeOff, Archive,
  ExternalLink, Upload, RefreshCw, ChevronRight, CheckCircle2, AlertTriangle, X,
  FileSpreadsheet, FileJson, ClipboardList, Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { parseHistoricalPeriodYear } from "@/lib/campaignChronology";
import { selectCampaignRows } from "@/lib/campaigns/entities";
import { CampaignExportPanel } from "@/components/admin/CampaignExportPanel";


export const Route = createFileRoute("/admin/campaigns/")({
  head: () => ({
    meta: [
      { title: "إدارة الحملات — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AdminCampaignsPage /></AdminGate>,
});

type Status = "draft" | "published" | "archived";

interface AdminCampaign {
  id: string;
  slug: string | null;
  title: string;
  status: Status;
  data: any;
  created_at: string;
  updated_at: string;
}

interface Toast { kind: "ok" | "err"; msg: string }

function AdminCampaignsPage() {
  const [rows, setRows] = useState<AdminCampaign[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [selected, setSelected] = useState<AdminCampaign | null>(null);

  // ---- export selection & filters (read-only concerns) ----
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [worldFilter, setWorldFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = async () => {
    const { data, error } = await supabase
      .from("admin_campaigns" as any)
      .select("id, slug, title, status, data, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) { setErr(error.message); return; }
    setRows(selectCampaignRows((data ?? []) as unknown as AdminCampaign[]));
    setErr(null);
  };

  useEffect(() => { refresh(); }, []);

  const worlds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows ?? []) {
      const w = (r.data?.worldSlug ?? r.data?.era ?? "") as string;
      if (w) set.add(w);
    }
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (worldFilter !== "all") {
        const w = (r.data?.worldSlug ?? r.data?.era ?? "") as string;
        if (w !== worldFilter) return false;
      }
      if (!q) return true;
      return [r.title, r.slug ?? "", r.id, (r.data?.subtitle ?? "") as string]
        .some(v => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter, worldFilter]);

  // keep the selection consistent with what is loaded
  useEffect(() => {
    if (!rows) return;
    const live = new Set(rows.map(r => r.id));
    setSelectedIds(prev => {
      const next = prev.filter(id => live.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [rows]);

  const toggleId = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);


  const setStatus = async (c: AdminCampaign, status: Status) => {
    const { error } = await supabase.from("admin_campaigns" as any)
      .update({ status, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) return notify("err", error.message);
    notify("ok", `تم تحديث الحالة إلى ${labelStatus(status)}.`);
    refresh();
    if (selected?.id === c.id) setSelected({ ...c, status });
  };

  const remove = async (c: AdminCampaign) => {
    if (!confirm(`حذف الحملة "${c.title}"؟ لا يمكن التراجع.`)) return;
    const { error } = await supabase.from("admin_campaigns" as any).delete().eq("id", c.id);
    if (error) return notify("err", error.message);
    notify("ok", "تم حذف الحملة.");
    if (selected?.id === c.id) setSelected(null);
    refresh();
  };

  const duplicate = async (c: AdminCampaign) => {
    const newId = `${c.id}_copy_${Date.now().toString(36)}`;
    const { error } = await supabase.from("admin_campaigns" as any).insert({
      id: newId,
      slug: c.slug ? `${c.slug}-copy` : null,
      title: `${c.title} (نسخة)`,
      status: "draft",
      data: c.data,
    });
    if (error) return notify("err", error.message);
    notify("ok", "تم تكرار الحملة كمسودة.");
    refresh();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Sword className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">إدارة الحملات</h1>
              <p className="text-sm text-slate-400">الحملات المستوردة في قاعدة بيانات إرث</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              ← لوحة الإدارة
            </Link>
            <button onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </button>
            <Link to="/admin/campaign-order"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20">
              ترتيب الحملات
            </Link>
            <Link to="/admin/import" search={{ type: "campaigns" } as any}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400">
              <Upload className="h-3.5 w-3.5" /> استيراد حملة JSON
            </Link>
          </div>
        </header>

        {err && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            تعذّر تحميل الحملات: {err}
          </div>
        )}

        {rows === null && !err && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
            جارٍ التحميل…
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-amber-500/30 bg-slate-900/40 p-10 text-center">
            <Sword className="mx-auto mb-3 h-8 w-8 text-amber-400/70" />
            <p className="text-base font-semibold text-amber-100">لا توجد حملات مستوردة بعد</p>
            <p className="mt-1 text-sm text-slate-400">استخدم مركز الاستيراد لإضافة حملة JSON جديدة.</p>
            <Link to="/admin/import" search={{ type: "campaigns" } as any}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400">
              <Upload className="h-4 w-4" /> استيراد حملة JSON
            </Link>
          </div>
        )}

        {rows && rows.length > 0 && (
          <CampaignExportPanel
            totalCount={rows.length}
            filteredCount={filtered.length}
            selectedIds={selectedIds}
            onSelectAllFiltered={() => setSelectedIds(filtered.map(r => r.id))}
            onClearSelection={() => setSelectedIds([])}
            onError={(m) => notify("err", m)}
            onSuccess={(m) => notify("ok", m)}
          />
        )}

        {rows && rows.length > 0 && (
          <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-[11px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالعنوان أو المعرّف…"
              className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-400"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-200 focus:border-amber-400">
              <option value="all">كل الحالات</option>
              <option value="published">منشورة</option>
              <option value="draft">مسودة</option>
              <option value="archived">مؤرشفة</option>
            </select>
            <select value={worldFilter} onChange={(e) => setWorldFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-200 focus:border-amber-400">
              <option value="all">كل العوالم</option>
              {worlds.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-slate-300">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-amber-500"
                checked={filtered.length > 0 && filtered.every(r => selectedIds.includes(r.id))}
                onChange={(e) =>
                  setSelectedIds(e.target.checked
                    ? [...new Set([...selectedIds, ...filtered.map(r => r.id)])]
                    : selectedIds.filter(id => !filtered.some(r => r.id === id)))}
              />
              تحديد الكل ({filtered.length})
            </label>
          </section>
        )}

        {rows && rows.length > 0 && <InventoryPanel rows={filtered} />}

        {rows && rows.length > 0 && (
          <section className="grid gap-3 md:grid-cols-2">
            {filtered.map(c => (
              <CampaignCard key={c.id} c={c}
                checked={selectedIds.includes(c.id)}
                onToggle={() => toggleId(c.id)}
                onView={() => setSelected(c)}
                onPublish={() => setStatus(c, c.status === "published" ? "draft" : "published")}
                onArchive={() => setStatus(c, c.status === "archived" ? "draft" : "archived")}
                onDuplicate={() => duplicate(c)}
                onDelete={() => remove(c)}
              />
            ))}
            {filtered.length === 0 && (
              <p className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400 md:col-span-2">
                لا توجد حملات مطابقة للفلترة الحالية.
              </p>
            )}
          </section>
        )}

      </div>

      {selected && <DetailsModal c={selected} onClose={() => setSelected(null)} />}

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

function CampaignCard({ c, checked, onToggle, onView, onPublish, onArchive, onDuplicate, onDelete }: {
  c: AdminCampaign;
  checked: boolean;
  onToggle: () => void;
  onView: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const chapters = chapterCount(c.data);
  const subtitle = (c.data?.subtitle ?? c.data?.description ?? "") as string;
  return (
    <div className={`rounded-xl border bg-slate-900/60 p-4 transition ${
      checked ? "border-amber-400/60 ring-1 ring-amber-400/30" : "border-slate-800 hover:border-amber-500/40"
    }`}>
      <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-400">
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 accent-amber-500" />
        تحديد للتصدير
      </label>
      <Link
        to="/admin/campaigns/$id/edit"
        params={{ id: c.id } as any}
        className="block"
      >

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[10px] tracking-widest text-amber-300/80">
              <StatusBadge status={c.status} />
              <span className="text-slate-500">{c.slug || c.id}</span>
            </div>
            <h3 className="mt-1 truncate text-base font-bold text-amber-100 hover:text-amber-300">{c.title || "بدون عنوان"}</h3>
            {subtitle && <p className="line-clamp-2 text-xs text-slate-400">{subtitle}</p>}
            <p className="mt-1 text-[10px] text-slate-500">
              {chapters} فصول · آخر تحديث {formatDate(c.updated_at)}
            </p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 shadow hover:bg-amber-400">
            <Pencil className="h-3.5 w-3.5" /> فتح المحرر
            <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </span>
        </div>
      </Link>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Btn onClick={onView} icon={ClipboardList} label="ملخص سريع" />
        <Btn onClick={onPublish} icon={c.status === "published" ? EyeOff : Eye}
          label={c.status === "published" ? "إلغاء النشر" : "نشر"} />
        <Btn onClick={onArchive} icon={Archive} label={c.status === "archived" ? "استرجاع" : "أرشفة"} />
        <Btn onClick={onDuplicate} icon={Copy} label="تكرار" />
        {c.status === "published" && (
          <Link to="/campaigns/imported/$id" params={{ id: c.id } as any}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/10">
            <ExternalLink className="h-3 w-3" /> فتح
          </Link>
        )}
        <Btn onClick={onDelete} icon={Trash2} label="حذف" danger />
      </div>
    </div>
  );
}

function DetailsModal({ c, onClose }: { c: AdminCampaign; onClose: () => void }) {
  const d = c.data ?? {};
  const chapters: any[] = Array.isArray(d.chapters) ? d.chapters : [];
  const rewards: any = d.rewards ?? d.reward ?? null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 p-6 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2"><StatusBadge status={c.status} /><span className="text-[10px] text-slate-500">{c.slug || c.id}</span></div>
            <h2 className="mt-1 text-xl font-bold text-amber-100">{c.title}</h2>
            {d.subtitle && <p className="text-sm text-slate-300">{d.subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-amber-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          {d.historicalPeriod && <Meta label="الحقبة" value={d.historicalPeriod} />}
          {d.period && <Meta label="الفترة" value={d.period} />}
          {d.difficulty && <Meta label="الصعوبة" value={String(d.difficulty)} />}
          <Meta label="الفصول" value={String(chapters.length)} />
          <Meta label="أُنشئت" value={formatDate(c.created_at)} />
          <Meta label="آخر تحديث" value={formatDate(c.updated_at)} />
        </dl>

        {d.description && (
          <div className="mt-4">
            <h3 className="mb-1 text-xs font-semibold text-amber-300">الوصف</h3>
            <p className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm leading-relaxed text-slate-300">{d.description}</p>
          </div>
        )}

        {rewards && (
          <div className="mt-4">
            <h3 className="mb-1 text-xs font-semibold text-amber-300">المكافآت</h3>
            <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-[11px] text-slate-300">{JSON.stringify(rewards, null, 2)}</pre>
          </div>
        )}

        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold text-amber-300">قائمة الفصول ({chapters.length})</h3>
          {chapters.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-3 text-center text-xs text-slate-500">لا توجد فصول.</p>
          ) : (
            <ol className="space-y-2">
              {chapters.map((ch, i) => {
                const acts: any[] = Array.isArray(ch.activities) ? ch.activities : Array.isArray(ch.questions) ? ch.questions : [];
                return (
                  <li key={ch.id ?? i} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <ChevronRight className="h-3 w-3" /> فصل {ch.order ?? i + 1}
                        </div>
                        <div className="truncate text-sm font-semibold text-slate-100">{ch.title || "بدون عنوان"}</div>
                      </div>
                      <div className="shrink-0 text-[10px] text-slate-400">
                        {acts.length} نشاط
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                      {typeof ch.xpReward === "number" && <Chip>+{ch.xpReward} XP</Chip>}
                      {typeof ch.coinsReward === "number" && <Chip>+{ch.coinsReward} عملة</Chip>}
                      {ch.unlocks && <Chip>يفتح: {Array.isArray(ch.unlocks) ? ch.unlocks.join("، ") : String(ch.unlocks)}</Chip>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const cls =
    status === "published" ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30"
    : status === "archived" ? "bg-slate-500/15 text-slate-300 border-slate-500/30"
    : "bg-amber-500/15 text-amber-200 border-amber-400/30";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>{labelStatus(status)}</span>;
}

function Btn({ onClick, icon: Icon, label, danger }: { onClick: () => void; icon: any; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition ${
        danger
          ? "border-red-400/30 text-red-300 hover:bg-red-500/10"
          : "border-slate-700 text-slate-300 hover:border-amber-400/40 hover:text-amber-300"
      }`}>
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
      <dt className="text-[10px] text-slate-500">{label}</dt>
      <dd className="truncate text-slate-200">{value}</dd>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-slate-700 bg-slate-900/60 px-1.5 py-0.5">{children}</span>;
}

function labelStatus(s: Status) {
  return s === "published" ? "منشورة" : s === "archived" ? "مؤرشفة" : "مسودة";
}

function chapterCount(data: any): number {
  const ch = data?.chapters;
  return Array.isArray(ch) ? ch.length : 0;
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
}

// ============================================================
// Inventory Panel — read-only audit & export
// ============================================================

interface InventoryRow {
  id: string;
  slug: string | null;
  chronological_order: number | null;
  sort_year: number | null;
  parsed_year: number | null;
  title: string;
  subtitle: string;
  period: string;
  worldSlug: string;
  era: string;
  status: Status;
  chapters: number;
  published: "published" | "draft" | "archived";
  created_at: string;
  imported_at: string;
  updated_at: string;
}

function toInventoryRow(c: AdminCampaign): InventoryRow {
  const d = c.data ?? {};
  const chronological_order = pickNumber(d.chronological_order, d.chronologicalOrder);
  const sort_year = pickNumber(d.sort_year, d.sortYear, d.startYear);
  const period = String(d.historicalPeriod ?? d.period ?? "");
  const parsed_year = parseHistoricalPeriodYear(period);
  return {
    id: c.id,
    slug: c.slug,
    chronological_order,
    sort_year,
    parsed_year,
    title: c.title ?? "",
    subtitle: String(d.subtitle ?? d.description ?? ""),
    period,
    worldSlug: String(d.worldSlug ?? d.world ?? ""),
    era: String(d.era ?? ""),
    status: c.status,
    chapters: chapterCount(d),
    published: c.status,
    created_at: c.created_at,
    imported_at: String(d.imported_at ?? d.importedAt ?? ""),
    updated_at: c.updated_at,
  };
}

function pickNumber(...vals: any[]): number | null {
  for (const v of vals) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return null;
}

function inventorySortKey(r: InventoryRow): number {
  if (r.chronological_order != null) return r.chronological_order;
  if (r.sort_year != null) return 1_000_000 + r.sort_year;
  if (r.parsed_year != null) return 2_000_000 + r.parsed_year;
  return Number.POSITIVE_INFINITY;
}

function InventoryPanel({ rows }: { rows: AdminCampaign[] }) {
  const inv = useMemo(() => {
    return rows
      .map(toInventoryRow)
      .sort((a, b) => {
        const ka = inventorySortKey(a);
        const kb = inventorySortKey(b);
        if (ka !== kb) return ka - kb;
        return a.title.localeCompare(b.title, "ar");
      });
  }, [rows]);

  const total = inv.length;
  const missingMeta = inv.filter(r => r.chronological_order == null && r.sort_year == null && r.parsed_year == null).length;

  const byWorld = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of inv) {
      const k = r.worldSlug || r.era || "— غير محدّد —";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inv]);

  const exportCSV = () => {
    const headers = [
      "chronological_order","sort_year","parsed_year","title","subtitle","period",
      "worldSlug","era","status","chapters","published","slug","id","created_at","imported_at","updated_at",
    ];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of inv) {
      lines.push([
        r.chronological_order ?? "", r.sort_year ?? "", r.parsed_year ?? "",
        r.title, r.subtitle, r.period, r.worldSlug, r.era, r.status, r.chapters,
        r.published, r.slug ?? "", r.id, r.created_at, r.imported_at, r.updated_at,
      ].map(esc).join(","));
    }
    download(`campaigns-inventory-${stamp()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
  };

  const exportJSON = () => {
    const payload = {
      generated_at: new Date().toISOString(),
      total,
      missing_chronology_metadata: missingMeta,
      by_world: Object.fromEntries(byWorld),
      campaigns: inv,
    };
    download(`campaigns-inventory-${stamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
  };

  return (
    <section className="rounded-xl border border-amber-500/20 bg-slate-900/40 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-amber-100">
          <ClipboardList className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-bold">جرد الحملات (للقراءة والتصدير فقط)</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
            الإجمالي: <strong className="text-amber-200">{total}</strong>
          </span>
          <span className={`rounded-lg border px-2 py-1 text-[11px] ${
            missingMeta > 0 ? "border-amber-400/40 text-amber-200" : "border-slate-700 text-slate-400"
          }`}>
            بلا بيانات ترتيب: <strong>{missingMeta}</strong>
          </span>
          <button onClick={exportCSV}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-amber-400 hover:text-amber-300">
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </button>
          <button onClick={exportJSON}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-amber-400 hover:text-amber-300">
            <FileJson className="h-3.5 w-3.5" /> JSON
          </button>
        </div>
      </header>

      {byWorld.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {byWorld.map(([w, n]) => (
            <span key={w} className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-300">
              {w}: <strong className="text-amber-200">{n}</strong>
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-right text-[11px] text-slate-300">
          <thead className="bg-slate-900/70 text-amber-200/80">
            <tr>
              {["#","ترتيب","سنة","سنة مُستنبطة","العنوان","العنوان الفرعي","الفترة","العالم","الحقبة","الحالة","فصول","slug","أُنشئت","استيراد"].map(h => (
                <th key={h} className="whitespace-nowrap px-2 py-1.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inv.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                <td className="px-2 py-1 text-slate-500">{i + 1}</td>
                <td className="px-2 py-1">{r.chronological_order ?? "—"}</td>
                <td className="px-2 py-1">{r.sort_year ?? "—"}</td>
                <td className="px-2 py-1 text-slate-500">{r.parsed_year ?? "—"}</td>
                <td className="px-2 py-1 font-semibold text-amber-100">{r.title}</td>
                <td className="max-w-[18ch] truncate px-2 py-1 text-slate-400">{r.subtitle}</td>
                <td className="whitespace-nowrap px-2 py-1">{r.period || "—"}</td>
                <td className="px-2 py-1">{r.worldSlug || "—"}</td>
                <td className="px-2 py-1">{r.era || "—"}</td>
                <td className="px-2 py-1">{labelStatus(r.status)}</td>
                <td className="px-2 py-1">{r.chapters}</td>
                <td className="px-2 py-1 text-slate-500">{r.slug ?? "—"}</td>
                <td className="whitespace-nowrap px-2 py-1 text-slate-500">{formatDate(r.created_at)}</td>
                <td className="whitespace-nowrap px-2 py-1 text-slate-500">{r.imported_at ? formatDate(r.imported_at) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
