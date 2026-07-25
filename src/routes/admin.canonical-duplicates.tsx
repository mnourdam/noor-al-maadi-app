// ============================================================
// Admin: Canonical Duplicates Resolver
//
// Detects duplicate encyclopedia entities and provides safe merge actions:
//   • mark canonical
//   • soft-hide duplicate (enabled=false + metadata.canonical_id)
//   • repoint atlas_entities.encyclopedia_entity_id
//   • repoint admin_campaigns references (slug-based string rewrite)
//
// NEVER hard-deletes. Preserves duplicate data in canonical.metadata.merged_from.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ShieldCheck, Loader2, AlertTriangle, Crown, EyeOff, Link2, Wand2, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { entityRichness } from "@/lib/encyclopedia-source";
import { normalizeArabicName, normalizeSlugKey } from "@/lib/arabic-normalize";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/canonical-duplicates")({
  head: () => ({
    meta: [
      { title: "حل المكررات القياسية — إرث" },
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
  timeline_start_year: number | null;
  timeline_end_year: number | null;
  timeline_year: number | null;
};
type Atlas = { id: string; slug: string; encyclopedia_entity_id: string | null };
type Campaign = { id: string; title: string; data: any };

// Normalization is centralized in src/lib/arabic-normalize.ts so the same
// matching keys are used by canonical-duplicates, the admin create form, and
// any future import pipeline. Strips diacritics, honorifics (رضي الله عنه /
// رحمه الله / صلى الله عليه وسلم), battle prefixes, and folds alef variants.
const normTitle = normalizeArabicName;
const normSlug = normalizeSlugKey;
function eraOf(r: Row): string {
  const m = r.metadata as any;
  return String(m?.era ?? "").trim();
}
function rangeOf(r: Row): string {
  const s = r.timeline_start_year ?? r.timeline_year;
  const e = r.timeline_end_year ?? r.timeline_year;
  return s == null && e == null ? "" : `${s ?? "?"}..${e ?? "?"}`;
}
function bodyLen(r: Row): number {
  try { return JSON.stringify(r.body ?? {}).length; } catch { return 0; }
}
function sourceCount(r: Row): number {
  const b = r.body as any;
  return Array.isArray(b?.sources) ? b.sources.length : 0;
}
function isCanonical(r: Row): boolean {
  return !!(r.metadata as any)?.canonical;
}
function canonicalIdOf(r: Row): string | null {
  const v = (r.metadata as any)?.canonical_id;
  return typeof v === "string" ? v : null;
}

type GroupStatus = "unresolved" | "partially_resolved" | "fully_resolved";
type Group = {
  key: string;
  rows: Row[];
  suggested: Row;
};

function isHiddenDup(r: Row): boolean {
  return !!(r.metadata as any)?.hidden_duplicate || (!r.enabled && !!canonicalIdOf(r));
}
function groupStatus(g: Group): GroupStatus {
  const hidden = g.rows.filter(isHiddenDup).length;
  const enabled = g.rows.filter(r => r.enabled && !isHiddenDup(r)).length;
  if (hidden === 0) return "unresolved";
  if (hidden === g.rows.length - 1 && enabled === 1) return "fully_resolved";
  return "partially_resolved";
}

function buildGroups(rows: Row[]): Group[] {
  const buckets = new Map<string, Row[]>();
  for (const r of rows) {
    const nt = normTitle(r.title);
    const ns = normSlug(r.slug);
    // primary key: type + normalized title; fallback secondary: type + normalized slug
    const key = `${r.entity_type}|t:${nt}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(r);
    if (ns && ns !== nt) {
      const k2 = `${r.entity_type}|s:${ns}`;
      (buckets.get(k2) ?? buckets.set(k2, []).get(k2)!).push(r);
    }
  }
  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    // dedupe groups by row-id set
    const sig = list.map(r => r.id).sort().join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    // optional refine: same era OR overlapping date OR shared atlas — keep loose to surface
    const ranked = [...list].sort((a, b) => {
      if (isCanonical(b) !== isCanonical(a)) return isCanonical(b) ? 1 : -1;
      const ra = entityRichness(a), rb = entityRichness(b);
      if (rb !== ra) return rb - ra;
      return bodyLen(b) - bodyLen(a);
    });
    groups.push({ key, rows: ranked, suggested: ranked[0] });
  }
  return groups.sort((a, b) => b.rows.length - a.rows.length);
}

function Page() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [atlas, setAtlas] = useState<Atlas[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    const [e, a, c] = await Promise.all([
      supabase.from("encyclopedia_entities")
        .select("id,entity_type,slug,title,subtitle,summary,body,metadata,enabled,timeline_start_year,timeline_end_year,timeline_year")
        .order("title", { ascending: true }),
      supabase.from("atlas_entities").select("id,slug,encyclopedia_entity_id"),
      supabase.from("admin_campaigns").select("id,title,data"),
    ]);
    if (e.error) setErr(e.error.message);
    else setRows((e.data as Row[]) ?? []);
    setAtlas((a.data as Atlas[]) ?? []);
    setCampaigns(selectCampaignRows((c.data as Campaign[]) ?? []));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => rows ? buildGroups(rows) : null, [rows]);

  // index: entity id -> atlas rows linking to it
  const atlasByEnt = useMemo(() => {
    const m = new Map<string, Atlas[]>();
    for (const a of atlas ?? []) {
      if (a.encyclopedia_entity_id)
        (m.get(a.encyclopedia_entity_id) ?? m.set(a.encyclopedia_entity_id, []).get(a.encyclopedia_entity_id)!).push(a);
    }
    return m;
  }, [atlas]);

  // index: slug -> campaigns that reference it (string scan of JSON)
  const campaignsBySlug = useMemo(() => {
    const m = new Map<string, Campaign[]>();
    for (const c of campaigns ?? []) {
      let s = ""; try { s = JSON.stringify(c.data); } catch { continue; }
      // Match `:slug` token (after `type:`) avoiding partial words
      const seen = new Set<string>();
      const re = /[a-z]+:([a-z0-9-]+)/g;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(s)) !== null) seen.add(mm[1]);
      for (const slug of seen) {
        (m.get(slug) ?? m.set(slug, []).get(slug)!).push(c);
      }
    }
    return m;
  }, [campaigns]);

  async function markCanonical(g: Group, canonical: Row) {
    setBusy(g.key); setMsg(null);
    try {
      const newMeta = { ...(canonical.metadata || {}), canonical: true };
      const r = await supabase.from("encyclopedia_entities")
        .update({ metadata: newMeta }).eq("id", canonical.id);
      if (r.error) throw r.error;
      setMsg(`تم تعيين «${canonical.title}» كقياسي.`);
      await load();
    } catch (e: any) { setMsg("فشل: " + (e?.message || e)); }
    finally { setBusy(null); }
  }

  async function softHideAndRedirect(dup: Row, canonical: Row) {
    setBusy(dup.id); setMsg(null);
    try {
      // 1) hide duplicate, set canonical_id and hidden_duplicate
      const dupMeta = {
        ...(dup.metadata || {}),
        canonical_id: canonical.id,
        canonical_slug: canonical.slug,
        hidden_duplicate: true,
        hidden_at: new Date().toISOString(),
      };
      const r1 = await supabase.from("encyclopedia_entities")
        .update({ metadata: dupMeta, enabled: false }).eq("id", dup.id);
      if (r1.error) throw r1.error;

      // 2) preserve provenance on canonical
      const canMeta: any = { ...(canonical.metadata || {}), canonical: true };
      const mergedFrom: any[] = Array.isArray(canMeta.merged_from) ? [...canMeta.merged_from] : [];
      if (!mergedFrom.find((x: any) => x?.id === dup.id)) {
        mergedFrom.push({
          id: dup.id, slug: dup.slug, title: dup.title,
          summary: dup.summary, subtitle: dup.subtitle,
          body: dup.body, source_metadata: dup.metadata,
          merged_at: new Date().toISOString(),
        });
      }
      canMeta.merged_from = mergedFrom;
      const r2 = await supabase.from("encyclopedia_entities")
        .update({ metadata: canMeta }).eq("id", canonical.id);
      if (r2.error) throw r2.error;

      // 3) repoint atlas
      const aList = atlasByEnt.get(dup.id) ?? [];
      for (const a of aList) {
        const r = await supabase.from("atlas_entities")
          .update({ encyclopedia_entity_id: canonical.id }).eq("id", a.id);
        if (r.error) throw r.error;
      }

      // 4) repoint campaigns (slug-based JSON string replace, conservative)
      const camps = campaignsBySlug.get(dup.slug) ?? [];
      for (const c of camps) {
        const s = JSON.stringify(c.data);
        // replace `:dupSlug` boundary only after `:` and before quote/punct
        const safe = dup.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(:)${safe}(?=[^a-z0-9-]|$)`, "g");
        const next = s.replace(re, `$1${canonical.slug}`);
        if (next !== s) {
          let parsed: any; try { parsed = JSON.parse(next); } catch { continue; }
          const r = await supabase.from("admin_campaigns")
            .update({ data: parsed }).eq("id", c.id);
          if (r.error) throw r.error;
        }
      }

      setMsg(`تم إخفاء «${dup.title}» وتحويلها إلى القياسي.`);
      await load();
    } catch (e: any) { setMsg("فشل: " + (e?.message || e)); }
    finally { setBusy(null); }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-center gap-2 border-b border-amber-500/20 pb-3">
          <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-amber-300/80 hover:text-amber-200">
            <ChevronRight className="size-3.5" /> لوحة الإدارة
          </Link>
        </header>
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-6 text-amber-400" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-amber-100">حل المكررات القياسية</h1>
            <p className="text-xs text-slate-400">
              كشف الكيانات المكررة وحلها بأمان: تعيين قياسي، إخفاء ناعم، إعادة توجيه الأطلس والحملات. لا حذف صلب.
            </p>
          </div>
          <button onClick={load} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20">
            تحديث
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
        {msg && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">{msg}</div>
        )}

        {groups && (
          <>
            <GroupsView
              rows={rows ?? []}
              groups={groups}
              atlasByEnt={atlasByEnt}
              campaignsBySlug={campaignsBySlug}
              busy={busy}
              onMarkCanonical={(g, r) => markCanonical(g, r)}
              onHide={(dup, can) => softHideAndRedirect(dup, can)}
            />
          </>
        )}
      </div>
    </div>
  );
}

