// ============================================================
// Admin: Content Cleanup (single source of truth for encyclopedia)
//
// Detects:
//   • duplicate slugs / titles / metadata.legacy_id
//   • low-richness "weak" legacy rows
//   • atlas_entities rows whose encyclopedia_entity_id is missing,
//     dangling, or points to a disabled / soon-to-be-archived row
//
// Bulk actions (preview → execute, all soft / reversible):
//   • Archive duplicates  → enabled = false + metadata.archived_*
//   • Re-link atlas refs  → atlas_entities.encyclopedia_entity_id = canonical
//   • Replace broken FKs  → same, for currently-broken atlas links
//
// NO hard deletes. Nothing leaves the database.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, ShieldCheck, Loader2, AlertTriangle, PlayCircle,
  Archive, Link2, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { entityRichness } from "@/lib/encyclopedia-source";

export const Route = createFileRoute("/admin/content-cleanup")({
  head: () => ({
    meta: [
      { title: "تنظيف المحتوى — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><Page /></AdminGate>,
});

type EncRow = {
  id: string; entity_type: string; slug: string; title: string;
  subtitle: string | null; summary: string | null;
  body: any; metadata: any; enabled: boolean; updated_at: string;
};
type AtlasRow = {
  id: string; slug: string; kind: string; name_ar: string;
  status: string; encyclopedia_entity_id: string | null;
};

function legacyIdOf(r: EncRow): string | null {
  const m = r.metadata as { legacy_id?: unknown } | null | undefined;
  return m && typeof m === "object" && typeof m.legacy_id === "string" ? m.legacy_id : null;
}
function isWeak(r: EncRow): boolean {
  if (entityRichness(r) >= 2) return false;
  if (r.summary && r.summary.trim().length > 40) return false;
  return true;
}
function pickCanonical(list: EncRow[]): EncRow {
  return [...list].sort((a, b) => {
    const ra = entityRichness(a), rb = entityRichness(b);
    if (ra !== rb) return rb - ra;
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return (b.updated_at || "").localeCompare(a.updated_at || "");
  })[0];
}

function Page() {
  const [enc, setEnc] = useState<EncRow[] | null>(null);
  const [atlas, setAtlas] = useState<AtlasRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Selection sets
  const [archiveIds, setArchiveIds] = useState<Set<string>>(new Set());
  // atlas_id -> target enc id
  const [relink, setRelink] = useState<Map<string, string>>(new Map());

  const [previewOpen, setPreviewOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    const [e, a] = await Promise.all([
      supabase.from("encyclopedia_entities")
        .select("id,entity_type,slug,title,subtitle,summary,body,metadata,enabled,updated_at")
        .order("slug"),
      supabase.from("atlas_entities")
        .select("id,slug,kind,name_ar,status,encyclopedia_entity_id")
        .order("slug"),
    ]);
    if (e.error) setErr(e.error.message);
    if (a.error) setErr(a.error.message);
    setEnc((e.data as EncRow[]) ?? []);
    setAtlas((a.data as AtlasRow[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const audit = useMemo(() => {
    if (!enc || !atlas) return null;
    const bySlug = new Map<string, EncRow[]>();
    const byTitle = new Map<string, EncRow[]>();
    const byLegacy = new Map<string, EncRow[]>();
    for (const r of enc) {
      (bySlug.get(r.slug) ?? bySlug.set(r.slug, []).get(r.slug)!).push(r);
      const t = (r.title || "").trim();
      if (t) (byTitle.get(t) ?? byTitle.set(t, []).get(t)!).push(r);
      const lid = legacyIdOf(r);
      if (lid) (byLegacy.get(lid) ?? byLegacy.set(lid, []).get(lid)!).push(r);
    }
    const dupSlugs = [...bySlug.entries()].filter(([, v]) => v.length > 1);
    const dupTitles = [...byTitle.entries()].filter(([, v]) => v.length > 1);
    const dupLegacy = [...byLegacy.entries()].filter(([, v]) => v.length > 1);
    const weak = enc.filter(isWeak);

    // Canonical map: every duplicate row → canonical id of its slug group
    const canonicalBySlug = new Map<string, EncRow>();
    for (const [slug, list] of dupSlugs) canonicalBySlug.set(slug, pickCanonical(list));

    // Atlas issues
    const enabledIds = new Set(enc.filter(r => r.enabled).map(r => r.id));
    const allIds = new Set(enc.map(r => r.id));
    const encBySlug = new Map<string, EncRow[]>();
    for (const r of enc) (encBySlug.get(r.slug) ?? encBySlug.set(r.slug, []).get(r.slug)!).push(r);

    const atlasIssues = atlas.map(a => {
      const eid = a.encyclopedia_entity_id;
      let issue: "missing" | "dangling" | "disabled" | null = null;
      if (!eid) issue = "missing";
      else if (!allIds.has(eid)) issue = "dangling";
      else if (!enabledIds.has(eid)) issue = "disabled";
      // Suggested candidate: canonical of group with same slug
      const cand = encBySlug.get(a.slug);
      const suggested = cand && cand.length ? pickCanonical(cand) : null;
      return { atlas: a, issue, suggested };
    }).filter(x => x.issue !== null);

    return { dupSlugs, dupTitles, dupLegacy, weak, canonicalBySlug, atlasIssues, encBySlug };
  }, [enc, atlas]);

  // Default selection: every duplicate row that is NOT its group's canonical
  useEffect(() => {
    if (!audit) return;
    const arch = new Set<string>();
    for (const [, list] of audit.dupSlugs) {
      const canon = pickCanonical(list);
      for (const r of list) if (r.id !== canon.id) arch.add(r.id);
    }
    setArchiveIds(arch);
    // Default re-link: every atlas issue with a suggested canonical
    const rl = new Map<string, string>();
    for (const it of audit.atlasIssues) {
      if (it.suggested) rl.set(it.atlas.id, it.suggested.id);
    }
    setRelink(rl);
  }, [audit]);

  async function execute() {
    if (!audit) return;
    setExecuting(true); setResult(null);
    try {
      let archived = 0, relinked = 0;
      // 1) Archive (soft) — chunked updates
      const archList = [...archiveIds];
      for (const id of archList) {
        const row = enc!.find(r => r.id === id);
        if (!row) continue;
        const newMeta = {
          ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
          archived: true,
          archived_at: new Date().toISOString(),
          archived_reason: "content-cleanup-duplicate-or-weak",
        };
        const { error } = await supabase
          .from("encyclopedia_entities")
          .update({ enabled: false, metadata: newMeta })
          .eq("id", id);
        if (!error) archived++;
      }
      // 2) Re-link atlas refs
      for (const [atlasId, encId] of relink.entries()) {
        if (!encId) continue;
        const { error } = await supabase
          .from("atlas_entities")
          .update({ encyclopedia_entity_id: encId })
          .eq("id", atlasId);
        if (!error) relinked++;
      }
      setResult(`تم: أُرشف ${archived} صفًّا، أُعيد ربط ${relinked} مرجع أطلس.`);
      setPreviewOpen(false);
      await load();
    } catch (e: any) {
      setResult("فشل التنفيذ: " + (e?.message ?? String(e)));
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-amber-300/80 hover:text-amber-200">
          <ChevronRight className="size-3.5" /> لوحة الإدارة
        </Link>
        <div className="flex items-center gap-3 border-b border-amber-500/20 pb-3">
          <ShieldCheck className="size-6 text-amber-400" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-amber-100">تنظيف المحتوى</h1>
            <p className="text-xs text-slate-400">
              يحوّل الموسوعة إلى مصدر وحيد للحقيقة: أرشفة المكررات/الضعيفة وإعادة ربط مراجع الأطلس.
              كل التغييرات قابلة للعكس — لا حذف صلب.
            </p>
          </div>
          <button
            onClick={() => {
              if (!enc || !audit) return;
              // Preset: archive every row that carries a pack_id (legacy pack
              // origin) AND has a richer or equal enabled non-pack row sharing
              // its slug. Falls back to "no pack-twin canonical" → keep.
              const next = new Set(archiveIds);
              const nextRelink = new Map(relink);
              for (const row of enc) {
                const meta = row.metadata as { pack_id?: unknown } | null;
                if (!meta || typeof meta !== "object" || !("pack_id" in meta)) continue;
                const twins = audit.encBySlug.get(row.slug) ?? [];
                const cleanTwins = twins.filter(t => {
                  const m = t.metadata as any;
                  return t.enabled && t.id !== row.id && !(m && typeof m === "object" && "pack_id" in m);
                });
                if (cleanTwins.length === 0) continue; // no replacement → keep
                next.add(row.id);
                // repoint atlas refs that currently point at the pack row
                const canon = pickCanonical(cleanTwins);
                for (const a of atlas ?? []) {
                  if (a.encyclopedia_entity_id === row.id) nextRelink.set(a.id, canon.id);
                }
              }
              setArchiveIds(next);
              setRelink(nextRelink);
            }}
            disabled={!audit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
          >
            تحديد الموروث (pack)
          </button>
          <button
            onClick={() => setPreviewOpen(true)}
            disabled={!audit || (archiveIds.size === 0 && relink.size === 0)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
          >
            <Eye className="size-3.5" /> معاينة وتنفيذ
          </button>
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
        {result && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {result}
          </div>
        )}

        {audit && (
          <>
            <Totals
              enc={enc!.length}
              dupSlugs={audit.dupSlugs.length}
              dupTitles={audit.dupTitles.length}
              dupLegacy={audit.dupLegacy.length}
              weak={audit.weak.length}
              atlasIssues={audit.atlasIssues.length}
              archiveSel={archiveIds.size}
              relinkSel={relink.size}
            />

            <DupGroups
              title={`مكررات slug (${audit.dupSlugs.length})`}
              groups={audit.dupSlugs}
              archiveIds={archiveIds}
              setArchiveIds={setArchiveIds}
            />
            <DupGroups
              title={`عناوين عربية مكررة (${audit.dupTitles.length})`}
              groups={audit.dupTitles}
              archiveIds={archiveIds}
              setArchiveIds={setArchiveIds}
            />
            <DupGroups
              title={`legacy_id مكرر (${audit.dupLegacy.length})`}
              groups={audit.dupLegacy}
              archiveIds={archiveIds}
              setArchiveIds={setArchiveIds}
            />

            {audit.weak.length > 0 && (
              <section>
                <h2 className="font-display mb-2 text-sm font-bold text-amber-200">صفوف ضعيفة ({audit.weak.length})</h2>
                <div className="space-y-1">
                  {audit.weak.slice(0, 200).map(r => (
                    <RowToggle
                      key={r.id} r={r}
                      checked={archiveIds.has(r.id)}
                      onChange={(v) => {
                        const n = new Set(archiveIds);
                        v ? n.add(r.id) : n.delete(r.id);
                        setArchiveIds(n);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            <AtlasIssues
              issues={audit.atlasIssues}
              encBySlug={audit.encBySlug}
              relink={relink}
              setRelink={setRelink}
            />
          </>
        )}
      </div>

      {previewOpen && audit && (
        <Preview
          enc={enc!} atlas={atlas!}
          archiveIds={archiveIds} relink={relink}
          onClose={() => setPreviewOpen(false)}
          onConfirm={execute} executing={executing}
        />
      )}
    </div>
  );
}

function Totals(p: {
  enc: number; dupSlugs: number; dupTitles: number; dupLegacy: number;
  weak: number; atlasIssues: number; archiveSel: number; relinkSel: number;
}) {
  const cells = [
    { l: "صفوف موسوعة", v: p.enc },
    { l: "مكررات slug", v: p.dupSlugs },
    { l: "عناوين مكررة", v: p.dupTitles },
    { l: "legacy_id مكرر", v: p.dupLegacy },
    { l: "ضعيفة", v: p.weak },
    { l: "مشكلات أطلس", v: p.atlasIssues },
    { l: "للأرشفة", v: p.archiveSel, hi: true },
    { l: "لإعادة الربط", v: p.relinkSel, hi: true },
  ];
  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {cells.map(c => (
        <div key={c.l} className={`rounded-lg border p-3 ${c.hi ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/20 bg-slate-900/60"}`}>
          <div className="text-[10px] text-slate-400">{c.l}</div>
          <div className={`mt-1 text-xl font-bold ${c.hi ? "text-emerald-300" : "text-amber-300"}`}>{c.v}</div>
        </div>
      ))}
    </section>
  );
}

function DupGroups({ title, groups, archiveIds, setArchiveIds }: {
  title: string; groups: [string, EncRow[]][];
  archiveIds: Set<string>; setArchiveIds: (s: Set<string>) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <section>
      <h2 className="font-display mb-2 text-sm font-bold text-amber-200">{title}</h2>
      <div className="space-y-3">
        {groups.slice(0, 100).map(([key, list]) => {
          const ranked = [...list].sort((a, b) => entityRichness(b) - entityRichness(a));
          const canon = ranked[0];
          return (
            <div key={key} className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
              <div className="mb-2 text-[11px] text-amber-300/80">
                <span className="font-mono">{key}</span>
                <span className="mx-2 opacity-60">× {list.length}</span>
              </div>
              <div className="space-y-1">
                {ranked.map(r => (
                  <RowToggle
                    key={r.id} r={r}
                    canonical={r.id === canon.id}
                    checked={archiveIds.has(r.id)}
                    onChange={(v) => {
                      const n = new Set(archiveIds);
                      v ? n.add(r.id) : n.delete(r.id);
                      setArchiveIds(n);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RowToggle({ r, canonical, checked, onChange }: {
  r: EncRow; canonical?: boolean; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={canonical}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-amber-500"
      />
      {canonical
        ? <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">قياسي</span>
        : <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-slate-300">مرشّح للأرشفة</span>}
      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">{r.entity_type}</span>
      <span className="flex-1 truncate" title={r.title}>{r.title || <i className="text-slate-500">بدون عنوان</i>}</span>
      <span className="font-mono text-[10px] text-slate-500">score {entityRichness(r).toFixed(0)}</span>
      <span className={`text-[10px] ${r.enabled ? "text-emerald-400" : "text-slate-500"}`}>
        {r.enabled ? "مفعّل" : "معطّل"}
      </span>
    </label>
  );
}

function AtlasIssues({ issues, encBySlug, relink, setRelink }: {
  issues: { atlas: AtlasRow; issue: string | null; suggested: EncRow | null }[];
  encBySlug: Map<string, EncRow[]>;
  relink: Map<string, string>;
  setRelink: (m: Map<string, string>) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <section>
      <h2 className="font-display mb-2 text-sm font-bold text-amber-200">مشكلات روابط الأطلس ({issues.length})</h2>
      <div className="space-y-1.5">
        {issues.slice(0, 200).map(({ atlas, issue, suggested }) => {
          const cands = (encBySlug.get(atlas.slug) ?? []).slice().sort((a, b) => entityRichness(b) - entityRichness(a));
          const cur = relink.get(atlas.id) ?? suggested?.id ?? "";
          return (
            <div key={atlas.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 p-2 text-xs">
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300">{issue}</span>
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">{atlas.kind}</span>
              <span className="flex-1 truncate">{atlas.name_ar} <span className="font-mono text-slate-500">({atlas.slug})</span></span>
              <select
                value={cur}
                onChange={(e) => {
                  const n = new Map(relink);
                  if (e.target.value) n.set(atlas.id, e.target.value);
                  else n.delete(atlas.id);
                  setRelink(n);
                }}
                className="rounded border border-white/15 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-100 max-w-[260px]"
              >
                <option value="">— لا تغيير —</option>
                {cands.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.entity_type} · {c.title || c.slug} · score {entityRichness(c).toFixed(0)}{c.enabled ? "" : " · معطّل"}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Preview({ enc, atlas, archiveIds, relink, onClose, onConfirm, executing }: {
  enc: EncRow[]; atlas: AtlasRow[];
  archiveIds: Set<string>; relink: Map<string, string>;
  onClose: () => void; onConfirm: () => void; executing: boolean;
}) {
  const encById = new Map(enc.map(r => [r.id, r] as const));
  const atlasById = new Map(atlas.map(a => [a.id, a] as const));
  const archiveRows = [...archiveIds].map(id => encById.get(id)).filter(Boolean) as EncRow[];
  const relinkRows = [...relink.entries()].map(([aid, eid]) => ({
    atlas: atlasById.get(aid), target: encById.get(eid),
  })).filter(x => x.atlas && x.target);

  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-amber-500/30 bg-slate-950 p-5 text-slate-100">
        <div className="mb-3 flex items-center gap-2 border-b border-amber-500/20 pb-2">
          <Eye className="size-5 text-amber-300" />
          <h3 className="text-base font-bold text-amber-100">معاينة قبل التنفيذ</h3>
          <span className="ms-auto text-[11px] text-slate-400">قابل للعكس · بدون حذف</span>
        </div>

        <section className="mb-4">
          <div className="mb-1 flex items-center gap-1.5 text-sm text-amber-200">
            <Archive className="size-4" /> سيُؤرشف ({archiveRows.length})
          </div>
          <div className="max-h-60 space-y-1 overflow-auto rounded border border-white/10 bg-slate-900/60 p-2">
            {archiveRows.length === 0 && <p className="text-[11px] text-slate-500">لا شيء.</p>}
            {archiveRows.map(r => (
              <div key={r.id} className="flex items-center gap-2 text-[11px]">
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">{r.entity_type}</span>
                <span className="font-mono text-slate-500">{r.slug}</span>
                <span className="truncate">{r.title}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <div className="mb-1 flex items-center gap-1.5 text-sm text-amber-200">
            <Link2 className="size-4" /> إعادة ربط الأطلس ({relinkRows.length})
          </div>
          <div className="max-h-60 space-y-1 overflow-auto rounded border border-white/10 bg-slate-900/60 p-2">
            {relinkRows.length === 0 && <p className="text-[11px] text-slate-500">لا شيء.</p>}
            {relinkRows.map(({ atlas, target }) => (
              <div key={atlas!.id} className="flex items-center gap-2 text-[11px]">
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">{atlas!.kind}</span>
                <span className="truncate">{atlas!.name_ar}</span>
                <span className="text-slate-500">→</span>
                <span className="truncate text-emerald-300">{target!.title || target!.slug}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-end gap-2 border-t border-amber-500/20 pt-3">
          <button onClick={onClose} disabled={executing}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50">
            إلغاء
          </button>
          <button onClick={onConfirm} disabled={executing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50">
            {executing ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
            تأكيد التنفيذ
          </button>
        </div>
      </div>
    </div>
  );
}
