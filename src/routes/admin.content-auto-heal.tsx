import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/content-auto-heal")({
  head: () => ({
    meta: [
      { title: "إصلاح ذاتي لرسم المحتوى — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <ContentAutoHeal />
    </AdminGate>
  ),
});

// ------------------------------ types ------------------------------

type EncEntity = {
  id: string;
  entity_type: string;
  slug: string;
  title: string | null;
  enabled: boolean;
  metadata: any;
};
type Campaign = { id: string; slug: string; title: string; status: string; data: any };

type UnlockRef = {
  campaignId: string;
  campaignSlug: string;
  chapterIndex: number;
  chapterId: string;
  unlockIndex: number;
  raw: string;
  type: string;
  slug: string;
};

// ------------------------------ data fetch ------------------------------

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

function parseUnlocks(campaigns: Campaign[]): UnlockRef[] {
  const out: UnlockRef[] = [];
  for (const c of campaigns) {
    const chapters = Array.isArray(c.data?.chapters) ? c.data.chapters : [];
    chapters.forEach((ch: any, chapterIndex: number) => {
      const unlocks: string[] = Array.isArray(ch?.rewards?.unlocks) ? ch.rewards.unlocks : [];
      unlocks.forEach((raw, unlockIndex) => {
        const [type, ...rest] = String(raw).split(":");
        out.push({
          campaignId: c.id,
          campaignSlug: c.slug,
          chapterIndex,
          chapterId: ch.id ?? `#${chapterIndex}`,
          unlockIndex,
          raw: String(raw),
          type: type ?? "",
          slug: rest.join(":"),
        });
      });
    });
  }
  return out;
}

// ------------------------------ normalization ------------------------------

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "") // Arabic diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normText(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------ unlock auto-fix (≥90) ------------------------------

const AUTO_THRESHOLD = 90;

type UnlockFix = { u: UnlockRef; match: EncEntity; score: number; newVal: string; reason: string };

function scoreUnlockMatch(u: UnlockRef, e: EncEntity, c: Campaign | undefined): { s: number; reason: string } {
  const target = norm(u.slug);
  const slugN = norm(e.slug);
  const titleN = norm(e.title);
  const legacy = norm(e.metadata?.legacy_id);
  const aliases: string[] = Array.isArray(e.metadata?.aliases) ? e.metadata.aliases : [];
  const reasons: string[] = [];
  let s = 0;
  if (slugN === target) { s += 100; reasons.push("exact-slug"); }
  else if (slugN && target && (slugN.includes(target) || target.includes(slugN))) { s += 35; reasons.push("partial-slug"); }
  if (titleN === target) { s += 85; reasons.push("title=slug"); }
  if (legacy && legacy === target) { s += 95; reasons.push("legacy_id"); }
  for (const a of aliases) if (norm(a) === target) { s += 90; reasons.push("alias"); break; }
  // type compatibility — penalize mismatched types
  if (u.type && e.entity_type !== u.type) s -= 40;
  else if (u.type && e.entity_type === u.type) s += 5;
  // campaign/chapter context — if entity title appears in campaign text, boost
  if (c) {
    const text = collectCampaignText(c);
    const t = normText(e.title);
    if (t && t.length >= 3 && normText(text).includes(t)) { s += 8; reasons.push("ctx"); }
  }
  return { s, reason: reasons.join(",") };
}

function planUnlockFixes(missing: UnlockRef[], enc: EncEntity[], campaigns: Campaign[]): UnlockFix[] {
  const out: UnlockFix[] = [];
  const campById = new Map(campaigns.map((c) => [c.id, c] as const));
  for (const u of missing) {
    const c = campById.get(u.campaignId);
    let best: { e: EncEntity; s: number; reason: string } | null = null;
    let second = -1;
    for (const e of enc) {
      const { s, reason } = scoreUnlockMatch(u, e, c);
      if (!best || s > best.s) { second = best?.s ?? -1; best = { e, s, reason }; }
      else if (s > second) { second = s; }
    }
    if (!best || best.s < AUTO_THRESHOLD) continue;
    if (best.s - second < 10) continue; // require clear winner
    out.push({
      u,
      match: best.e,
      score: best.s,
      newVal: `${best.e.entity_type}:${best.e.slug}`,
      reason: best.reason,
    });
  }
  return out;
}

