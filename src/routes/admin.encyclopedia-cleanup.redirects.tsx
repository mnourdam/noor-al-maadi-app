// Safe Redirect Viewer — lists every encyclopedia entity carrying
// metadata.redirect_from OR archived duplicates that point at a
// canonical_slug. Provides a one-click "test redirect" that opens the
// old slug URL in a new tab so QA can confirm the resolver picks the
// canonical without losing context.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink, Loader2, RefreshCw, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string; entity_type: string; slug: string; title: string;
  enabled: boolean; metadata: any;
};

export const Route = createFileRoute("/admin/encyclopedia-cleanup/redirects")({
  head: () => ({ meta: [{ title: "تحويلات الموسوعة — إرث" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: RedirectsViewer,
});

type RedirectEntry = {
  from: string;
  to: string;
  canonicalId: string;
  canonicalTitle: string;
  source: "redirect_from" | "archived_duplicate";
  duplicateId?: string;
  duplicateTitle?: string;
};

function entityHref(type: string, slug: string): string {
  if (type === "state") return `/encyclopedia/state/${slug}`;
  return `/encyclopedia/entity/${slug}`;
}

function RedirectsViewer() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase
        .from("encyclopedia_entities" as any)
        .select("id,entity_type,slug,title,enabled,metadata")
        .limit(3000);
      if (error) throw error;
      setRows((data ?? []) as unknown as Row[]);
    } catch (e: any) { setErr(e?.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const entries = useMemo<RedirectEntry[]>(() => {
    const bySlug = new Map<string, Row>();
    const byId = new Map<string, Row>();
    for (const r of rows) {
      if (r.slug) bySlug.set(r.slug, r);
      byId.set(r.id, r);
    }

    const out: RedirectEntry[] = [];
    // 1) Canonicals with metadata.redirect_from
    for (const r of rows) {
      const redirects = r.metadata?.redirect_from;
      if (!Array.isArray(redirects)) continue;
      for (const from of redirects) {
        if (typeof from !== "string" || !from) continue;
        out.push({
          from, to: r.slug, canonicalId: r.id, canonicalTitle: r.title,
          source: "redirect_from",
        });
      }
    }
    // 2) Archived duplicates with canonical_slug
    for (const r of rows) {
      const canSlug = r.metadata?.canonical_slug;
      if (!canSlug || typeof canSlug !== "string") continue;
      const canById = r.metadata?.canonical_id ? byId.get(r.metadata.canonical_id) : null;
      const can = canById ?? bySlug.get(canSlug);
      if (!can) continue;
      // Skip duplicates already covered by the canonical's redirect_from.
      const known = Array.isArray(can.metadata?.redirect_from) && can.metadata.redirect_from.includes(r.slug);
      if (known) continue;
      out.push({
        from: r.slug, to: canSlug, canonicalId: can.id, canonicalTitle: can.title,
        source: "archived_duplicate", duplicateId: r.id, duplicateTitle: r.title,
      });
    }

    out.sort((a, b) => a.from.localeCompare(b.from));
    return out;
  }, [rows]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
        <div className="flex items-center gap-2">
          <Workflow className="size-5 text-amber-400" />
          <div>
            <h1 className="text-lg font-bold text-amber-100">تحويلات الـ slug</h1>
            <p className="text-xs text-slate-400">
              {loading ? "جارٍ التحميل…" : `${entries.length} تحويل نشط`}
              {" · "}<Link to="/admin/encyclopedia-cleanup" className="underline hover:text-amber-200">عودة للورشة</Link>
            </p>
          </div>
        </div>
        <button onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
        </button>
      </header>

      {err && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{err}</div>
      )}

      {!loading && entries.length === 0 && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
          لا توجد تحويلات مسجّلة بعد.
        </div>
      )}

      <div className="space-y-2">
        {entries.map((e, i) => {
          // Determine type from canonical for the test link.
          const can = rows.find((r) => r.id === e.canonicalId);
          const type = can?.entity_type ?? "figure";
          const oldUrl = entityHref(type, e.from);
          const newUrl = entityHref(type, e.to);
          return (
            <div key={i} className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span dir="ltr" className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-rose-200">{e.from}</span>
                  <ArrowRight className="size-3 text-slate-500" />
                  <span dir="ltr" className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-200">{e.to}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                    e.source === "redirect_from"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  }`}>
                    {e.source === "redirect_from" ? "redirect_from" : "مكرر مؤرشف"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <a href={oldUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600/60 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800/60">
                    <ExternalLink className="size-3.5" /> اختبار التحويل
                  </a>
                  <a href={newUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/10">
                    فتح القياسي
                  </a>
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                القياسي: <span className="font-semibold text-slate-200">{e.canonicalTitle}</span>
                {e.duplicateTitle && <> · المكرر: <span className="text-slate-300">{e.duplicateTitle}</span></>}
              </p>
            </div>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
        </div>
      )}
    </div>
  );
}
