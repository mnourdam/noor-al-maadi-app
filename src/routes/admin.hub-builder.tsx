import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Hammer, Save, ChevronDown, ChevronLeft } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { supabase } from "@/integrations/supabase/client";
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/hub-builder")({
  head: () => ({
    meta: [
      { title: "باني المحاور التاريخية — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <Page />
    </AdminGate>
  ),
});

const HUBS: { slug: string; label: string; glyph: string }[] = [
  { slug: "prophetic", label: "العصر النبوي", glyph: "🕋" },
  { slug: "rashidun", label: "الخلافة الراشدة", glyph: "🌅" },
  { slug: "umayyad", label: "الدولة الأموية", glyph: "🏛️" },
  { slug: "andalus", label: "الأندلس", glyph: "🌙" },
  { slug: "abbasid", label: "الدولة العباسية", glyph: "📜" },
  { slug: "seljuk", label: "السلاجقة", glyph: "🏹" },
  { slug: "zengid", label: "الزنكيون", glyph: "⚔️" },
  { slug: "ayyubid-state", label: "الدولة الأيوبية", glyph: "🛡️" },
  { slug: "mamluk-sultanate", label: "دولة المماليك", glyph: "🐎" },
  { slug: "ottoman", label: "الدولة العثمانية", glyph: "🏰" },
];

const TYPE_LABEL: Record<string, string> = {
  state: "دول",
  figure: "شخصيات",
  scholar: "علماء",
  city: "مدن",
  battle: "معارك",
  event: "أحداث",
  landmark: "معالم",
  artifact: "آثار",
};

const TYPE_ORDER = ["figure", "scholar", "city", "battle", "event", "landmark", "artifact", "state"];

type Candidate = {
  slug: string;
  title: string;
  entity_type: string;
  sources: Set<string>;
};

type HubData = {
  id: string;
  slug: string;
  title: string;
  entity_type: string;
  metadata: Record<string, unknown>;
  currentRelated: string[];
  incomingCount: number;
  campaignCount: number;
  atlasCount: number;
  candidates: Candidate[];
};

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

function computeScore(direct: number, incoming: number, campaigns: number, atlas: number) {
  return direct * 3 + incoming * 1 + campaigns * 4 + atlas * 1;
}
function bandOf(score: number): "weak" | "medium" | "strong" {
  return score >= 30 ? "strong" : score >= 12 ? "medium" : "weak";
}

async function loadHub(slug: string): Promise<HubData | null> {
  const { data: hub } = await supabase
    .from("encyclopedia_entities")
    .select("id,slug,entity_type,title,metadata,enabled")
    .eq("slug", slug)
    .eq("enabled", true)
    .maybeSingle();
  if (!hub) return null;

  const meta = (hub.metadata && typeof hub.metadata === "object"
    ? (hub.metadata as Record<string, unknown>)
    : {});
  const currentRelated = Array.from(new Set(
    [...asStringList(meta.related_entities), ...asStringList(meta.related)]
      .map(stripPrefix).filter(Boolean),
  ));

  const sources = new Map<string, Set<string>>();
  const addSrc = (slugK: string, src: string) => {
    if (!slugK || slugK === hub.slug) return;
    if (!sources.has(slugK)) sources.set(slugK, new Set());
    sources.get(slugK)!.add(src);
  };

  // 1) Reverse geography / affiliation
  const ors: string[] = [];
  for (const key of ["state", "affiliation", "dynasty", "caliphate", "sultanate", "era"]) {
    ors.push(`metadata->>${key}.eq.${hub.slug}`);
  }
  const { data: rev } = await supabase
    .from("encyclopedia_entities")
    .select("slug")
    .eq("enabled", true)
    .neq("id", hub.id)
    .or(ors.join(","))
    .limit(1000);
  for (const r of (rev ?? []) as { slug: string }[]) addSrc(r.slug, "انتماء/جغرافيا");

  // 2) Back-references in related_entities/related
  const { data: backRefs } = await supabase
    .from("encyclopedia_entities")
    .select("slug")
    .eq("enabled", true)
    .neq("id", hub.id)
    .or(`metadata.cs.{"related_entities":["${hub.slug}"]},metadata.cs.{"related":["${hub.slug}"]}`)
    .limit(1000);
  for (const r of (backRefs ?? []) as { slug: string }[]) addSrc(r.slug, "رابط عكسي");

  // 3) Campaigns
  let campaignCount = 0;
  const { data: camps } = await supabase
    .from("admin_campaigns")
    .select("data")
    .limit(1000);
  for (const c of selectCampaignRows(camps ?? [])) {
    const cm = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
    const cmeta = (cm.metadata && typeof cm.metadata === "object"
      ? (cm.metadata as Record<string, unknown>)
      : {});
    const core = [...asStringList(cm.core_entities), ...asStringList(cmeta.core_entities)].map(stripPrefix);
    const sup = [...asStringList(cm.supporting_entities), ...asStringList(cmeta.supporting_entities)].map(stripPrefix);
    if (!core.includes(hub.slug) && !sup.includes(hub.slug)) continue;
    campaignCount += 1;
    for (const s of core) addSrc(s, "حملة (محوري)");
    for (const s of sup) addSrc(s, "حملة (داعم)");
  }

  // 4) Atlas family
  const { count: atlasDirect } = await supabase
    .from("atlas_entities")
    .select("id", { count: "exact", head: true })
    .eq("encyclopedia_entity_id", hub.id);
  let atlasCount = atlasDirect ?? 0;
  const atlasId = typeof meta.atlas_id === "string" ? meta.atlas_id : "";
  if (atlasId) {
    const { data: atl } = await supabase
      .from("encyclopedia_entities")
      .select("slug")
      .eq("enabled", true)
      .neq("id", hub.id)
      .contains("metadata", { atlas_id: atlasId })
      .limit(200);
    for (const r of (atl ?? []) as { slug: string }[]) addSrc(r.slug, "أطلس مشترك");
    atlasCount += (atl ?? []).length;
  }

  // Include already-current related as candidates too (so user can keep them)
  for (const s of currentRelated) addSrc(s, "حالي");

  // Resolve all candidate slugs
  const all = Array.from(sources.keys());
  const candidates: Candidate[] = [];
  if (all.length > 0) {
    const { data: rows } = await supabase
      .from("encyclopedia_entities")
      .select("slug,title,entity_type")
      .eq("enabled", true)
      .in("slug", all);
    for (const r of (rows ?? []) as { slug: string; title: string; entity_type: string }[]) {
      candidates.push({
        slug: r.slug,
        title: r.title,
        entity_type: r.entity_type,
        sources: sources.get(r.slug) ?? new Set(),
      });
    }
  }
  candidates.sort((a, b) =>
    (TYPE_ORDER.indexOf(a.entity_type) - TYPE_ORDER.indexOf(b.entity_type)) ||
    a.title.localeCompare(b.title, "ar"),
  );

  // Incoming count = unique slugs from rev+backRefs (not counting current/campaign-only)
  const incomingSet = new Set<string>();
  for (const r of (rev ?? []) as { slug: string }[]) incomingSet.add(r.slug);
  for (const r of (backRefs ?? []) as { slug: string }[]) incomingSet.add(r.slug);

  return {
    id: hub.id,
    slug: hub.slug,
    title: hub.title,
    entity_type: hub.entity_type,
    metadata: meta,
    currentRelated,
    incomingCount: incomingSet.size,
    campaignCount,
    atlasCount,
    candidates,
  };
}

function Page() {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <Hammer className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-amber-100">باني المحاور التاريخية</h1>
            <p className="text-sm text-slate-400">
              تحويل كل محور كبير إلى مرساة موسوعية. اختيار الكيانات الحقيقية من Supabase فقط — لا توليد ولا بدائل عصر.
            </p>
          </div>
          <Link to="/admin" className="ms-auto text-xs text-amber-300 underline">عودة</Link>
        </header>

        <div className="space-y-4">
          {HUBS.map((h) => <HubCard key={h.slug} slug={h.slug} label={h.label} glyph={h.glyph} />)}
        </div>
      </div>
    </div>
  );
}

