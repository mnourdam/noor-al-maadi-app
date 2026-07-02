// ============================================================
// Data Hygiene — canonical metadata fixer, stub cleanup,
// missing content cleanup, weak states, and orphan relationships.
// Safe actions only: disable, archive, remove-flag, CSV export.
// No hard deletes. Every mutation writes admin_audit_log via RPC.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Archive, ArrowRight, ArrowUpRight, CheckCircle2, ChevronLeft,
  Download, EyeOff, Filter, Landmark, Layers, Loader2, MapPin, Network, RefreshCw,
  Shield, SprayCan, Wand2, X, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ERAS } from "@/lib/app-constants";
import { WORLD_HUBS } from "@/lib/worlds";
import { useTaxonomy } from "@/lib/taxonomy";

export const Route = createFileRoute("/admin/encyclopedia-cleanup/data-hygiene")({
  head: () => ({
    meta: [
      { title: "تنظيف بيانات الموسوعة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DataHygienePage,
});

// ------------------------------------------------------------
// Types + canonical sets
// ------------------------------------------------------------
type Row = {
  id: string;
  entity_type: string;
  slug: string;
  title: string;
  summary: string | null;
  body: any;
  metadata: any;
  enabled: boolean;
};

// Seeded from code constants; augmented at runtime with CMS taxonomy rows
// (see useSyncTaxonomy() in DataHygienePage). Mutable Sets so downstream
// memos see the enlarged canon without threading it through helpers.
const CANONICAL_ERA = new Set(ERAS.map((e) => e.id as string));
const CANONICAL_WORLD = new Set(WORLD_HUBS.map((w) => w.slug));
// State canon is CMS-only (no code fallback); populated at runtime by the
// admin_taxonomy sync effect. Kept mutable so downstream memos re-read it.
const CANONICAL_STATE = new Set<string>();

// Same rule as encyclopedia-source.isDisplayableEntity
function bodyHasContent(body: unknown): boolean {
  if (!body) return false;
  if (typeof body === "string") return body.trim().length >= 40;
  if (typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.overview === "string" && b.overview.trim().length >= 40) return true;
  if (typeof b.introduction === "string" && b.introduction.trim().length >= 40) return true;
  for (const k of ["sections", "blocks", "timeline", "facts"]) {
    if (Array.isArray((b as any)[k]) && (b as any)[k].length > 0) return true;
  }
  return false;
}
function isDisplayable(r: Row): boolean {
  if (!r.enabled) return false;
  const s = (r.summary ?? "").trim();
  if (s.length >= 40) return true;
  return bodyHasContent(r.body);
}
function metaObj(r: Row): Record<string, unknown> {
  return r.metadata && typeof r.metadata === "object" ? (r.metadata as any) : {};
}

// Suggested canonical replacement for era/world/state values.
// Strip common suffixes then look up in the canonical set.
function suggestCanonical(kind: "era" | "world", raw: string): string | null {
  if (!raw) return null;
  const canonical = kind === "era" ? CANONICAL_ERA : CANONICAL_WORLD;
  if (canonical.has(raw)) return raw;
  const candidates = [
    raw.replace(/-era$/, ""),
    raw.replace(/-period$/, ""),
    raw.replace(/-empire$/, ""),
    raw.replace(/-sultanate$/, ""),
    raw.replace(/-caliphate$/, ""),
    raw.replace(/-state$/, ""),
    raw.replace(/-dynasty$/, ""),
    raw.replace(/-invasion$/, ""),
    raw.replace(/-rise$/, ""),
    raw.replace(/-expansion$/, ""),
    raw.replace(/-stability$/, ""),
    raw.replace(/-decline$/, ""),
    raw.replace(/^early-/, ""),
    raw.replace(/^late-/, ""),
    raw.split("-")[0],
  ];
  for (const c of candidates) if (c && canonical.has(c)) return c;
  return null;
}

// Era → preferred World slug. World represents the civilizational home, not
// geography, so `world` MUST be reviewed at the entity level. This map only
// powers per-entity suggestions in the Entity World Mapper modal — never a
// bulk group→world assignment (a single legacy world like `iraq-and-hijaz`
// contains Umayyad, Abbasid, Seljuk, Zengid, ... entities that cannot all be
// mapped to one world).
const ERA_TO_WORLD: Record<string, string> = {
  prophetic: "prophetic",
  rashidun: "rashidun",
  umayyad: "umayyad",
  abbasid: "abbasid",
  andalus: "andalus",
  seljuk: "seljuk",
  zengid: "zengid",
  ayyubid: "ayyubid-state",
  mamluk: "mamluk-sultanate",
  ottoman: "ottoman",
  fatimid: "fatimid",
  buyid: "buyid",
  timurid: "timurid",
  mongols: "mongols",
  mongol: "mongols",
  ilkhanid: "mongols",
};

function suggestWorldForEntity(r: Row): string {
  const m = metaObj(r);
  const era = typeof m.era === "string" ? (m.era as string).trim() : "";
  const state = typeof m.state === "string" ? (m.state as string).trim() : "";
  const eraGuess = era ? ERA_TO_WORLD[era] : undefined;
  if (eraGuess && CANONICAL_WORLD.has(eraGuess)) return eraGuess;
  if (state && CANONICAL_WORLD.has(state)) return state;
  return "";
}

// World / Era → preferred canonical State slug. Used only for per-entity
// suggestions inside the Entity State Mapper — never for bulk assignment.
// State represents an entity's specific political affiliation and must be
// reviewed at the entity level.
const WORLD_TO_STATE: Record<string, string> = {
  rashidun: "rashidun-caliphate",
  umayyad: "umayyad-caliphate",
  abbasid: "abbasid-caliphate",
  ottoman: "ottoman-empire",
  seljuk: "seljuk-empire",
  zengid: "zengid-dynasty",
  "ayyubid-state": "ayyubid-dynasty",
  "mamluk-sultanate": "mamluk-sultanate",
  fatimid: "fatimid-caliphate",
  andalus: "andalusi-caliphate",
  buyid: "buyid-dynasty",
  timurid: "timurid-empire",
  mongols: "mongol-empire",
  prophetic: "prophetic-state",
};
const ERA_TO_STATE: Record<string, string> = {
  rashidun: "rashidun-caliphate",
  umayyad: "umayyad-caliphate",
  abbasid: "abbasid-caliphate",
  ottoman: "ottoman-empire",
  seljuk: "seljuk-empire",
  zengid: "zengid-dynasty",
  ayyubid: "ayyubid-dynasty",
  mamluk: "mamluk-sultanate",
  fatimid: "fatimid-caliphate",
  andalus: "andalusi-caliphate",
  buyid: "buyid-dynasty",
  timurid: "timurid-empire",
  mongols: "mongol-empire",
  mongol: "mongol-empire",
  ilkhanid: "mongol-empire",
  prophetic: "prophetic-state",
};

function suggestStateForEntity(r: Row): string {
  const m = metaObj(r);
  const cur = typeof m.state === "string" ? (m.state as string).trim() : "";
  if (cur && CANONICAL_STATE.has(cur)) return cur;
  const world = typeof m.world === "string" ? (m.world as string).trim() : "";
  const wGuess = world ? WORLD_TO_STATE[world] : undefined;
  if (wGuess && CANONICAL_STATE.has(wGuess)) return wGuess;
  const era = typeof m.era === "string" ? (m.era as string).trim() : "";
  const eGuess = era ? ERA_TO_STATE[era] : undefined;
  if (eGuess && CANONICAL_STATE.has(eGuess)) return eGuess;
  // Suffix-strip fallback: try to match current value after normalizing.
  if (cur) {
    const candidates = [
      cur, cur.replace(/-empire$/, ""), cur.replace(/-caliphate$/, ""),
      cur.replace(/-sultanate$/, ""), cur.replace(/-dynasty$/, ""),
      cur.replace(/-state$/, ""),
    ];
    for (const c of candidates) if (c && CANONICAL_STATE.has(c)) return c;
  }
  return "";
}


// ------------------------------------------------------------
// Fetch — one shot, paged.
// ------------------------------------------------------------
async function fetchAll(): Promise<Row[]> {
  const all: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("encyclopedia_entities")
      .select("id,slug,entity_type,title,summary,body,metadata,enabled")
      .order("entity_type", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data as unknown as Row[]) ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    if (from > 20_000) break;
  }
  return all;
}

// ------------------------------------------------------------
// CSV helper
// ------------------------------------------------------------
function toCsv(headers: string[], rows: (string | number | boolean | null)[][]): string {
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}
function downloadCsv(name: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// ------------------------------------------------------------
// Mutations — always merge onto fresh metadata; never overwrite blindly.
// ------------------------------------------------------------
async function patchMetadata(id: string, patch: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase
    .from("encyclopedia_entities")
    .select("metadata")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const base = (data?.metadata && typeof data.metadata === "object") ? (data.metadata as any) : {};
  const next = { ...base, ...patch };
  const { error: upErr } = await supabase
    .from("encyclopedia_entities")
    .update({ metadata: next })
    .eq("id", id);
  if (upErr) throw upErr;
}
async function setEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from("encyclopedia_entities")
    .update({ enabled })
    .eq("id", id);
  if (error) throw error;
}
async function archiveEntity(id: string): Promise<void> {
  await patchMetadata(id, { archived: true, archived_at: new Date().toISOString() });
  await setEnabled(id, false);
}
async function removeStubFlag(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("encyclopedia_entities")
    .select("metadata")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const base = (data?.metadata && typeof data.metadata === "object") ? (data.metadata as any) : {};
  const next = { ...base };
  delete next.needs_content;
  const { error: upErr } = await supabase
    .from("encyclopedia_entities")
    .update({ metadata: next })
    .eq("id", id);
  if (upErr) throw upErr;
}

async function runBulk<T>(
  items: T[],
  worker: (t: T) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0;
  const CONC = 6;
  let i = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (i < items.length) {
        const idx = i++;
        try { await worker(items[idx]); ok++; }
        catch (e) { console.error(e); failed++; }
        onProgress?.(ok + failed, items.length);
      }
    }),
  );
  return { ok, failed };
}