// ------------------------------ campaign related entities ------------------------------

function collectCampaignText(c: Campaign): string {
  const d = c.data ?? {};
  const parts: string[] = [c.title, d.title, d.subtitle, d.description, d.summary];
  const chapters = Array.isArray(d.chapters) ? d.chapters : [];
  for (const ch of chapters) {
    parts.push(ch.title, ch.subtitle, ch.description, ch.summary, ch.intro, ch.outro);
    const activities = Array.isArray(ch.activities) ? ch.activities : [];
    for (const a of activities) parts.push(a.title, a.description, a.question, a.prompt, a.text);
    const unlocks: string[] = Array.isArray(ch?.rewards?.unlocks) ? ch.rewards.unlocks : [];
    parts.push(unlocks.join(" "));
  }
  return parts.filter(Boolean).join(" \n ");
}

type RelatedLink = { campaignId: string; campaignSlug: string; add: string[]; existing: string[] };

function planCampaignRelated(campaigns: Campaign[], enc: EncEntity[]): RelatedLink[] {
  // Index entities by normalized title and aliases — only those long enough to avoid noise.
  type Idx = { key: string; entity: EncEntity };
  const idx: Idx[] = [];
  for (const e of enc) {
    const candidates: string[] = [];
    if (e.title) candidates.push(e.title);
    const aliases: string[] = Array.isArray(e.metadata?.aliases) ? e.metadata.aliases : [];
    for (const a of aliases) candidates.push(a);
    for (const c of candidates) {
      const k = normText(c);
      if (k.length >= 4) idx.push({ key: k, entity: e });
    }
  }
  const out: RelatedLink[] = [];
  for (const c of campaigns) {
    const text = normText(collectCampaignText(c));
    if (!text) continue;
    const existing: string[] = Array.isArray(c.data?.metadata?.related_entities) ? c.data.metadata.related_entities : [];
    const existingSet = new Set(existing);
    const hits = new Set<string>();
    for (const { key, entity } of idx) {
      if (text.includes(key)) hits.add(`${entity.entity_type}:${entity.slug}`);
    }
    const add = [...hits].filter((h) => !existingSet.has(h));
    if (add.length) out.push({ campaignId: c.id, campaignSlug: c.slug, add, existing });
  }
  return out;
}

async function applyCampaignRelated(plans: RelatedLink[], campaigns: Campaign[]) {
  const byId = new Map(campaigns.map((c) => [c.id, c] as const));
  for (const p of plans) {
    const c = byId.get(p.campaignId);
    if (!c) continue;
    const data = JSON.parse(JSON.stringify(c.data ?? {}));
    data.metadata = data.metadata ?? {};
    const cur: string[] = Array.isArray(data.metadata.related_entities) ? data.metadata.related_entities : [];
    data.metadata.related_entities = Array.from(new Set([...cur, ...p.add])).sort();
    data.metadata.auto_healed_at = new Date().toISOString();
    const { error } = await supabase.from("admin_campaigns").update({ data }).eq("id", p.campaignId);
    if (error) throw error;
  }
}

// ------------------------------ museum unlock mapping ------------------------------

type MuseumPlan = {
  obtainable: { e: EncEntity; sourceCampaigns: string[] }[];
  encyclopediaOnly: EncEntity[]; // artifacts without any unlock source
};

function planMuseum(enc: EncEntity[], unlocks: UnlockRef[]): MuseumPlan {
  const artifacts = enc.filter((e) => e.entity_type === "artifact");
  const unlockedBy = new Map<string, string[]>(); // artifact slug -> campaign slugs
  for (const u of unlocks) {
    if (u.type !== "artifact" || !u.slug) continue;
    const arr = unlockedBy.get(u.slug) ?? [];
    if (!arr.includes(u.campaignSlug)) arr.push(u.campaignSlug);
    unlockedBy.set(u.slug, arr);
  }
  const obtainable: MuseumPlan["obtainable"] = [];
  const encOnly: EncEntity[] = [];
  for (const a of artifacts) {
    const src = unlockedBy.get(a.slug);
    const m = a.metadata ?? {};
    const museum = m.museum ?? {};
    const expectedItemId = `artifact:${a.slug}`;
    if (src && src.length) {
      const needs =
        museum.item_id !== expectedItemId ||
        museum.obtainable !== true ||
        JSON.stringify(museum.unlock_sources ?? []) !== JSON.stringify(src);
      if (needs) obtainable.push({ e: a, sourceCampaigns: src });
    } else {
      if (museum.encyclopedia_only !== true || museum.item_id !== expectedItemId) {
        encOnly.push(a);
      }
    }
  }
  return { obtainable, encyclopediaOnly: encOnly };
}

