// ============================================================
// Admin: Encyclopedia Canonicalization Audit
//
// Read-only inspection of encyclopedia_entities to surface:
//   • duplicate slugs (same slug across rows)
//   • duplicate Arabic titles
//   • duplicate legacy_id (metadata.legacy_id)
//   • empty / weak placeholder rows (no summary, no body content)
//
// Safe actions:
//   • toggle enabled=false to "soft-disable" a duplicate / weak row
//   • NEVER hard-deletes. NEVER touches multiple rows in one click.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ShieldCheck, EyeOff, Eye, AlertTriangle, Loader2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { entityRichness } from "@/lib/encyclopedia-source";

export const Route = createFileRoute("/admin/encyclopedia-audit")({
  head: () => ({
    meta: [
      { title: "تدقيق الموسوعة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><Page /></AdminGate>,
});

type Row = {
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
};

function legacyIdOf(r: Row): string | null {
  const m = r.metadata as { legacy_id?: unknown } | null | undefined;
  if (m && typeof m === "object" && typeof m.legacy_id === "string") return m.legacy_id;
  return null;
}

function isWeak(r: Row): boolean {
  if (entityRichness(r) >= 2) return false;
  if (r.summary && r.summary.trim().length > 40) return false;
  return true;
}

function Page() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("encyclopedia_entities")
      .select("id,entity_type,slug,title,subtitle,summary,body,metadata,enabled,updated_at")
      .order("slug", { ascending: true });
    if (error) setErr(error.message);
    else setRows((data as Row[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    if (!rows) return null;
    const bySlug = new Map<string, Row[]>();
    const byTitle = new Map<string, Row[]>();
    const byLegacy = new Map<string, Row[]>();
    for (const r of rows) {
      (bySlug.get(r.slug) ?? bySlug.set(r.slug, []).get(r.slug)!).push(r);
      const t = (r.title || "").trim();
      if (t) (byTitle.get(t) ?? byTitle.set(t, []).get(t)!).push(r);
      const lid = legacyIdOf(r);
      if (lid) (byLegacy.get(lid) ?? byLegacy.set(lid, []).get(lid)!).push(r);
    }
    const dupSlugs = [...bySlug.entries()].filter(([, v]) => v.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    const dupTitles = [...byTitle.entries()].filter(([, v]) => v.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    const dupLegacy = [...byLegacy.entries()].filter(([, v]) => v.length > 1);
    const weak = rows.filter(isWeak);
    return { dupSlugs, dupTitles, dupLegacy, weak };
  }, [rows]);

  async function toggleEnabled(r: Row) {
    setBusyId(r.id);
    const { error } = await supabase
      .from("encyclopedia_entities")
      .update({ enabled: !r.enabled })
      .eq("id", r.id);
    setBusyId(null);
    if (error) { alert("فشل التحديث: " + error.message); return; }
    setRows((prev) => prev?.map(x => x.id === r.id ? { ...x, enabled: !r.enabled } : x) ?? null);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-2 border-b border-amber-500/20 pb-3">
          <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-amber-300/80 hover:text-amber-200">
            <ChevronRight className="size-3.5" /> لوحة الإدارة
          </Link>
        </header>
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-6 text-amber-400" />
          <div>
            <h1 className="text-xl font-bold text-amber-100">تدقيق توحيد الموسوعة</h1>
            <p className="text-xs text-slate-400">
              اعرض الصفوف المكررة والضعيفة. التعطيل الآمن فقط (enabled=false) — بدون حذف صلب.
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertTriangle className="inline size-4" /> {err}
          </div>
        )}

        {groups && (
          <>
            <Stat
              total={rows?.length ?? 0}
              dupSlugs={groups.dupSlugs.length}
              dupTitles={groups.dupTitles.length}
              dupLegacy={groups.dupLegacy.length}
              weak={groups.weak.length}
            />

            <DupSection
              title={`أكواد slug مكررة (${groups.dupSlugs.length})`}
              hint="اختر الصف الأغنى محتوى كقياسي وعطّل الباقي."
              groups={groups.dupSlugs}
              busyId={busyId}
              onToggle={toggleEnabled}
            />

            <DupSection
              title={`عناوين عربية مكررة (${groups.dupTitles.length})`}
              hint="تكرار عبر أنواع مختلفة أحيانًا مقصود (مدينة + معلم)."
              groups={groups.dupTitles}
              busyId={busyId}
              onToggle={toggleEnabled}
            />

            <DupSection
              title={`legacy_id مكرر (${groups.dupLegacy.length})`}
              hint="نتيجة استيراد جزئي مكرر — أبقِ السجل الأحدث."
              groups={groups.dupLegacy}
              busyId={busyId}
              onToggle={toggleEnabled}
            />

            <WeakSection rows={groups.weak} busyId={busyId} onToggle={toggleEnabled} />
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ total, dupSlugs, dupTitles, dupLegacy, weak }: {
  total: number; dupSlugs: number; dupTitles: number; dupLegacy: number; weak: number;
}) {
  const cells = [
    { l: "إجمالي الصفوف", v: total },
    { l: "مجموعات slug مكررة", v: dupSlugs },
    { l: "مجموعات عناوين مكررة", v: dupTitles },
    { l: "legacy_id مكرر", v: dupLegacy },
    { l: "صفوف ضعيفة/فارغة", v: weak },
  ];
  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {cells.map(c => (
        <div key={c.l} className="rounded-lg border border-amber-500/20 bg-slate-900/60 p-3">
          <div className="text-[10px] text-slate-400">{c.l}</div>
          <div className="mt-1 text-xl font-bold text-amber-300">{c.v}</div>
        </div>
      ))}
    </section>
  );
}

function DupSection({ title, hint, groups, busyId, onToggle }: {
  title: string; hint: string; groups: [string, Row[]][]; busyId: string | null; onToggle: (r: Row) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <section>
      <h2 className="font-display text-sm font-bold text-amber-200">{title}</h2>
      <p className="mt-0.5 mb-2 text-[11px] text-slate-400">{hint}</p>
      <div className="space-y-3">
        {groups.slice(0, 100).map(([key, list]) => {
          const ranked = [...list].sort((a, b) => entityRichness(b) - entityRichness(a));
          const canonical = ranked[0]?.id;
          return (
            <div key={key} className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
              <div className="mb-2 text-[11px] text-amber-300/80">
                <span className="font-mono">{key}</span>
                <span className="mx-2 opacity-60">×</span>
                <span>{list.length}</span>
              </div>
              <div className="space-y-1.5">
                {ranked.map(r => (
                  <RowLine key={r.id} r={r} canonical={r.id === canonical} busy={busyId === r.id} onToggle={onToggle} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WeakSection({ rows, busyId, onToggle }: {
  rows: Row[]; busyId: string | null; onToggle: (r: Row) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="font-display text-sm font-bold text-amber-200">صفوف ضعيفة / فارغة ({rows.length})</h2>
      <p className="mt-0.5 mb-2 text-[11px] text-slate-400">
        لا ملخص ولا body مفيد — مرشحة للتعطيل بعد المراجعة اليدوية.
      </p>
      <div className="space-y-1.5">
        {rows.slice(0, 200).map(r => (
          <div key={r.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-2">
            <RowLine r={r} canonical={false} busy={busyId === r.id} onToggle={onToggle} />
          </div>
        ))}
      </div>
    </section>
  );
}

function RowLine({ r, canonical, busy, onToggle }: {
  r: Row; canonical: boolean; busy: boolean; onToggle: (r: Row) => void;
}) {
  const score = entityRichness(r);
  return (
    <div className="flex items-center gap-2 text-xs">
      {canonical
        ? <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">قياسي</span>
        : <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300">مكرر</span>}
      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">{r.entity_type}</span>
      <span className="flex-1 truncate" title={r.title}>{r.title || <i className="text-slate-500">بدون عنوان</i>}</span>
      <span className="font-mono text-[10px] text-slate-500">score {score.toFixed(0)}</span>
      <span className={r.enabled ? "text-emerald-400" : "text-slate-500"}>
        {r.enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </span>
      <button
        disabled={busy}
        onClick={() => onToggle(r)}
        className="rounded border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
      >
        {busy ? "…" : r.enabled ? "تعطيل" : "تفعيل"}
      </button>
      <Link
        to="/encyclopedia/entity/$id"
        params={{ id: r.id }}
        target="_blank"
        className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/5"
      >
        فتح
      </Link>
    </div>
  );
}
