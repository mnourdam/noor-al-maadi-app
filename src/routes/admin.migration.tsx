import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Database, Download, Upload, RefreshCw, CheckCircle2, AlertTriangle, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import { CHARACTERS, ARTIFACTS, BATTLE_PROFILES, MAP_REGIONS } from "@/lib/data";
import { CITIES } from "@/lib/cities";
import { CONTENT_PACKS } from "@/lib/packs/registry";
import type { PackEntity } from "@/lib/packs/types";

export const Route = createFileRoute("/admin/migration")({
  head: () => ({
    meta: [
      { title: "ترحيل المحتوى القديم — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AdminMigrationPage /></AdminGate>,
});

const ENTITY_TYPES = ["figure","city","battle","state","event","landmark","artifact"] as const;
type EntityType = typeof ENTITY_TYPES[number];

const TYPE_LABELS: Record<EntityType, string> = {
  figure: "شخصيات", city: "مدن", battle: "معارك", state: "دول",
  event: "أحداث", landmark: "معالم", artifact: "آثار",
};

interface MigrationRow {
  entity_type: EntityType;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  body: any;
  metadata: any;
  enabled: boolean;
  source: string;
}

function normalizeSlug(raw: string): string {
  // strip prefixes like "pack.figure." → "salahuddin"; lowercase; replace non-allowed with -
  const last = raw.split(".").pop() ?? raw;
  return last.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function fromCharacters(): MigrationRow[] {
  return CHARACTERS.map(c => ({
    entity_type: "figure" as EntityType,
    slug: normalizeSlug(c.id),
    title: c.name,
    subtitle: c.title || null,
    summary: c.bio || null,
    body: { power: c.power, avatar: c.avatar },
    metadata: { era: c.era, rarity: c.rarity, legacy_id: c.id },
    enabled: true,
    source: "data.ts:CHARACTERS",
  }));
}

function fromArtifacts(): MigrationRow[] {
  return ARTIFACTS.map(a => ({
    entity_type: "artifact" as EntityType,
    slug: normalizeSlug(a.id),
    title: a.name,
    subtitle: a.typeLabel || null,
    summary: a.description || null,
    body: { icon: a.icon },
    metadata: { era: a.era, type: a.type, legacy_id: a.id },
    enabled: true,
    source: "data.ts:ARTIFACTS",
  }));
}

function fromBattles(): MigrationRow[] {
  return Object.values(BATTLE_PROFILES).map(b => ({
    entity_type: "battle" as EntityType,
    slug: normalizeSlug(b.id),
    title: b.name,
    subtitle: b.subtitle || null,
    summary: b.overview?.[0] ?? null,
    body: {
      overview: b.overview, sides: b.sides, timeline: b.timeline,
      decisions: b.decisions, outcome: b.outcome, impact: b.impact,
    },
    metadata: {
      era: b.era, year: b.year, hijri: b.hijri, location: b.location,
      coords: b.coords, hero: b.hero, related: {
        characters: b.relatedCharacterIds, regions: b.relatedRegionIds, artifacts: b.relatedArtifactIds,
      }, legacy_id: b.id,
    },
    enabled: true,
    source: "data.ts:BATTLE_PROFILES",
  }));
}

function fromRegions(): MigrationRow[] {
  // MAP_REGIONS are state-like containers. Emit state + nested landmark rows.
  const rows: MigrationRow[] = [];
  for (const r of MAP_REGIONS) {
    rows.push({
      entity_type: "state",
      slug: normalizeSlug(r.id),
      title: r.name,
      subtitle: r.capital || null,
      summary: r.blurb || null,
      body: { theme: r.theme, glyph: r.glyph, polygon: r.polygon },
      metadata: {
        era: r.era, coords: { x: r.x, y: r.y }, label: { x: r.labelX, y: r.labelY },
        cost: r.cost, characters: r.characterIds, stories: r.storyIds,
        campaign_era: r.campaignEra, unlocks_artifact: r.unlocksArtifact, legacy_id: r.id,
      },
      enabled: true,
      source: "data.ts:MAP_REGIONS",
    });
    for (const lm of r.landmarks ?? []) {
      rows.push({
        entity_type: "landmark",
        slug: normalizeSlug(lm.id),
        title: lm.name,
        subtitle: r.name,
        summary: null,
        body: { icon: lm.icon, coords: { x: lm.x, y: lm.y } },
        metadata: { region_id: r.id, era: r.era, legacy_id: lm.id },
        enabled: true,
        source: "data.ts:MAP_REGIONS.landmarks",
      });
    }
  }
  return rows;
}

function fromCities(): MigrationRow[] {
  return CITIES.map(c => ({
    entity_type: "city" as EntityType,
    slug: normalizeSlug(c.id),
    title: c.name,
    subtitle: c.honorific || c.romanized || null,
    summary: c.tagline || null,
    body: {
      identity: c.identity, significance: c.significance,
      civilization: c.civilization, landmarks: c.landmarks, era_notes: c.eraNotes,
      fog_clue: c.fogClue,
    },
    metadata: {
      era: c.era, eras: c.eras, region_id: c.regionId, founded: c.founded,
      population: c.population, coords: c.coords, glyph: c.glyph, tone: c.toneClass,
      characters: c.characterIds, battles: c.battleIds, artifacts: c.artifactIds,
      stories: c.storyIds, campaign_eras: c.campaignEras, legacy_id: c.id,
    },
    enabled: true,
    source: "cities.ts:CITIES",
  }));
}

function fromPacks(): MigrationRow[] {
  const rows: MigrationRow[] = [];
  for (const pack of CONTENT_PACKS) {
    for (const e of pack.entities as PackEntity[]) {
      if (e.type === "achievement") continue;
      // skip placeholder locked future-campaign events
      if ((e.meta as any)?.kind === "campaign-placeholder") continue;
      rows.push({
        entity_type: e.type as EntityType,
        slug: normalizeSlug(e.id),
        title: e.title,
        subtitle: e.latin || null,
        summary: e.description || null,
        body: {
          unlockables: e.unlockables, image: e.image, meta: e.meta ?? {},
        },
        metadata: {
          pack_id: pack.id, era: pack.era, period: e.period,
          related: e.relatedEntities, rarity: e.rarity ?? "rare",
          timeline_position: e.timelinePosition, bridges: e.bridges ?? {},
          legacy_id: e.id,
        },
        enabled: true,
        source: `packs:${pack.id}`,
      });
    }
  }
  return rows;
}

function buildAll(): MigrationRow[] {
  const all = [
    ...fromCharacters(), ...fromArtifacts(), ...fromBattles(),
    ...fromRegions(), ...fromCities(), ...fromPacks(),
  ];
  // dedupe within batch by (type, slug) — first wins, keep order
  const seen = new Set<string>();
  const out: MigrationRow[] = [];
  for (const r of all) {
    if (!r.slug) continue;
    const k = `${r.entity_type}|${r.slug}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function AdminMigrationPage() {
  const candidates = useMemo(buildAll, []);
  const [existingKeys, setExistingKeys] = useState<Set<string> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; failed: number; errors: string[] } | null>(null);

  const refresh = async () => {
    setExistingKeys(null);
    const { data, error } = await supabase
      .from("encyclopedia_entities" as any)
      .select("entity_type, slug");
    if (error) { setErr(error.message); return; }
    setErr(null);
    setExistingKeys(new Set((data ?? []).map((r: any) => `${r.entity_type}|${r.slug}`)));
  };
  useEffect(() => { refresh(); }, []);

  const counts = useMemo(() => {
    const detected: Record<string, number> = { total: candidates.length };
    const migrated: Record<string, number> = { total: 0 };
    for (const t of ENTITY_TYPES) { detected[t] = 0; migrated[t] = 0; }
    for (const r of candidates) {
      detected[r.entity_type]++;
      if (existingKeys?.has(`${r.entity_type}|${r.slug}`)) {
        migrated[r.entity_type]++;
        migrated.total++;
      }
    }
    return { detected, migrated };
  }, [candidates, existingKeys]);

  const pending = useMemo(
    () => candidates.filter(r => !existingKeys?.has(`${r.entity_type}|${r.slug}`)),
    [candidates, existingKeys],
  );

  const downloadJson = (name: string, data: any) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const runMigration = async () => {
    if (!existingKeys) return;
    const targets = overwrite ? candidates : pending;
    if (targets.length === 0) { setResult({ inserted: 0, updated: 0, skipped: candidates.length, failed: 0, errors: [] }); return; }
    if (overwrite && !confirm(`الكتابة فوق ${candidates.length - pending.length} صفًا موجودًا؟ لا يمكن التراجع.`)) return;

    setBusy(true); setResult(null);
    let inserted = 0, updated = 0, failed = 0;
    const errors: string[] = [];

    const payloads = targets.map(r => ({
      entity_type: r.entity_type, slug: r.slug, title: r.title,
      subtitle: r.subtitle, summary: r.summary, body: r.body,
      metadata: r.metadata, enabled: r.enabled,
    }));

    for (let i = 0; i < payloads.length; i += 100) {
      const chunk = payloads.slice(i, i + 100);
      if (overwrite) {
        const { error, count } = await supabase
          .from("encyclopedia_entities" as any)
          .upsert(chunk as any, { onConflict: "entity_type,slug", count: "exact" });
        if (error) {
          for (const row of chunk) {
            const { error: e2 } = await supabase.from("encyclopedia_entities" as any)
              .upsert(row as any, { onConflict: "entity_type,slug" });
            if (e2) { failed++; errors.push(`${row.entity_type}/${row.slug}: ${e2.message}`); }
            else { updated++; }
          }
        } else { updated += count ?? chunk.length; }
      } else {
        const { error, count } = await supabase
          .from("encyclopedia_entities" as any)
          .insert(chunk as any, { count: "exact" });
        if (error) {
          for (const row of chunk) {
            const { error: e2 } = await supabase.from("encyclopedia_entities" as any).insert(row as any);
            if (e2) { failed++; errors.push(`${row.entity_type}/${row.slug}: ${e2.message}`); }
            else { inserted++; }
          }
        } else { inserted += count ?? chunk.length; }
      }
    }

    const skipped = overwrite ? 0 : (candidates.length - pending.length);
    setResult({ inserted, updated, skipped, failed, errors: errors.slice(0, 12) });
    setBusy(false);
    await refresh();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Database className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">ترحيل المحتوى القديم</h1>
              <p className="text-sm text-slate-400">نسخ المحتوى من data.ts / cities.ts / packs إلى encyclopedia_entities — بدون حذف</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/admin" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              ← لوحة الإدارة
            </Link>
            <button onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </button>
          </div>
        </header>

        {err && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            تعذّر القراءة من Supabase: {err}
          </div>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-amber-200">المُكتشف مقابل المُرحَّل</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="الإجمالي" detected={counts.detected.total} migrated={counts.migrated.total} />
            {ENTITY_TYPES.map(t => (
              <StatCard key={t} label={TYPE_LABELS[t]} detected={counts.detected[t]} migrated={counts.migrated[t]} />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setPreview(p => !p)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <Eye className="h-3.5 w-3.5" /> {preview ? "إخفاء المعاينة" : "معاينة الترحيل"}
            </button>
            <button onClick={() => downloadJson("encyclopedia-migration.json", candidates.map(({ source, ...r }) => r))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <Download className="h-3.5 w-3.5" /> تحميل JSON للموسوعة
            </button>
            <button
              disabled
              title="لا توجد مصادر حملات في الكود — admin_campaigns يُملأ عبر مركز الاستيراد."
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-500 opacity-60">
              <Download className="h-3.5 w-3.5" /> تحميل JSON للحملات (لا يوجد)
            </button>
            <label className="ms-auto flex items-center gap-1.5 text-xs text-slate-300">
              <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
              السماح بالكتابة فوق الموجود
            </label>
            <button onClick={runMigration} disabled={busy || !existingKeys}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
              <Upload className="h-4 w-4" /> {busy ? "جارٍ الترحيل…" : "ترحيل إلى Supabase"}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            بدون "الكتابة فوق": يُدرج فقط الصفوف الجديدة، ويتجاوز ما هو موجود مسبقًا حسب (entity_type + slug).
            <br />سيتم ترحيل <span className="text-amber-300">{pending.length}</span> صفًا جديدًا من أصل <span className="text-amber-300">{candidates.length}</span>.
          </p>
        </section>

        {preview && (
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <div className="bg-slate-900/80 px-3 py-2 text-xs text-slate-400">معاينة (أول 100 صف)</div>
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">العنوان</th>
                  <th className="px-3 py-2">slug</th>
                  <th className="px-3 py-2">المصدر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {candidates.slice(0, 100).map((r, i) => {
                  const exists = existingKeys?.has(`${r.entity_type}|${r.slug}`);
                  return (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                          exists ? "bg-slate-700/40 text-slate-300" : "bg-emerald-500/15 text-emerald-200"
                        }`}>{exists ? "موجود" : "جديد"}</span>
                      </td>
                      <td className="px-3 py-1.5 text-amber-300">{TYPE_LABELS[r.entity_type]}</td>
                      <td className="px-3 py-1.5">{r.title}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-400">{r.slug}</td>
                      <td className="px-3 py-1.5 text-[10px] text-slate-500">{r.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {candidates.length > 100 && (
              <div className="px-3 py-2 text-[10px] text-slate-500">… وُجد {candidates.length - 100} صفًا إضافيًا.</div>
            )}
          </section>
        )}

        {result && (
          <section className={`rounded-xl border p-4 ${
            result.failed === 0 ? "border-emerald-400/30 bg-emerald-500/10" : "border-amber-400/30 bg-amber-500/10"
          }`}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {result.failed === 0
                ? <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                : <AlertTriangle className="h-4 w-4 text-amber-300" />}
              نتيجة الترحيل
            </div>
            <ul className="text-xs text-slate-200">
              <li>تم الإدراج: <b>{result.inserted}</b></li>
              <li>تم التحديث (كتابة فوق): <b>{result.updated}</b></li>
              <li>تم التخطّي (موجود مسبقًا): <b>{result.skipped}</b></li>
              <li>فشل: <b>{result.failed}</b></li>
            </ul>
            {result.errors.length > 0 && (
              <div className="mt-2 text-[10px] text-red-200">
                <div className="font-semibold">عيّنة أخطاء:</div>
                <ul className="list-disc pr-5">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, detected, migrated }: { label: string; detected: number; migrated: number | null }) {
  const pct = detected > 0 && migrated !== null ? Math.round((migrated / detected) * 100) : 0;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-bold text-amber-200">{migrated ?? "…"}</span>
        <span className="text-xs text-slate-400">/ {detected}</span>
        {detected > 0 && migrated !== null && (
          <span className="ms-auto text-[10px] text-slate-500">{pct}%</span>
        )}
      </div>
    </div>
  );
}
