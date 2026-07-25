import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { selectCampaignRows } from "@/lib/campaigns/entities";

export const Route = createFileRoute("/admin/content-integrity-repair")({
  head: () => ({
    meta: [
      { title: "إصلاح سلامة المحتوى — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <ContentIntegrityRepair />
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
};
type AtlasEntity = { id: string; slug: string; kind: string; encyclopedia_entity_id: string | null };
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

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function scoreMatches(u: UnlockRef, enc: EncEntity[]): { e: EncEntity; s: number }[] {
  const target = norm(u.slug);
  const sameType = enc.filter((e) => !u.type || e.entity_type === u.type);
  const scored: { e: EncEntity; s: number }[] = [];
  for (const e of sameType) {
    let s = 0;
    const slugN = norm(e.slug);
    const titleN = norm(e.title);
    const legacy = norm(e.metadata?.legacy_id);
    const aliases: string[] = Array.isArray(e.metadata?.aliases) ? e.metadata.aliases : [];
    if (slugN === target) s += 100;
    else if (slugN.includes(target) || target.includes(slugN)) s += 40;
    if (titleN === target) s += 80;
    else if (titleN.includes(target) || target.includes(titleN)) s += 25;
    if (legacy && legacy === target) s += 90;
    for (const a of aliases) if (norm(a) === target) s += 70;
    if (s > 0) scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored;
}

function suggestMatches(u: UnlockRef, enc: EncEntity[]): EncEntity[] {
  return scoreMatches(u, enc).slice(0, 5).map((x) => x.e);
}

const AUTO_FIX_THRESHOLD = 85;

type AutoFixPlan = { u: UnlockRef; match: EncEntity; score: number; newVal: string };

function planAutoFixes(missing: UnlockRef[], enc: EncEntity[]): AutoFixPlan[] {
  const out: AutoFixPlan[] = [];
  for (const u of missing) {
    const scored = scoreMatches(u, enc);
    const top = scored[0];
    const second = scored[1];
    if (!top || top.s < AUTO_FIX_THRESHOLD) continue;
    // Require a clear winner (avoid ambiguous ties)
    if (second && top.s - second.s < 10) continue;
    out.push({ u, match: top.e, score: top.s, newVal: `${top.e.entity_type}:${top.e.slug}` });
  }
  return out;
}

async function applyBulkUnlockFixes(plans: AutoFixPlan[], campaigns: Campaign[]) {
  // Group by campaign to avoid clobbering when multiple unlocks change in same row.
  const byCampaign = new Map<string, AutoFixPlan[]>();
  for (const p of plans) {
    const arr = byCampaign.get(p.u.campaignId) ?? [];
    arr.push(p);
    byCampaign.set(p.u.campaignId, arr);
  }
  for (const [campaignId, items] of byCampaign) {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) continue;
    const data = JSON.parse(JSON.stringify(campaign.data ?? {}));
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    for (const p of items) {
      const ch = chapters[p.u.chapterIndex];
      if (!ch?.rewards?.unlocks) continue;
      ch.rewards.unlocks[p.u.unlockIndex] = p.newVal;
    }
    const { error } = await supabase.from("admin_campaigns").update({ data }).eq("id", campaignId);
    if (error) throw error;
  }
}

type Report = {
  encyclopedia: EncEntity[];
  atlas: AtlasEntity[];
  campaigns: Campaign[];
  unlocks: UnlockRef[];
  encByKey: Map<string, EncEntity>;
  unlocks_missing: UnlockRef[];
  artifacts: EncEntity[];
  museum_orphan: EncEntity[];
  enc_reachable_campaign: Set<string>;
  enc_reachable_atlas: Set<string>;
  enc_orphan: EncEntity[];
};

const ATLAS_TYPES = new Set(["city", "landmark", "battle"]);

async function buildReport(): Promise<Report> {
  const [encyclopedia, atlas, campaigns] = await Promise.all([
    fetchAll<EncEntity>("encyclopedia_entities", "id,entity_type,slug,title,enabled,metadata"),
    fetchAll<AtlasEntity>("atlas_entities", "id,slug,kind,encyclopedia_entity_id"),
    fetchAll<Campaign>("admin_campaigns", "id,slug,title,status,data").then(selectCampaignRows),
  ]);
  const encByKey = new Map<string, EncEntity>();
  for (const e of encyclopedia) encByKey.set(`${e.entity_type}:${e.slug}`, e);

  const unlocks = parseUnlocks(campaigns);
  const unlocks_missing = unlocks.filter(
    (u) => u.type && u.slug && !encByKey.has(`${u.type}:${u.slug}`),
  );

  const enc_reachable_campaign = new Set<string>();
  for (const u of unlocks) {
    const h = encByKey.get(`${u.type}:${u.slug}`);
    if (h) enc_reachable_campaign.add(h.id);
  }
  const enc_reachable_atlas = new Set<string>();
  for (const a of atlas) if (a.encyclopedia_entity_id) enc_reachable_atlas.add(a.encyclopedia_entity_id);

  const enc_orphan = encyclopedia.filter(
    (e) => !enc_reachable_campaign.has(e.id) && !enc_reachable_atlas.has(e.id),
  );

  const artifacts = encyclopedia.filter((e) => e.entity_type === "artifact");
  const unlockedArtifactIds = new Set<string>();
  for (const u of unlocks) {
    if (u.type !== "artifact") continue;
    const h = encByKey.get(`artifact:${u.slug}`);
    if (h) unlockedArtifactIds.add(h.id);
  }
  const museum_orphan = artifacts.filter((a) => !unlockedArtifactIds.has(a.id));

  return {
    encyclopedia,
    atlas,
    campaigns,
    unlocks,
    encByKey,
    unlocks_missing,
    artifacts,
    museum_orphan,
    enc_reachable_campaign,
    enc_reachable_atlas,
    enc_orphan,
  };
}

async function saveCampaignUnlock(campaign: Campaign, chapterIndex: number, unlockIndex: number, newValue: string | null) {
  const data = JSON.parse(JSON.stringify(campaign.data ?? {}));
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  const ch = chapters[chapterIndex];
  if (!ch?.rewards?.unlocks) throw new Error("chapter unlock not found");
  if (newValue === null) ch.rewards.unlocks.splice(unlockIndex, 1);
  else ch.rewards.unlocks[unlockIndex] = newValue;
  const { error } = await supabase
    .from("admin_campaigns")
    .update({ data })
    .eq("id", campaign.id);
  if (error) throw error;
}

async function addUnlockToCampaign(campaign: Campaign, chapterIndex: number, value: string) {
  const data = JSON.parse(JSON.stringify(campaign.data ?? {}));
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  const ch = chapters[chapterIndex];
  if (!ch) throw new Error("chapter not found");
  ch.rewards = ch.rewards ?? {};
  ch.rewards.unlocks = Array.isArray(ch.rewards.unlocks) ? ch.rewards.unlocks : [];
  if (!ch.rewards.unlocks.includes(value)) ch.rewards.unlocks.push(value);
  const { error } = await supabase.from("admin_campaigns").update({ data }).eq("id", campaign.id);
  if (error) throw error;
}

async function tagDiscoverable(ids: string[]) {
  for (const id of ids) {
    const { data, error: e1 } = await supabase
      .from("encyclopedia_entities")
      .select("metadata")
      .eq("id", id)
      .maybeSingle();
    if (e1) throw e1;
    const md = { ...((data?.metadata as any) ?? {}), discoverable_in_encyclopedia: true };
    const { error } = await supabase.from("encyclopedia_entities").update({ metadata: md }).eq("id", id);
    if (error) throw error;
  }
}

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

function ContentIntegrityRepair() {
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; lines: string[]; onConfirm: () => Promise<void> } | null>(null);
  const [bulkResult, setBulkResult] = useState<{ applied: number; remaining: number } | null>(null);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      setR(await buildReport());
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    run();
  }, []);

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

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إصلاح سلامة المحتوى</h1>
          <p className="text-sm text-muted-foreground">
            أدوات إصلاح مراجع الحملات، التحف اليتيمة، والكيانات غير الموصولة.
            <Link to="/admin/content-integrity" className="mx-2 underline">عرض التقرير</Link>
          </p>
        </div>
        <button onClick={run} disabled={loading} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
          {loading ? "جارٍ التحليل…" : "إعادة التحليل"}
        </button>
      </header>

      {err && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

      {preview && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 font-bold">معاينة الإصلاح — {preview.title}</div>
          <ul className="mb-3 list-disc space-y-1 pr-5 text-sm">
            {preview.lines.map((l, i) => (
              <li key={i}><code className="font-mono text-xs">{l}</code></li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={confirmPreview} disabled={!!busy} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? "جارٍ التطبيق…" : "تأكيد التطبيق"}
            </button>
            <button onClick={() => setPreview(null)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {!r ? (
        <div className="text-sm text-muted-foreground">جارٍ تحميل البيانات…</div>
      ) : (
        <>
          <Section title="نظرة عامة">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="مراجع حملات مكسورة" value={r.unlocks_missing.length} tone={r.unlocks_missing.length ? "bad" : "good"} />
              <Stat label="تحف بلا مصدر فتح" value={r.museum_orphan.length} tone={r.museum_orphan.length ? "warn" : "good"} />
              <Stat label="كيانات يتيمة" value={r.enc_orphan.length} tone={r.enc_orphan.length ? "warn" : "good"} />
              <Stat label="إجمالي الموسوعة" value={r.encyclopedia.length} />
            </div>
          </Section>

          <Section title="١. إصلاح مكافآت الحملات">
            {(() => {
              const plans = planAutoFixes(r.unlocks_missing, r.encyclopedia);
              return (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
                  <span className="font-medium">إصلاح تلقائي آمن:</span>
                  <span className="text-muted-foreground">
                    {plans.length} مرشّح بثقة ≥ {AUTO_FIX_THRESHOLD} من أصل {r.unlocks_missing.length} مكسور.
                    {r.unlocks_missing.length - plans.length > 0 && (
                      <> ({r.unlocks_missing.length - plans.length} يحتاج مراجعة يدوية)</>
                    )}
                  </span>
                  <button
                    disabled={plans.length === 0 || !!busy}
                    onClick={() =>
                      setPreview({
                        title: `إصلاح تلقائي لـ ${plans.length} مرجع`,
                        lines: plans
                          .slice(0, 200)
                          .map(
                            (p) =>
                              `[${p.score}] ${p.u.campaignSlug}/${p.u.chapterId}: ${p.u.raw}  →  ${p.newVal}`,
                          )
                          .concat(plans.length > 200 ? [`… +${plans.length - 200} أخرى`] : []),
                        onConfirm: async () => {
                          await applyBulkUnlockFixes(plans, r.campaigns);
                          const fresh = await buildReport();
                          setR(fresh);
                          setBulkResult({ applied: plans.length, remaining: fresh.unlocks_missing.length });
                        },
                      })
                    }
                    className="rounded border bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    معاينة الإصلاح التلقائي
                  </button>
                  {bulkResult && (
                    <span className="text-xs text-emerald-700">
                      تم تطبيق {bulkResult.applied}؛ المتبقي: {bulkResult.remaining}
                    </span>
                  )}
                </div>
              );
            })()}
            {r.unlocks_missing.length === 0 ? (
              <div className="text-sm text-muted-foreground">لا توجد مراجع مكسورة.</div>
            ) : (
              <div className="space-y-3">

                {r.unlocks_missing.slice(0, 50).map((u, i) => {
                  const matches = suggestMatches(u, r.encyclopedia);
                  const campaign = r.campaigns.find((c) => c.id === u.campaignId)!;
                  return (
                    <div key={i} className="rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <code className="font-mono text-xs">{u.raw}</code>
                        <span className="text-xs text-muted-foreground">{u.campaignSlug} / {u.chapterId}</span>
                      </div>
                      {matches.length === 0 ? (
                        <div className="text-xs text-muted-foreground">لا توجد اقتراحات مطابقة.</div>
                      ) : (
                        <ul className="space-y-1">
                          {matches.map((m) => {
                            const newVal = `${m.entity_type}:${m.slug}`;
                            return (
                              <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                                <span>{m.title ?? m.slug} <span className="text-xs text-muted-foreground">({newVal})</span></span>
                                <button
                                  className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
                                  onClick={() =>
                                    setPreview({
                                      title: "ربط مكافأة حملة",
                                      lines: [
                                        `${u.campaignSlug} / ${u.chapterId}: ${u.raw}  →  ${newVal}`,
                                      ],
                                      onConfirm: () => saveCampaignUnlock(campaign, u.chapterIndex, u.unlockIndex, newVal),
                                    })
                                  }
                                >
                                  ربط
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
                          onClick={() =>
                            setPreview({
                              title: "حذف مرجع المكافأة",
                              lines: [`إزالة ${u.raw} من ${u.campaignSlug}/${u.chapterId}`],
                              onConfirm: () => saveCampaignUnlock(campaign, u.chapterIndex, u.unlockIndex, null),
                            })
                          }
                        >
                          إزالة المرجع
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="٢. إصلاح قابلية الحصول على تحف المتحف">
            {r.museum_orphan.length === 0 ? (
              <div className="text-sm text-muted-foreground">لا توجد تحف يتيمة.</div>
            ) : (
              <div className="space-y-3">
                {r.museum_orphan.slice(0, 50).map((art) => (
                  <ArtifactRepair
                    key={art.id}
                    art={art}
                    campaigns={r.campaigns}
                    onAssign={(c, chapterIndex) =>
                      setPreview({
                        title: "إسناد تحفة لمكافأة فصل",
                        lines: [`إضافة artifact:${art.slug} إلى ${c.slug}/${c.data?.chapters?.[chapterIndex]?.id ?? `#${chapterIndex}`}`],
                        onConfirm: () => addUnlockToCampaign(c, chapterIndex, `artifact:${art.slug}`),
                      })
                    }
                    onEncyclopediaOnly={() =>
                      setPreview({
                        title: "وسم كموسوعة فقط",
                        lines: [`${art.slug}: metadata.museum_only = false, encyclopedia_only = true`],
                        onConfirm: async () => {
                          const md = { ...(art.metadata ?? {}), encyclopedia_only: true };
                          const { error } = await supabase
                            .from("encyclopedia_entities")
                            .update({ metadata: md })
                            .eq("id", art.id);
                          if (error) throw error;
                        },
                      })
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="٣. إصلاح الكيانات الموسوعية اليتيمة">
            <OrphanRepair
              orphans={r.enc_orphan}
              atlasIds={r.enc_reachable_atlas}
              campaignIds={r.enc_reachable_campaign}
              campaigns={r.campaigns}
              onBulkTag={(ids) =>
                setPreview({
                  title: "وسم كيانات كقابلة للاكتشاف",
                  lines: [`تحديث ${ids.length} كيان: metadata.discoverable_in_encyclopedia = true`],
                  onConfirm: () => tagDiscoverable(ids),
                })
              }
              onLinkToCampaign={(ent, c, chapterIndex) =>
                setPreview({
                  title: "ربط بحملة",
                  lines: [`إضافة ${ent.entity_type}:${ent.slug} إلى ${c.slug}/${c.data?.chapters?.[chapterIndex]?.id ?? `#${chapterIndex}`}`],
                  onConfirm: () => addUnlockToCampaign(c, chapterIndex, `${ent.entity_type}:${ent.slug}`),
                })
              }
            />
          </Section>
        </>
      )}
    </div>
  );
}

function ArtifactRepair({
  art,
  campaigns,
  onAssign,
  onEncyclopediaOnly,
}: {
  art: EncEntity;
  campaigns: Campaign[];
  onAssign: (c: Campaign, chapterIndex: number) => void;
  onEncyclopediaOnly: () => void;
}) {
  const [cid, setCid] = useState<string>("");
  const [chIdx, setChIdx] = useState<number>(0);
  const chapters: any[] = useMemo(() => {
    const c = campaigns.find((x) => x.id === cid);
    return Array.isArray(c?.data?.chapters) ? c!.data.chapters : [];
  }, [cid, campaigns]);

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium">{art.title ?? art.slug}</span>
        <code className="font-mono text-xs text-muted-foreground">artifact:{art.slug}</code>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={cid} onChange={(e) => { setCid(e.target.value); setChIdx(0); }} className="rounded border px-2 py-1 text-xs">
          <option value="">— اختر حملة —</option>
          {campaigns.map((c) => (<option key={c.id} value={c.id}>{c.title || c.slug}</option>))}
        </select>
        <select value={chIdx} onChange={(e) => setChIdx(Number(e.target.value))} className="rounded border px-2 py-1 text-xs" disabled={!cid}>
          {chapters.map((ch, i) => (<option key={i} value={i}>{ch.id ?? ch.title ?? `#${i}`}</option>))}
        </select>
        <button
          disabled={!cid}
          onClick={() => onAssign(campaigns.find((c) => c.id === cid)!, chIdx)}
          className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          إسناد كمكافأة
        </button>
        <button onClick={onEncyclopediaOnly} className="rounded border px-2 py-1 text-xs hover:bg-muted">
          موسوعة فقط
        </button>
      </div>
    </div>
  );
}

function OrphanRepair({
  orphans,
  atlasIds,
  campaignIds,
  campaigns,
  onBulkTag,
  onLinkToCampaign,
}: {
  orphans: EncEntity[];
  atlasIds: Set<string>;
  campaignIds: Set<string>;
  campaigns: Campaign[];
  onBulkTag: (ids: string[]) => void;
  onLinkToCampaign: (e: EncEntity, c: Campaign, chapterIndex: number) => void;
}) {
  const [filterType, setFilterType] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const classified = useMemo(() => {
    return orphans.map((e) => ({
      e,
      atlas: atlasIds.has(e.id),
      campaign: campaignIds.has(e.id),
      truly_orphan: !atlasIds.has(e.id) && !campaignIds.has(e.id),
    }));
  }, [orphans, atlasIds, campaignIds]);

  const types = useMemo(() => Array.from(new Set(orphans.map((e) => e.entity_type))).sort(), [orphans]);
  const filtered = classified.filter((x) => !filterType || x.e.entity_type === filterType);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded border px-2 py-1 text-xs">
          <option value="">كل الأنواع</option>
          {types.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} كيان</span>
        <button
          disabled={selected.size === 0}
          onClick={() => onBulkTag(Array.from(selected))}
          className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          وسم كقابل للاكتشاف ({selected.size})
        </button>
      </div>
      <div className="divide-y rounded-md border text-sm">
        {filtered.slice(0, 100).map((x) => (
          <OrphanRow
            key={x.e.id}
            row={x}
            checked={selected.has(x.e.id)}
            onToggle={() => toggle(x.e.id)}
            campaigns={campaigns}
            onLinkToCampaign={onLinkToCampaign}
          />
        ))}
        {filtered.length > 100 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">+{filtered.length - 100} كيان إضافي…</div>
        )}
      </div>
    </div>
  );
}

function OrphanRow({
  row,
  checked,
  onToggle,
  campaigns,
  onLinkToCampaign,
}: {
  row: { e: EncEntity; atlas: boolean; campaign: boolean; truly_orphan: boolean };
  checked: boolean;
  onToggle: () => void;
  campaigns: Campaign[];
  onLinkToCampaign: (e: EncEntity, c: Campaign, chapterIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cid, setCid] = useState("");
  const [chIdx, setChIdx] = useState(0);
  const chapters: any[] = useMemo(() => {
    const c = campaigns.find((x) => x.id === cid);
    return Array.isArray(c?.data?.chapters) ? c!.data.chapters : [];
  }, [cid, campaigns]);
  const era = row.e.metadata?.era ?? "—";

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={checked} onChange={onToggle} />
          <span>{row.e.title ?? row.e.slug}</span>
          <span className="text-xs text-muted-foreground">{row.e.entity_type} · {era}</span>
        </label>
        <div className="flex items-center gap-1 text-xs">
          {row.atlas && <span className="rounded bg-blue-100 px-1.5 py-0.5">أطلس</span>}
          {row.campaign && <span className="rounded bg-emerald-100 px-1.5 py-0.5">حملة</span>}
          {row.truly_orphan && <span className="rounded bg-red-100 px-1.5 py-0.5">يتيم تمامًا</span>}
          <button onClick={() => setOpen((o) => !o)} className="ml-2 rounded border px-2 py-0.5 hover:bg-muted">
            {open ? "إخفاء" : "ربط بحملة"}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={cid} onChange={(e) => { setCid(e.target.value); setChIdx(0); }} className="rounded border px-2 py-1 text-xs">
            <option value="">— حملة —</option>
            {campaigns.map((c) => (<option key={c.id} value={c.id}>{c.title || c.slug}</option>))}
          </select>
          <select value={chIdx} onChange={(e) => setChIdx(Number(e.target.value))} className="rounded border px-2 py-1 text-xs" disabled={!cid}>
            {chapters.map((ch, i) => (<option key={i} value={i}>{ch.id ?? ch.title ?? `#${i}`}</option>))}
          </select>
          <button
            disabled={!cid}
            onClick={() => onLinkToCampaign(row.e, campaigns.find((c) => c.id === cid)!, chIdx)}
            className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            إضافة كمكافأة
          </button>
        </div>
      )}
    </div>
  );
}
