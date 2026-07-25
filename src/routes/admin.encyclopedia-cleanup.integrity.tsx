// Relationship Integrity — read-only audit that surfaces broken cross-references:
//   • body.related_entities / metadata.related → unknown slugs or ids
//   • atlas_entities.encyclopedia_entity_id    → deleted entity
//   • admin_campaigns.data slug refs            → unknown slug
//   • user_collection.entity_id                 → deleted entity
//
// Each finding links the operator straight back to the affected entity in
// the workshop. No mutations.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BookOpen, ExternalLink, Layers, Loader2, MapPin, Network,
  RefreshCw, Shield, Swords,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { selectCampaignRows } from "@/lib/campaigns/entities";

type Row = {
  id: string; entity_type: string; slug: string; title: string;
  enabled: boolean; metadata: any; body: any;
};

export const Route = createFileRoute("/admin/encyclopedia-cleanup/integrity")({
  head: () => ({ meta: [{ title: "سلامة العلاقات — إرث" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: IntegrityAudit,
});

type Finding =
  | { kind: "related"; entity: Row; ref: string }
  | { kind: "atlas"; atlasId: string; missingEntityId: string }
  | { kind: "campaign"; campaignId: string; campaignTitle?: string; missingSlug: string }
  | { kind: "museum"; collectionId: string; missingEntityId: string };

function collectStrings(node: any, out: string[]): void {
  if (!node) return;
  if (typeof node === "string") { if (node) out.push(node); return; }
  if (Array.isArray(node)) { for (const v of node) collectStrings(v, out); return; }
  if (typeof node === "object") {
    for (const k of ["id", "slug", "entity_id", "entity_slug", "ref", "target", "to"]) {
      const v = (node as any)[k];
      if (typeof v === "string" && v) out.push(v);
    }
  }
}

function relatedRefs(r: Row): string[] {
  const acc: string[] = [];
  collectStrings(r.body?.related_entities, acc);
  collectStrings(r.metadata?.related, acc);
  collectStrings(r.metadata?.related_entities, acc);
  return Array.from(new Set(acc));
}

function IntegrityAudit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [atlas, setAtlas] = useState<{ id: string; encyclopedia_entity_id: string | null }[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; title?: string | null; data: any }[]>([]);
  const [collection, setCollection] = useState<{ id: string; entity_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true); setErr(null);
    try {
      const [e, a, c, u] = await Promise.all([
        supabase.from("encyclopedia_entities" as any).select("id,entity_type,slug,title,enabled,metadata,body").limit(3000),
        supabase.from("atlas_entities" as any).select("id,encyclopedia_entity_id").limit(5000),
        supabase.from("admin_campaigns" as any).select("id,title,data").limit(500),
        supabase.from("user_collection" as any).select("id,entity_id").limit(5000),
      ]);
      if (e.error) throw e.error;
      setRows((e.data ?? []) as unknown as Row[]);
      setAtlas((a.data ?? []) as any);
      setCampaigns(selectCampaignRows((c.data ?? []) as any[]));
      setCollection((u.data ?? []) as any);
    } catch (ex: any) { setErr(ex?.message || String(ex)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const { related, atlasBroken, campaignBroken, museumBroken } = useMemo(() => {
    const bySlug = new Map<string, Row>();
    const byId = new Map<string, Row>();
    const redirectIndex = new Map<string, string>(); // old slug -> canonical slug
    for (const r of rows) {
      if (r.slug) bySlug.set(r.slug, r);
      byId.set(r.id, r);
      const redirects = r.metadata?.redirect_from;
      if (Array.isArray(redirects)) for (const s of redirects) if (typeof s === "string") redirectIndex.set(s, r.slug);
    }
    const resolveSlug = (s: string) => bySlug.has(s) ? s : redirectIndex.get(s);

    const related: Finding[] = [];
    for (const r of rows) {
      for (const ref of relatedRefs(r)) {
        const ok = byId.has(ref) || resolveSlug(ref);
        if (!ok) related.push({ kind: "related", entity: r, ref });
      }
    }
    const atlasBroken: Finding[] = [];
    for (const a of atlas) {
      if (!a.encyclopedia_entity_id) continue;
      if (!byId.has(a.encyclopedia_entity_id)) {
        atlasBroken.push({ kind: "atlas", atlasId: a.id, missingEntityId: a.encyclopedia_entity_id });
      }
    }
    const campaignBroken: Finding[] = [];
    for (const c of campaigns) {
      try {
        const blob = JSON.stringify(c.data ?? {});
        // Pull tokens that look like slugs from common positions.
        const slugs = new Set<string>();
        const re = /"(?:slug|entity_slug|entity|target|unlock_slug)"\s*:\s*"([a-z0-9][a-z0-9-]+)"/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(blob))) slugs.add(m[1]);
        for (const s of slugs) {
          if (!resolveSlug(s)) {
            campaignBroken.push({ kind: "campaign", campaignId: c.id, campaignTitle: c.title ?? undefined, missingSlug: s });
          }
        }
      } catch { /* tolerate malformed JSON */ }
    }
    const museumBroken: Finding[] = [];
    for (const u of collection) {
      if (!u.entity_id) continue;
      if (!byId.has(u.entity_id)) {
        museumBroken.push({ kind: "museum", collectionId: u.id, missingEntityId: u.entity_id });
      }
    }
    return { related, atlasBroken, campaignBroken, museumBroken };
  }, [rows, atlas, campaigns, collection]);

  const sections: { key: string; title: string; icon: any; tone: string; items: Finding[] }[] = [
    { key: "related", title: "علاقات مكسورة بين الكيانات", icon: BookOpen, tone: "amber",   items: related },
    { key: "atlas",   title: "روابط أطلس مكسورة",         icon: MapPin,    tone: "sky",     items: atlasBroken },
    { key: "camp",    title: "مراجع حملات مكسورة",         icon: Swords,   tone: "fuchsia", items: campaignBroken },
    { key: "muse",    title: "آثار متحف بلا كيان",          icon: Layers,    tone: "rose",    items: museumBroken },
  ];

  const totalIssues = related.length + atlasBroken.length + campaignBroken.length + museumBroken.length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
        <div className="flex items-center gap-2">
          <Network className="size-5 text-amber-400" />
          <div>
            <h1 className="text-lg font-bold text-amber-100">سلامة العلاقات</h1>
            <p className="text-xs text-slate-400">
              {loading ? "جارٍ الفحص…" : `${totalIssues} مشكلة`}
              {" · "}<Link to="/admin/encyclopedia-cleanup" className="underline hover:text-amber-200">عودة للورشة</Link>
            </p>
          </div>
        </div>
        <button onClick={refresh} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> إعادة فحص
        </button>
      </header>

      {err && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{err}</div>
      )}

      {!loading && totalIssues === 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center text-sm text-emerald-200">
          <Shield className="mx-auto mb-2 size-6" />
          جميع العلاقات سليمة. لا توجد مراجع مكسورة.
        </div>
      )}

      <div className="space-y-4">
        {sections.map((s) => (
          <section key={s.key} className="rounded-xl border border-slate-700/60 bg-slate-900/40">
            <header className="flex items-center justify-between gap-2 border-b border-slate-700/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-slate-200">
                <s.icon className="size-4 text-amber-300" />
                <span>{s.title}</span>
              </div>
              <span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300">
                {s.items.length}
              </span>
            </header>
            <div className="divide-y divide-slate-800/60">
              {s.items.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-slate-500">لا مشاكل في هذه الفئة.</p>
              )}
              {s.items.slice(0, 200).map((f, i) => (
                <FindingRow key={i} finding={f} />
              ))}
              {s.items.length > 200 && (
                <p className="px-3 py-2 text-center text-[11px] text-slate-500">
                  …عرض أول 200 من {s.items.length}. أصلِح الدفعة الأولى ثم أعد الفحص.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  if (finding.kind === "related") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
        <div className="min-w-0">
          <span className="font-semibold text-slate-200">{finding.entity.title}</span>{" "}
          <span dir="ltr" className="font-mono text-[10px] text-slate-500">({finding.entity.slug})</span>{" "}
          <span className="text-slate-400">→ مرجع غير موجود:</span>{" "}
          <span dir="ltr" className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-rose-200">{finding.ref}</span>
        </div>
        <Link to="/admin/encyclopedia-cleanup" search={{ select: finding.entity.id } as any}
          className="inline-flex items-center gap-1 rounded border border-slate-600/60 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800/60">
          <ExternalLink className="size-3" /> فتح
        </Link>
      </div>
    );
  }
  if (finding.kind === "atlas") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
        <div className="min-w-0">
          <span className="text-slate-400">نقطة أطلس</span>{" "}
          <span dir="ltr" className="font-mono text-[10px] text-slate-500">{finding.atlasId.slice(0, 8)}…</span>{" "}
          <span className="text-slate-400">تشير إلى كيان محذوف</span>{" "}
          <span dir="ltr" className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-rose-200">{finding.missingEntityId.slice(0, 8)}…</span>
        </div>
        <Link to="/admin/atlas-entities"
          className="inline-flex items-center gap-1 rounded border border-slate-600/60 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800/60">
          <ExternalLink className="size-3" /> الأطلس
        </Link>
      </div>
    );
  }
  if (finding.kind === "campaign") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
        <div className="min-w-0">
          <span className="text-slate-400">حملة</span>{" "}
          <span className="font-semibold text-slate-200">{finding.campaignTitle ?? finding.campaignId.slice(0, 8)}</span>{" "}
          <span className="text-slate-400">تشير إلى slug غير موجود:</span>{" "}
          <span dir="ltr" className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-rose-200">{finding.missingSlug}</span>
        </div>
        <Link to="/admin/campaigns"
          className="inline-flex items-center gap-1 rounded border border-slate-600/60 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800/60">
          <ExternalLink className="size-3" /> الحملات
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
      <div className="min-w-0">
        <span className="text-slate-400">عنصر متحف</span>{" "}
        <span dir="ltr" className="font-mono text-[10px] text-slate-500">{finding.collectionId.slice(0, 8)}…</span>{" "}
        <span className="text-slate-400">يشير إلى كيان محذوف:</span>{" "}
        <span dir="ltr" className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-rose-200">{finding.missingEntityId.slice(0, 8)}…</span>
      </div>
    </div>
  );
}

// keep AlertTriangle referenced for unused-import safety on certain build modes
void AlertTriangle;
