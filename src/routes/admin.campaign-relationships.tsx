import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/campaign-relationships")({
  head: () => ({
    meta: [
      { title: "باني علاقات الحملات — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <CampaignRelationships />
    </AdminGate>
  ),
});

// ------------------------------ types ------------------------------

type EncEntity = {
  id: string;
  entity_type: string;
  slug: string;
  title: string | null;
};
type Campaign = { id: string; slug: string; title: string; status: string; data: any };

type Ref = { ref: string; source: string }; // ref = "type:slug"

type CampaignPlan = {
  campaign: Campaign;
  core: Ref[];           // from unlocks + rewards
  supporting: Ref[];     // from explicit encyclopedia_refs only
  unresolved: Ref[];     // references that don't match any encyclopedia entity
  existingCore: string[];
  existingSupporting: string[];
  addCore: string[];
  addSupporting: string[];
};

// ------------------------------ fetch ------------------------------

async function fetchAll<T = any>(table: string, columns: string): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const out: T[] = [];
  while (true) {
    const { data, error } = await supabase.from(table as any).select(columns).range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// ------------------------------ explicit reference extraction ------------------------------

function asRef(v: any): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s.includes(":")) return null;
  return s;
}

function pushRefs(arr: any, source: string, out: Ref[]) {
  if (!Array.isArray(arr)) return;
  for (const v of arr) {
    const r = asRef(v);
    if (r) out.push({ ref: r, source });
  }
}

// Collect references that count as CORE: unlocks + reward artifacts/items/entities/encyclopedia
function collectCoreRefs(c: Campaign): Ref[] {
  const out: Ref[] = [];
  const d = c.data ?? {};
  const chapters = Array.isArray(d.chapters) ? d.chapters : [];
  chapters.forEach((ch: any, ci: number) => {
    const label = `chapter[${ci}]`;
    const rewards = ch?.rewards ?? {};
    pushRefs(rewards.unlocks, `${label}.rewards.unlocks`, out);
    pushRefs(rewards.entities, `${label}.rewards.entities`, out);
    pushRefs(rewards.artifacts, `${label}.rewards.artifacts`, out);
    pushRefs(rewards.items, `${label}.rewards.items`, out);
    pushRefs(rewards.encyclopedia, `${label}.rewards.encyclopedia`, out);
  });
  // top-level rewards (rare)
  const top = d.rewards ?? {};
  pushRefs(top.unlocks, "rewards.unlocks", out);
  pushRefs(top.entities, "rewards.entities", out);
  pushRefs(top.artifacts, "rewards.artifacts", out);
  pushRefs(top.items, "rewards.items", out);
  pushRefs(top.encyclopedia, "rewards.encyclopedia", out);
  return out;
}

// Collect references that count as SUPPORTING: explicit encyclopedia_refs only
function collectSupportingRefs(c: Campaign): Ref[] {
  const out: Ref[] = [];
  const d = c.data ?? {};
  pushRefs(d.encyclopedia_refs, "data.encyclopedia_refs", out);
  pushRefs(d.metadata?.encyclopedia_refs, "data.metadata.encyclopedia_refs", out);
  const chapters = Array.isArray(d.chapters) ? d.chapters : [];
  chapters.forEach((ch: any, ci: number) => {
    const label = `chapter[${ci}]`;
    pushRefs(ch.encyclopedia_refs, `${label}.encyclopedia_refs`, out);
    pushRefs(ch?.metadata?.encyclopedia_refs, `${label}.metadata.encyclopedia_refs`, out);
    const activities = Array.isArray(ch.activities) ? ch.activities : [];
    activities.forEach((a: any, ai: number) => {
      const al = `${label}.activities[${ai}]`;
      pushRefs(a.encyclopedia_refs, `${al}.encyclopedia_refs`, out);
      // single explicit entity_ref on activity
      const single = asRef(a.entity_ref);
      if (single) out.push({ ref: single, source: `${al}.entity_ref` });
    });
  });
  return out;
}

function dedupe(refs: Ref[]): Ref[] {
  const seen = new Set<string>();
  const out: Ref[] = [];
  for (const r of refs) {
    if (seen.has(r.ref)) continue;
    seen.add(r.ref);
    out.push(r);
  }
  return out;
}

