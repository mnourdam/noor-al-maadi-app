import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/content-integrity")({
  head: () => ({
    meta: [
      { title: "سلامة المحتوى — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <ContentIntegrity />
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
type AtlasEntity = {
  id: string;
  slug: string;
  kind: string;
  encyclopedia_entity_id: string | null;
  status: string;
};
type Campaign = { id: string; slug: string; title: string; status: string; data: any };

type UnlockRef = {
  campaign: string;
  chapter: string;
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
    for (const ch of chapters) {
      const unlocks: string[] = Array.isArray(ch?.rewards?.unlocks)
        ? ch.rewards.unlocks
        : [];
      for (const raw of unlocks) {
        const [type, ...rest] = String(raw).split(":");
        out.push({
          campaign: c.slug,
          chapter: ch.id ?? "?",
          raw: String(raw),
          type: type ?? "",
          slug: rest.join(":"),
        });
      }
    }
  }
  return out;
}

type Report = {
  encyclopedia: EncEntity[];
  atlas: AtlasEntity[];
  campaigns: Campaign[];
  unlocks: UnlockRef[];
  enc_by_key: Map<string, EncEntity>; // "type:slug" -> entity
  enc_by_id: Map<string, EncEntity>;
  // Section 1
  unlocks_total: number;
  unlocks_missing: UnlockRef[];
  unlocks_broken: UnlockRef[]; // bad format
  // Section 2
  museum_total: number;
  museum_unlocked_via_campaign: number;
  museum_orphan: EncEntity[]; // artifacts not in any unlock
  rewards_missing_artifact: UnlockRef[]; // artifact unlocks pointing to nothing
  // Section 3
  enc_reachable_campaign: Set<string>;
  enc_reachable_atlas: Set<string>;
  enc_orphan: EncEntity[];
  // Section 4 = museum
  // Section 5
  atlas_without_enc: AtlasEntity[];
  enc_without_atlas_expected: EncEntity[]; // city/landmark/battle without atlas link
  // Section 6
  score_campaign: number;
  score_encyclopedia: number;
  score_museum: number;
  score_overall: number;
};

const ATLAS_EXPECTED_TYPES = new Set(["city", "landmark", "battle"]);

async function buildReport(): Promise<Report> {
  const [encyclopedia, atlas, campaigns] = await Promise.all([
    fetchAll<EncEntity>("encyclopedia_entities", "id,entity_type,slug,title,enabled,metadata"),
    fetchAll<AtlasEntity>("atlas_entities", "id,slug,kind,encyclopedia_entity_id,status"),
    fetchAll<Campaign>("admin_campaigns", "id,slug,title,status,data"),
  ]);

  const enc_by_key = new Map<string, EncEntity>();
  const enc_by_id = new Map<string, EncEntity>();
  for (const e of encyclopedia) {
    enc_by_key.set(`${e.entity_type}:${e.slug}`, e);
    enc_by_id.set(e.id, e);
  }

  const unlocks = parseUnlocks(campaigns);
  const unlocks_broken = unlocks.filter((u) => !u.type || !u.slug);
  const unlocks_missing = unlocks.filter(
    (u) => u.type && u.slug && !enc_by_key.has(`${u.type}:${u.slug}`),
  );

  const enc_reachable_campaign = new Set<string>();
  for (const u of unlocks) {
    const hit = enc_by_key.get(`${u.type}:${u.slug}`);
    if (hit) enc_reachable_campaign.add(hit.id);
  }

  const enc_reachable_atlas = new Set<string>();
  for (const a of atlas) {
    if (a.encyclopedia_entity_id) enc_reachable_atlas.add(a.encyclopedia_entity_id);
  }

  const enc_orphan = encyclopedia.filter(
    (e) => !enc_reachable_campaign.has(e.id) && !enc_reachable_atlas.has(e.id),
  );

  // Museum = artifact entities
  const artifacts = encyclopedia.filter((e) => e.entity_type === "artifact");
  const unlocked_artifact_ids = new Set<string>();
  const rewards_missing_artifact: UnlockRef[] = [];
  for (const u of unlocks) {
    if (u.type !== "artifact") continue;
    const hit = enc_by_key.get(`artifact:${u.slug}`);
    if (hit) unlocked_artifact_ids.add(hit.id);
    else rewards_missing_artifact.push(u);
  }
  const museum_orphan = artifacts.filter((a) => !unlocked_artifact_ids.has(a.id));

  // Atlas reachability
  const atlas_without_enc = atlas.filter((a) => !a.encyclopedia_entity_id);
  const enc_with_atlas = new Set(enc_reachable_atlas);
  const enc_without_atlas_expected = encyclopedia.filter(
    (e) => ATLAS_EXPECTED_TYPES.has(e.entity_type) && !enc_with_atlas.has(e.id),
  );

  // Scores
  const pct = (ok: number, total: number) =>
    total === 0 ? 100 : Math.round((ok / total) * 1000) / 10;

  const score_campaign = pct(
    unlocks.length - unlocks_missing.length - unlocks_broken.length,
    Math.max(unlocks.length, 1),
  );
  const score_encyclopedia = pct(
    encyclopedia.length - enc_orphan.length,
    Math.max(encyclopedia.length, 1),
  );
  const score_museum = pct(
    artifacts.length - museum_orphan.length,
    Math.max(artifacts.length, 1),
  );
  const score_overall =
    Math.round(((score_campaign + score_encyclopedia + score_museum) / 3) * 10) / 10;

  return {
    encyclopedia,
    atlas,
    campaigns,
    unlocks,
    enc_by_key,
    enc_by_id,
    unlocks_total: unlocks.length,
    unlocks_missing,
    unlocks_broken,
    museum_total: artifacts.length,
    museum_unlocked_via_campaign: unlocked_artifact_ids.size,
    museum_orphan,
    rewards_missing_artifact,
    enc_reachable_campaign,
    enc_reachable_atlas,
    enc_orphan,
    atlas_without_enc,
    enc_without_atlas_expected,
    score_campaign,
    score_encyclopedia,
    score_museum,
    score_overall,
  };
}

function Stat({ label, value, tone = "default" }: { label: string; value: any; tone?: "default" | "good" | "warn" | "bad" }) {
  const color =
    tone === "good"
      ? "text-green-700"
      : tone === "warn"
      ? "text-amber-700"
      : tone === "bad"
      ? "text-red-700"
      : "text-slate-900";
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

function List({ items, render, empty = "—", max = 50 }: { items: any[]; render: (x: any, i: number) => React.ReactNode; empty?: string; max?: number }) {
  if (!items.length) return <div className="text-sm text-muted-foreground">{empty}</div>;
  return (
    <ul className="divide-y rounded-md border text-sm">
      {items.slice(0, max).map((x, i) => (
        <li key={i} className="px-3 py-2">{render(x, i)}</li>
      ))}
      {items.length > max && (
        <li className="px-3 py-2 text-xs text-muted-foreground">
          +{items.length - max} عنصر إضافي…
        </li>
      )}
    </ul>
  );
}

function ContentIntegrity() {
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const toneFor = (s: number): "good" | "warn" | "bad" =>
    s >= 95 ? "good" : s >= 80 ? "warn" : "bad";

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">سلامة المحتوى</h1>
          <p className="text-sm text-muted-foreground">
            تحقق من ترابط الحملات والموسوعة والأطلس والمتحف.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          {loading ? "جارٍ التحليل…" : "إعادة التحليل"}
        </button>
      </header>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {!r ? (
        <div className="text-sm text-muted-foreground">جارٍ تحميل البيانات…</div>
      ) : (
        <>
          {/* Section 6: scores first */}
          <Section title="6. نقاط السلامة">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="سلامة الحملات" value={`${r.score_campaign}%`} tone={toneFor(r.score_campaign)} />
              <Stat label="سلامة الموسوعة" value={`${r.score_encyclopedia}%`} tone={toneFor(r.score_encyclopedia)} />
              <Stat label="سلامة المتحف" value={`${r.score_museum}%`} tone={toneFor(r.score_museum)} />
              <Stat label="السلامة الإجمالية" value={`${r.score_overall}%`} tone={toneFor(r.score_overall)} />
            </div>
          </Section>

          <Section title="1. الحملة ← الموسوعة">
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="إجمالي مراجع الفتح" value={r.unlocks_total} />
              <Stat label="مراجع مفقودة" value={r.unlocks_missing.length} tone={r.unlocks_missing.length ? "bad" : "good"} />
              <Stat label="معرّفات مكسورة" value={r.unlocks_broken.length} tone={r.unlocks_broken.length ? "bad" : "good"} />
              <Stat label="حملات مفهرسة" value={r.campaigns.length} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">مراجع مفقودة</div>
                <List
                  items={r.unlocks_missing}
                  empty="لا يوجد"
                  render={(u: UnlockRef) => (
                    <div className="flex items-center justify-between gap-3">
                      <code className="font-mono text-xs">{u.raw}</code>
                      <span className="text-xs text-muted-foreground">{u.campaign} / {u.chapter}</span>
                    </div>
                  )}
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">معرّفات مكسورة</div>
                <List
                  items={r.unlocks_broken}
                  empty="لا يوجد"
                  render={(u: UnlockRef) => (
                    <div className="flex items-center justify-between gap-3">
                      <code className="font-mono text-xs">{u.raw || "(فارغ)"}</code>
                      <span className="text-xs text-muted-foreground">{u.campaign} / {u.chapter}</span>
                    </div>
                  )}
                />
              </div>
            </div>
          </Section>

          <Section title="2. الحملة ← المتحف">
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="إجمالي تحف المتحف" value={r.museum_total} />
              <Stat label="مفتوحة عبر الحملات" value={r.museum_unlocked_via_campaign} />
              <Stat label="مكافآت تحف مفقودة" value={r.rewards_missing_artifact.length} tone={r.rewards_missing_artifact.length ? "bad" : "good"} />
              <Stat label="تحف بلا مصدر فتح" value={r.museum_orphan.length} tone={r.museum_orphan.length ? "warn" : "good"} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">مكافآت تحف لا تطابق موسوعة</div>
                <List
                  items={r.rewards_missing_artifact}
                  empty="لا يوجد"
                  render={(u: UnlockRef) => (
                    <div className="flex items-center justify-between gap-3">
                      <code className="font-mono text-xs">{u.raw}</code>
                      <span className="text-xs text-muted-foreground">{u.campaign} / {u.chapter}</span>
                    </div>
                  )}
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">تحف بلا مصدر فتح</div>
                <List
                  items={r.museum_orphan}
                  empty="لا يوجد"
                  render={(e: EncEntity) => (
                    <div className="flex items-center justify-between gap-3">
                      <span>{e.title ?? e.slug}</span>
                      <code className="font-mono text-xs text-muted-foreground">{e.slug}</code>
                    </div>
                  )}
                />
              </div>
            </div>
          </Section>

          <Section title="3. وصول الموسوعة">
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="إجمالي الموسوعة" value={r.encyclopedia.length} />
              <Stat label="موصولة بحملة" value={r.enc_reachable_campaign.size} />
              <Stat label="موصولة بالأطلس" value={r.enc_reachable_atlas.size} />
              <Stat label="يتيمة (لا حملة ولا أطلس)" value={r.enc_orphan.length} tone={r.enc_orphan.length ? "warn" : "good"} />
            </div>
            <List
              items={r.enc_orphan}
              empty="لا يوجد"
              render={(e: EncEntity) => (
                <div className="flex items-center justify-between gap-3">
                  <span>{e.title ?? e.slug}</span>
                  <span className="text-xs text-muted-foreground">{e.entity_type} · {e.slug}</span>
                </div>
              )}
            />
          </Section>

          <Section title="4. وصول المتحف">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="قابلة للحصول" value={r.museum_unlocked_via_campaign} tone="good" />
              <Stat label="غير قابلة للحصول" value={r.museum_total - r.museum_unlocked_via_campaign} tone={r.museum_total - r.museum_unlocked_via_campaign ? "warn" : "good"} />
              <Stat label="تحف يتيمة" value={r.museum_orphan.length} tone={r.museum_orphan.length ? "warn" : "good"} />
            </div>
          </Section>

          <Section title="5. وصول الأطلس">
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="إجمالي كيانات الأطلس" value={r.atlas.length} />
              <Stat label="أطلس بلا موسوعة" value={r.atlas_without_enc.length} tone={r.atlas_without_enc.length ? "warn" : "good"} />
              <Stat label="موسوعة (مدن/معالم/معارك) بلا أطلس" value={r.enc_without_atlas_expected.length} tone={r.enc_without_atlas_expected.length ? "warn" : "good"} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">أطلس بلا موسوعة</div>
                <List
                  items={r.atlas_without_enc}
                  empty="لا يوجد"
                  render={(a: AtlasEntity) => (
                    <div className="flex items-center justify-between gap-3">
                      <code className="font-mono text-xs">{a.slug}</code>
                      <span className="text-xs text-muted-foreground">{a.kind} · {a.status}</span>
                    </div>
                  )}
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">موسوعة بلا أطلس (متوقعة)</div>
                <List
                  items={r.enc_without_atlas_expected}
                  empty="لا يوجد"
                  render={(e: EncEntity) => (
                    <div className="flex items-center justify-between gap-3">
                      <span>{e.title ?? e.slug}</span>
                      <span className="text-xs text-muted-foreground">{e.entity_type} · {e.slug}</span>
                    </div>
                  )}
                />
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