function HubCard({ slug, label, glyph }: { slug: string; label: string; glyph: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const hubQ = useQuery({
    queryKey: ["hub-builder", slug],
    queryFn: () => loadHub(slug),
    staleTime: 30_000,
  });

  const hub = hubQ.data;

  useEffect(() => {
    if (hub && !initialized) {
      setSelected(new Set(hub.currentRelated));
      setInitialized(true);
    }
  }, [hub, initialized]);

  const grouped = useMemo(() => {
    const g: Record<string, Candidate[]> = {};
    if (!hub) return g;
    for (const c of hub.candidates) {
      (g[c.entity_type] ||= []).push(c);
    }
    return g;
  }, [hub]);

  if (!hub && hubQ.isLoading) {
    return <section className="rounded-2xl border border-amber-500/20 bg-slate-900/60 p-4 text-xs text-slate-400">جارٍ تحميل {label}…</section>;
  }
  if (!hub) {
    return (
      <section className="rounded-2xl border border-rose-500/30 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2"><span className="text-xl">{glyph}</span>
          <h2 className="text-base font-bold text-rose-200">{label}</h2>
          <code className="ms-auto text-xs text-slate-500">{slug}</code>
        </div>
        <p className="mt-1 text-xs text-rose-300">المحور غير موجود أو معطّل في الموسوعة.</p>
      </section>
    );
  }

  const current = hub.currentRelated.length;
  const proposed = selected.size;
  const scoreBefore = computeScore(current, hub.incomingCount, hub.campaignCount, hub.atlasCount);
  const scoreAfter = computeScore(proposed, hub.incomingCount, hub.campaignCount, hub.atlasCount);
  const bandBefore = bandOf(scoreBefore);
  const bandAfter = bandOf(scoreAfter);

  const toggle = (s: string) => setSelected((p) => {
    const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n;
  });
  const selectAll = () => setSelected(new Set(hub.candidates.map((c) => c.slug)));
  const clearAll = () => setSelected(new Set());
  const selectGroup = (t: string) => setSelected((p) => {
    const n = new Set(p);
    for (const c of grouped[t] ?? []) n.add(c.slug);
    return n;
  });
  const clearGroup = (t: string) => setSelected((p) => {
    const n = new Set(p);
    for (const c of grouped[t] ?? []) n.delete(c.slug);
    return n;
  });

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const newMeta = { ...hub.metadata, related_entities: Array.from(selected).sort() };
      const { error } = await supabase
        .from("encyclopedia_entities")
        .update({ metadata: newMeta })
        .eq("id", hub.id);
      if (error) throw error;
      setMsg("تم الحفظ. إعادة احتساب القوة…");
      await qc.invalidateQueries({ queryKey: ["hub-builder", slug] });
      await qc.invalidateQueries({ queryKey: ["historical-hubs-audit"] });
      await qc.invalidateQueries({ queryKey: ["exploration-path"] });
      setInitialized(false);
    } catch (e) {
      setMsg(`فشل الحفظ: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const bandColor = (b: string) =>
    b === "strong" ? "text-emerald-300" : b === "medium" ? "text-amber-300" : "text-rose-300";

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-slate-900/60 p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-right">
        <span className="text-2xl">{glyph}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-amber-100">{hub.title}
            <code className="ms-2 text-xs text-slate-500">{hub.slug}</code>
          </h2>
          <p className="text-xs text-slate-400">
            مرشحون: {hub.candidates.length} · حالي: {current} · مقترح: {proposed} ·
            القوة: <span className={bandColor(bandBefore)}>{scoreBefore}</span>
            {" → "}
            <span className={bandColor(bandAfter)}>{scoreAfter}</span>
          </p>
        </div>
        {open ? <ChevronDown className="size-5 text-amber-300" /> : <ChevronLeft className="size-5 text-amber-300" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 text-xs">
            <Stat label="related حالي" v={current} />
            <Stat label="مقترح" v={proposed} />
            <Stat label="إشارات واردة" v={hub.incomingCount} />
            <Stat label="حملات" v={hub.campaignCount} />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button onClick={selectAll} className="rounded-lg border border-amber-500/40 px-2 py-1 text-amber-200">تحديد الكل</button>
            <button onClick={clearAll} className="rounded-lg border border-slate-600 px-2 py-1 text-slate-300">إلغاء التحديد</button>
            <button
              onClick={save}
              disabled={saving}
              className="ms-auto inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-slate-950 disabled:opacity-50">
              <Save className="size-3.5" /> {saving ? "جارٍ الحفظ…" : "حفظ related_entities"}
            </button>
            {msg && <span className={`text-xs ${msg.startsWith("تم") ? "text-emerald-300" : "text-rose-300"}`}>{msg}</span>}
          </div>

          {hub.candidates.length === 0 ? (
            <p className="text-xs text-slate-400">لا يوجد مرشحون من بيانات Supabase الحالية.</p>
          ) : (
            TYPE_ORDER.filter((t) => grouped[t]?.length).map((t) => {
              const items = grouped[t];
              const allChecked = items.every((c) => selected.has(c.slug));
              return (
                <div key={t} className="rounded-xl border border-slate-700 bg-slate-950/40">
                  <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs">
                    <span className="font-semibold text-amber-200">{TYPE_LABEL[t] ?? t}</span>
                    <span className="text-slate-500">({items.length})</span>
                    <button
                      onClick={() => (allChecked ? clearGroup(t) : selectGroup(t))}
                      className="ms-auto text-[11px] text-amber-300 underline">
                      {allChecked ? "إلغاء المجموعة" : "تحديد المجموعة"}
                    </button>
                  </div>
                  <ul className="max-h-64 divide-y divide-slate-800 overflow-y-auto">
                    {items.map((c) => {
                      const checked = selected.has(c.slug);
                      return (
                        <li key={c.slug} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                          <input type="checkbox" checked={checked} onChange={() => toggle(c.slug)}
                            className="size-4 accent-amber-400" />
                          <span className="flex-1">
                            <span className="font-semibold text-slate-100">{c.title}</span>
                            <span className="ms-2 text-[10px] text-slate-500"><code>{c.slug}</code></span>
                          </span>
                          <span className="text-[10px] text-amber-300/80">
                            {Array.from(c.sources).join(" · ")}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-center">
      <div className="text-[9px] tracking-[0.15em] text-slate-400">{label}</div>
      <div className="text-base font-bold text-amber-200">{v}</div>
    </div>
  );
}
