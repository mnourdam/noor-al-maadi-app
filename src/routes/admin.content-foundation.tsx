import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/content-foundation")({
  head: () => ({
    meta: [
      { title: "أساس المحتوى — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><ContentFoundation /></AdminGate>,
});

type Row = {
  id: string;
  slug: string;
  title: string;
  entity_type: string;
  summary: string | null;
  body: any;
  enabled: boolean;
  timeline_year: number | null;
  metadata: any;
};

const TYPES = ["city", "battle", "state", "landmark", "figure", "event", "artifact"];

function eraOf(y: number | null): string {
  if (y == null) return "غير محدد";
  if (y < 622) return "ما قبل الإسلام";
  if (y < 750) return "النبوّة والراشدون والأمويون";
  if (y < 1258) return "العصر العباسي";
  if (y < 1517) return "العصور الوسطى المتأخرة";
  if (y < 1924) return "العثماني والحديث المبكر";
  return "المعاصر";
}

function isWeak(r: Row): boolean {
  const s = (r.summary ?? "").trim();
  const bodyEmpty = !r.body || (typeof r.body === "object" && Object.keys(r.body).length === 0);
  return bodyEmpty || s.length < 60;
}

function ContentFoundation() {
  const [rows, setRows] = useState<Row[]>([]);
  const [allTotals, setAllTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterEra, setFilterEra] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string>("");

  async function reload() {
    setLoading(true);
    const PAGE = 1000;
    let from = 0;
    const stubs: Row[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("encyclopedia_entities" as any)
        .select("id,slug,title,entity_type,summary,body,enabled,timeline_year,metadata")
        .or("metadata->>source.eq.atlas_repair_stub,metadata->>needs_content_expansion.eq.true")
        .range(from, from + PAGE - 1);
      if (error) { console.error(error); break; }
      const batch = (data ?? []) as unknown as Row[];
      stubs.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    // global coverage per type (all enabled entities)
    const totals: Record<string, number> = {};
    for (const t of TYPES) {
      const { count } = await supabase
        .from("encyclopedia_entities" as any)
        .select("*", { count: "exact", head: true })
        .eq("entity_type", t);
      totals[t] = count ?? 0;
    }
    setAllTotals(totals);
    setRows(stubs);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (filterType !== "all" && r.entity_type !== filterType) return false;
    if (filterEra !== "all" && eraOf(r.timeline_year) !== filterEra) return false;
    return true;
  }), [rows, filterType, filterEra]);

  const byType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.entity_type] = (m[r.entity_type] ?? 0) + 1;
    return m;
  }, [rows]);

  const byEra = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) { const k = eraOf(r.timeline_year); m[k] = (m[k] ?? 0) + 1; }
    return m;
  }, [rows]);

  const emptyBody = rows.filter(r => !r.body || (typeof r.body === "object" && Object.keys(r.body).length === 0)).length;
  const weak = rows.filter(isWeak).length;
  const reviewed = rows.filter(r => r.metadata?.reviewed === true).length;
  const ready = rows.filter(r => r.metadata?.ready_for_enrichment === true).length;

  const eras = Array.from(new Set(rows.map(r => eraOf(r.timeline_year))));

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function selectAll() { setSelected(new Set(filtered.map(r => r.id))); }
  function clearSel() { setSelected(new Set()); }

  async function bulkMark(field: "reviewed" | "ready_for_enrichment") {
    if (selected.size === 0) return;
    setMsg("جاري التحديث…");
    let ok = 0, fail = 0;
    for (const id of selected) {
      const row = rows.find(r => r.id === id);
      if (!row) continue;
      const nextMeta = { ...(row.metadata ?? {}), [field]: true, [`${field}_at`]: new Date().toISOString() };
      const { error } = await supabase
        .from("encyclopedia_entities" as any)
        .update({ metadata: nextMeta })
        .eq("id", id);
      if (error) fail++; else ok++;
    }
    setMsg(`تم تحديث ${ok} • أخطاء ${fail}`);
    clearSel();
    await reload();
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="border-b border-amber-500/20 pb-4">
          <h1 className="text-2xl font-bold text-amber-100">أساس المحتوى — تدقيق الموسوعة</h1>
          <p className="text-sm text-slate-400">تحديد الكيانات الجذعية والضعيفة استعداداً للإثراء.</p>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="إجمالي الجذعية" value={rows.length} />
          <Stat label="جسم فارغ" value={emptyBody} />
          <Stat label="وصف ضعيف" value={weak} />
          <Stat label="تمت مراجعتها" value={reviewed} />
          <Stat label="جاهز للإثراء" value={ready} />
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Panel title="حسب النوع (جذعية)">
            <ul className="space-y-1 text-sm">
              {Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
                <li key={k} className="flex justify-between"><span>{k}</span><span className="text-amber-300">{v}</span></li>
              ))}
            </ul>
          </Panel>
          <Panel title="حسب الحقبة (جذعية)">
            <ul className="space-y-1 text-sm">
              {Object.entries(byEra).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
                <li key={k} className="flex justify-between"><span>{k}</span><span className="text-amber-300">{v}</span></li>
              ))}
            </ul>
          </Panel>
        </section>

        <Panel title="تغطية المحتوى الكلية (كل الكيانات)">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-7 text-sm">
            {TYPES.map(t => (
              <div key={t} className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5">
                <div className="text-slate-400">{t}</div>
                <div className="text-amber-200 font-bold">{allTotals[t] ?? 0}</div>
                <div className="text-xs text-slate-500">جذعية: {byType[t] ?? 0}</div>
              </div>
            ))}
          </div>
        </Panel>

        <section className="flex flex-wrap items-center gap-2 rounded border border-slate-700 bg-slate-900 p-3">
          <label className="text-sm text-slate-400">النوع:</label>
          <select value={filterType} onChange={e=>setFilterType(e.target.value)} className="rounded bg-slate-800 px-2 py-1 text-sm">
            <option value="all">الكل</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="text-sm text-slate-400">الحقبة:</label>
          <select value={filterEra} onChange={e=>setFilterEra(e.target.value)} className="rounded bg-slate-800 px-2 py-1 text-sm">
            <option value="all">الكل</option>
            {eras.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <div className="flex-1" />
          <button onClick={selectAll} className="rounded bg-slate-700 px-3 py-1 text-sm">تحديد الكل المعروض</button>
          <button onClick={clearSel} className="rounded bg-slate-700 px-3 py-1 text-sm">مسح التحديد</button>
          <button disabled={selected.size===0} onClick={()=>bulkMark("reviewed")} className="rounded bg-emerald-700 px-3 py-1 text-sm disabled:opacity-40">وسم كَـ‌مُراجَعة ({selected.size})</button>
          <button disabled={selected.size===0} onClick={()=>bulkMark("ready_for_enrichment")} className="rounded bg-amber-700 px-3 py-1 text-sm disabled:opacity-40">وسم كَـ‌جاهز للإثراء ({selected.size})</button>
          {msg && <span className="text-xs text-slate-400">{msg}</span>}
        </section>

        <section className="rounded border border-slate-700">
          {loading ? (
            <div className="p-6 text-center text-slate-400">…تحميل</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-2"></th>
                  <th className="p-2 text-right">العنوان</th>
                  <th className="p-2">النوع</th>
                  <th className="p-2">الحقبة</th>
                  <th className="p-2">الوصف</th>
                  <th className="p-2">الجسم</th>
                  <th className="p-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const bodyEmpty = !r.body || (typeof r.body === "object" && Object.keys(r.body).length === 0);
                  const sLen = (r.summary ?? "").length;
                  return (
                    <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                      <td className="p-2 text-center"><input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggle(r.id)} /></td>
                      <td className="p-2 text-right">
                        <div className="font-medium text-amber-100">{r.title}</div>
                        <div className="text-xs text-slate-500">{r.slug}</div>
                      </td>
                      <td className="p-2 text-center">{r.entity_type}</td>
                      <td className="p-2 text-center text-xs">{eraOf(r.timeline_year)}</td>
                      <td className="p-2 text-center text-xs">{sLen < 60 ? <span className="text-rose-400">{sLen} حرف</span> : <span className="text-emerald-400">{sLen}</span>}</td>
                      <td className="p-2 text-center text-xs">{bodyEmpty ? <span className="text-rose-400">فارغ</span> : <span className="text-emerald-400">موجود</span>}</td>
                      <td className="p-2 text-center text-xs">
                        {r.metadata?.ready_for_enrichment && <span className="rounded bg-amber-700/40 px-1.5 py-0.5">جاهز</span>}
                        {r.metadata?.reviewed && <span className="ms-1 rounded bg-emerald-700/40 px-1.5 py-0.5">مُراجَع</span>}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-500">لا توجد نتائج</td></tr>
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-700 bg-slate-900 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-bold text-amber-200">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-slate-700 bg-slate-900 p-3">
      <h3 className="mb-2 text-sm font-bold text-amber-100">{title}</h3>
      {children}
    </div>
  );
}
