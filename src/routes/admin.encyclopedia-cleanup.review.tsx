// Bulk Canonical Review — walks duplicate groups one at a time so admins
// can choose canonical, archive duplicates, merge, or skip in seconds.
//
// All actions reuse the same row patterns as the main workshop. We do NOT
// duplicate the rich soft-merge logic from the workshop (atlas repoint,
// campaign rewrite) — that lives in the workshop merge dialog. For now
// review-mode performs:
//   • set canonical : metadata.canonical = true on chosen row
//   • archive other : enabled=false + metadata.archived + canonical_id/slug
//                     of the chosen canonical (so redirects work)
//   • merge action  : same as archive, plus appends slug to canonical's
//                     metadata.redirect_from. This is the safe subset of
//                     soft-merge. Full repoint should be done from the
//                     workshop for high-traffic entities.
//   • skip          : stored in sessionStorage only.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowLeft, ArrowRight, CheckCircle2, GitMerge, Loader2,
  RefreshCw, Skull, SkipForward, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clusterDuplicates, type DuplicateGroup } from "@/lib/encyclopedia-clusters";
import { scoreColor, scoreEntity } from "@/lib/encyclopedia-quality";

type Row = {
  id: string; entity_type: string; slug: string; title: string;
  subtitle: string | null; summary: string | null;
  body: any; metadata: any; enabled: boolean;
};