type FilterMode = "all" | "open" | "done" | "collapsed";

function GroupsView({ rows, groups, atlasByEnt, campaignsBySlug, busy, onMarkCanonical, onHide }: {
  rows: Row[];
  groups: Group[];
  atlasByEnt: Map<string, Atlas[]>;
  campaignsBySlug: Map<string, Campaign[]>;
  busy: string | null;
  onMarkCanonical: (g: Group, r: Row) => void;
  onHide: (dup: Row, can: Row) => void;
}) {
  const statuses = useMemo(() => {
    const m = new Map<string, GroupStatus>();
    for (const g of groups) m.set(g.key, groupStatus(g));
    return m;
  }, [groups]);

  // Collapse state per group; default = collapsed iff fully_resolved
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<FilterMode>("all");

  // Initialize defaults when groups change (don't override user choices already set)
  useEffect(() => {
    setCollapsed(prev => {
      const next = { ...prev };
      for (const g of groups) {
        if (!(g.key in next)) next[g.key] = statuses.get(g.key) === "fully_resolved";
      }
      return next;
    });
  }, [groups, statuses]);

  const counts = useMemo(() => {
    let done = 0, open = 0;
    for (const g of groups) (statuses.get(g.key) === "fully_resolved" ? done++ : open++);
    const hidden = rows.filter(r => !!(r.metadata as any)?.hidden_duplicate).length;
    return { done, open, hidden };
  }, [groups, statuses, rows]);

  const visible = useMemo(() => {
    return groups.filter(g => {
      const s = statuses.get(g.key)!;
      if (filter === "open") return s !== "fully_resolved";
      if (filter === "done") return s === "fully_resolved";
      if (filter === "collapsed") return collapsed[g.key];
      return true;
    });
  }, [groups, statuses, filter, collapsed]);

  const setAllCollapsed = (v: boolean) => {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.key] = v;
    setCollapsed(next);
  };

  return (
    <>
      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat l="مجموعات مكتملة" v={counts.done} />
        <Stat l="مجموعات متبقية" v={counts.open} />
        <Stat l="مكررات مخفية" v={counts.hidden} />
        <Stat l="إجمالي المجموعات" v={groups.length} />
      </section>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 p-2 text-xs">
        {([
          ["all", "الكل"],
          ["open", "غير منتهية"],
          ["done", "منتهية"],
          ["collapsed", "مطوية فقط"],
        ] as [FilterMode, string][]).map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded border px-2 py-1 ${filter === k ? "border-amber-400 bg-amber-500/20 text-amber-100" : "border-white/10 bg-slate-950/40 text-slate-300 hover:bg-white/5"}`}>
            {lbl}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-white/10" />
        <button onClick={() => setAllCollapsed(true)}
          className="rounded border border-white/10 bg-slate-950/40 px-2 py-1 text-slate-300 hover:bg-white/5">طي الكل</button>
        <button onClick={() => setAllCollapsed(false)}
          className="rounded border border-white/10 bg-slate-950/40 px-2 py-1 text-slate-300 hover:bg-white/5">فتح الكل</button>
        <span className="ms-auto text-[10px] text-slate-400">يظهر {visible.length} من {groups.length}</span>
      </div>

      <p className="text-[11px] text-slate-400">
        الترشيح: نفس <code>entity_type</code> + عنوان عربي معياري (أو slug معياري). المجموعات المكتملة تُطوى تلقائياً.
      </p>

      <div className="space-y-4">
        {visible.map(g => (
          <GroupCard
            key={g.key}
            g={g}
            status={statuses.get(g.key)!}
            collapsed={!!collapsed[g.key]}
            onToggle={() => setCollapsed(p => ({ ...p, [g.key]: !p[g.key] }))}
            atlasByEnt={atlasByEnt}
            campaignsBySlug={campaignsBySlug}
            busy={busy}
            onMarkCanonical={(r) => onMarkCanonical(g, r)}
            onHide={(dup, can) => onHide(dup, can)}
          />
        ))}
        {visible.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
            لا توجد مجموعات لعرضها بهذا المرشّح.
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ l, v }: { l: string; v: number }) {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-slate-900/60 p-3">
      <div className="text-[10px] text-slate-400">{l}</div>
      <div className="mt-1 text-xl font-bold text-amber-300">{v}</div>
    </div>
  );
}

function GroupCard({ g, status, collapsed, onToggle, atlasByEnt, campaignsBySlug, busy, onMarkCanonical, onHide }: {
  g: Group;
  status: GroupStatus;
  collapsed: boolean;
  onToggle: () => void;
  atlasByEnt: Map<string, Atlas[]>;
  campaignsBySlug: Map<string, Campaign[]>;
  busy: string | null;
  onMarkCanonical: (r: Row) => void;
  onHide: (dup: Row, can: Row) => void;
}) {
  const [chosenId, setChosenId] = useState<string>(g.suggested.id);
  const canonical = g.rows.find(r => r.id === chosenId) ?? g.suggested;

  const statusBadge =
    status === "fully_resolved"
      ? { txt: "مكتملة", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" }
      : status === "partially_resolved"
      ? { txt: "جزئية", cls: "bg-amber-500/15 text-amber-200 border-amber-500/30" }
      : { txt: "غير محلولة", cls: "bg-rose-500/15 text-rose-200 border-rose-500/30" };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <button onClick={onToggle} className="inline-flex items-center text-slate-300 hover:text-amber-200" aria-label={collapsed ? "فتح" : "طي"}>
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">{g.rows[0].entity_type}</span>
        <span className="text-sm font-bold text-amber-100">{g.suggested.title}</span>
        <span className="text-[10px] text-slate-400">({g.rows.length})</span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${statusBadge.cls}`}>{statusBadge.txt}</span>
        <span className="ms-auto font-mono text-[10px] text-slate-500">{g.key}</span>
      </div>

      {collapsed ? null : (
      <div className="space-y-1.5">

        {g.rows.map(r => {
          const aList = atlasByEnt.get(r.id) ?? [];
          const cList = campaignsBySlug.get(r.slug) ?? [];
          const cid = canonicalIdOf(r);
          const isChosen = r.id === chosenId;
          return (
            <div key={r.id} className={`rounded-lg border p-2 text-xs ${isChosen ? "border-emerald-500/50 bg-emerald-500/5" : "border-white/10 bg-slate-950/40"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1">
                  <input type="radio" name={`can-${g.key}`} checked={isChosen} onChange={() => setChosenId(r.id)} />
                  {isCanonical(r) && <Crown className="size-3.5 text-amber-300" />}
                  <span className="font-bold">{r.title}</span>
                </label>
                <span className="font-mono text-[10px] text-slate-500">{r.slug}</span>
                {!r.enabled && <span className="rounded bg-slate-700/60 px-1 text-[10px] text-slate-300">معطّل</span>}
                {cid && <span className="rounded bg-rose-500/20 px-1 text-[10px] text-rose-300">يُحوَّل → {cid.slice(0, 6)}</span>}
                <span className="ms-auto text-[10px] text-slate-400">
                  rich {entityRichness(r).toFixed(0)} · body {bodyLen(r)} · src {sourceCount(r)} · atlas {aList.length} · حملات {cList.length}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                <span>عصر: {eraOf(r) || "—"}</span>
                <span>· سنة: {rangeOf(r) || "—"}</span>
                <Link to="/encyclopedia/entity/$id" params={{ id: r.id }} target="_blank"
                  className="ms-auto rounded border border-white/10 px-1.5 py-0.5 text-slate-300 hover:bg-white/5">فتح</Link>
                {!isChosen && (
                  <button
                    disabled={busy === r.id}
                    onClick={() => onHide(r, canonical)}
                    className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                    title="إخفاء ناعم وإعادة التوجيه للقياسي + إعادة ربط الأطلس والحملات"
                  >
                    {busy === r.id ? <Loader2 className="size-3 animate-spin" /> : <EyeOff className="size-3" />}
                    إخفاء وإعادة توجيه
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {collapsed ? null : (
      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2 text-[11px]">
        <Wand2 className="size-3.5 text-amber-300" />
        <span className="text-slate-400">القياسي المختار:</span>
        <span className="font-bold text-amber-200">{canonical.title}</span>
        <button
          disabled={busy === g.key || isCanonical(canonical)}
          onClick={() => onMarkCanonical(canonical)}
          className="ms-auto inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
        >
          {busy === g.key ? <Loader2 className="size-3 animate-spin" /> : <Crown className="size-3" />}
          تعيين قياسي
        </button>
        <span className="text-slate-500"><Link2 className="inline size-3" /> الإخفاء يعيد ربط الأطلس + استبدال slug في الحملات</span>
      </div>
      )}

    </div>
  );
}