async function applyMuseum(plan: MuseumPlan) {
  for (const o of plan.obtainable) {
    const md = { ...(o.e.metadata ?? {}) };
    md.museum = {
      ...(md.museum ?? {}),
      item_id: `artifact:${o.e.slug}`,
      obtainable: true,
      unlock_sources: o.sourceCampaigns,
      encyclopedia_only: false,
    };
    const { error } = await supabase.from("encyclopedia_entities").update({ metadata: md }).eq("id", o.e.id);
    if (error) throw error;
  }
  for (const e of plan.encyclopediaOnly) {
    const md = { ...(e.metadata ?? {}) };
    md.museum = {
      ...(md.museum ?? {}),
      item_id: `artifact:${e.slug}`,
      obtainable: false,
      encyclopedia_only: true,
    };
    const { error } = await supabase.from("encyclopedia_entities").update({ metadata: md }).eq("id", e.id);
    if (error) throw error;
  }
}

// ------------------------------ unlock fix apply ------------------------------

async function applyUnlockFixes(fixes: UnlockFix[], campaigns: Campaign[]) {
  const byCampaign = new Map<string, UnlockFix[]>();
  for (const f of fixes) {
    const arr = byCampaign.get(f.u.campaignId) ?? [];
    arr.push(f);
    byCampaign.set(f.u.campaignId, arr);
  }
  for (const [campaignId, items] of byCampaign) {
    const c = campaigns.find((x) => x.id === campaignId);
    if (!c) continue;
    const data = JSON.parse(JSON.stringify(c.data ?? {}));
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    for (const f of items) {
      const ch = chapters[f.u.chapterIndex];
      if (!ch?.rewards?.unlocks) continue;
      ch.rewards.unlocks[f.u.unlockIndex] = f.newVal;
    }
    const { error } = await supabase.from("admin_campaigns").update({ data }).eq("id", campaignId);
    if (error) throw error;
  }
}

// ------------------------------ report ------------------------------

type Snapshot = {
  encyclopedia: EncEntity[];
  campaigns: Campaign[];
  unlocks: UnlockRef[];
  missing: UnlockRef[];
  unlockFixes: UnlockFix[];
  related: RelatedLink[];
  museum: MuseumPlan;
};

async function buildSnapshot(): Promise<Snapshot> {
  const [encyclopedia, campaigns] = await Promise.all([
    fetchAll<EncEntity>("encyclopedia_entities", "id,entity_type,slug,title,enabled,metadata"),
    fetchAll<Campaign>("admin_campaigns", "id,slug,title,status,data").then(selectCampaignRows),
  ]);
  const encByKey = new Map<string, EncEntity>();
  for (const e of encyclopedia) encByKey.set(`${e.entity_type}:${e.slug}`, e);
  const unlocks = parseUnlocks(campaigns);
  const missing = unlocks.filter((u) => u.type && u.slug && !encByKey.has(`${u.type}:${u.slug}`));
  const unlockFixes = planUnlockFixes(missing, encyclopedia, campaigns);
  const related = planCampaignRelated(campaigns, encyclopedia);
  const museum = planMuseum(encyclopedia, unlocks);
  return { encyclopedia, campaigns, unlocks, missing, unlockFixes, related, museum };
}

// ------------------------------ UI ------------------------------

