// Phase 1 — Admin: Atlas Entities (list + create + edit + verify + publish).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
  Crosshair,
} from "lucide-react";
import { geoToAps } from "@/lib/atlas/transform";
import { AtlasApsPicker } from "@/components/atlas/AtlasApsPicker";

import { AdminGate } from "@/lib/admin-guard";
import { supabase } from "@/integrations/supabase/client";
import {
  ATLAS_ENTITY_KINDS,
  ATLAS_ENTITY_STATUSES,
  KIND_LABEL_AR,
  LC1_ATLAS_VISIBLE_KINDS,
  STATUS_LABEL_AR,
  createAtlasEntity,
  deleteAtlasEntity,
  isLc1VisibleAtlasKind,
  listAllAtlasEntities,
  setAtlasEntityStatus,
  suggestSlug,
  unverifyAtlasEntity,
  updateAtlasEntity,
  verifyAtlasEntity,
  type AtlasEntityKind,
  type AtlasEntityRow,
} from "@/lib/atlas-entities";
const ATLAS_ALLOWED_KINDS: AtlasEntityKind[] = ATLAS_ENTITY_KINDS.filter((k) =>
  LC1_ATLAS_VISIBLE_KINDS.has(k),
);
import { ATLAS_V1_PIXEL_SIZE } from "@/data/atlas-anchors";

