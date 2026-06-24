import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Network, Save, ChevronDown, ChevronLeft, Link2 } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { supabase } from "@/integrations/supabase/client";
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";

export const Route = createFileRoute("/admin/cross-hub-links")({
  head: () => ({
    meta: [
      { title: "روابط المحاور المتقاطعة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <Page />
    </AdminGate>
  ),
});

// Hub registry (label + glyph). Mongols intentionally omitted — not in DB.
const HUBS: { slug: string; label: string; glyph: string }[] = [
  { slug: "prophetic", label: "العصر النبوي", glyph: "🕋" },
  { slug: "rashidun", label: "الخلافة الراشدة", glyph: "🌅" },
  { slug: "umayyad", label: "الأمويون", glyph: "🏛️" },
  { slug: "andalus", label: "الأندلس", glyph: "🌙" },
  { slug: "abbasid", label: "العباسيون", glyph: "📜" },
  { slug: "seljuk", label: "السلاجقة", glyph: "🏹" },
  { slug: "zengid", label: "الزنكيون", glyph: "⚔️" },
  { slug: "ayyubid-state", label: "الأيوبيون", glyph: "🛡️" },
  { slug: "mamluk-sultanate", label: "المماليك", glyph: "🐎" },
  { slug: "ottoman", label: "العثمانيون", glyph: "🏰" },
  { slug: "murabitun", label: "المرابطون", glyph: "🐪" },
  { slug: "muwahhidun", label: "الموحدون", glyph: "🌄" },
  { slug: "jerusalem", label: "القدس", glyph: "🕌" },
];
const HUB_SLUGS = new Set(HUBS.map((h) => h.slug));
const labelOf = (s: string) => HUBS.find((h) => h.slug === s)?.label ?? s;

// Proposed directed links per spec. Reciprocal applied automatically when selected.
type Link = { from: string; to: string; kind: "primary" | "secondary" };
const PROPOSED: Link[] = [
  // Chain 1
  { from: "prophetic", to: "rashidun", kind: "primary" },
  { from: "rashidun", to: "umayyad", kind: "primary" },
  { from: "umayyad", to: "andalus", kind: "primary" },
  // Chain 2
  { from: "abbasid", to: "seljuk", kind: "primary" },
  { from: "seljuk", to: "zengid", kind: "primary" },
  { from: "zengid", to: "ayyubid-state", kind: "primary" },
  { from: "ayyubid-state", to: "mamluk-sultanate", kind: "primary" },
  { from: "mamluk-sultanate", to: "ottoman", kind: "primary" },
  // Secondary
  { from: "umayyad", to: "abbasid", kind: "secondary" },
  { from: "ayyubid-state", to: "jerusalem", kind: "secondary" },
  { from: "andalus", to: "umayyad", kind: "secondary" },
  { from: "andalus", to: "murabitun", kind: "secondary" },
  { from: "andalus", to: "muwahhidun", kind: "secondary" },
];

function asStringList(v: unknown): string[] {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: string[] = [];
  for (const x of arr) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const s =
        (typeof o.slug === "string" && o.slug) ||
        (typeof o.id === "string" && o.id) ||
        (typeof o.entity_slug === "string" && o.entity_slug);
      if (typeof s === "string" && s) out.push(s);
    }
  }
  return out;
}
const stripPrefix = (s: string) => {
  const c = s.includes(":") ? s.split(":").pop()! : s;
  return normalizeEntitySlug(c);
};

type HubRow = {
  id: string;
  slug: string;
  title: string;
  metadata: Record<string, unknown>;
  related: string[]; // normalized
};

async function loadHubs(): Promise<Record<string, HubRow>> {
  const { data, error } = await supabase
    .from("encyclopedia_entities")
    .select("id,slug,title,metadata,enabled")
    .in("slug", Array.from(HUB_SLUGS))
    .eq("enabled", true);
  if (error) throw error;
  const out: Record<string, HubRow> = {};
  for (const r of data ?? []) {
    const meta = (r.metadata && typeof r.metadata === "object"
      ? (r.metadata as Record<string, unknown>)
      : {});
    const related = Array.from(new Set(
      [...asStringList(meta.related_entities), ...asStringList(meta.related)]
        .map(stripPrefix).filter(Boolean),
    ));
    out[r.slug] = {
      id: r.id, slug: r.slug, title: r.title,
      metadata: meta, related,
    };
  }
  return out;
}

type Edge = { a: string; b: string; kind: "primary" | "secondary" };

function buildEdges(hubs: Record<string, HubRow>) {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const p of PROPOSED) {
    if (!hubs[p.from] || !hubs[p.to]) continue;
    const key = [p.from, p.to].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ a: p.from, b: p.to, kind: p.kind });
  }
  return edges;
}

