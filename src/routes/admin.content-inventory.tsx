import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/content-inventory")({
  head: () => ({
    meta: [
      { title: "جرد المحتوى — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <ContentInventory />
    </AdminGate>
  ),
});

const ENC_TYPES = ["figure", "city", "state", "battle", "event", "landmark", "artifact"] as const;

function eraOf(y: number | null): string {
  if (y == null) return "غير محدد";
  if (y < 622) return "ما قبل الإسلام";
  if (y < 750) return "النبوّة والراشدون والأمويون";
  if (y < 1258) return "العصر العباسي";
  if (y < 1517) return "العصور الوسطى المتأخرة";
  if (y < 1924) return "العثماني والحديث المبكر";
  return "المعاصر";
}

type Inventory = {
  generated_at: string;
  encyclopedia: {
    total: number;
    by_type: Record<string, number>;
    by_era: Record<string, number>;
    with_body: number;
    empty_body: number;
    atlas_repair_stub: number;
  };
  campaigns: {
    total: number;
    published: number;
    draft: number;
    chapters: number;
    activities: number;
    rewards: number;
  };
  investigations: { total: number; published: number; draft: number };
  today_in_history: { total: number; enabled: number; disabled: number };
  notifications: { total: number; scheduled: number; sent: number; draft: number };
  atlas: { total: number; linked: number; coverage_pct: number };
  growth: {
    week: number;
    month: number;
    by_type_week: Record<string, number>;
    by_type_month: Record<string, number>;
  };
  top: {
    eras: Array<{ era: string; count: number }>;
    campaigns_by_chapters: Array<{ title: string; chapters: number }>;
    entity_types: Array<{ type: string; count: number }>;
  };
};

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

async function buildInventory(): Promise<Inventory> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();

  // Encyclopedia
  const enc = await fetchAll<any>(
    "encyclopedia_entities",
    "id,entity_type,body,metadata,timeline_year,timeline_start_year,created_at"
  );
  const by_type: Record<string, number> = {};
  const by_era: Record<string, number> = {};
  let with_body = 0;
  let empty_body = 0;
  let stub = 0;
  const by_type_week: Record<string, number> = {};
  const by_type_month: Record<string, number> = {};
  for (const r of enc) {
    by_type[r.entity_type] = (by_type[r.entity_type] ?? 0) + 1;
    const y = r.timeline_year ?? r.timeline_start_year ?? null;
    const era = eraOf(y);
    by_era[era] = (by_era[era] ?? 0) + 1;
    const hasBody = r.body && typeof r.body === "object" && Object.keys(r.body).length > 0;
    if (hasBody) with_body++;
    else empty_body++;
    if (r.metadata?.source === "atlas_repair_stub") stub++;
    if (r.created_at >= weekAgo)
      by_type_week[r.entity_type] = (by_type_week[r.entity_type] ?? 0) + 1;
    if (r.created_at >= monthAgo)
      by_type_month[r.entity_type] = (by_type_month[r.entity_type] ?? 0) + 1;
  }

  // Campaigns
  const camps = selectCampaignRows(await fetchAll<any>("admin_campaigns", "id,title,status,data,created_at"));
  let chapters = 0;
  let activities = 0;
  let rewards = 0;
  const campByChapters: Array<{ title: string; chapters: number }> = [];
  for (const c of camps) {
    const chs = Array.isArray(c.data?.chapters) ? c.data.chapters : [];
    chapters += chs.length;
    campByChapters.push({ title: c.title, chapters: chs.length });
    for (const ch of chs) {
      const acts = Array.isArray(ch?.activities) ? ch.activities : [];
      activities += acts.length;
      for (const a of acts) {
        if (a?.reward) rewards++;
      }
    }
  }

  // Investigations
  const invs = await fetchAll<any>("investigations", "id,enabled");
  const invPub = invs.filter((i) => i.enabled).length;

  // Today in history
  const tih = await fetchAll<any>("today_in_history_events", "id,enabled");
  const tihEn = tih.filter((t) => t.enabled).length;

  // Notifications
  const notifs = await fetchAll<any>("notifications", "id,status");
  const nSched = notifs.filter((n) => n.status === "scheduled").length;
  const nSent = notifs.filter((n) => n.status === "sent").length;
  const nDraft = notifs.filter((n) => n.status === "draft").length;

  // Atlas
  const atlas = await fetchAll<any>("atlas_entities", "id,encyclopedia_entity_id");
  const linked = atlas.filter((a) => a.encyclopedia_entity_id).length;
  const coverage = atlas.length ? (linked / atlas.length) * 100 : 0;

  // Growth (encyclopedia counts)
  const week = enc.filter((r) => r.created_at >= weekAgo).length;
  const month = enc.filter((r) => r.created_at >= monthAgo).length;

  // Top
  const topEras = Object.entries(by_era)
    .map(([era, count]) => ({ era, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const topTypes = Object.entries(by_type)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  const topCamps = campByChapters.sort((a, b) => b.chapters - a.chapters).slice(0, 5);

  return {
    generated_at: now.toISOString(),
    encyclopedia: {
      total: enc.length,
      by_type,
      by_era,
      with_body,
      empty_body,
      atlas_repair_stub: stub,
    },
    campaigns: {
      total: camps.length,
      published: camps.filter((c) => c.status === "published").length,
      draft: camps.filter((c) => c.status === "draft").length,
      chapters,
      activities,
      rewards,
    },
    investigations: {
      total: invs.length,
      published: invPub,
      draft: invs.length - invPub,
    },
    today_in_history: {
      total: tih.length,
      enabled: tihEn,
      disabled: tih.length - tihEn,
    },
    notifications: {
      total: notifs.length,
      scheduled: nSched,
      sent: nSent,
      draft: nDraft,
    },
    atlas: {
      total: atlas.length,
      linked,
      coverage_pct: Math.round(coverage * 10) / 10,
    },
    growth: { week, month, by_type_week, by_type_month },
    top: { eras: topEras, campaigns_by_chapters: topCamps, entity_types: topTypes },
  };
}

function toCSV(inv: Inventory): string {
  const lines: string[] = ["section,metric,value"];
  const push = (s: string, m: string, v: any) =>
    lines.push(`${s},${m},"${String(v).replace(/"/g, '""')}"`);
  push("encyclopedia", "total", inv.encyclopedia.total);
  push("encyclopedia", "with_body", inv.encyclopedia.with_body);
  push("encyclopedia", "empty_body", inv.encyclopedia.empty_body);
  push("encyclopedia", "atlas_repair_stub", inv.encyclopedia.atlas_repair_stub);
  for (const [k, v] of Object.entries(inv.encyclopedia.by_type)) push("encyclopedia.by_type", k, v);
  for (const [k, v] of Object.entries(inv.encyclopedia.by_era)) push("encyclopedia.by_era", k, v);
  for (const [k, v] of Object.entries(inv.campaigns)) push("campaigns", k, v);
  for (const [k, v] of Object.entries(inv.investigations)) push("investigations", k, v);
  for (const [k, v] of Object.entries(inv.today_in_history)) push("today_in_history", k, v);
  for (const [k, v] of Object.entries(inv.notifications)) push("notifications", k, v);
  for (const [k, v] of Object.entries(inv.atlas)) push("atlas", k, v);
  push("growth", "week", inv.growth.week);
  push("growth", "month", inv.growth.month);
  for (const [k, v] of Object.entries(inv.growth.by_type_week))
    push("growth.by_type_week", k, v);
  for (const [k, v] of Object.entries(inv.growth.by_type_month))
    push("growth.by_type_month", k, v);
  for (const e of inv.top.eras) push("top.eras", e.era, e.count);
  for (const c of inv.top.campaigns_by_chapters)
    push("top.campaigns_by_chapters", c.title, c.chapters);
  for (const t of inv.top.entity_types) push("top.entity_types", t.type, t.count);
  return lines.join("\n");
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toSummaryText(inv: Inventory): string {
  const L: string[] = [];
  const h = (t: string) => L.push("", `=== ${t} ===`);
  const kv = (k: string, v: any) => L.push(`${k}: ${v}`);
  L.push(`Content Inventory Report`);
  L.push(`Generated: ${new Date(inv.generated_at).toLocaleString()}`);

  h("1. Encyclopedia");
  kv("total", inv.encyclopedia.total);
  kv("with_body", inv.encyclopedia.with_body);
  kv("empty_body", inv.encyclopedia.empty_body);
  kv("atlas_repair_stub", inv.encyclopedia.atlas_repair_stub);
  L.push("-- by type --");
  for (const t of ENC_TYPES) kv(t, inv.encyclopedia.by_type[t] ?? 0);
  L.push("-- by era --");
  for (const [k, v] of Object.entries(inv.encyclopedia.by_era)) kv(k, v);

  h("2. Campaigns");
  for (const [k, v] of Object.entries(inv.campaigns)) kv(k, v);
  h("3. Investigations");
  for (const [k, v] of Object.entries(inv.investigations)) kv(k, v);
  h("4. Today in History");
  for (const [k, v] of Object.entries(inv.today_in_history)) kv(k, v);
  h("5. Notifications");
  for (const [k, v] of Object.entries(inv.notifications)) kv(k, v);
  h("6. Atlas");
  for (const [k, v] of Object.entries(inv.atlas)) kv(k, v);

  h("7. Growth");
  kv("this_week", inv.growth.week);
  kv("this_month", inv.growth.month);
  L.push("-- this week by type --");
  for (const [k, v] of Object.entries(inv.growth.by_type_week)) kv(k, v);
  L.push("-- this month by type --");
  for (const [k, v] of Object.entries(inv.growth.by_type_month)) kv(k, v);

  h("8. Top Areas");
  L.push("-- top eras --");
  for (const e of inv.top.eras) kv(e.era, e.count);
  L.push("-- top campaigns by chapters --");
  for (const c of inv.top.campaigns_by_chapters) kv(c.title, c.chapters);
  L.push("-- entity types --");
  for (const t of inv.top.entity_types) kv(t.type, t.count);

  return L.join("\n");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function KV({ data }: { data: Record<string, any> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-3">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-border/40 py-1">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-mono">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ContentInventory() {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      setInv(await buildInventory());
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const json = useMemo(() => (inv ? JSON.stringify(inv, null, 2) : ""), [inv]);

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">جرد المحتوى</h1>
        <div className="flex gap-2">
          <button
            className="rounded border border-border px-3 py-1 text-sm"
            onClick={load}
            disabled={loading}
          >
            {loading ? "..." : "تحديث"}
          </button>
          <button
            className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
            disabled={!inv}
            onClick={() =>
              inv && download(`inventory-${Date.now()}.json`, json, "application/json")
            }
          >
            تصدير JSON
          </button>
          <button
            className="rounded border border-border px-3 py-1 text-sm disabled:opacity-50"
            disabled={!inv}
            onClick={() =>
              inv && download(`inventory-${Date.now()}.csv`, toCSV(inv), "text/csv")
            }
          >
            تصدير CSV
          </button>
          <button
            className="rounded border border-border bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
            disabled={!inv}
            onClick={async () => {
              if (!inv) return;
              const text = toSummaryText(inv);
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                const ta = document.createElement("textarea");
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "تم النسخ ✓" : "نسخ التقرير"}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm">{err}</div>
      )}

      {loading && !inv && <div className="text-sm text-muted-foreground">جاري التحميل...</div>}

      {inv && (
        <>
          <p className="text-xs text-muted-foreground">
            مُولَّد في {new Date(inv.generated_at).toLocaleString("ar")}
          </p>

          <Section title="1. الموسوعة">
            <KV
              data={{
                total: inv.encyclopedia.total,
                with_body: inv.encyclopedia.with_body,
                empty_body: inv.encyclopedia.empty_body,
                atlas_repair_stub: inv.encyclopedia.atlas_repair_stub,
              }}
            />
            <h3 className="mt-3 text-sm font-semibold">حسب النوع</h3>
            <KV data={Object.fromEntries(ENC_TYPES.map((t) => [t, inv.encyclopedia.by_type[t] ?? 0]))} />
            <h3 className="mt-3 text-sm font-semibold">حسب الحقبة</h3>
            <KV data={inv.encyclopedia.by_era} />
          </Section>

          <Section title="2. الحملات">
            <KV data={inv.campaigns} />
          </Section>

          <Section title="3. التحقيقات">
            <KV data={inv.investigations} />
          </Section>

          <Section title="4. حدث في مثل هذا اليوم">
            <KV data={inv.today_in_history} />
          </Section>

          <Section title="5. الإشعارات">
            <KV data={inv.notifications} />
          </Section>

          <Section title="6. الأطلس">
            <KV data={inv.atlas} />
          </Section>

          <Section title="7. نمو المحتوى">
            <KV data={{ this_week: inv.growth.week, this_month: inv.growth.month }} />
            <h3 className="mt-3 text-sm font-semibold">هذا الأسبوع حسب النوع</h3>
            <KV data={inv.growth.by_type_week} />
            <h3 className="mt-3 text-sm font-semibold">هذا الشهر حسب النوع</h3>
            <KV data={inv.growth.by_type_month} />
          </Section>

          <Section title="8. أهم المجالات">
            <h3 className="text-sm font-semibold">أهم الحقب</h3>
            <KV data={Object.fromEntries(inv.top.eras.map((e) => [e.era, e.count]))} />
            <h3 className="mt-3 text-sm font-semibold">أهم الحملات حسب عدد الفصول</h3>
            <KV
              data={Object.fromEntries(inv.top.campaigns_by_chapters.map((c) => [c.title, c.chapters]))}
            />
            <h3 className="mt-3 text-sm font-semibold">أهم أنواع الكيانات</h3>
            <KV data={Object.fromEntries(inv.top.entity_types.map((t) => [t.type, t.count]))} />
          </Section>
        </>
      )}
    </div>
  );
}
