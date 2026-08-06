import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { 
  Search, Download, Upload, RefreshCw, Filter, ArrowLeft, 
  Save, AlertTriangle, CheckCircle2, Globe, FileText, ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { buildWorldIndex, invalidateWorldIndex } from "@/lib/worlds-progress";
import { ensureLocalSnapshotLoaded } from "@/lib/local-first-store";
import { WORLD_HUBS } from "@/lib/worlds";

export const Route = createFileRoute("/admin/investigations/worlds")({
  head: () => ({
    meta: [
      { title: "إدارة عوالم التحقيقات — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><InvestigationWorldsPage /></AdminGate>,
});

const ALLOWED_WORLDS = [
  "prophetic", "rashidun", "umayyad", "abbasid", "seljuk", "zengid", 
  "ayyubid-state", "mamluk-sultanate", "andalus", "ottoman", "mongols", "timurid"
];

interface InvestigationRow {
  id: string;
  slug: string;
  title: string;
  world_slug: string | null;
  derived_world: string | null;
}

function InvestigationWorldsPage() {
  const [rows, setRows] = useState<InvestigationRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [worldFilter, setWorldFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState<any[] | null>(null);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureLocalSnapshotLoaded();
      const worldIndex = buildWorldIndex();
      const derivedMap = new Map<string, string>();
      for (const [ws, entry] of worldIndex) {
        for (const s of entry.investigationSlugs) derivedMap.set(s, ws);
      }

      const { data, error: rpcError } = await supabase.rpc("admin_list_investigations" as any);
      if (rpcError) throw rpcError;
      
      setRows((data as any[]).map(r => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        world_slug: r.world_slug || null,
        derived_world: derivedMap.get(r.slug) || null
      })));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const notify = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const updateWorld = async (id: string, slug: string, worldSlug: string | null) => {
    setBusy(true);
    try {
      // Use the existing draft RPC to update world_slug
      const { data: full } = await supabase.rpc("admin_get_investigation_full" as any, { p_id_or_slug: id });
      const draft = full?.draft || full?.published || {};
      
      const { error: saveError } = await supabase.rpc("admin_save_investigation_draft" as any, {
        p_id: id,
        p_draft: { ...draft, world_slug: worldSlug },
        p_allow_removals: true
      });
      if (saveError) throw saveError;

      // Also publish it immediately to reflect in worlds
      await supabase.rpc("admin_publish_investigation" as any, {
        p_id: id,
        p_allow_removals: true
      });

      notify("ok", `تم تحديث ${slug}`);
      refresh();
      invalidateWorldIndex();
    } catch (e: any) {
      notify("err", e?.message || "فشل التحديث");
    } finally {
      setBusy(false);
    }
  };

  const bulkUpdate = async (worldSlug: string | null) => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    let ok = 0;
    for (const id of selectedIds) {
      try {
        const { data: full } = await supabase.rpc("admin_get_investigation_full" as any, { p_id_or_slug: id });
        const draft = full?.draft || full?.published || {};
        await supabase.rpc("admin_save_investigation_draft" as any, {
          p_id: id,
          p_draft: { ...draft, world_slug: worldSlug },
          p_allow_removals: true
        });
        await supabase.rpc("admin_publish_investigation" as any, { p_id: id, p_allow_removals: true });
        ok++;
      } catch (e) {}
    }
    notify("ok", `تم تحديث ${ok} من التحقيقات`);
    setSelectedIds(new Set());
    refresh();
    invalidateWorldIndex();
    setBusy(false);
  };

  const exportWorlds = () => {
    if (!rows) return;
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      investigations: rows.map(r => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        world_slug: r.world_slug
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `investigation-worlds-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !rows) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!Array.isArray(json.investigations)) throw new Error("تنسيق غير صالح");
      
      const results = json.investigations.map((imported: any) => {
        const local = rows.find(r => r.id === imported.id || r.slug === imported.slug);
        const isValidWorld = imported.world_slug === null || ALLOWED_WORLDS.includes(imported.world_slug);
        
        return {
          id: imported.id,
          slug: imported.slug,
          title: imported.title || local?.title || "غير موجود",
          old_world: local?.world_slug || null,
          new_world: imported.world_slug,
          status: !local ? "missing" : !isValidWorld ? "invalid_world" : local.world_slug === imported.world_slug ? "no_change" : "update"
        };
      });
      setDryRun(results);
    } catch (e: any) {
      notify("err", "فشل قراءة الملف: " + e.message);
    }
  };

  const commitImport = async () => {
    if (!dryRun) return;
    setBusy(true);
    let updated = 0;
    for (const item of dryRun) {
      if (item.status === "update") {
        try {
          const { data: full } = await supabase.rpc("admin_get_investigation_full" as any, { p_id_or_slug: item.id || item.slug });
          const draft = full?.draft || full?.published || {};
          await supabase.rpc("admin_save_investigation_draft" as any, {
            p_id: item.id || draft.id,
            p_draft: { ...draft, world_slug: item.new_world },
            p_allow_removals: true
          });
          await supabase.rpc("admin_publish_investigation" as any, { p_id: item.id || draft.id, p_allow_removals: true });
          updated++;
        } catch (e) {}
      }
    }
    notify("ok", `تم تحديث ${updated} بنجاح`);
    setDryRun(null);
    refresh();
    invalidateWorldIndex();
    setBusy(false);
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter(r => {
      const matchSearch = r.title.toLowerCase().includes(search.toLowerCase()) || r.slug.toLowerCase().includes(search.toLowerCase());
      const matchWorld = worldFilter === "" || (worldFilter === "__none__" ? !r.world_slug : r.world_slug === worldFilter);
      return matchSearch && matchWorld;
    });
  }, [rows, search, worldFilter]);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-4">
            <Link to="/admin/investigations" className="p-2 hover:bg-slate-900 rounded-lg">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-amber-100">إدارة عوالم التحقيقات</h1>
              <p className="text-sm text-slate-400">ربط التحقيقات بالعوالم الرسمية بشكل يدوي ومستقر.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportWorlds} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg hover:border-amber-400 text-sm">
              <Download className="h-4 w-4" /> تصدير JSON
            </button>
            <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg hover:border-emerald-400 text-sm cursor-pointer">
              <Upload className="h-4 w-4" /> استيراد JSON
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
            <button onClick={refresh} disabled={busy} className="p-2 bg-slate-900 border border-slate-700 rounded-lg">
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {dryRun && (
          <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-amber-100 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> معاينة الاستيراد (Dry Run)
              </h3>
              <div className="flex gap-2">
                <button onClick={() => setDryRun(null)} className="px-4 py-1.5 bg-slate-800 rounded-lg text-sm">إلغاء</button>
                <button onClick={commitImport} className="px-4 py-1.5 bg-emerald-600 rounded-lg text-sm font-bold">تأفيذ التغييرات ({dryRun.filter(i => i.status === 'update').length})</button>
              </div>
            </div>
            <div className="max-h-60 overflow-auto border border-slate-800 rounded-lg">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-950 sticky top-0">
                  <tr>
                    <th className="p-2">التحقيق</th>
                    <th className="p-2">العالم القديم</th>
                    <th className="p-2">العالم الجديد</th>
                    <th className="p-2">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {dryRun.map((item, idx) => (
                    <tr key={idx} className={item.status === 'update' ? 'bg-emerald-500/5' : ''}>
                      <td className="p-2 font-medium">{item.title}</td>
                      <td className="p-2 text-slate-400">{item.old_world || '—'}</td>
                      <td className="p-2 text-amber-200">{item.new_world || '—'}</td>
                      <td className="p-2">
                        {item.status === 'update' && <span className="text-emerald-400">سيتم التحديث</span>}
                        {item.status === 'no_change' && <span className="text-slate-500">لا تغيير</span>}
                        {item.status === 'missing' && <span className="text-red-400">غير موجود</span>}
                        {item.status === 'invalid_world' && <span className="text-amber-400">عالم غير صالح</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-500" />
              <input 
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالعنوان أو slug..." 
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pr-10 py-2 text-sm outline-none focus:border-amber-500/50" 
              />
            </div>
            <select 
              value={worldFilter} onChange={e => setWorldFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500/50"
            >
              <option value="">كل العوالم</option>
              <option value="__none__">غير مربوط</option>
              {ALLOWED_WORLDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <select 
              disabled={selectedIds.size === 0}
              onChange={e => bulkUpdate(e.target.value === "" ? null : e.target.value)}
              className="flex-1 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-200 outline-none disabled:opacity-50"
            >
              <option value="">تعيين جماعي...</option>
              <option value="">— إزالة الربط —</option>
              {ALLOWED_WORLDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-950 text-xs text-slate-400">
              <tr>
                <th className="p-3 w-10">
                  <input 
                    type="checkbox" 
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={() => {
                      if (selectedIds.size === filtered.length) setSelectedIds(new Set());
                      else setSelectedIds(new Set(filtered.map(r => r.id)));
                    }}
                  />
                </th>
                <th className="p-3">التحقيق</th>
                <th className="p-3">Slug</th>
                <th className="p-3">العالم الحالي</th>
                <th className="p-3">المقترح (Derived)</th>
                <th className="p-3">مصدر الربط</th>
                <th className="p-3">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map(r => (
                <tr key={r.id} className={`hover:bg-slate-800/50 ${selectedIds.has(r.id) ? 'bg-amber-500/5' : ''}`}>
                  <td className="p-3">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(r.id)}
                      onChange={() => {
                        const next = new Set(selectedIds);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        setSelectedIds(next);
                      }}
                    />
                  </td>
                  <td className="p-3 font-medium">{r.title}</td>
                  <td className="p-3 font-mono text-xs text-slate-500" dir="ltr">{r.slug}</td>
                  <td className="p-3">
                    <select 
                      value={r.world_slug || ""} 
                      onChange={e => updateWorld(r.id, r.slug, e.target.value === "" ? null : e.target.value)}
                      className={`bg-slate-950 border rounded px-2 py-1 text-xs ${r.world_slug ? 'border-amber-500/50 text-amber-200' : 'border-slate-700 text-slate-400'}`}
                    >
                      <option value="">— غير محدد —</option>
                      {ALLOWED_WORLDS.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-xs text-slate-500">{r.derived_world || '—'}</td>
                  <td className="p-3 text-xs">
                    {r.world_slug ? (
                      <span className="text-amber-400 font-bold">يدوي (Manual)</span>
                    ) : r.derived_world ? (
                      <span className="text-slate-500">آلي (Derived)</span>
                    ) : (
                      <span className="text-slate-600 italic">غير مربوط</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Link to="/investigation/$id" params={{ id: r.slug }} target="_blank" className="text-slate-500 hover:text-amber-400">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full shadow-2xl z-50 border ${
          toast.kind === 'ok' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-100' : 'bg-red-500/10 border-red-500/50 text-red-100'
        }`}>
          {toast.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