function edgeExists(hubs: Record<string, HubRow>, a: string, b: string) {
  const ra = hubs[a]?.related.includes(b) ?? false;
  const rb = hubs[b]?.related.includes(a) ?? false;
  return { a2b: ra, b2a: rb, both: ra && rb };
}

function Page() {
  const qc = useQueryClient();
  const hubsQ = useQuery({ queryKey: ["cross-hub-links"], queryFn: loadHubs, staleTime: 30_000 });
  const hubs = hubsQ.data ?? {};
  const edges = useMemo(() => buildEdges(hubs), [hubs]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reciprocal, setReciprocal] = useState(true);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Default-select all edges where at least one direction is missing
  useEffect(() => {
    if (!hubsQ.data) return;
    const next = new Set<string>();
    for (const e of edges) {
      const { both } = edgeExists(hubsQ.data, e.a, e.b);
      if (!both) next.add(`${e.a}|${e.b}`);
    }
    setSelected(next);
  }, [hubsQ.data, edges]);

  const toggle = (k: string) => setSelected((p) => {
    const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  // Compute writes to apply
  const writes = useMemo(() => {
    const adds = new Map<string, Set<string>>(); // hubSlug -> set of slugs to add
    for (const e of edges) {
      if (!selected.has(`${e.a}|${e.b}`)) continue;
      const exA = hubs[e.a]?.related ?? [];
      const exB = hubs[e.b]?.related ?? [];
      if (!exA.includes(e.b)) {
        if (!adds.has(e.a)) adds.set(e.a, new Set());
        adds.get(e.a)!.add(e.b);
      }
      if (reciprocal && !exB.includes(e.a)) {
        if (!adds.has(e.b)) adds.set(e.b, new Set());
        adds.get(e.b)!.add(e.a);
      }
    }
    return adds;
  }, [edges, selected, hubs, reciprocal]);

  const totalAdds = useMemo(() => {
    let n = 0;
    for (const s of writes.values()) n += s.size;
    return n;
  }, [writes]);

  const apply = async () => {
    setSaving(true); setMsg(null);
    try {
      let touched = 0;
      for (const [slug, adds] of writes) {
        const hub = hubs[slug];
        if (!hub) continue;
        const merged = Array.from(new Set([...hub.related, ...adds])).sort();
        const newMeta = { ...hub.metadata, related_entities: merged };
        const { error } = await supabase
          .from("encyclopedia_entities")
          .update({ metadata: newMeta })
          .eq("id", hub.id);
        if (error) throw error;
        touched += 1;
      }
      await qc.invalidateQueries({ queryKey: ["cross-hub-links"] });
      await qc.invalidateQueries({ queryKey: ["historical-hubs-audit"] });
      await qc.invalidateQueries({ queryKey: ["hub-builder"] });
      await qc.invalidateQueries({ queryKey: ["exploration-path"] });
      setMsg(`تم. حُدّث ${touched} محورًا بإضافة ${totalAdds} رابطًا.`);
      setPreview(false);
    } catch (e) {
      setMsg(`فشل الحفظ: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <Network className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-amber-100">روابط المحاور المتقاطعة</h1>
            <p className="text-sm text-slate-400">
              ربط المحاور الكبرى ببعضها داخل related_entities — كيانات Supabase حقيقية فقط، دمج بلا حذف.
            </p>
          </div>
          <Link to="/admin" className="ms-auto text-xs text-amber-300 underline">عودة</Link>
        </header>

        {hubsQ.isLoading && <p className="text-sm text-slate-400">جارٍ التحميل…</p>}
        {hubsQ.isError && <p className="text-sm text-rose-300">فشل التحميل: {(hubsQ.error as Error).message}</p>}

        {hubsQ.data && (
          <>
            {/* Per-hub summary cards */}
            <section className="grid gap-3 md:grid-cols-2">
              {HUBS.filter((h) => hubs[h.slug]).map((h) => {
                const hub = hubs[h.slug];
                const existing = hub.related.filter((s) => HUB_SLUGS.has(s) && s !== h.slug);
                const proposedNew = (writes.get(h.slug) ?? new Set<string>());
                const before = existing.length;
                const after = new Set([...existing, ...proposedNew]).size;
                return (
                  <div key={h.slug} className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{h.glyph}</span>
                      <h2 className="text-sm font-bold text-amber-100">{h.label}</h2>
                      <code className="ms-auto text-[10px] text-slate-500">{h.slug}</code>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      related_entities: {hub.related.length} · روابط محاور: <span className="text-amber-200">{before}</span> → <span className="text-emerald-300">{after}</span>
                    </p>
                    <div className="mt-2 space-y-1 text-[11px]">
                      <div><span className="text-slate-500">قائم:</span> {existing.length ? existing.map(labelOf).join("، ") : <span className="text-slate-600">—</span>}</div>
                      <div><span className="text-slate-500">مقترح:</span> {proposedNew.size ? Array.from(proposedNew).map(labelOf).join("، ") : <span className="text-slate-600">—</span>}</div>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Edges selection */}
            <section className="rounded-2xl border border-amber-500/25 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-amber-300" />
                <h2 className="text-sm font-bold text-amber-100">الروابط المقترحة</h2>
                <label className="ms-auto inline-flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={reciprocal} onChange={(e) => setReciprocal(e.target.checked)}
                    className="size-4 accent-amber-400" />
                  ربط متبادل تلقائي
                </label>
              </div>
              <ul className="divide-y divide-slate-800 text-xs">
                {edges.map((e) => {
                  const k = `${e.a}|${e.b}`;
                  const checked = selected.has(k);
                  const ex = edgeExists(hubs, e.a, e.b);
                  const status =
                    ex.both ? "موجود ↔" :
                    ex.a2b ? `موجود ${e.a} → ${e.b}` :
                    ex.b2a ? `موجود ${e.b} → ${e.a}` : "غير موجود";
                  return (
                    <li key={k} className="flex items-center gap-3 py-2">
                      <input type="checkbox" checked={checked} onChange={() => toggle(k)}
                        className="size-4 accent-amber-400" />
                      <span className="flex-1">
                        <span className="font-semibold text-slate-100">{labelOf(e.a)}</span>
                        <span className="mx-2 text-amber-400">↔</span>
                        <span className="font-semibold text-slate-100">{labelOf(e.b)}</span>
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${e.kind === "primary" ? "bg-amber-500/10 text-amber-300" : "bg-slate-700/40 text-slate-300"}`}>
                        {e.kind === "primary" ? "أساسي" : "ثانوي"}
                      </span>
                      <span className={`text-[10px] ${ex.both ? "text-emerald-300" : ex.a2b || ex.b2a ? "text-amber-300" : "text-slate-500"}`}>{status}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="text-xs text-slate-400">
                  ستُضاف <span className="font-bold text-amber-200">{totalAdds}</span> إدخالة عبر <span className="font-bold text-amber-200">{writes.size}</span> محورًا.
                </div>
                <button
                  onClick={() => setPreview((v) => !v)}
                  className="ms-auto rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200">
                  {preview ? "إخفاء المعاينة" : "معاينة الكتابات"}
                </button>
                <button
                  onClick={apply}
                  disabled={saving || totalAdds === 0}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-50">
                  <Save className="size-3.5" /> {saving ? "جارٍ الحفظ…" : "تطبيق الكتابات"}
                </button>
              </div>

              {msg && <p className={`mt-2 text-xs ${msg.startsWith("تم") ? "text-emerald-300" : "text-rose-300"}`}>{msg}</p>}

              {preview && (
                <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-[11px] text-slate-300">
{JSON.stringify(
  Object.fromEntries(Array.from(writes.entries()).map(([k, v]) => [k, Array.from(v).sort()])),
  null, 2,
)}
                </pre>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