export const Route = createFileRoute("/admin/encyclopedia-cleanup/review")({
  head: () => ({ meta: [{ title: "مراجعة المكررات — إرث" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ReviewMode,
});

const SKIP_KEY = "irth-admin-cleanup-skip-v1";

function loadSkips(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(SKIP_KEY) ?? "[]")); }
  catch { return new Set(); }
}
function saveSkips(s: Set<string>) {
  try { sessionStorage.setItem(SKIP_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

async function audit(action: string, detail: Record<string, unknown>) {
  try {
    // Direct INSERTs into admin_audit_log are not permitted for app roles.
    await supabase.rpc("log_admin_action" as any, {
      p_action: action,
      p_target: null,
      p_detail: detail as any,
      p_reason: "bulk-review",
    });
  } catch { /* never block on audit */ }
}


function ReviewMode() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [skips, setSkips] = useState<Set<string>>(() => loadSkips());
  const [idx, setIdx] = useState(0);
  const [chosenCanonical, setChosenCanonical] = useState<Record<string, string>>({});

  const refresh = async () => {
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase
        .from("encyclopedia_entities" as any)
        .select("id,entity_type,slug,title,subtitle,summary,body,metadata,enabled")
        .order("updated_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      setRows((data ?? []) as unknown as Row[]);
    } catch (e: any) { setErr(e?.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const groups: DuplicateGroup<Row>[] = useMemo(() => {
    const all = clusterDuplicates(rows);
    return all.filter((g) => !skips.has(g.key));
  }, [rows, skips]);

  const total = groups.length;
  const current = groups[idx] ?? null;
  useEffect(() => { if (idx >= total) setIdx(0); }, [total, idx]);

  const skip = () => {
    if (!current) return;
    const next = new Set(skips); next.add(current.key);
    setSkips(next); saveSkips(next);
    setIdx((i) => Math.min(i, Math.max(0, total - 2)));
  };

  const setCanonical = (groupKey: string, id: string) =>
    setChosenCanonical((m) => ({ ...m, [groupKey]: id }));

  const archiveAsDup = async (dup: Row, canonical: Row, withRedirect: boolean) => {
    setBusy(dup.id);
    try {
      const dupMeta = { ...(dup.metadata || {}) };
      dupMeta.canonical_id = canonical.id;
      dupMeta.canonical_slug = canonical.slug;
      dupMeta.archived = true;
      dupMeta.archived_at = new Date().toISOString();
      dupMeta.hidden_duplicate = true;
      const r1 = await supabase.from("encyclopedia_entities" as any)
        .update({ enabled: false, metadata: dupMeta }).eq("id", dup.id);
      if (r1.error) throw r1.error;

      if (withRedirect) {
        const canMeta = { ...(canonical.metadata || {}) };
        const redirects: string[] = Array.isArray(canMeta.redirect_from) ? [...canMeta.redirect_from] : [];
        if (dup.slug && !redirects.includes(dup.slug)) redirects.push(dup.slug);
        canMeta.redirect_from = redirects;
        canMeta.canonical = true;
        const aliases: string[] = Array.isArray(canMeta.aliases) ? [...canMeta.aliases] : [];
        if (dup.title && !aliases.includes(dup.title)) aliases.push(dup.title);
        canMeta.aliases = aliases;
        const r2 = await supabase.from("encyclopedia_entities" as any)
          .update({ metadata: canMeta }).eq("id", canonical.id);
        if (r2.error) throw r2.error;
      }

      await audit(withRedirect ? "encyclopedia.merge.bulk" : "encyclopedia.archive.bulk", {
        canonical_id: canonical.id, canonical_slug: canonical.slug,
        duplicate_id: dup.id, duplicate_slug: dup.slug,
      });
      setToast(withRedirect ? "تم الدمج" : "تمت أرشفة المكرر");
      await refresh();
    } catch (e: any) {
      setToast("فشل: " + (e?.message || e));
    } finally { setBusy(null); }
  };

  const markCanonical = async (canonical: Row) => {
    setBusy(canonical.id);
    try {
      const meta = { ...(canonical.metadata || {}), canonical: true };
      const { error } = await supabase.from("encyclopedia_entities" as any)
        .update({ metadata: meta }).eq("id", canonical.id);
      if (error) throw error;
      await audit("encyclopedia.canonical.mark", { id: canonical.id, slug: canonical.slug });
      setToast("تم تعيين القياسي");
      await refresh();
    } catch (e: any) { setToast("فشل: " + (e?.message || e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
        <div>
          <h1 className="text-lg font-bold text-amber-100">مراجعة المكررات</h1>
          <p className="text-xs text-slate-400">
            {loading ? "جارٍ التحميل…" : `${total} مجموعة · تم تخطّي ${skips.size}`}
            {" · "}<Link to="/admin/encyclopedia-cleanup" className="underline hover:text-amber-200">عودة للورشة</Link>
          </p>
        </div>
        <div className="flex gap-2">
          {skips.size > 0 && (
            <button onClick={() => { setSkips(new Set()); saveSkips(new Set()); }}
              className="rounded-md border border-slate-600/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60">
              إفراغ قائمة التخطّي
            </button>
          )}
          <button onClick={refresh} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
          </button>
        </div>
      </header>

      {err && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{err}</div>
      )}

      {!loading && total === 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center text-sm text-emerald-200">
          <CheckCircle2 className="mx-auto mb-2 size-6" />
          لا توجد مجموعات مكررة قابلة للمراجعة الآن.
        </div>
      )}

      {current && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>المجموعة {idx + 1} من {total} · نوع: {current.members[0].entity_type}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
                className="rounded border border-slate-700/60 p-1 hover:bg-slate-800/60 disabled:opacity-40">
                <ArrowRight className="size-3.5" />
              </button>
              <button onClick={() => setIdx((i) => Math.min(total - 1, i + 1))} disabled={idx >= total - 1}
                className="rounded border border-slate-700/60 p-1 hover:bg-slate-800/60 disabled:opacity-40">
                <ArrowLeft className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 text-xs text-fuchsia-200">
            <Sparkles className="me-1 inline size-3.5" />
            اختر الكيان القياسي ثم أرشف أو ادمج باقي الأعضاء. التخطّي يُحفظ في الجلسة فقط.
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {current.members.map((m) => {
              const score = scoreEntity({
                summary: m.summary, body: m.body, metadata: m.metadata,
              });
              const isCanon = chosenCanonical[current.key] === m.id;
              const len = (m.summary ?? "").length + (typeof m.body === "string" ? m.body.length : JSON.stringify(m.body || {}).length);
              return (
                <div key={m.id} className={`rounded-xl border p-3 transition ${
                  isCanon
                    ? "border-emerald-400/60 bg-emerald-500/10"
                    : "border-slate-700/60 bg-slate-900/40"
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{m.title}</p>
                      <p dir="ltr" className="truncate font-mono text-[10px] text-slate-500">{m.slug}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${scoreColor(score)}`}>
                      {score}%
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-400">
                    <span className="rounded-full border border-slate-700/60 px-1.5">{len} حرف</span>
                    {!m.enabled && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 text-amber-300">مؤرشف</span>}
                    {m.metadata?.canonical && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 text-emerald-300">قياسي</span>}
                  </div>
                  {m.summary && (
                    <p className="mt-2 line-clamp-3 text-[12px] text-slate-300">{m.summary}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button onClick={() => setCanonical(current.key, m.id)}
                      className={`rounded-md border px-2 py-1 text-[11px] ${
                        isCanon
                          ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                          : "border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"
                      }`}>
                      {isCanon ? "القياسي" : "اجعله القياسي"}
                    </button>
                    {chosenCanonical[current.key] && !isCanon && (
                      <>
                        <button
                          disabled={busy === m.id}
                          onClick={() => {
                            const can = current.members.find((x) => x.id === chosenCanonical[current.key]);
                            if (can) void archiveAsDup(m, can, false);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
                          <Archive className="size-3.5" /> أرشف
                        </button>
                        <button
                          disabled={busy === m.id}
                          onClick={() => {
                            const can = current.members.find((x) => x.id === chosenCanonical[current.key]);
                            if (can) void archiveAsDup(m, can, true);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-1 text-[11px] text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-50">
                          {busy === m.id ? <Loader2 className="size-3.5 animate-spin" /> : <GitMerge className="size-3.5" />} ادمج
                        </button>
                      </>
                    )}
                    <Link
                      to="/admin/encyclopedia-cleanup"
                      search={{ select: m.id } as any}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-700/60 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800/60">
                      افتح في الورشة
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/40 pt-3">
            <div className="text-xs text-slate-400">
              {chosenCanonical[current.key]
                ? "اختر إجراء على باقي الأعضاء."
                : "ابدأ باختيار الكيان القياسي."}
            </div>
            <div className="flex gap-2">
              {chosenCanonical[current.key] && (
                <button
                  onClick={() => {
                    const can = current.members.find((x) => x.id === chosenCanonical[current.key]);
                    if (can) void markCanonical(can);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20">
                  <CheckCircle2 className="size-3.5" /> تثبيت القياسي
                </button>
              )}
              <button onClick={skip}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-600/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/60">
                <SkipForward className="size-3.5" /> تخطّي إلى التالي
              </button>
              <button onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                disabled={idx >= total - 1}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
                التالي
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-6 mx-auto w-fit max-w-md rounded-full border border-amber-400/30 bg-slate-900/90 px-4 py-2 text-sm text-amber-100 shadow-lg backdrop-blur">
          {toast}
          <button onClick={() => setToast(null)} className="ms-3 text-slate-400 hover:text-slate-100">×</button>
        </div>
      )}
    </div>
  );
}
// Reference unused import to keep tree-shaking happy across builds.
void Skull;