function buildPlan(c: Campaign, encKeys: Set<string>): CampaignPlan {
  const coreAll = dedupe(collectCoreRefs(c));
  const supAll = dedupe(collectSupportingRefs(c));
  const coreSet = new Set(coreAll.map((r) => r.ref));
  // supporting that's already core → drop from supporting
  const sup = supAll.filter((r) => !coreSet.has(r.ref));
  const unresolved: Ref[] = [];
  const core: Ref[] = [];
  for (const r of coreAll) (encKeys.has(r.ref) ? core : unresolved).push(r);
  const supporting: Ref[] = [];
  for (const r of sup) (encKeys.has(r.ref) ? supporting : unresolved).push(r);

  const md = c.data?.metadata ?? {};
  const existingCore: string[] = Array.isArray(md.core_entities) ? md.core_entities : [];
  const existingSupporting: string[] = Array.isArray(md.supporting_entities) ? md.supporting_entities : [];
  const coreRefs = core.map((r) => r.ref);
  const supRefs = supporting.map((r) => r.ref);
  const addCore = coreRefs.filter((r) => !existingCore.includes(r));
  const addSupporting = supRefs.filter((r) => !existingSupporting.includes(r));

  return {
    campaign: c,
    core,
    supporting,
    unresolved,
    existingCore,
    existingSupporting,
    addCore,
    addSupporting,
  };
}

// ------------------------------ apply ------------------------------

async function applyPlans(plans: CampaignPlan[]) {
  for (const p of plans) {
    if (p.addCore.length === 0 && p.addSupporting.length === 0) continue;
    const data = JSON.parse(JSON.stringify(p.campaign.data ?? {}));
    data.metadata = data.metadata ?? {};
    const curCore: string[] = Array.isArray(data.metadata.core_entities) ? data.metadata.core_entities : [];
    const curSup: string[] = Array.isArray(data.metadata.supporting_entities) ? data.metadata.supporting_entities : [];
    data.metadata.core_entities = Array.from(new Set([...curCore, ...p.core.map((r) => r.ref)])).sort();
    data.metadata.supporting_entities = Array.from(new Set([...curSup, ...p.supporting.map((r) => r.ref)])).sort();
    data.metadata.relationships_built_at = new Date().toISOString();
    const { error } = await supabase.from("admin_campaigns").update({ data }).eq("id", p.campaign.id);
    if (error) throw error;
  }
}

// ------------------------------ UI ------------------------------

