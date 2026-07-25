import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Network, ShieldCheck } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { supabase } from "@/integrations/supabase/client";
import { normalizeEntitySlug } from "@/lib/encyclopedia-source";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/historical-hubs-audit")({
  head: () => ({
    meta: [
      { title: "تدقيق المحاور التاريخية — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <Page />
    </AdminGate>
  ),
});

const HUBS: { slug: string; label: string }[] = [
  { slug: "andalus", label: "الأندلس" },
  { slug: "al-andalus", label: "الأندلس (al-andalus)" },
  { slug: "abbasid", label: "الدولة العباسية" },
  { slug: "umayyad", label: "الدولة الأموية" },
  { slug: "mamluk-sultanate", label: "دولة المماليك" },
  { slug: "ayyubid-state", label: "الدولة الأيوبية" },
  { slug: "ottoman", label: "الدولة العثمانية" },
  { slug: "rashidun", label: "الخلافة الراشدة" },
  { slug: "prophetic", label: "العصر النبوي" },
];

type HubReport = {
  slug: string;
  label: string;
  exists: boolean;
  hubTitle: string | null;
  directRelated: number;
  incomingRefs: number;
  campaigns: number;
  atlasLinked: number;
  byType: Record<string, number>;
  score: number;
  band: "weak" | "medium" | "strong";
  missing: boolean;
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

async function auditHub(slug: string, label: string): Promise<HubReport> {
  const empty: HubReport = {
    slug, label, exists: false, hubTitle: null,
    directRelated: 0, incomingRefs: 0, campaigns: 0, atlasLinked: 0,
    byType: {}, score: 0, band: "weak", missing: true,
  };

  const { data: hub } = await supabase
    .from("encyclopedia_entities")
    .select("id,slug,entity_type,title,metadata,enabled")
    .eq("slug", slug)
    .eq("enabled", true)
    .maybeSingle();
  if (!hub) return empty;

  const meta = (hub.metadata && typeof hub.metadata === "object"
    ? (hub.metadata as Record<string, unknown>)
    : {});

  const directSlugs = new Set(
    [
      ...asStringList(meta.related_entities),
      ...asStringList(meta.related),
    ].map(stripPrefix).filter(Boolean),
  );
  const directRelated = directSlugs.size;

  // Incoming references
  const incomingSlugs = new Set<string>();
  const ors: string[] = [];
  if (hub.entity_type === "state") {
    ors.push(`metadata->>state.eq.${hub.slug}`);
    ors.push(`metadata->>affiliation.eq.${hub.slug}`);
  }
  if (hub.entity_type === "city") {
    ors.push(`metadata->>city.eq.${hub.slug}`);
    ors.push(`metadata->>location.eq.${hub.slug}`);
    ors.push(`metadata->>capital.eq.${hub.slug}`);
  }
  if (ors.length > 0) {
    const { data: rev } = await supabase
      .from("encyclopedia_entities")
      .select("slug,entity_type")
      .eq("enabled", true)
      .neq("id", hub.id)
      .or(ors.join(","))
      .limit(500);
    for (const r of (rev ?? []) as { slug: string }[]) incomingSlugs.add(r.slug);
  }
  const { data: backRefs } = await supabase
    .from("encyclopedia_entities")
    .select("slug,entity_type")
    .eq("enabled", true)
    .neq("id", hub.id)
    .or(
      `metadata.cs.{"related_entities":["${hub.slug}"]},metadata.cs.{"related":["${hub.slug}"]}`,
    )
    .limit(500);
  for (const r of (backRefs ?? []) as { slug: string }[]) incomingSlugs.add(r.slug);

  // Campaigns
  let campaigns = 0;
  const campaignSlugs = new Set<string>();
  const { data: camps } = await supabase
    .from("admin_campaigns")
    .select("data")
    .limit(500);
  for (const c of selectCampaignRows(camps ?? [])) {
    const cm = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>;
    const cmeta = (cm.metadata && typeof cm.metadata === "object"
      ? (cm.metadata as Record<string, unknown>)
      : {});
    const core = [
      ...asStringList(cm.core_entities),
      ...asStringList(cmeta.core_entities),
    ].map(stripPrefix);
    const sup = [
      ...asStringList(cm.supporting_entities),
      ...asStringList(cmeta.supporting_entities),
    ].map(stripPrefix);
    if (core.includes(hub.slug) || sup.includes(hub.slug)) {
      campaigns += 1;
      for (const s of [...core, ...sup]) if (s && s !== hub.slug) campaignSlugs.add(s);
    }
  }

  // Atlas linked
  const { count: atlasDirectCount } = await supabase
    .from("atlas_entities")
    .select("id", { count: "exact", head: true })
    .eq("encyclopedia_entity_id", hub.id);
  let atlasLinked = atlasDirectCount ?? 0;
  const atlasId = typeof meta.atlas_id === "string" ? meta.atlas_id : "";
  if (atlasId) {
    const { count: famCount } = await supabase
      .from("encyclopedia_entities")
      .select("id", { count: "exact", head: true })
      .eq("enabled", true)
      .neq("id", hub.id)
      .contains("metadata", { atlas_id: atlasId });
    atlasLinked += famCount ?? 0;
  }

  // Resolve union of all candidate slugs to count by type
  const unionSlugs = new Set<string>([
    ...directSlugs,
    ...incomingSlugs,
    ...campaignSlugs,
  ]);
  const byType: Record<string, number> = {};
  if (unionSlugs.size > 0) {
    const { data: rows } = await supabase
      .from("encyclopedia_entities")
      .select("slug,entity_type")
      .eq("enabled", true)
      .in("slug", Array.from(unionSlugs));
    for (const r of (rows ?? []) as { slug: string; entity_type: string }[]) {
      byType[r.entity_type] = (byType[r.entity_type] ?? 0) + 1;
    }
  }

  const score =
    directRelated * 3 +
    incomingSlugs.size * 1 +
    campaigns * 4 +
    atlasLinked * 1;
  const band: HubReport["band"] = score >= 30 ? "strong" : score >= 12 ? "medium" : "weak";

  return {
    slug, label, exists: true, hubTitle: hub.title,
    directRelated,
    incomingRefs: incomingSlugs.size,
    campaigns,
    atlasLinked,
    byType,
    score, band, missing: false,
  };
}

function Page() {
  const q = useQuery({
    queryKey: ["historical-hubs-audit"],
    queryFn: async () => {
      const out: HubReport[] = [];
      for (const h of HUBS) out.push(await auditHub(h.slug, h.label));
      return out;
    },
    staleTime: 30_000,
  });

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <Network className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-amber-100">تدقيق المحاور التاريخية</h1>
            <p className="text-sm text-slate-400">
              قياس قوة الربط في الرسم البياني لكل محور كبير. للقراءة فقط — لا تعديل.
            </p>
          </div>
          <Link to="/admin" className="ms-auto text-xs text-amber-300 underline">عودة</Link>
        </header>

        {q.isLoading ? (
          <p className="text-sm text-slate-400">جارٍ التدقيق…</p>
        ) : (
          <div className="space-y-3">
            {(q.data ?? []).map((r) => (
              <HubRow key={r.slug} r={r} />
            ))}
          </div>
        )}

        <p className="pt-4 text-xs text-slate-500">
          النقاط = direct×3 + incoming×1 + campaigns×4 + atlas×1.
          {" "}قوي ≥ 30 · متوسط ≥ 12 · ضعيف &lt; 12.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, dim }: { label: string; value: number; dim?: boolean }) {
  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-1.5 text-center ${dim ? "opacity-60" : ""}`}>
      <div className="text-[9px] tracking-[0.15em] text-slate-400">{label}</div>
      <div className="text-base font-bold text-amber-200">{value}</div>
    </div>
  );
}

function HubRow({ r }: { r: HubReport }) {
  const bandColor =
    r.band === "strong" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
    : r.band === "medium" ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
    : "bg-rose-500/15 text-rose-300 border-rose-500/40";
  const bandLabel = r.band === "strong" ? "قوي" : r.band === "medium" ? "متوسط" : "ضعيف";

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-slate-900/60 p-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-5 text-amber-300" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-amber-100">
            {r.hubTitle ?? r.label}
            <span className="ms-2 text-xs text-slate-500">
              <code>{r.slug}</code>
            </span>
          </h2>
          {!r.exists && (
            <p className="text-xs text-rose-300">المحور غير موجود أو معطّل في الموسوعة.</p>
          )}
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${bandColor}`}>
          {bandLabel} · {r.score}
        </span>
      </div>

      {r.exists && (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Stat label="related_entities" value={r.directRelated} />
            <Stat label="إشارات واردة" value={r.incomingRefs} />
            <Stat label="حملات" value={r.campaigns} />
            <Stat label="أطلس" value={r.atlasLinked} />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <Stat label="شخصيات" value={r.byType.figure ?? 0} dim={!r.byType.figure} />
            <Stat label="مدن" value={r.byType.city ?? 0} dim={!r.byType.city} />
            <Stat label="أحداث" value={r.byType.event ?? 0} dim={!r.byType.event} />
            <Stat label="معارك" value={r.byType.battle ?? 0} dim={!r.byType.battle} />
          </div>
        </>
      )}
    </section>
  );
}
