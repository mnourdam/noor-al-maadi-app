import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/museum-provenance")({
  head: () => ({
    meta: [
      { title: "تدقيق مصادر المتحف — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <MuseumProvenance />
    </AdminGate>
  ),
});

type EncEntity = {
  id: string;
  entity_type: string;
  slug: string;
  title: string | null;
  enabled: boolean;
  metadata: any;
  created_at: string;
};
type Campaign = { id: string; slug: string; title: string; status: string; data: any };

async function fetchAll<T = any>(table: string, columns: string): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const out: T[] = [];
  while (true) {
    const { data, error } = await supabase
      .from(table as any)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

type Provenance = {
  artifact: EncEntity;
  adminImported: boolean;
  importMarkers: string[];
  campaignRefs: string[];
  museumEnabled: boolean;
  isLegacy: boolean;
  willRemainVisible: boolean;
};

function collectCampaignArtifactRefs(campaigns: Campaign[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (slug: string, campaignSlug: string) => {
    if (!slug) return;
    const arr = map.get(slug) ?? [];
    if (!arr.includes(campaignSlug)) arr.push(campaignSlug);
    map.set(slug, arr);
  };
  const scanRefList = (list: any, campaignSlug: string) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const s = String(raw ?? "");
      const [type, ...rest] = s.split(":");
      if (type === "artifact") add(rest.join(":"), campaignSlug);
    }
  };
  for (const c of campaigns) {
    const d = c.data ?? {};
    const meta = d.metadata ?? {};
    scanRefList(meta.core_entities, c.slug);
    scanRefList(meta.supporting_entities, c.slug);
    const chapters = Array.isArray(d.chapters) ? d.chapters : [];
    for (const ch of chapters) {
      scanRefList(ch?.rewards?.unlocks, c.slug);
      const artifacts = ch?.rewards?.artifacts;
      if (Array.isArray(artifacts)) {
        for (const a of artifacts) {
          const slug = typeof a === "string" ? a : a?.slug ?? a?.id;
          if (slug) add(String(slug), c.slug);
        }
      }
    }
  }
  return map;
}

function analyze(artifact: EncEntity, campaignRefs: string[]): Provenance {
  const m = artifact.metadata ?? {};
  const markers: string[] = [];
  if (typeof m.pack_id === "string" && m.pack_id) markers.push(`pack_id=${m.pack_id}`);
  if (typeof m.source === "string" && m.source) markers.push(`source=${m.source}`);
  if (m.atlas_id) markers.push("atlas_id");
  if (m.imported_at) markers.push(`imported_at=${m.imported_at}`);
  if (m.import_batch) markers.push(`import_batch=${m.import_batch}`);
  if (m.provenance) markers.push(`provenance=${typeof m.provenance === "string" ? m.provenance : "object"}`);

  const adminImported = markers.length > 0;
  const museumEnabled = m.museum_enabled === true || m?.museum?.museum_enabled === true;
  const hasCampaign = campaignRefs.length > 0;
  const isLegacy = !adminImported && !hasCampaign && !museumEnabled;
  const willRemainVisible = adminImported || hasCampaign || museumEnabled;

  return {
    artifact,
    adminImported,
    importMarkers: markers,
    campaignRefs,
    museumEnabled,
    isLegacy,
    willRemainVisible,
  };
}

function MuseumProvenance() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Provenance[]>([]);
  const [filter, setFilter] = useState<"all" | "visible" | "hidden" | "legacy" | "admin">("all");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [ents, camps] = await Promise.all([
          fetchAll<EncEntity>(
            "encyclopedia_entities",
            "id,entity_type,slug,title,enabled,metadata,created_at",
          ),
          fetchAll<Campaign>("admin_campaigns", "id,slug,title,status,data").then(selectCampaignRows),
        ]);
        const artifacts = ents.filter((e) => e.entity_type === "artifact");
        const refMap = collectCampaignArtifactRefs(camps);
        const analyzed = artifacts.map((a) =>
          analyze(a, refMap.get(a.slug) ?? []),
        );
        setRows(analyzed);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const adminImported = rows.filter((r) => r.adminImported);
    const campaignOnly = rows.filter((r) => !r.adminImported && r.campaignRefs.length > 0);
    const museumEnabledOnly = rows.filter(
      (r) => !r.adminImported && r.campaignRefs.length === 0 && r.museumEnabled,
    );
    const legacy = rows.filter((r) => r.isLegacy);
    const visible = rows.filter((r) => r.willRemainVisible);
    const hidden = rows.filter((r) => !r.willRemainVisible);

    // First import batch grouped by pack_id / source
    const batchCounts = new Map<string, number>();
    for (const r of adminImported) {
      const m = r.artifact.metadata ?? {};
      const key =
        m.import_batch || m.pack_id || m.source || m.provenance || "(غير محدد)";
      batchCounts.set(String(key), (batchCounts.get(String(key)) ?? 0) + 1);
    }
    const batches = [...batchCounts.entries()].sort((a, b) => b[1] - a[1]);

    return {
      total,
      adminImported: adminImported.length,
      campaignOnly: campaignOnly.length,
      museumEnabledOnly: museumEnabledOnly.length,
      legacy: legacy.length,
      visible: visible.length,
      hidden: hidden.length,
      batches,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "visible":
        return rows.filter((r) => r.willRemainVisible);
      case "hidden":
        return rows.filter((r) => !r.willRemainVisible);
      case "legacy":
        return rows.filter((r) => r.isLegacy);
      case "admin":
        return rows.filter((r) => r.adminImported);
      default:
        return rows;
    }
  }, [rows, filter]);

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6 text-sm">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">تدقيق مصادر المتحف</h1>
        <p className="text-muted-foreground">
          تقرير معاينة فقط — لا يتم حذف أو أرشفة أو تعديل أي صف. يحدد القطع
          ذات المصدر الإداري مقابل القطع القديمة/التجريبية، ويعرض ما سيبقى
          ظاهراً في وضع التشغيل الجديد للمتحف.
        </p>
        <div className="rounded border border-border bg-muted/30 p-3 text-xs">
          <div className="font-semibold mb-1">قاعدة العرض المقترحة</div>
          يظهر في المتحف فقط: (1) القطع المستوردة من الإدارة، أو (2) القطع
          المرتبطة بحملة، أو (3) القطع المُعلَّمة صراحةً
          <code className="mx-1">museum_enabled=true</code>. غير ذلك يُخفى من واجهة اللاعب.
        </div>
      </header>

      {!loading && !err && (
        <div className="rounded border border-dashed border-border bg-muted/20 p-2 font-mono text-xs">
          debug · visible={stats.visible} · hidden={stats.hidden} · legacy/demo hidden=
          {rows.filter((r) => r.isLegacy && !r.willRemainVisible).length}
        </div>
      )}

      {loading && <div>جارٍ التحميل…</div>}
      {err && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-destructive">
          {err}
        </div>
      )}

      {!loading && !err && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="إجمالي القطع" value={stats.total} />
            <Stat label="مستوردة من الإدارة" value={stats.adminImported} tone="ok" />
            <Stat label="مرتبطة بحملة فقط" value={stats.campaignOnly} />
            <Stat label="museum_enabled فقط" value={stats.museumEnabledOnly} />
            <Stat label="قديمة/تجريبية" value={stats.legacy} tone="warn" />
            <Stat label="ستبقى ظاهرة" value={stats.visible} tone="ok" />
            <Stat label="ستُخفى" value={stats.hidden} tone="warn" />
            <Stat
              label="نسبة الظهور"
              value={
                stats.total
                  ? `${Math.round((stats.visible / stats.total) * 100)}%`
                  : "—"
              }
            />
          </section>

          <section className="rounded border border-border p-4">
            <h2 className="mb-2 font-semibold">دفعات الاستيراد</h2>
            {stats.batches.length === 0 ? (
              <div className="text-muted-foreground">لا توجد دفعات معروفة.</div>
            ) : (
              <ul className="space-y-1">
                {stats.batches.map(([k, n]) => (
                  <li key={k} className="flex justify-between border-b border-border/40 py-1">
                    <span className="font-mono text-xs">{k}</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["all", "visible", "hidden", "legacy", "admin"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded border px-3 py-1 text-xs ${
                    filter === f
                      ? "border-primary bg-primary/10"
                      : "border-border"
                  }`}
                >
                  {labelFor(f)} ({countFor(f, stats)})
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-right">العنوان</th>
                    <th className="p-2 text-right">المعرّف</th>
                    <th className="p-2 text-right">المصدر</th>
                    <th className="p-2 text-right">الحملات</th>
                    <th className="p-2 text-right">museum_enabled</th>
                    <th className="p-2 text-right">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((r) => (
                    <tr key={r.artifact.id} className="border-t border-border/40">
                      <td className="p-2">{r.artifact.title ?? "—"}</td>
                      <td className="p-2 font-mono">{r.artifact.slug}</td>
                      <td className="p-2 font-mono text-[10px]">
                        {r.importMarkers.join(" · ") || "—"}
                      </td>
                      <td className="p-2 font-mono text-[10px]">
                        {r.campaignRefs.join(", ") || "—"}
                      </td>
                      <td className="p-2">{r.museumEnabled ? "نعم" : "—"}</td>
                      <td className="p-2">
                        {r.willRemainVisible ? (
                          <span className="text-emerald-600">ظاهر</span>
                        ) : (
                          <span className="text-amber-600">سيُخفى</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 500 && (
                <div className="border-t border-border p-2 text-xs text-muted-foreground">
                  يعرض أول 500 من {filtered.length}
                </div>
              )}
            </div>
          </section>

          <section className="rounded border border-amber-500/40 bg-amber-500/5 p-4 text-xs">
            <div className="mb-1 font-semibold">الخطوات التالية (لم تُطبَّق بعد)</div>
            <ol className="list-decimal space-y-1 pr-5">
              <li>مراجعة قائمة "سيُخفى" والتأكد من عدم وجود قطع مطلوبة.</li>
              <li>وسم أي قطع قديمة يجب الاحتفاظ بها يدوياً بـ <code>museum_enabled=true</code>.</li>
              <li>بعد التأكيد فقط، يتم تطبيق وضع التشغيل الذي يخفي الباقي. لا حذف ولا أرشفة.</li>
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

function labelFor(f: string) {
  switch (f) {
    case "all":
      return "الكل";
    case "visible":
      return "ستبقى ظاهرة";
    case "hidden":
      return "ستُخفى";
    case "legacy":
      return "قديمة/تجريبية";
    case "admin":
      return "مستوردة";
    default:
      return f;
  }
}
function countFor(f: string, s: any) {
  switch (f) {
    case "all":
      return s.total;
    case "visible":
      return s.visible;
    case "hidden":
      return s.hidden;
    case "legacy":
      return s.legacy;
    case "admin":
      return s.adminImported;
    default:
      return 0;
  }
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
      ? "text-amber-600"
      : "text-foreground";
  return (
    <div className="rounded border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