function Stat({ label, value, tone }: { label: string; value: any; tone?: "good" | "warn" | "bad" }) {
  const color =
    tone === "good" ? "text-green-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "text-slate-900";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-background p-5">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

type Preview = { title: string; lines: string[]; onConfirm: () => Promise<void> };

function ContentAutoHeal() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lastReport, setLastReport] = useState<{
    fixedUnlocks: number;
    linkedCampaigns: number;
    museumObtainable: number;
    museumEncOnly: number;
    remainingManual: number;
  } | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      setSnap(await buildSnapshot());
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { run(); }, []);

  async function confirmPreview() {
    if (!preview) return;
    setBusy(preview.title);
    try {
      await preview.onConfirm();
      setPreview(null);
      await run();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  }

  const remainingManual = useMemo(() => (snap ? snap.missing.length - snap.unlockFixes.length : 0), [snap]);

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إصلاح ذاتي لرسم المحتوى</h1>
          <p className="text-sm text-muted-foreground">
            إصلاح آلي عالي الثقة (≥ {AUTO_THRESHOLD}) لمراجع الحملات، الكيانات المرتبطة، وقابلية المتحف.
            <Link to="/admin/content-integrity" className="mx-2 underline">تقرير السلامة</Link>
            <Link to="/admin/content-integrity-repair" className="underline">إصلاح يدوي</Link>
          </p>
        </div>
        <button onClick={run} disabled={loading} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
          {loading ? "جارٍ التحليل…" : "إعادة المسح"}
        </button>
      </header>

      {err && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

      {preview && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 font-bold">معاينة — {preview.title}</div>
          <ul className="mb-3 max-h-72 list-disc space-y-1 overflow-auto pr-5 text-sm">
            {preview.lines.slice(0, 400).map((l, i) => (
              <li key={i}><code className="font-mono text-xs">{l}</code></li>
            ))}
            {preview.lines.length > 400 && <li>… +{preview.lines.length - 400} سطر إضافي</li>}
          </ul>
          <div className="flex gap-2">
            <button onClick={confirmPreview} disabled={!!busy} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? "جارٍ التطبيق…" : "تأكيد التطبيق"}
            </button>
            <button onClick={() => setPreview(null)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">إلغاء</button>
          </div>
        </div>
      )}

      {lastReport && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm">
          <div className="font-bold">تقرير آخر تشغيل</div>
          <div>مكافآت تم إصلاحها: {lastReport.fixedUnlocks}</div>
          <div>حملات تم ربط كياناتها: {lastReport.linkedCampaigns}</div>
          <div>تحف أصبحت قابلة للحصول: {lastReport.museumObtainable}</div>
          <div>تحف تم وسمها كموسوعة فقط: {lastReport.museumEncOnly}</div>
          <div>عناصر متبقية للمراجعة اليدوية: {lastReport.remainingManual}</div>
        </div>
      )}

      {!snap ? (
        <div className="text-sm text-muted-foreground">جارٍ تحميل البيانات…</div>
      ) : (
        <>
          <Section title="نظرة عامة">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="إجمالي الموسوعة" value={snap.encyclopedia.length} />
              <Stat label="إجمالي الحملات" value={snap.campaigns.length} />
              <Stat label="مراجع مكسورة" value={snap.missing.length} tone={snap.missing.length ? "bad" : "good"} />
              <Stat label="إصلاح آلي مرشّح" value={snap.unlockFixes.length} tone={snap.unlockFixes.length ? "good" : "warn"} />
              <Stat label="مراجعة يدوية" value={remainingManual} tone={remainingManual ? "warn" : "good"} />
            </div>
          </Section>

          <Section title={`١. إصلاح آلي عالي الثقة للمكافآت (${snap.unlockFixes.length})`}>
            <p className="mb-2 text-xs text-muted-foreground">
              فقط الكيانات بمطابقة ≥ {AUTO_THRESHOLD} مع فارق ≥ 10 عن المرشح الثاني. لا حذف.
            </p>
            <button
              disabled={snap.unlockFixes.length === 0 || !!busy}
              onClick={() =>
                setPreview({
                  title: `إصلاح ${snap.unlockFixes.length} مرجع مكافأة`,
                  lines: snap.unlockFixes.map(
                    (f) => `[${f.score}|${f.reason}] ${f.u.campaignSlug}/${f.u.chapterId}: ${f.u.raw}  →  ${f.newVal}`,
                  ),
                  onConfirm: async () => {
                    await applyUnlockFixes(snap.unlockFixes, snap.campaigns);
                    setLastReport((prev) => ({
                      fixedUnlocks: snap.unlockFixes.length,
                      linkedCampaigns: prev?.linkedCampaigns ?? 0,
                      museumObtainable: prev?.museumObtainable ?? 0,
                      museumEncOnly: prev?.museumEncOnly ?? 0,
                      remainingManual: snap.missing.length - snap.unlockFixes.length,
                    }));
                  },
                })
              }
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              معاينة الإصلاح الآلي
            </button>
            {remainingManual > 0 && (
              <div className="mt-2 text-xs">
                <Link to="/admin/content-integrity-repair" className="underline">
                  {remainingManual} مرجع منخفض الثقة — للمراجعة اليدوية
                </Link>
              </div>
            )}
          </Section>

          <Section title="٢. ربط الكيانات المرتبطة بالحملات">
            <p className="mb-2 text-xs text-muted-foreground">
              تم نقل بناء العلاقات إلى أداة مخصّصة تعتمد على المراجع الصريحة فقط (مكافآت، فتوحات،
              <code className="mx-1 font-mono">encyclopedia_refs</code>) — بدون مطابقة نصية.
            </p>
            <Link to="/admin/campaign-relationships" className="inline-block rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700">
              فتح باني علاقات الحملات
            </Link>
          </Section>


          <Section title={`٣. توليد خريطة فتح المتحف (${snap.museum.obtainable.length} قابل + ${snap.museum.encyclopediaOnly.length} موسوعة فقط)`}>
            <p className="mb-2 text-xs text-muted-foreground">
              لكل تحفة في الموسوعة هوية متحف ثابتة. المفتوحة بحملة تُوسم قابلة للحصول مع مصادر الفتح؛ غير ذلك يُوسم موسوعة فقط.
            </p>
            <button
              disabled={(snap.museum.obtainable.length + snap.museum.encyclopediaOnly.length) === 0 || !!busy}
              onClick={() =>
                setPreview({
                  title: "تحديث خريطة المتحف",
                  lines: [
                    ...snap.museum.obtainable.map(
                      (o) => `obtainable artifact:${o.e.slug} ← [${o.sourceCampaigns.join(", ")}]`,
                    ),
                    ...snap.museum.encyclopediaOnly.map((e) => `encyclopedia_only artifact:${e.slug}`),
                  ],
                  onConfirm: async () => {
                    await applyMuseum(snap.museum);
                    setLastReport((prev) => ({
                      fixedUnlocks: prev?.fixedUnlocks ?? 0,
                      linkedCampaigns: prev?.linkedCampaigns ?? 0,
                      museumObtainable: snap.museum.obtainable.length,
                      museumEncOnly: snap.museum.encyclopediaOnly.length,
                      remainingManual: prev?.remainingManual ?? remainingManual,
                    }));
                  },
                })
              }
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              معاينة تحديث المتحف
            </button>
          </Section>

          <Section title="٤. تنفيذ كل الإصلاحات الآلية">
            <p className="mb-2 text-xs text-muted-foreground">
              يطبّق إصلاح المكافآت وخريطة المتحف ضمن معاينة واحدة. لا عمليات حذف. (ربط الكيانات أصبح في أداة مستقلة.)
            </p>
            <button
              disabled={!!busy}
              onClick={() =>
                setPreview({
                  title: "إصلاح ذاتي شامل",
                  lines: [
                    `مكافآت سيتم إصلاحها: ${snap.unlockFixes.length}`,
                    `تحف ستصبح قابلة للحصول: ${snap.museum.obtainable.length}`,
                    `تحف ستوسم كموسوعة فقط: ${snap.museum.encyclopediaOnly.length}`,
                    `يتبقى للمراجعة اليدوية: ${remainingManual}`,
                  ],
                  onConfirm: async () => {
                    await applyUnlockFixes(snap.unlockFixes, snap.campaigns);
                    await applyMuseum(snap.museum);
                    setLastReport({
                      fixedUnlocks: snap.unlockFixes.length,
                      linkedCampaigns: 0,
                      museumObtainable: snap.museum.obtainable.length,
                      museumEncOnly: snap.museum.encyclopediaOnly.length,
                      remainingManual: snap.missing.length - snap.unlockFixes.length,
                    });
                  },
                })
              }
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              معاينة الإصلاح الذاتي الشامل
            </button>
          </Section>

        </>
      )}
    </div>
  );
}