export const Route = createFileRoute("/admin/atlas-entities")({
  head: () => ({
    meta: [
      { title: "إدارة كيانات الأطلس — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <AdminAtlasEntitiesPage />
    </AdminGate>
  ),
});

type EncyclopediaRef = { id: string; title: string; entity_type: string; slug: string };

function AdminAtlasEntitiesPage() {
  const [rows, setRows] = useState<AtlasEntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AtlasEntityRow | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [encyclopedia, setEncyclopedia] = useState<EncyclopediaRef[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLegacyKinds, setShowLegacyKinds] = useState(false);
  const visibleRows = showLegacyKinds ? rows : rows.filter((r) => isLc1VisibleAtlasKind(r.kind));
  const legacyCount = rows.length - rows.filter((r) => isLc1VisibleAtlasKind(r.kind)).length;


  const reload = async () => {
    setLoading(true);
    try {
      const list = await listAllAtlasEntities();
      setRows(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // Encyclopedia options for the picker
    supabase
      .from("encyclopedia_entities")
      .select("id, title, entity_type, slug")
      .eq("enabled", true)
      .order("title", { ascending: true })
      .limit(2000)
      .then(({ data }) => {
        if (data) setEncyclopedia(data as EncyclopediaRef[]);
      });
  }, []);

  const action = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
          <div className="flex items-center gap-2">
            <Link to="/admin" className="text-amber-300 hover:text-amber-200">
              <ChevronRight className="size-4" />
            </Link>
            <MapPin className="size-6 text-amber-400" />
            <h1 className="text-xl font-bold text-amber-100">كيانات الأطلس</h1>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
              المرحلة 1
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reload}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
            >
              <RefreshCw className="inline size-4" />
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <input
                type="checkbox"
                checked={showLegacyKinds}
                onChange={(e) => setShowLegacyKinds(e.target.checked)}
              />
              إظهار أنواع قديمة{legacyCount ? ` (${legacyCount})` : ""}
            </label>
            <button
              onClick={() => setImporting(true)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/10"
            >
              <Upload className="size-4" />
              استيراد JSON
            </button>
            <button
              onClick={() => setEditing("new")}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400"
            >
              <Plus className="size-4" />
              كيان جديد
            </button>

          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <RefreshCw className="size-4 animate-spin" /> جاري التحميل…
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            لا توجد كيانات بعد. أنشئ أول كيان للبدء.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-right text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">الاسم</th>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">APS</th>
                  <th className="px-3 py-2">التحقق</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950">
                {visibleRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/50">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-100">{r.name_ar}</div>
                      <div className="font-mono text-[11px] text-slate-500">{r.slug}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{KIND_LABEL_AR[r.kind]}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-slate-400">
                      {r.aps_x}, {r.aps_y}
                    </td>
                    <td className="px-3 py-2">
                      {r.aps_verified ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                          ✓ موثّق
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                          غير موثّق
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          disabled={busyId === r.id}
                          onClick={() => setEditing(r)}
                          className="rounded border border-slate-700 px-2 py-0.5 text-[11px] hover:bg-slate-800"
                        >
                          تعديل
                        </button>
                        {!r.aps_verified ? (
                          <button
                            disabled={busyId === r.id}
                            onClick={async () => {
                              const { data } = await supabase.auth.getUser();
                              return action(r.id, () => verifyAtlasEntity(r.id, data.user?.id ?? null));
                            }}
                            className="rounded border border-emerald-700 bg-emerald-600/20 px-2 py-0.5 text-[11px] text-emerald-200 hover:bg-emerald-600/30"
                          >
                            تأكيد APS
                          </button>
                        ) : (
                          <button
                            disabled={busyId === r.id}
                            onClick={() => action(r.id, () => unverifyAtlasEntity(r.id))}
                            className="rounded border border-amber-700 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-600/20"
                          >
                            إلغاء التوثيق
                          </button>
                        )}
                        {r.status !== "published" ? (
                          <button
                            disabled={busyId === r.id || !r.aps_verified}
                            onClick={() => action(r.id, () => setAtlasEntityStatus(r.id, "published"))}
                            className="rounded border border-sky-700 bg-sky-600/20 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-sky-600/30 disabled:opacity-40"
                            title={r.aps_verified ? "" : "يجب توثيق APS قبل النشر"}
                          >
                            نشر
                          </button>
                        ) : (
                          <button
                            disabled={busyId === r.id}
                            onClick={() => action(r.id, () => setAtlasEntityStatus(r.id, "retired"))}
                            className="rounded border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
                          >
                            تقاعد
                          </button>
                        )}
                        {r.status === "draft" && (
                          <button
                            disabled={busyId === r.id}
                            onClick={() => {
                              if (confirm(`حذف "${r.name_ar}"؟`)) {
                                action(r.id, () => deleteAtlasEntity(r.id));
                              }
                            }}
                            className="rounded border border-rose-700 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-600/20"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Link
          to="/map"
          className="inline-flex items-center gap-1.5 text-sm text-amber-300 hover:text-amber-200"
        >
          <ArrowRight className="size-4" />
          عرض الأطلس الحي
        </Link>
      </div>

      {editing && (
        <EntityEditor
          row={editing === "new" ? null : editing}
          encyclopedia={encyclopedia}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}

      {importing && (
        <ImportJsonDialog
          onClose={() => setImporting(false)}
          onDone={async () => {
            setImporting(false);
            await reload();
          }}
        />
      )}

    </div>
  );
}

function StatusPill({ status }: { status: AtlasEntityRow["status"] }) {
  const styles: Record<AtlasEntityRow["status"], string> = {
    draft: "bg-slate-500/15 text-slate-300",
    review: "bg-amber-500/15 text-amber-300",
    published: "bg-emerald-500/15 text-emerald-300",
    retired: "bg-rose-500/15 text-rose-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${styles[status]}`}>
      {STATUS_LABEL_AR[status]}
    </span>
  );
}

function EntityEditor({
  row,
  encyclopedia,
  onClose,
  onSaved,
}: {
  row: AtlasEntityRow | null;
  encyclopedia: EncyclopediaRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = row === null;
  const [name_ar, setNameAr] = useState(row?.name_ar ?? "");
  const [name_en, setNameEn] = useState(row?.name_en ?? "");
  const [slug, setSlug] = useState(row?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [kind, setKind] = useState<AtlasEntityKind>(row?.kind ?? "place");
  const [aps_x, setApsX] = useState<number>(row?.aps_x ?? 7000);
  const [aps_y, setApsY] = useState<number>(row?.aps_y ?? 3500);
  const [lon, setLon] = useState<string>(row?.lon != null ? String(row.lon) : "");
  const [lat, setLat] = useState<string>(row?.lat != null ? String(row.lat) : "");
  const [era, setEra] = useState(row?.era ?? "");
  const [year_start, setYearStart] = useState<string>(
    row?.year_start != null ? String(row.year_start) : "",
  );
  const [year_end, setYearEnd] = useState<string>(
    row?.year_end != null ? String(row.year_end) : "",
  );
  const [encyclopediaId, setEncyclopediaId] = useState<string>(row?.encyclopedia_entity_id ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickingAps, setPickingAps] = useState(false);
  const [apsPickedNotice, setApsPickedNotice] = useState<{ x: number; y: number } | null>(null);

  // Auto-suggest slug when name changes and admin hasn't touched it
  useEffect(() => {
    if (!slugTouched && isNew) setSlug(suggestSlug(name_ar, name_en));
  }, [name_ar, name_en, slugTouched, isNew]);

  const apsInBounds =
    aps_x >= 0 &&
    aps_x < ATLAS_V1_PIXEL_SIZE.width &&
    aps_y >= 0 &&
    aps_y < ATLAS_V1_PIXEL_SIZE.height;

  const valid = name_ar.trim().length > 0 && /^[a-z0-9][a-z0-9-]{1,63}$/.test(slug) && apsInBounds;

  const onSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        slug,
        kind,
        name_ar: name_ar.trim(),
        name_en: name_en.trim() || null,
        aps_x: Math.round(aps_x),
        aps_y: Math.round(aps_y),
        lon: lon ? Number(lon) : null,
        lat: lat ? Number(lat) : null,
        geo_source: (lon && lat) ? "manual" : null,
        era: era.trim() || null,
        year_start: year_start ? Number(year_start) : null,
        year_end: year_end ? Number(year_end) : null,
        encyclopedia_entity_id: encyclopediaId || null,
      };
      if (isNew) {
        await createAtlasEntity(payload as any);
      } else {
        await updateAtlasEntity(row!.id, payload);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-lg font-bold text-amber-100">
            {isNew ? "إنشاء كيان أطلس" : `تعديل: ${row!.name_ar}`}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-800">
            <X className="size-4" />
          </button>
        </div>

        {err && (
          <div className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-200">
            {err}
          </div>
        )}

        <div className="grid gap-3 text-sm">
          <Field label="الاسم بالعربية *">
            <input
              value={name_ar}
              onChange={(e) => setNameAr(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
            />
          </Field>
          <Field label="Name (EN)">
            <input
              value={name_en}
              onChange={(e) => setNameEn(e.target.value)}
              dir="ltr"
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono"
            />
          </Field>
          <Field label="Slug *">
            <input
              value={slug}
              dir="ltr"
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-amber-200"
              placeholder="lowercase-with-dashes"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              يُشتق تلقائيًا من الاسم. يمكن تعديله قبل الحفظ.
            </p>
          </Field>
          <Field label="النوع">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AtlasEntityKind)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
            >
              {ATLAS_ENTITY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL_AR[k]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="APS X *">
              <input
                type="number"
                value={aps_x}
                onChange={(e) => setApsX(Number(e.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono"
                min={0}
                max={ATLAS_V1_PIXEL_SIZE.width - 1}
              />
            </Field>
            <Field label="APS Y *">
              <input
                type="number"
                value={aps_y}
                onChange={(e) => setApsY(Number(e.target.value))}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono"
                min={0}
                max={ATLAS_V1_PIXEL_SIZE.height - 1}
              />
            </Field>
          </div>
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              حدود الأطلس: 0–{ATLAS_V1_PIXEL_SIZE.width - 1} × 0–{ATLAS_V1_PIXEL_SIZE.height - 1}.
              APS هو المصدر الموثوق للموقع.
            </p>
            <button
              type="button"
              onClick={() => setPickingAps(true)}
              className="inline-flex items-center gap-1.5 rounded border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-[12px] font-semibold text-amber-200 hover:bg-amber-500/20"
            >
              <Crosshair className="size-3.5" />
              اختيار APS من الأطلس
            </button>
          </div>
          {!isNew && (
            <p className="-mt-1 text-[11px] text-amber-300/80">
              تغيير الإحداثيات سيُعيد ضبط حالة التوثيق تلقائياً ويتطلب إعادة التأكيد والنشر.
            </p>
          )}



          <div className="grid grid-cols-2 gap-3">
            <Field label="Lon (اختياري)">
              <input
                type="number"
                step="0.01"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono"
              />
            </Field>
            <Field label="Lat (اختياري)">
              <input
                type="number"
                step="0.01"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono"
              />
            </Field>
          </div>

          <Field label="الحقبة (اختياري)">
            <input
              value={era}
              onChange={(e) => setEra(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="سنة البداية">
              <input
                type="number"
                value={year_start}
                onChange={(e) => setYearStart(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
              />
            </Field>
            <Field label="سنة النهاية">
              <input
                type="number"
                value={year_end}
                onChange={(e) => setYearEnd(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
              />
            </Field>
          </div>

          <Field label="ربط بالموسوعة (اختياري)">
            <select
              value={encyclopediaId}
              onChange={(e) => setEncyclopediaId(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
            >
              <option value="">— بدون ربط —</option>
              {encyclopedia.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.title} ({opt.entity_type})
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            onClick={onClose}
            className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            إلغاء
          </button>
          <button
            disabled={!valid || saving}
            onClick={onSave}
            className="flex items-center gap-1.5 rounded bg-amber-500 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            {isNew ? "إنشاء (مسودة)" : "حفظ التعديلات"}
          </button>
        </div>

        {!isNew && (
          <p className="mt-3 text-[11px] text-slate-500">
            ملاحظة: تغيير إحداثيات APS سيُعيد ضبط حالة التوثيق تلقائيًا.
          </p>
        )}
      </div>

      {pickingAps && (
        <AtlasApsPicker
          initial={{ x: aps_x, y: aps_y }}
          label={name_ar || slug}
          onClose={() => setPickingAps(false)}
          onPick={(p) => {
            setApsX(p.x);
            setApsY(p.y);
            setPickingAps(false);
            setApsPickedNotice({ x: p.x, y: p.y });
            window.setTimeout(() => setApsPickedNotice(null), 4000);
          }}
        />
      )}
      {apsPickedNotice && (
        <div className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-emerald-500/50 bg-emerald-600/95 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          تم تحديث APS من الأطلس: {apsPickedNotice.x}, {apsPickedNotice.y} — احفظ التعديلات
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-400">{label}</span>
      {children}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────
// JSON Import (Phase 1 helper — not the full bulk import system)
// ─────────────────────────────────────────────────────────────

type ImportResult = {
  inserted: number;
  skipped: number;
  errors: { index: number; slug?: string; message: string }[];
};

const EXAMPLE_JSON = `{
  "slug": "jerusalem",
  "kind": "place",
  "name_ar": "القدس",
  "name_en": "Jerusalem",
  "aps_x": 5230,
  "aps_y": 2860,
  "lon": 35.2137,
  "lat": 31.7683,
  "era": "early-islamic",
  "metadata": { "tier": "major_city" }
}`;

function ImportJsonDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);

  const run = async () => {
    setParseErr(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setParseErr("JSON غير صالح: " + (e as Error).message);
      return;
    }
    const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];

    setRunning(true);
    const res: ImportResult = { inserted: 0, skipped: 0, errors: [] };

    for (let i = 0; i < items.length; i++) {
      const raw = items[i] as Record<string, any>;
      try {
        if (!raw || typeof raw !== "object") throw new Error("ليس كائنًا");
        const slug = String(raw.slug ?? "").trim();
        if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) throw new Error("slug مفقود أو غير صالح");
        const kind = String(raw.kind ?? "").trim() as AtlasEntityKind;
        if (!ATLAS_ENTITY_KINDS.includes(kind)) throw new Error("kind مفقود أو غير صالح");
        const name_ar = String(raw.name_ar ?? "").trim();
        if (!name_ar) throw new Error("name_ar مطلوب");

        let aps_x = raw.aps_x;
        let aps_y = raw.aps_y;
        const hasAps = Number.isFinite(aps_x) && Number.isFinite(aps_y);
        const hasGeo = Number.isFinite(raw.lon) && Number.isFinite(raw.lat);
        if (!hasAps && !hasGeo) throw new Error("APS أو lon/lat مطلوب");
        if (!hasAps && hasGeo) {
          const p = geoToAps(Number(raw.lon), Number(raw.lat));
          aps_x = Math.round(p.x);
          aps_y = Math.round(p.y);
        }
        aps_x = Math.round(Number(aps_x));
        aps_y = Math.round(Number(aps_y));
        if (
          aps_x < 0 ||
          aps_x >= ATLAS_V1_PIXEL_SIZE.width ||
          aps_y < 0 ||
          aps_y >= ATLAS_V1_PIXEL_SIZE.height
        ) {
          throw new Error(
            `APS خارج الحدود (${aps_x}, ${aps_y}) — يجب أن يكون ضمن ${ATLAS_V1_PIXEL_SIZE.width}×${ATLAS_V1_PIXEL_SIZE.height}`,
          );
        }

        await createAtlasEntity({
          slug,
          kind,
          name_ar,
          name_en: raw.name_en ? String(raw.name_en).trim() : null,
          aps_x,
          aps_y,
          lon: hasGeo ? Number(raw.lon) : null,
          lat: hasGeo ? Number(raw.lat) : null,
          geo_source: hasGeo ? (hasAps ? "manual" : "geoToAps") : null,
          era: raw.era ? String(raw.era).trim() : null,
          year_start: Number.isFinite(raw.year_start) ? Number(raw.year_start) : null,
          year_end: Number.isFinite(raw.year_end) ? Number(raw.year_end) : null,
          encyclopedia_entity_id: raw.encyclopedia_entity_id || null,
          metadata: raw.metadata ?? null,
        } as any);
        res.inserted += 1;
      } catch (e) {
        res.skipped += 1;
        res.errors.push({
          index: i,
          slug: typeof (items[i] as any)?.slug === "string" ? (items[i] as any).slug : undefined,
          message: (e as Error).message,
        });
      }
    }

    setResult(res);
    setRunning(false);
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-100">
            <Upload className="size-5" /> استيراد كيانات أطلس من JSON
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-800">
            <X className="size-4" />
          </button>
        </div>

        <p className="mb-2 text-xs text-slate-400">
          ألصق كائنًا واحدًا أو مصفوفة كائنات. كل العناصر تُنشأ كـ <b>مسودة غير موثّقة</b>،
          ثم يمكن توثيقها ونشرها من القائمة.
        </p>
        <details className="mb-3 rounded border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-400">
          <summary className="cursor-pointer text-slate-300">عرض مثال</summary>
          <pre dir="ltr" className="mt-2 overflow-x-auto font-mono text-[11px] text-slate-400">
{EXAMPLE_JSON}
          </pre>
        </details>

        <textarea
          dir="ltr"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE_JSON}
          rows={14}
          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-[12px] text-slate-200"
        />

        {parseErr && (
          <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-sm text-rose-200">
            {parseErr}
          </div>
        )}

        {result && (
          <div className="mt-3 space-y-2 rounded border border-slate-700 bg-slate-950 p-3 text-sm">
            <div className="flex gap-4">
              <span className="text-emerald-300">✓ تم الإدخال: {result.inserted}</span>
              <span className="text-amber-300">⤬ تم التخطي: {result.skipped}</span>
            </div>
            {result.errors.length > 0 && (
              <ul className="space-y-1 text-[12px] text-rose-200">
                {result.errors.map((e, i) => (
                  <li key={i} className="font-mono">
                    [#{e.index}{e.slug ? ` ${e.slug}` : ""}] {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            onClick={onClose}
            className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            إغلاق
          </button>
          {result && result.inserted > 0 && (
            <button
              onClick={onDone}
              className="rounded border border-emerald-700 bg-emerald-600/20 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-600/30"
            >
              تحديث القائمة
            </button>
          )}
          <button
            disabled={running || !text.trim()}
            onClick={run}
            className="flex items-center gap-1.5 rounded bg-amber-500 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {running ? <RefreshCw className="size-4 animate-spin" /> : <Upload className="size-4" />}
            تشغيل الاستيراد
          </button>
        </div>
      </div>
    </div>
  );
}