function CampaignRelationships() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [encKeys, setEncKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [expand, setExpand] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setErr(null);
    setDone(null);
    try {
      const [enc, camps] = await Promise.all([
        fetchAll<EncEntity>("encyclopedia_entities", "id,entity_type,slug,title"),
        fetchAll<Campaign>("admin_campaigns", "id,slug,title,status,data").then(selectCampaignRows),
      ]);
      const keys = new Set(enc.map((e) => `${e.entity_type}:${e.slug}`));
      setEncKeys(keys);
      setCampaigns(camps);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const plans = useMemo(
    () => campaigns.map((c) => buildPlan(c, encKeys)).sort((a, b) => a.campaign.slug.localeCompare(b.campaign.slug)),
    [campaigns, encKeys],
  );

  const totals = useMemo(() => {
    let core = 0, sup = 0, addC = 0, addS = 0, unres = 0, withChanges = 0;
    for (const p of plans) {
      core += p.core.length;
      sup += p.supporting.length;
      addC += p.addCore.length;
      addS += p.addSupporting.length;
      unres += p.unresolved.length;
      if (p.addCore.length || p.addSupporting.length) withChanges++;
    }
    return { core, sup, addC, addS, unres, withChanges };
  }, [plans]);

  async function applyAll() {
    setBusy(true);
    setErr(null);
    try {
      await applyPlans(plans);
      setDone(`تم تحديث ${totals.withChanges} حملة.`);
      setShowPreview(false);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">باني علاقات الحملات</h1>
          <p className="text-sm text-muted-foreground">
            يستخرج <code className="font-mono">core_entities</code> و
            <code className="mx-1 font-mono">supporting_entities</code> من المراجع الصريحة فقط
            (مكافآت، فتوحات، <code className="font-mono">encyclopedia_refs</code>) — بدون مطابقة نصية.
            <Link to="/admin/content-integrity" className="mx-2 underline">سلامة المحتوى</Link>
            <Link to="/admin/content-auto-heal" className="underline">الإصلاح الذاتي</Link>
          </p>
        </div>
        <button onClick={load} disabled={loading} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
          {loading ? "جارٍ التحميل…" : "إعادة المسح"}
        </button>
      </header>

      {err && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>}
      {done && <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{done}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="حملات" value={plans.length} />
        <Stat label="حملات بتغييرات" value={totals.withChanges} />
        <Stat label="إجمالي core" value={totals.core} />
        <Stat label="إجمالي supporting" value={totals.sup} />
        <Stat label="إضافات معلّقة" value={totals.addC + totals.addS} tone={totals.addC + totals.addS ? "good" : "warn"} />
        <Stat label="مراجع غير محلولة" value={totals.unres} tone={totals.unres ? "bad" : "good"} />
      </div>

      <div className="flex gap-2">
        <button
          disabled={totals.withChanges === 0 || busy}
          onClick={() => setShowPreview(true)}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          معاينة وتطبيق ({totals.withChanges})
        </button>
      </div>

      {showPreview && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 font-bold">معاينة الكتابة</div>
          <ul className="mb-3 max-h-72 list-disc space-y-1 overflow-auto pr-5 text-xs">
            {plans
              .filter((p) => p.addCore.length || p.addSupporting.length)
              .slice(0, 300)
              .map((p) => (
                <li key={p.campaign.id}>
                  <code className="font-mono">
                    {p.campaign.slug}: +{p.addCore.length} core, +{p.addSupporting.length} supporting
                  </code>
                </li>
              ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={applyAll} disabled={busy} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? "جارٍ التطبيق…" : "تأكيد التطبيق"}
            </button>
            <button onClick={() => setShowPreview(false)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">إلغاء</button>
          </div>
        </div>
      )}

      <section className="rounded-xl border bg-background p-4">
        <h2 className="mb-3 text-lg font-bold">تفاصيل الحملات</h2>
        <div className="space-y-2">
          {plans.map((p) => {
            const id = p.campaign.id;
            const open = !!expand[id];
            const changed = p.addCore.length || p.addSupporting.length;
            return (
              <div key={id} className="rounded border bg-card p-3 text-sm">
                <button
                  onClick={() => setExpand((e) => ({ ...e, [id]: !open }))}
                  className="flex w-full items-center justify-between gap-3 text-right"
                >
                  <span className="font-mono text-xs">{p.campaign.slug}</span>
                  <span className="flex gap-2 text-xs">
                    <span>core {p.core.length}{p.addCore.length ? ` (+${p.addCore.length})` : ""}</span>
                    <span>sup {p.supporting.length}{p.addSupporting.length ? ` (+${p.addSupporting.length})` : ""}</span>
                    {p.unresolved.length > 0 && <span className="text-red-700">unresolved {p.unresolved.length}</span>}
                    {changed ? <span className="text-emerald-700">●</span> : <span className="text-muted-foreground">—</span>}
                  </span>
                </button>
                {open && (
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <RefList title="core_entities" items={p.core} />
                    <RefList title="supporting_entities" items={p.supporting} />
                    <RefList title="unresolved" items={p.unresolved} tone="bad" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function RefList({ title, items, tone }: { title: string; items: Ref[]; tone?: "bad" }) {
  return (
    <div className={`rounded border p-2 ${tone === "bad" ? "border-red-200 bg-red-50" : ""}`}>
      <div className="mb-1 text-xs font-bold">{title} ({items.length})</div>
      <ul className="max-h-48 space-y-0.5 overflow-auto text-xs">
        {items.map((r, i) => (
          <li key={i}>
            <code className="font-mono">{r.ref}</code>
            <span className="text-muted-foreground"> — {r.source}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-muted-foreground">—</li>}
      </ul>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: any; tone?: "good" | "warn" | "bad" }) {
  const color =
    tone === "good" ? "text-green-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "text-slate-900";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
