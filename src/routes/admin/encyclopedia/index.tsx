import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Landmark, Upload, RefreshCw, Eye, EyeOff, Trash2, Plus, Save, X,
  CheckCircle2, AlertTriangle, FileJson, BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { normalizeArabicName } from "@/lib/arabic-normalize";
import { EncyclopediaEntityImageUploader } from "@/components/admin/EncyclopediaEntityImageUploader";
import type { EntityImageFields } from "@/lib/encyclopedia-images";

export const Route = createFileRoute("/admin/encyclopedia/")({
  head: () => ({
    meta: [
      { title: "إدارة الموسوعة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AdminEncyclopediaPage /></AdminGate>,
});

const ENTITY_TYPES = ["figure","city","battle","state","event","landmark","artifact"] as const;
type EntityType = typeof ENTITY_TYPES[number];

const TYPE_LABELS: Record<EntityType, string> = {
  figure: "شخصيات",
  city: "مدن",
  battle: "معارك",
  state: "دول",
  event: "أحداث",
  landmark: "معالم",
  artifact: "آثار",
};

interface Entity {
  id: string;
  entity_type: EntityType;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  body: any;
  metadata: any;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  timeline_year: number | null;
  timeline_start_year: number | null;
  timeline_end_year: number | null;
  timeline_hijri: string | null;
  timeline_order: number | null;
  timeline_category: string | null;
  timeline_tone: string | null;
  timeline_glyph: string | null;
  image_url?: string | null;
  image_path?: string | null;
  image_credit?: string | null;
  image_source?: string | null;
}

const TIMELINE_CATEGORIES = ["caliphate", "figure", "battle", "book", "event"] as const;

interface Toast { kind: "ok" | "err"; msg: string }

function AdminEncyclopediaPage() {
  const [rows, setRows] = useState<Entity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<EntityType | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Entity | "new" | null>(null);
  const [jsonUpdating, setJsonUpdating] = useState<Entity | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rarityFilter, setRarityFilter] = useState<"any" | "missing" | "common" | "rare" | "epic" | "legendary">("any");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkTarget, setBulkTarget] = useState<"common" | "rare" | "epic" | "legendary">("legendary");
  const [bulkBusy, setBulkBusy] = useState(false);

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = async () => {
    const { data, error } = await supabase
      .from("encyclopedia_entities" as any)
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) { setErr(error.message); return; }
    setRows((data ?? []) as unknown as Entity[]);
    setErr(null);
  };

  useEffect(() => { refresh(); }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter !== "all" && r.entity_type !== filter) return false;
      if (q && !r.title.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false;
      if (filter === "artifact" && rarityFilter !== "any") {
        const raw = (r.metadata as any)?.rarity;
        const valid = raw === "common" || raw === "rare" || raw === "epic" || raw === "legendary";
        if (rarityFilter === "missing") return !valid;
        return valid && raw === rarityFilter;
      }
      return true;
    });
  }, [rows, filter, search, rarityFilter]);

  useEffect(() => { setSelected(new Set()); }, [filter, rarityFilter, search]);

  const selectedVisibleIds = useMemo(() => {
    if (filter !== "artifact") return [];
    return visible.filter(v => selected.has(v.id)).map(v => v.id);
  }, [visible, selected, filter]);

  const applyBulkRarity = async () => {
    if (selectedVisibleIds.length === 0) return;
    const ok = window.confirm(
      `تعيين الندرة "${bulkTarget}" على ${selectedVisibleIds.length} أثرًا؟\nسيتم تعديل metadata.rarity فقط، ولن يتأثر ملك اللاعبين.`,
    );
    if (!ok) return;
    setBulkBusy(true);
    const { data, error } = await supabase.rpc("admin_set_artifact_rarity" as any, {
      _ids: selectedVisibleIds, _rarity: bulkTarget,
    });
    setBulkBusy(false);
    if (error) return notify("err", error.message);
    const res = (data as any) ?? {};
    notify("ok", `تم التحديث: ${res.updated ?? 0} · تم التخطي: ${res.skipped ?? 0}`);
    setSelected(new Set());
    refresh();
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const t of ENTITY_TYPES) c[t] = 0;
    rows?.forEach(r => { c[r.entity_type] = (c[r.entity_type] ?? 0) + 1; });
    return c;
  }, [rows]);

  const duplicateSlugs = useMemo(() => {
    const byS = new Map<string, Set<string>>();
    for (const r of rows ?? []) {
      if (!r.enabled) continue;
      const s = byS.get(r.slug) ?? new Set<string>();
      s.add(r.entity_type);
      byS.set(r.slug, s);
    }
    return Array.from(byS.entries())
      .filter(([, types]) => types.size > 1)
      .map(([slug, types]) => ({ slug, types: Array.from(types) }));
  }, [rows]);

  const toggleEnabled = async (e: Entity) => {
    const { error } = await supabase.from("encyclopedia_entities" as any)
      .update({ enabled: !e.enabled }).eq("id", e.id);
    if (error) return notify("err", error.message);
    notify("ok", !e.enabled ? "تم التفعيل." : "تم التعطيل.");
    refresh();
  };

  const remove = async (e: Entity) => {
    if (!confirm(`حذف "${e.title}" (${e.entity_type})؟ لا يمكن التراجع.`)) return;
    const { error } = await supabase.from("encyclopedia_entities" as any).delete().eq("id", e.id);
    if (error) return notify("err", error.message);
    notify("ok", "تم الحذف.");
    refresh();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Landmark className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">إدارة الموسوعة</h1>
              <p className="text-sm text-slate-400">شخصيات، مدن، معارك، دول، أحداث، معالم، آثار</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              ← لوحة الإدارة
            </Link>
            <button onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </button>
            <Link to="/admin/encyclopedia/priority-audit"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10">
              <BarChart3 className="h-3.5 w-3.5" /> تدقيق أولوية الصور
            </Link>
            <Link to="/admin/import" search={{ type: "encyclopedia" } as any}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <Upload className="h-3.5 w-3.5" /> استيراد JSON
            </Link>
            <button onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400">
              <Plus className="h-3.5 w-3.5" /> إضافة
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <FilterBtn active={filter === "all"} onClick={() => setFilter("all")} label={`الكل (${counts.all})`} />
          {ENTITY_TYPES.map(t => (
            <FilterBtn key={t} active={filter === t} onClick={() => setFilter(t)} label={`${TYPE_LABELS[t]} (${counts[t]})`} />
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالعنوان أو slug..."
            className="ms-auto w-full max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-amber-400/50"
          />
        </div>

        {filter === "artifact" && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-100">
            <span className="font-bold">ندرة الأثر:</span>
            {(["any","missing","common","rare","epic","legendary"] as const).map(r => (
              <button key={r}
                onClick={() => setRarityFilter(r)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                  rarityFilter === r
                    ? "border-amber-400 bg-amber-500/20 text-amber-100"
                    : "border-slate-700 text-slate-300 hover:border-amber-400/50"
                }`}
              >
                {r === "any" ? "الكل"
                  : r === "missing" ? "بلا ندرة"
                  : r === "common" ? "عادي"
                  : r === "rare" ? "نادر"
                  : r === "epic" ? "ملحمي" : "أسطوري"}
              </button>
            ))}
            <span className="ms-auto flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  const allIds = new Set(visible.map(v => v.id));
                  const allSelected = visible.every(v => selected.has(v.id));
                  setSelected(allSelected ? new Set() : allIds);
                }}
                className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:border-amber-400"
              >
                {visible.every(v => selected.has(v.id)) && visible.length > 0
                  ? "إلغاء التحديد" : `تحديد الكل (${visible.length})`}
              </button>
              <span className="text-slate-400">المحدد: {selectedVisibleIds.length}</span>
              <select
                value={bulkTarget}
                onChange={e => setBulkTarget(e.target.value as any)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
              >
                <option value="common">عادي</option>
                <option value="rare">نادر</option>
                <option value="epic">ملحمي</option>
                <option value="legendary">أسطوري</option>
              </select>
              <button
                onClick={applyBulkRarity}
                disabled={selectedVisibleIds.length === 0 || bulkBusy}
                className="rounded-lg bg-amber-500 px-3 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
              >
                {bulkBusy ? "جارٍ التحديث…" : "تعيين الندرة"}
              </button>
            </span>
          </div>
        )}

        {err && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            تعذّر التحميل: {err}
          </div>
        )}

        {duplicateSlugs.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <div className="font-bold">
              يوجد أكثر من نوع بنفس المعرّف — تحقق من الربط
            </div>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-200/90">
              {duplicateSlugs.slice(0, 10).map(d => (
                <li key={d.slug}>
                  <span className="font-mono">{d.slug}</span>{" "}
                  <span className="text-amber-300/80">({d.types.join(" / ")})</span>
                </li>
              ))}
              {duplicateSlugs.length > 10 && (
                <li className="text-amber-300/70">…و{duplicateSlugs.length - 10} غيرها</li>
              )}
            </ul>
          </div>
        )}

        {rows === null && !err && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">جارٍ التحميل…</div>
        )}

        {rows && visible.length === 0 && (
          <div className="rounded-xl border border-dashed border-amber-500/30 bg-slate-900/40 p-10 text-center">
            <Landmark className="mx-auto mb-3 h-8 w-8 text-amber-400/70" />
            <p className="text-base font-semibold text-amber-100">
              {rows.length === 0 ? "لا توجد مدخلات موسوعة بعد" : "لا توجد نتائج مطابقة"}
            </p>
            {rows.length === 0 && (
              <p className="mt-1 text-sm text-slate-400">أضف مدخلًا يدويًا أو استورد JSON.</p>
            )}
          </div>
        )}

        {visible.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-900/80 text-xs text-slate-400">
                <tr>
                  {filter === "artifact" && <th className="w-8 px-2 py-2"></th>}
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">العنوان</th>
                  <th className="px-3 py-2">Slug</th>
                  {filter === "artifact" && <th className="px-3 py-2">الندرة</th>}
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">آخر تحديث</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {visible.map(e => (
                  <tr key={e.id} className="hover:bg-slate-900/60">
                    {filter === "artifact" && (
                      <td className="w-8 px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(e.id)}
                          onChange={() => setSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                            return next;
                          })}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 text-xs text-amber-300">{TYPE_LABELS[e.entity_type]}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-100">{e.title}</div>
                      {e.subtitle && <div className="text-xs text-slate-400">{e.subtitle}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{e.slug}</td>
                    {filter === "artifact" && (
                      <td className="px-3 py-2 text-xs">
                        {(() => {
                          const raw = (e.metadata as any)?.rarity;
                          const valid = raw === "common" || raw === "rare" || raw === "epic" || raw === "legendary";
                          if (!valid) return <span className="text-slate-500">—</span>;
                          const label = raw === "common" ? "عادي" : raw === "rare" ? "نادر" : raw === "epic" ? "ملحمي" : "أسطوري";
                          const cls = raw === "legendary" ? "border-gold/50 bg-gold/10 text-amber-200"
                            : raw === "epic" ? "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200"
                            : raw === "rare" ? "border-sky-400/40 bg-sky-400/10 text-sky-200"
                            : "border-slate-700 bg-slate-800 text-slate-300";
                          return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>{label}</span>;
                        })()}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        e.enabled
                          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                          : "border-slate-600 bg-slate-800 text-slate-400"
                      }`}>{e.enabled ? "مفعّل" : "معطّل"}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {new Date(e.updated_at).toLocaleDateString("ar")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                         <button onClick={() => toggleEnabled(e)} title={e.enabled ? "تعطيل" : "تفعيل"}
                          className="p-1 text-slate-500 hover:text-amber-400">
                          {e.enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button onClick={() => setEditing(e)}
                          className="p-1 text-slate-500 hover:text-amber-400">
                          <Plus className="h-4 w-4" />
                        </button>
                        <button onClick={() => setJsonUpdating(e)}
                          className="p-1 text-slate-500 hover:text-amber-400">
                          <FileJson className="h-4 w-4" />
                        </button>
                        <button onClick={() => remove(e)}
                          className="p-1 text-slate-500 hover:text-red-400">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-2xl ${
          toast.kind === "ok" ? "border-emerald-500/40 bg-emerald-950 text-emerald-100" : "border-red-500/40 bg-red-950 text-red-100"
        }`}>
          {toast.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        active ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
      }`}>
      {label}
    </button>
  );
}