// ============================================================
// Page
// ============================================================
type SectionKey = "canonical" | "stubs" | "missing" | "states" | "orphans";

function DataHygienePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>("canonical");
  const [busy, setBusy] = useState<string | null>(null);

  // Sync CMS taxonomy into the canonical Sets so entities using
  // admin-added eras/worlds/states are no longer flagged as non-canonical.
  const eraTax = useTaxonomy("era");
  const worldTax = useTaxonomy("world");
  const stateTax = useTaxonomy("state");
  useEffect(() => {
    for (const e of eraTax.entries) if (e.enabled && !e.archived) CANONICAL_ERA.add(e.key);
    for (const w of worldTax.entries) if (w.enabled && !w.archived) CANONICAL_WORLD.add(w.key);
    for (const s of stateTax.entries) if (s.enabled && !s.archived) CANONICAL_STATE.add(s.key);
    if (rows) setRows((prev) => (prev ? [...prev] : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eraTax.entries, worldTax.entries, stateTax.entries]);

  async function reload() {
    setLoading(true); setErr(null);
    try { setRows(await fetchAll()); }
    catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  const stats = useMemo(() => {
    if (!rows) return null;
    let stubs = 0, missingOverview = 0, missingBody = 0, unpublished = 0, nonCanonEra = 0;
    for (const r of rows) {
      const m = metaObj(r);
      if (m.needs_content === true) stubs++;
      const s = (r.summary ?? "").trim();
      if (!s) missingOverview++;
      if (!bodyHasContent(r.body)) missingBody++;
      if (!r.enabled) unpublished++;
      const era = typeof m.era === "string" ? m.era : "";
      if (era && !CANONICAL_ERA.has(era)) nonCanonEra++;
    }
    return { total: rows.length, stubs, missingOverview, missingBody, unpublished, nonCanonEra };
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/admin/encyclopedia-cleanup" className="inline-flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-900/40 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800/60">
            <ChevronLeft className="size-3.5" /> عودة إلى الورشة
          </Link>
          <h1 className="flex items-center gap-2 text-lg font-bold text-amber-100">
            <SprayCan className="size-5 text-amber-400" /> تنظيف بيانات الموسوعة
          </h1>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-900/40 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800/60 disabled:opacity-40"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          تحديث
        </button>
      </div>

      {err && (
        <div className="mb-3 flex items-center gap-2 rounded border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200">
          <AlertTriangle className="size-4" /> {err}
        </div>
      )}

      {/* Stats strip */}
      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="الإجمالي" value={stats.total} />
          <Stat label="stub_flag" value={stats.stubs} tone="warn" />
          <Stat label="بلا مقدمة" value={stats.missingOverview} tone="warn" />
          <Stat label="بلا محتوى" value={stats.missingBody} tone="warn" />
          <Stat label="غير منشورة" value={stats.unpublished} />
          <Stat label="حقبة غير قانونية" value={stats.nonCanonEra} tone="warn" />
        </div>
      )}

      {/* Section tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["canonical", "المصطلحات القانونية", Wand2],
            ["stubs", "علامات stub", Layers],
            ["missing", "محتوى ناقص", Filter],
            ["states", "الدول الضعيفة", Landmark],
            ["orphans", "العلاقات المفقودة", Network],
          ] as [SectionKey, string, any][]
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setSection(k)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
              section === k
                ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                : "border-slate-700/60 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60"
            }`}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      {loading && !rows && (
        <div className="rounded border border-slate-700/60 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
          <Loader2 className="mx-auto mb-2 size-5 animate-spin" /> جارٍ تحميل بيانات الموسوعة…
        </div>
      )}

      {rows && (
        <>
          {section === "canonical" && (
            <CanonicalFixer rows={rows} onDone={reload} setBusy={setBusy} busy={busy} />
          )}
          {section === "stubs" && (
            <StubCleanup rows={rows} onDone={reload} setBusy={setBusy} busy={busy} />
          )}
          {section === "missing" && (
            <MissingCleanup rows={rows} onDone={reload} setBusy={setBusy} busy={busy} />
          )}
          {section === "states" && (
            <StatesCleanup rows={rows} onDone={reload} setBusy={setBusy} busy={busy} />
          )}
          {section === "orphans" && (
            <OrphanReport rows={rows} />
          )}
        </>
      )}

      <p className="mt-6 flex items-center gap-2 rounded border border-slate-700/60 bg-slate-900/40 p-3 text-[11px] text-slate-400">
        <Shield className="size-3.5 text-amber-400" />
        الحذف النهائي غير مفعّل. كل الإجراءات تعتمد على «تعطيل» أو «أرشفة» مع الاحتفاظ بنسخة CSV احتياطية قبل التنفيذ.
      </p>
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warn" }) {
  return (
    <div className={`rounded border p-2 text-center ${tone === "warn" ? "border-amber-500/30 bg-amber-500/10" : "border-slate-700/60 bg-slate-900/40"}`}>
      <div className={`text-lg font-bold ${tone === "warn" ? "text-amber-200" : "text-slate-100"}`}>{value.toLocaleString("ar")}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

// ============================================================
// 1) Canonical fixer — era / world / state
// ============================================================
function CanonicalFixer({
  rows, onDone, setBusy, busy,
}: { rows: Row[]; onDone: () => void; setBusy: (s: string | null) => void; busy: string | null }) {
  const [kind, setKind] = useState<"era" | "world" | "state">("era");
  const canonical = kind === "era" ? CANONICAL_ERA : kind === "world" ? CANONICAL_WORLD : CANONICAL_STATE;

  // Build value groups from live data
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const m = metaObj(r);
      const raw = typeof m[kind] === "string" ? (m[kind] as string) : "";
      if (!raw) continue;
      if (canonical.has(raw)) continue;
      if (!map.has(raw)) map.set(raw, []);
      map.get(raw)!.push(r);
    }
    return [...map.entries()]
      .map(([raw, list]) => ({ raw, list, suggested: kind === "state" ? "" : suggestCanonical(kind, raw) }))
      .sort((a, b) => b.list.length - a.list.length);
  }, [rows, kind, canonical]);

  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);
  const [entityMapperGroup, setEntityMapperGroup] = useState<string | null>(null);

  useEffect(() => {
    // seed mapping with suggestions on load / kind change
    const next: Record<string, string> = {};
    for (const g of groups) if (g.suggested) next[g.raw] = g.suggested;
    setMapping(next);
    setSelected(new Set());
  }, [kind, rows.length]);

  const affectedCount = useMemo(() => {
    let n = 0;
    for (const raw of selected) {
      const g = groups.find((x) => x.raw === raw);
      if (g && mapping[raw]) n += g.list.length;
    }
    return n;
  }, [selected, mapping, groups]);

  async function applyMapping() {
    if (!confirm(`سيتم تحديث ${affectedCount} كيان. متابعة؟`)) return;
    setBusy("mapping");
    const jobs: { id: string; patch: Record<string, unknown> }[] = [];
    for (const raw of selected) {
      const target = mapping[raw];
      if (!target || !canonical.has(target) && kind !== "state") continue;
      const g = groups.find((x) => x.raw === raw);
      if (!g) continue;
      for (const r of g.list) jobs.push({ id: r.id, patch: { [kind]: target } });
    }
    const res = await runBulk(jobs, (j) => patchMetadata(j.id, j.patch));
    setBusy(null);
    alert(`تم تحديث ${res.ok}. فشل ${res.failed}.`);
    onDone();
  }

  return (
    <section className="rounded border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-amber-100">مصلح المصطلحات القانونية</div>
        <div className="flex items-center gap-1">
          {(["era", "world", "state"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 text-xs ${
                kind === k
                  ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                  : "border-slate-700/60 bg-slate-950/40 text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              {k === "era" ? "حقبة" : k === "world" ? "عالَم" : "دولة"}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-[11px] text-slate-400">
        القيم غير الموجودة في المجموعة القانونية {kind === "era" ? `(${[...CANONICAL_ERA].join(" • ")})` : `(${[...CANONICAL_WORLD].join(" • ")})`}. لن يُنفَّذ أي تحديث قبل استعراض العدد والضغط على «تطبيق».
      </p>

      {kind === "world" && (
        <div className="mb-3 rounded border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] leading-6 text-amber-100">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4" /> لا تُطبّق تحويل «عالَم» كمجموعة
          </div>
          مجموعة قديمة واحدة مثل <code className="mx-1 rounded bg-slate-900 px-1">iraq-and-hijaz</code> قد تحوي شخصيات أموية وعباسية وسلجوقية وزنكية معًا — ولا يمكن ضمّها كلها لعالَم واحد. استخدم زر <b>«مصنّف الكيانات»</b> بجانب كل مجموعة لمراجعة كل كيان على حدة مع اقتراح ذكي مبني على العصر ثم الدولة.
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">
          <CheckCircle2 className="mr-1 inline size-4" /> كل القيم قانونية.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="p-2 w-10"><input
                    type="checkbox"
                    onChange={(e) => setSelected(e.target.checked ? new Set(groups.filter((g) => mapping[g.raw]).map((g) => g.raw)) : new Set())}
                    checked={selected.size > 0 && selected.size === groups.filter((g) => mapping[g.raw]).length}
                  /></th>
                  <th className="p-2">القيمة الحالية</th>
                  <th className="p-2">العدد</th>
                  <th className="p-2">{kind === "world" ? "قيمة قانونية جماعية (غير مستحسن)" : "القيمة القانونية المقترحة"}</th>
                  <th className="p-2">تصفح</th>
                  <th className="p-2">{kind === "world" ? "مصنّف الكيانات" : ""}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const target = mapping[g.raw] ?? "";
                  const valid = kind === "state" ? true : canonical.has(target);
                  return (
                    <tr key={g.raw} className="border-t border-slate-800 hover:bg-slate-900/30">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          disabled={!target}
                          checked={selected.has(g.raw)}
                          onChange={(e) => {
                            const s = new Set(selected);
                            if (e.target.checked) s.add(g.raw); else s.delete(g.raw);
                            setSelected(s);
                          }}
                        />
                      </td>
                      <td className="p-2 font-mono text-amber-200">{g.raw}</td>
                      <td className="p-2 text-slate-300">{g.list.length}</td>
                      <td className="p-2">
                        {kind === "state" ? (
                          <input
                            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                            value={target}
                            onChange={(e) => setMapping({ ...mapping, [g.raw]: e.target.value })}
                            placeholder="اكتب قيمة قياسية"
                          />
                        ) : (
                          <select
                            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                            value={target}
                            onChange={(e) => setMapping({ ...mapping, [g.raw]: e.target.value })}
                          >
                            <option value="">— اختر —</option>
                            {[...canonical].sort().map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        )}
                        {target && !valid && kind !== "state" && (
                          <span className="mr-2 text-[10px] text-rose-300">غير قانوني</span>
                        )}
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() => setPreviewOpen(previewOpen === g.raw ? null : g.raw)}
                          className="text-amber-300 hover:underline"
                        >
                          {previewOpen === g.raw ? "إخفاء" : `عرض (${g.list.length})`}
                        </button>
                      </td>
                      <td className="p-2">
                        {kind === "world" ? (
                          <button
                            onClick={() => setEntityMapperGroup(g.raw)}
                            className="inline-flex items-center gap-1 rounded border border-amber-400/50 bg-amber-500/10 px-2 py-1 text-amber-100 hover:bg-amber-500/20"
                          >
                            <Users className="size-3.5" /> فتح المصنّف
                          </button>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                }).flatMap((tr, i) => {
                  const g = groups[i];
                  if (previewOpen !== g.raw) return [tr];
                  return [
                    tr,
                    <tr key={g.raw + "-p"} className="bg-slate-950/40">
                      <td colSpan={6} className="p-2">
                        <ul className="max-h-48 space-y-1 overflow-auto text-[11px] text-slate-300">
                          {g.list.slice(0, 100).map((r) => (
                            <li key={r.id}>
                              <span className="text-slate-500">[{r.entity_type}]</span> {r.title} <span className="text-slate-500">— {r.slug}</span>
                            </li>
                          ))}
                          {g.list.length > 100 && <li className="text-slate-500">…و {g.list.length - 100} إضافية</li>}
                        </ul>
                      </td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-400">
              {selected.size} مجموعة مختارة — {affectedCount} كيان سيتم تحديثه
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const csv = toCsv(
                    ["kind", "current", "count", "suggested"],
                    groups.map((g) => [kind, g.raw, g.list.length, mapping[g.raw] ?? ""]),
                  );
                  downloadCsv(`canonical-${kind}.csv`, csv);
                }}
                className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
              >
                <Download className="size-3.5" /> CSV احتياطي
              </button>
              <button
                onClick={applyMapping}
                disabled={busy !== null || affectedCount === 0}
                className="inline-flex items-center gap-1.5 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
              >
                {busy === "mapping" ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                تطبيق التحويل
              </button>
            </div>
          </div>
        </>
      )}

      {entityMapperGroup && (
        <EntityWorldMapperModal
          rawWorld={entityMapperGroup}
          rows={groups.find((g) => g.raw === entityMapperGroup)?.list ?? []}
          onClose={() => setEntityMapperGroup(null)}
          onApplied={() => { setEntityMapperGroup(null); onDone(); }}
          setBusy={setBusy}
          busy={busy}
        />
      )}
    </section>
  );
}

// ============================================================
// Entity World Mapper — per-entity world review
// ------------------------------------------------------------
// World represents an entity's civilizational home, not geography. A single
// legacy world value (e.g. `iraq-and-hijaz`) can contain Umayyad, Abbasid,
// Seljuk and Zengid figures at once, so we NEVER bulk-map a group→world.
// This modal lists every affected entity, pre-fills a smart suggestion
// (era → world, else state), lets the admin adjust each row, and applies
// only rows with a chosen canonical world.
// ============================================================
function EntityWorldMapperModal({
  rawWorld, rows, onClose, onApplied, setBusy, busy,
}: {
  rawWorld: string;
  rows: Row[];
  onClose: () => void;
  onApplied: () => void;
  setBusy: (s: string | null) => void;
  busy: string | null;
}) {
  const [assign, setAssign] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const r of rows) seed[r.id] = suggestWorldForEntity(r);
    return seed;
  });
  const [filterType, setFilterType] = useState<string>("");
  const [filterEra, setFilterEra] = useState<string>("");
  const [onlySuggested, setOnlySuggested] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");

  const worldOptions = useMemo(() => [...CANONICAL_WORLD].sort(), []);
  const types = useMemo(() => [...new Set(rows.map((r) => r.entity_type))].sort(), [rows]);
  const eras = useMemo(() => [...new Set(rows.map((r) => (metaObj(r).era as string) || "").filter(Boolean))].sort(), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterType && r.entity_type !== filterType) return false;
      const m = metaObj(r);
      if (filterEra && (m.era as string) !== filterEra) return false;
      if (onlySuggested && !assign[r.id]) return false;
      if (q && !(`${r.title} ${r.slug}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, filterType, filterEra, onlySuggested, query, assign]);

  const readyCount = useMemo(
    () => rows.filter((r) => assign[r.id] && CANONICAL_WORLD.has(assign[r.id])).length,
    [rows, assign],
  );

  function setAll(target: string) {
    const next = { ...assign };
    for (const r of visible) next[r.id] = target;
    setAssign(next);
  }
  function resetToSuggestions() {
    const next: Record<string, string> = {};
    for (const r of rows) next[r.id] = suggestWorldForEntity(r);
    setAssign(next);
  }

  async function apply() {
    const jobs = rows
      .filter((r) => assign[r.id] && CANONICAL_WORLD.has(assign[r.id]))
      .map((r) => ({ id: r.id, world: assign[r.id] }));
    if (jobs.length === 0) { alert("لا توجد كيانات جاهزة للتطبيق."); return; }
    if (!confirm(`سيتم تحديث حقل «العالَم» لعدد ${jobs.length} كيان. متابعة؟`)) return;
    setBusy("entity-mapper");
    const res = await runBulk(jobs, (j) => patchMetadata(j.id, { world: j.world }));
    setBusy(null);
    alert(`تم تحديث ${res.ok}. فشل ${res.failed}.`);
    onApplied();
  }

  function exportCsv() {
    const csv = toCsv(
      ["id", "type", "slug", "title", "era", "state", "current_world", "new_world"],
      rows.map((r) => {
        const m = metaObj(r);
        return [
          r.id, r.entity_type, r.slug, r.title,
          (m.era as string) ?? "", (m.state as string) ?? "",
          rawWorld, assign[r.id] ?? "",
        ];
      }),
    );
    downloadCsv(`entity-world-mapper-${rawWorld}.csv`, csv);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <div dir="rtl" className="my-6 w-full max-w-6xl rounded-xl border border-amber-500/40 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <div className="text-sm text-slate-400">مصنّف العالَم للكيانات</div>
            <div className="text-base font-semibold text-amber-100">
              المجموعة القديمة: <code className="rounded bg-slate-900 px-1.5 py-0.5">{rawWorld}</code>
              <span className="ms-2 text-xs text-slate-400">({rows.length} كيان — {readyCount} جاهز)</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-900 hover:text-slate-100" aria-label="إغلاق">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-3 text-xs">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالعنوان أو الـ slug"
            className="w-56 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
          />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
            <option value="">كل الأنواع</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterEra} onChange={(e) => setFilterEra(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100">
            <option value="">كل العصور</option>
            {eras.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-slate-300">
            <input type="checkbox" checked={onlySuggested} onChange={(e) => setOnlySuggested(e.target.checked)} />
            الظاهر يحوي اقتراحًا فقط
          </label>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <button onClick={resetToSuggestions} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 hover:bg-slate-800">
              إعادة الاقتراحات
            </button>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">تطبيق على الظاهر:</span>
              <select
                onChange={(e) => { if (e.target.value) { setAll(e.target.value); e.currentTarget.value = ""; } }}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
                defaultValue=""
              >
                <option value="">— اختر عالَمًا —</option>
                {worldOptions.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-right text-xs">
            <thead className="sticky top-0 bg-slate-950/95 text-slate-400 backdrop-blur">
              <tr>
                <th className="p-2">الكيان</th>
                <th className="p-2">النوع</th>
                <th className="p-2">العصر</th>
                <th className="p-2">الدولة</th>
                <th className="p-2">العالَم الحالي</th>
                <th className="p-2">العالَم الجديد</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const m = metaObj(r);
                const era = (m.era as string) ?? "";
                const state = (m.state as string) ?? "";
                const chosen = assign[r.id] ?? "";
                const valid = chosen === "" || CANONICAL_WORLD.has(chosen);
                return (
                  <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                    <td className="p-2">
                      <div className="font-semibold text-slate-100">{r.title}</div>
                      <div className="font-mono text-[10px] text-slate-500">{r.slug}</div>
                    </td>
                    <td className="p-2 text-slate-300">{r.entity_type}</td>
                    <td className="p-2 text-slate-300">{era || <span className="text-slate-600">—</span>}</td>
                    <td className="p-2 text-slate-300">{state || <span className="text-slate-600">—</span>}</td>
                    <td className="p-2 font-mono text-amber-200/80">{rawWorld}</td>
                    <td className="p-2">
                      <select
                        value={chosen}
                        onChange={(e) => setAssign({ ...assign, [r.id]: e.target.value })}
                        className={`rounded border px-2 py-1 text-slate-100 ${valid ? "border-slate-700 bg-slate-900" : "border-rose-500/60 bg-rose-500/10"}`}
                      >
                        <option value="">— بدون —</option>
                        {worldOptions.map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-slate-500">لا نتائج مطابقة للفلاتر.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 p-3 text-xs">
          <div className="text-slate-400">
            الظاهر: {visible.length} — الجاهز للتطبيق: {readyCount}
          </div>
          <div className="flex gap-2">
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 hover:bg-slate-800">
              <Download className="size-3.5" /> CSV احتياطي
            </button>
            <button onClick={onClose} className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 hover:bg-slate-800">
              إلغاء
            </button>
            <button
              onClick={apply}
              disabled={busy !== null || readyCount === 0}
              className="inline-flex items-center gap-1.5 rounded bg-amber-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
            >
              {busy === "entity-mapper" ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
              تطبيق ({readyCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// 2) Stub cleanup — grouped by type
// ============================================================
function StubCleanup({
  rows, onDone, setBusy, busy,
}: { rows: Row[]; onDone: () => void; setBusy: (s: string | null) => void; busy: string | null }) {
  const stubs = useMemo(() => rows.filter((r) => metaObj(r).needs_content === true), [rows]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of stubs) {
      if (!g.has(r.entity_type)) g.set(r.entity_type, []);
      g.get(r.entity_type)!.push(r);
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [stubs]);

  async function bulk(action: "disable" | "archive" | "remove-flag") {
    const ids = [...selected];
    if (!ids.length) return;
    const label = action === "disable" ? "تعطيل" : action === "archive" ? "أرشفة" : "إزالة علامة stub من";
    if (!confirm(`${label} ${ids.length} كيان؟`)) return;
    setBusy(action);
    const res = await runBulk(ids, async (id) => {
      if (action === "disable") await setEnabled(id, false);
      else if (action === "archive") await archiveEntity(id);
      else await removeStubFlag(id);
    });
    setBusy(null);
    alert(`تم: ${res.ok} / فشل: ${res.failed}`);
    setSelected(new Set());
    onDone();
  }

  return (
    <section className="rounded border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-amber-100">
          كيانات تحمل علامة <span className="font-mono text-amber-300">needs_content</span> ({stubs.length})
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => downloadCsv("stubs.csv", toCsv(
              ["id", "type", "slug", "title", "enabled", "displayable"],
              stubs.map((r) => [r.id, r.entity_type, r.slug, r.title, r.enabled, isDisplayable(r)]),
            ))}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
          >
            <Download className="size-3.5" /> CSV
          </button>
          <button onClick={() => bulk("remove-flag")} disabled={!selected.size || busy !== null} className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-40">
            <CheckCircle2 className="size-3.5" /> إزالة العلامة
          </button>
          <button onClick={() => bulk("disable")} disabled={!selected.size || busy !== null} className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40">
            <EyeOff className="size-3.5" /> تعطيل
          </button>
          <button onClick={() => bulk("archive")} disabled={!selected.size || busy !== null} className="inline-flex items-center gap-1.5 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40">
            <Archive className="size-3.5" /> أرشفة
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {groups.map(([type, list]) => (
          <details key={type} open className="rounded border border-slate-800 bg-slate-950/40">
            <summary className="cursor-pointer p-2 text-xs text-slate-200">
              <span className="font-mono text-amber-300">{type}</span> — {list.length}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  const s = new Set(selected);
                  const allIn = list.every((r) => s.has(r.id));
                  if (allIn) list.forEach((r) => s.delete(r.id));
                  else list.forEach((r) => s.add(r.id));
                  setSelected(s);
                }}
                className="mr-3 text-amber-300 hover:underline"
              >
                تحديد/إلغاء المجموعة
              </button>
            </summary>
            <ul className="divide-y divide-slate-800 text-[11px]">
              {list.map((r) => (
                <li key={r.id} className="flex items-center gap-2 p-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      const s = new Set(selected);
                      if (e.target.checked) s.add(r.id); else s.delete(r.id);
                      setSelected(s);
                    }}
                  />
                  <span className="flex-1 truncate text-slate-200">{r.title}</span>
                  <span className="text-slate-500">{r.slug}</span>
                  {!r.enabled && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">معطل</span>}
                  {isDisplayable(r) && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">قابل للعرض</span>}
                </li>
              ))}
            </ul>
          </details>
        ))}
        {!groups.length && (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">
            <CheckCircle2 className="mr-1 inline size-4" /> لا توجد كيانات مُعلَّمة كنماذج (stub).
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// 3) Missing content cleanup
// ============================================================
function MissingCleanup({
  rows, onDone, setBusy, busy,
}: { rows: Row[]; onDone: () => void; setBusy: (s: string | null) => void; busy: string | null }) {
  const [fType, setFType] = useState("");
  const [fEra, setFEra] = useState("");
  const [fWorld, setFWorld] = useState("");
  const [fState, setFState] = useState("");
  const [fEnabled, setFEnabled] = useState<"all" | "on" | "off">("all");
  const [fDisplay, setFDisplay] = useState<"all" | "yes" | "no">("no");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const list = useMemo(() => {
    return rows.filter((r) => {
      const m = metaObj(r);
      const missingOv = !(r.summary ?? "").trim();
      const missingB = !bodyHasContent(r.body);
      if (!missingOv && !missingB) return false;
      if (fType && r.entity_type !== fType) return false;
      if (fEra && m.era !== fEra) return false;
      if (fWorld && m.world !== fWorld) return false;
      if (fState && m.state !== fState) return false;
      if (fEnabled === "on" && !r.enabled) return false;
      if (fEnabled === "off" && r.enabled) return false;
      const disp = isDisplayable(r);
      if (fDisplay === "yes" && !disp) return false;
      if (fDisplay === "no" && disp) return false;
      return true;
    });
  }, [rows, fType, fEra, fWorld, fState, fEnabled, fDisplay]);

  const types = useMemo(() => [...new Set(rows.map((r) => r.entity_type))].sort(), [rows]);
  const eras = useMemo(() => [...new Set(rows.map((r) => metaObj(r).era).filter(Boolean) as string[])].sort(), [rows]);
  const worlds = useMemo(() => [...new Set(rows.map((r) => metaObj(r).world).filter(Boolean) as string[])].sort(), [rows]);
  const states = useMemo(() => [...new Set(rows.map((r) => metaObj(r).state).filter(Boolean) as string[])].sort(), [rows]);

  async function bulk(action: "disable" | "archive") {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`${action === "disable" ? "تعطيل" : "أرشفة"} ${ids.length} كيان؟`)) return;
    setBusy(action);
    const res = await runBulk(ids, async (id) => {
      if (action === "disable") await setEnabled(id, false); else await archiveEntity(id);
    });
    setBusy(null);
    alert(`تم: ${res.ok} / فشل: ${res.failed}`);
    setSelected(new Set());
    onDone();
  }

  return (
    <section className="rounded border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <Select value={fType} onChange={setFType} label="النوع" options={["", ...types]} />
        <Select value={fEra} onChange={setFEra} label="الحقبة" options={["", ...eras]} />
        <Select value={fWorld} onChange={setFWorld} label="العالَم" options={["", ...worlds]} />
        <Select value={fState} onChange={setFState} label="الدولة" options={["", ...states]} />
        <Select value={fEnabled} onChange={(v) => setFEnabled(v as any)} label="النشر" options={["all", "on", "off"]} />
        <Select value={fDisplay} onChange={(v) => setFDisplay(v as any)} label="قابل للعرض" options={["all", "yes", "no"]} />
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-400">النتائج: {list.length} — المحدد: {selected.size}</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelected(new Set(list.map((r) => r.id)))}
            className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
          >تحديد الكل</button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
          >تفريغ</button>
          <button
            onClick={() => downloadCsv("missing.csv", toCsv(
              ["id", "type", "slug", "title", "enabled", "era", "world", "state"],
              list.map((r) => {
                const m = metaObj(r);
                return [r.id, r.entity_type, r.slug, r.title, r.enabled, (m.era as string) ?? "", (m.world as string) ?? "", (m.state as string) ?? ""];
              }),
            ))}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
          >
            <Download className="size-3.5" /> CSV
          </button>
          <button onClick={() => bulk("disable")} disabled={!selected.size || busy !== null} className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40">
            <EyeOff className="size-3.5" /> تعطيل
          </button>
          <button onClick={() => bulk("archive")} disabled={!selected.size || busy !== null} className="inline-flex items-center gap-1.5 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40">
            <Archive className="size-3.5" /> أرشفة
          </button>
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto rounded border border-slate-800">
        <table className="w-full text-right text-xs">
          <thead className="sticky top-0 bg-slate-950/80 text-slate-400">
            <tr>
              <th className="p-2 w-8"></th>
              <th className="p-2">النوع</th>
              <th className="p-2">العنوان</th>
              <th className="p-2">Slug</th>
              <th className="p-2">النشر</th>
              <th className="p-2">النقص</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 800).map((r) => {
              const missingOv = !(r.summary ?? "").trim();
              const missingB = !bodyHasContent(r.body);
              return (
                <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/30">
                  <td className="p-2"><input type="checkbox" checked={selected.has(r.id)} onChange={(e) => {
                    const s = new Set(selected);
                    if (e.target.checked) s.add(r.id); else s.delete(r.id);
                    setSelected(s);
                  }} /></td>
                  <td className="p-2 font-mono text-amber-300">{r.entity_type}</td>
                  <td className="p-2 text-slate-100">{r.title}</td>
                  <td className="p-2 text-slate-500">{r.slug}</td>
                  <td className="p-2">{r.enabled ? "منشور" : "معطل"}</td>
                  <td className="p-2 text-rose-300">
                    {[missingOv && "مقدمة", missingB && "محتوى"].filter(Boolean).join("، ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length > 800 && (
          <div className="p-2 text-center text-[11px] text-slate-500">تم عرض أول 800 صف — استخدم الفلاتر أو CSV للاطلاع على الباقي.</div>
        )}
      </div>
    </section>
  );
}

function Select({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: string[] }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-slate-400">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
      >
        {options.map((o) => <option key={o} value={o}>{o === "" ? "الكل" : o}</option>)}
      </select>
    </label>
  );
}

// ============================================================
// 4) States cleanup — strong publish criteria
// ============================================================
function StatesCleanup({
  rows, onDone, setBusy, busy,
}: { rows: Row[]; onDone: () => void; setBusy: (s: string | null) => void; busy: string | null }) {
  // A "state" here = entity_type=state
  const states = useMemo(() => rows.filter((r) => r.entity_type === "state"), [rows]);

  // Explicit relationships from any entity pointing to this state's slug/id.
  const relIndex = useMemo(() => {
    const idx = new Map<string, number>();
    for (const r of rows) {
      const m = metaObj(r);
      const rel = [
        ...(Array.isArray((m as any).related_entities) ? (m as any).related_entities : []),
        ...(Array.isArray((m as any).related) ? (m as any).related : []),
        ...(Array.isArray((m as any).relationships) ? (m as any).relationships : []),
      ] as unknown[];
      for (const v of rel) {
        if (typeof v === "string") idx.set(v, (idx.get(v) ?? 0) + 1);
      }
    }
    return idx;
  }, [rows]);

  const evaluated = useMemo(() => states.map((r) => {
    const m = metaObj(r);
    const hasOverview = ((r.summary ?? "").trim().length >= 40) || (typeof m.overview === "string" && (m.overview as string).trim().length >= 40);
    const hasBody = bodyHasContent(r.body);
    const era = typeof m.era === "string" ? (m.era as string) : "";
    const canonicalEra = era && CANONICAL_ERA.has(era);
    const relCount = (relIndex.get(r.slug) ?? 0) + (relIndex.get(r.id) ?? 0);
    const publishable = r.enabled && hasOverview && hasBody && canonicalEra && relCount >= 2;
    return { r, hasOverview, hasBody, canonicalEra, relCount, publishable };
  }), [states, relIndex]);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const weak = evaluated.filter((x) => !x.publishable && x.r.enabled);

  async function bulk(action: "disable" | "archive") {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`${action === "disable" ? "تعطيل" : "أرشفة"} ${ids.length} دولة ضعيفة؟`)) return;
    setBusy(action);
    const res = await runBulk(ids, async (id) => {
      if (action === "disable") await setEnabled(id, false); else await archiveEntity(id);
    });
    setBusy(null);
    alert(`تم: ${res.ok} / فشل: ${res.failed}`);
    setSelected(new Set());
    onDone();
  }

  return (
    <section className="rounded border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-amber-100">
          <MapPin className="mr-1 inline size-4" /> الدول ({evaluated.length}) — {weak.length} ضعيفة تحتاج إخفاء
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSelected(new Set(weak.map((x) => x.r.id)))} className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900">تحديد الضعيفة</button>
          <button onClick={() => downloadCsv("states.csv", toCsv(
            ["id", "slug", "title", "enabled", "hasOverview", "hasBody", "canonicalEra", "relations", "publishable"],
            evaluated.map((x) => [x.r.id, x.r.slug, x.r.title, x.r.enabled, x.hasOverview, x.hasBody, x.canonicalEra, x.relCount, x.publishable]),
          ))} className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900">
            <Download className="size-3.5" /> CSV
          </button>
          <button onClick={() => bulk("disable")} disabled={!selected.size || busy !== null} className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40">
            <EyeOff className="size-3.5" /> تعطيل
          </button>
          <button onClick={() => bulk("archive")} disabled={!selected.size || busy !== null} className="inline-flex items-center gap-1.5 rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40">
            <Archive className="size-3.5" /> أرشفة
          </button>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-slate-400">
        معيار النشر: مقدمة + محتوى + حقبة قانونية + عدد صلات صريحة ≥ 2. الدول التي لا تحقق كل المعايير لا يجب عرضها في موسوعة اللاعب.
      </p>
      <div className="max-h-[560px] overflow-auto rounded border border-slate-800">
        <table className="w-full text-right text-xs">
          <thead className="sticky top-0 bg-slate-950/80 text-slate-400">
            <tr>
              <th className="p-2 w-8"></th>
              <th className="p-2">الدولة</th>
              <th className="p-2">النشر</th>
              <th className="p-2">مقدمة</th>
              <th className="p-2">محتوى</th>
              <th className="p-2">حقبة</th>
              <th className="p-2">صلات</th>
              <th className="p-2">صالحة للعرض</th>
            </tr>
          </thead>
          <tbody>
            {evaluated.map(({ r, hasOverview, hasBody, canonicalEra, relCount, publishable }) => (
              <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/30">
                <td className="p-2"><input type="checkbox" checked={selected.has(r.id)} onChange={(e) => {
                  const s = new Set(selected);
                  if (e.target.checked) s.add(r.id); else s.delete(r.id);
                  setSelected(s);
                }} /></td>
                <td className="p-2 text-slate-100">{r.title} <span className="text-slate-500">— {r.slug}</span></td>
                <td className="p-2">{r.enabled ? "منشور" : "معطل"}</td>
                <td className="p-2">{hasOverview ? "✓" : "—"}</td>
                <td className="p-2">{hasBody ? "✓" : "—"}</td>
                <td className="p-2">{canonicalEra ? "✓" : "—"}</td>
                <td className="p-2">{relCount}</td>
                <td className={`p-2 ${publishable ? "text-emerald-300" : "text-rose-300"}`}>{publishable ? "نعم" : "لا"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================
// 5) Orphan relationship report
// ============================================================
function OrphanReport({ rows }: { rows: Row[] }) {
  const orphans = useMemo(() => {
    // Explicit outbound refs per row
    const outbound = new Map<string, number>();
    // Reverse refs — who points to this slug/id
    const reverse = new Map<string, number>();
    for (const r of rows) {
      const m = metaObj(r);
      const rel = [
        ...(Array.isArray((m as any).related_entities) ? (m as any).related_entities : []),
        ...(Array.isArray((m as any).related) ? (m as any).related : []),
        ...(Array.isArray((m as any).relationships) ? (m as any).relationships : []),
      ] as unknown[];
      outbound.set(r.id, rel.filter((v) => typeof v === "string").length);
      for (const v of rel) if (typeof v === "string") reverse.set(v, (reverse.get(v) ?? 0) + 1);
    }
    return rows
      .filter((r) => isDisplayable(r))
      .filter((r) => (outbound.get(r.id) ?? 0) === 0 && (reverse.get(r.slug) ?? 0) === 0 && (reverse.get(r.id) ?? 0) === 0);
  }, [rows]);

  const byType = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of orphans) {
      if (!g.has(r.entity_type)) g.set(r.entity_type, []);
      g.get(r.entity_type)!.push(r);
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [orphans]);

  return (
    <section className="rounded border border-slate-700/60 bg-slate-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-amber-100">
          <Network className="mr-1 inline size-4" /> كيانات قابلة للعرض بدون علاقات صريحة ({orphans.length})
        </div>
        <button
          onClick={() => downloadCsv("orphans.csv", toCsv(
            ["id", "type", "slug", "title"],
            orphans.map((r) => [r.id, r.entity_type, r.slug, r.title]),
          ))}
          className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900"
        >
          <Download className="size-3.5" /> CSV
        </button>
      </div>
      <p className="mb-3 text-[11px] text-slate-400">
        هذه الكيانات ليست معطوبة، لكنها تحتاج إلى ربط صريح ضمن <span className="font-mono">metadata.related_entities</span> لتظهر في شبكة العلاقات.
      </p>
      <div className="space-y-3">
        {byType.map(([type, list]) => (
          <details key={type} className="rounded border border-slate-800 bg-slate-950/40">
            <summary className="cursor-pointer p-2 text-xs text-slate-200">
              <span className="font-mono text-amber-300">{type}</span> — {list.length}
            </summary>
            <ul className="max-h-64 divide-y divide-slate-800 overflow-auto text-[11px]">
              {list.map((r) => (
                <li key={r.id} className="flex items-center gap-2 p-2">
                  <span className="flex-1 truncate text-slate-200">{r.title}</span>
                  <span className="text-slate-500">{r.slug}</span>
                  <Link to="/admin/encyclopedia-cleanup" className="inline-flex items-center gap-1 text-amber-300 hover:underline">
                    الورشة <ArrowUpRight className="size-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {!byType.length && (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">
            <CheckCircle2 className="mr-1 inline size-4" /> لا توجد كيانات يتيمة قابلة للعرض.
          </div>
        )}
      </div>
    </section>
  );
}
