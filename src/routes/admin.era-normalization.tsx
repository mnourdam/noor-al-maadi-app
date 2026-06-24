import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import {
  CANONICAL_ERA_LABEL,
  CANONICAL_ERA_ORDER,
  toCanonicalEra,
  type CanonicalEra,
} from "@/lib/era-canonical";

export const Route = createFileRoute("/admin/era-normalization")({
  head: () => ({
    meta: [
      { title: "توحيد العصور — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <EraNormalization />
    </AdminGate>
  ),
});

type Row = {
  id: string;
  slug: string;
  title: string | null;
  metadata: any;
};

async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("encyclopedia_entities")
      .select("id,slug,title,metadata")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as Row[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

function rawEra(r: Row): string {
  const m = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
  return typeof m.era === "string" ? m.era.trim() : "";
}

function EraNormalization() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeLog, setWriteLog] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchAll();
      setRows(r);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const analysis = useMemo(() => {
    if (!rows) return null;
    const rawCounts = new Map<string, number>();
    const grouped = new Map<CanonicalEra | "__UNMAPPED__", { raw: Map<string, number>; total: number }>();
    let missing = 0;
    const toUpdate: { id: string; from: string; toKey: CanonicalEra; metadata: any }[] = [];

    for (const r of rows) {
      const raw = rawEra(r);
      if (!raw) { missing++; continue; }
      rawCounts.set(raw, (rawCounts.get(raw) ?? 0) + 1);
      const canon = toCanonicalEra(raw);
      const key = canon ?? "__UNMAPPED__";
      const bucket = grouped.get(key) ?? { raw: new Map(), total: 0 };
      bucket.raw.set(raw, (bucket.raw.get(raw) ?? 0) + 1);
      bucket.total += 1;
      grouped.set(key, bucket);
      if (canon && raw !== canon) {
        toUpdate.push({ id: r.id, from: raw, toKey: canon, metadata: r.metadata ?? {} });
      }
    }
    return { rawCounts, grouped, missing, toUpdate };
  }, [rows]);

  async function applyUpdates() {
    if (!analysis) return;
    setWriting(true);
    setWriteLog("");
    let ok = 0;
    let fail = 0;
    try {
      for (const u of analysis.toUpdate) {
        const newMeta = { ...(u.metadata && typeof u.metadata === "object" ? u.metadata : {}), era: u.toKey };
        const { error } = await supabase
          .from("encyclopedia_entities")
          .update({ metadata: newMeta })
          .eq("id", u.id);
        if (error) {
          fail++;
          setWriteLog((s) => s + `\n✗ ${u.id}: ${error.message}`);
        } else {
          ok++;
        }
        if ((ok + fail) % 25 === 0) {
          setWriteLog((s) => s + `\n… ${ok + fail}/${analysis.toUpdate.length}`);
        }
      }
      setWriteLog((s) => s + `\n\nDone. updated=${ok} failed=${fail}`);
      await load();
    } catch (e: any) {
      setWriteLog((s) => s + `\nFATAL: ${e?.message ?? String(e)}`);
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 text-sm" dir="rtl">
      <h1 className="font-display text-xl font-bold">توحيد العصور (Era Normalization)</h1>
      <p className="text-xs text-muted-foreground">
        فحص قيم <code>metadata.era</code> في <code>encyclopedia_entities</code>، تجميعها تحت تصنيف موحّد،
        ثم تحديث جماعي (بدون حذف).
      </p>

      <div className="flex gap-2">
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-gold/30 bg-surface px-3 py-1.5 text-xs hover:border-gold/60 disabled:opacity-50"
        >
          {loading ? "جارٍ المسح…" : "مسح المعاينة"}
        </button>
        {analysis && analysis.toUpdate.length > 0 && (
          <button
            onClick={() => {
              if (confirm(`سيتم تحديث ${analysis.toUpdate.length} عنصر إلى المفاتيح الموحّدة. متابعة؟`)) {
                void applyUpdates();
              }
            }}
            disabled={writing}
            className="rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-3 py-1.5 text-xs hover:border-emerald-500/70 disabled:opacity-50"
          >
            {writing ? "جارٍ التحديث…" : `تنفيذ التحديث (${analysis.toUpdate.length})`}
          </button>
        )}
      </div>

      {error && <p className="text-rose-400">{error}</p>}

      {analysis && (
        <>
          <div className="rounded-xl border border-white/10 bg-surface p-3 text-xs">
            <p>إجمالي العناصر: <b>{rows!.length}</b></p>
            <p>بدون عصر: <b>{analysis.missing}</b></p>
            <p>قيم خام مميّزة: <b>{analysis.rawCounts.size}</b></p>
            <p>عناصر تحتاج تحديث: <b>{analysis.toUpdate.length}</b></p>
          </div>

          <section>
            <h2 className="font-display mb-2 text-sm font-bold">المجموعات الموحّدة</h2>
            <div className="space-y-2">
              {CANONICAL_ERA_ORDER.map((key) => {
                const b = analysis.grouped.get(key);
                if (!b) return null;
                return (
                  <div key={key} className="rounded-lg border border-white/10 bg-surface p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{CANONICAL_ERA_LABEL[key]} <span className="text-[10px] text-muted-foreground">({key})</span></span>
                      <span className="text-[10px] text-gold/80">{b.total} عنصر</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                      {Array.from(b.raw.entries()).sort((a,b)=>b[1]-a[1]).map(([raw, n]) => (
                        <span key={raw} className={`rounded-full border px-2 py-0.5 ${raw===key?"border-emerald-500/40":"border-white/15"}`}>
                          {raw} · {n}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {analysis.grouped.get("__UNMAPPED__") && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-300">غير مصنّف (يحتاج إضافة للقاموس)</span>
                    <span className="text-[10px] text-rose-300">{analysis.grouped.get("__UNMAPPED__")!.total} عنصر</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-rose-200">
                    {Array.from(analysis.grouped.get("__UNMAPPED__")!.raw.entries()).sort((a,b)=>b[1]-a[1]).map(([raw,n]) => (
                      <span key={raw} className="rounded-full border border-rose-500/40 px-2 py-0.5">{raw} · {n}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {writeLog && (
            <pre className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-black/40 p-2 text-[10px]" dir="ltr">{writeLog}</pre>
          )}
        </>
      )}
    </div>
  );
}
