// ============================================================
// CampaignEditor — main studio component.
// Tabs: معلومات / الفصول / JSON / السجل.
// Draft ≠ Published: saving a draft does NOT affect players.
// Only "نشر" bumps content_version and flips the live snapshot.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Save, UploadCloud, Eye, FileDown, FileUp, History,
  ArrowRight, AlertTriangle, CheckCircle2, Sword, Plus, Loader2, Info,
} from "lucide-react";
import type { Campaign, CampaignChapter } from "@/types/campaign";
import {
  fetchAdminCampaign, saveCampaignDraft, publishCampaign,
  fetchCampaignProgressStats, type AdminCampaignRow, type CampaignProgressStats,
} from "@/lib/adminCampaignsApi";
import { validateCampaign, uid } from "@/lib/campaignStorage";
import { ChapterEditor } from "./ChapterEditor";
import { JsonMode } from "./JsonMode";
import { VersionHistory } from "./VersionHistory";
import { KeyArtPanel } from "./KeyArtPanel";

type Tab = "meta" | "chapters" | "json" | "history";
type Toast = { kind: "ok" | "err"; msg: string };

interface Props { campaignId: string }

const inputCls = "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-amber-400 focus:outline-none";
const labelCls = "block text-[11px] font-semibold text-amber-300/80 mb-1";

function normalize(row: AdminCampaignRow): Campaign {
  const src = (row.draft_data ?? row.data ?? {}) as Partial<Campaign>;
  return {
    id: row.id,
    slug: row.slug ?? src.slug,
    title: row.title ?? src.title ?? "بدون عنوان",
    subtitle: src.subtitle,
    description: src.description,
    coverImage: src.coverImage,
    historicalPeriod: src.historicalPeriod,
    era: src.era,
    worldSlug: src.worldSlug,
    difficulty: src.difficulty,
    estimatedDuration: src.estimatedDuration,
    tags: src.tags,
    chronological_order: src.chronological_order,
    sort_year: src.sort_year,
    mapRegion: src.mapRegion,
    category: src.category,
    status: (row.status === "archived" ? "draft" : row.status) as any,
    chapters: Array.isArray(src.chapters) ? src.chapters as CampaignChapter[] : [],
    unlocks: src.unlocks,
    finalRewards: src.finalRewards,
  };
}

export function CampaignEditor({ campaignId }: Props) {
  const navigate = useNavigate();
  const [row, setRow] = useState<AdminCampaignRow | null>(null);
  const [draft, setDraft] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<CampaignProgressStats | null>(null);
  const [tab, setTab] = useState<Tab>("meta");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [dirty, setDirty] = useState(false);
  const savedSnapshot = useRef<string>("");

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const reload = async () => {
    const r = await fetchAdminCampaign(campaignId);
    if (!r) { notify("err", "لم يتم العثور على الحملة."); return; }
    setRow(r);
    const d = normalize(r);
    setDraft(d);
    savedSnapshot.current = JSON.stringify(d);
    setDirty(false);
    fetchCampaignProgressStats(campaignId).then(setStats).catch(() => {});
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [campaignId]);

  useEffect(() => {
    if (!draft) return;
    setDirty(JSON.stringify(draft) !== savedSnapshot.current);
  }, [draft]);

  // Unsaved changes guard
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const setField = <K extends keyof Campaign>(k: K, v: Campaign[K]) =>
    setDraft(d => d ? { ...d, [k]: v } : d);

  const setChapter = (i: number, patch: Partial<CampaignChapter>) =>
    setDraft(d => {
      if (!d) return d;
      const chapters = [...d.chapters];
      chapters[i] = { ...chapters[i], ...patch };
      return { ...d, chapters };
    });

  const addChapter = () => setDraft(d => {
    if (!d) return d;
    const nw: CampaignChapter = {
      id: uid("ch"),
      title: "فصل جديد",
      order: (d.chapters[d.chapters.length - 1]?.order ?? 0) + 1,
      activities: [],
    };
    return { ...d, chapters: [...d.chapters, nw] };
  });

  const deleteChapter = (i: number) => setDraft(d => {
    if (!d) return d;
    return { ...d, chapters: d.chapters.filter((_, j) => j !== i) };
  });

  const duplicateChapter = (i: number) => setDraft(d => {
    if (!d) return d;
    const src = d.chapters[i];
    const copy: CampaignChapter = {
      ...src,
      id: uid("ch"),
      title: `${src.title} (نسخة)`,
      order: src.order + 1,
      activities: src.activities.map(a => ({ ...a, id: uid("act") })),
    };
    const chapters = [...d.chapters];
    chapters.splice(i + 1, 0, copy);
    return { ...d, chapters };
  });

  const moveChapter = (i: number, dir: -1 | 1) => setDraft(d => {
    if (!d) return d;
    const j = i + dir;
    if (j < 0 || j >= d.chapters.length) return d;
    const chapters = [...d.chapters];
    [chapters[i], chapters[j]] = [chapters[j], chapters[i]];
    // Re-number order to reflect new sequence
    chapters.forEach((c, idx) => (c.order = idx + 1));
    return { ...d, chapters };
  });

  const validation = useMemo(() => draft ? validateCampaign(draft) : null, [draft]);

  const saveDraftAction = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await saveCampaignDraft({
        id: draft.id,
        title: draft.title,
        slug: draft.slug ?? null,
        draft,
      });
      savedSnapshot.current = JSON.stringify(draft);
      setDirty(false);
      notify("ok", "تم حفظ المسودة. لن يرى اللاعبون التغييرات حتى النشر.");
      reload();
    } catch (e: any) { notify("err", `فشل الحفظ: ${e.message}`); }
    finally { setBusy(false); }
  };

  const publishAction = async () => {
    if (!draft) return;
    if (validation && !validation.ok) {
      notify("err", "لا يمكن النشر: توجد أخطاء في المسودة. راجع تبويب المعلومات/الفصول.");
      return;
    }
    if (dirty) {
      const ok = confirm("لديك تغييرات غير محفوظة. سيتم حفظها ثم نشرها. متابعة؟");
      if (!ok) return;
      await saveDraftAction();
    }
    if (!confirm("نشر هذه النسخة الآن؟ سيراها اللاعبون فوراً. تقدّم اللاعبين لن يُمس.")) return;
    setBusy(true);
    try {
      const res = await publishCampaign(draft.id);
      notify("ok", `تم النشر بنجاح — النسخة #${res.version}.`);
      reload();
    } catch (e: any) { notify("err", `فشل النشر: ${e.message}`); }
    finally { setBusy(false); }
  };

  const exportJson = () => {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.slug || draft.id}.draft.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      parsed.id = campaignId; // stable id
      const res = validateCampaign(parsed);
      if (!res.ok) {
        notify("err", `JSON غير صالح: ${res.issues[0]?.message ?? "أخطاء متعددة"}`);
        return;
      }
      // preserve existing chapter/activity ids where possible
      if (draft && res.normalized) {
        const currentChapters = new Map(draft.chapters.map(c => [c.id, c]));
        res.normalized.chapters = res.normalized.chapters.map(ch => {
          const existing = currentChapters.get(ch.id);
          if (!existing) return ch;
          const existingActs = new Map(existing.activities.map(a => [a.id, a]));
          return {
            ...ch,
            activities: ch.activities.map(a => existingActs.has(a.id) ? { ...a, id: a.id } : a),
          };
        });
      }
      setDraft(res.normalized ?? null);
      notify("ok", "تم استيراد JSON. لا يزال في المسودة — انشر لتفعيله.");
    } catch (e: any) { notify("err", `تعذّر استيراد الملف: ${e.message}`); }
  };

  const previewDraft = async () => {
    if (dirty) {
      if (!confirm("تحتاج لحفظ المسودة أولاً لمعاينتها. حفظ الآن؟")) return;
      await saveDraftAction();
    }
    window.open(`/campaigns/imported/${campaignId}?preview=draft`, "_blank");
  };
  const previewPublished = () => {
    window.open(`/campaigns/imported/${campaignId}`, "_blank");
  };

  if (!row || !draft) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-slate-400">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" /> جارٍ تحميل الحملة…
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-24 text-slate-100">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 border-b border-amber-500/20 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/admin/campaigns" className="rounded-md border border-slate-700 p-1.5 text-slate-400 hover:text-amber-300">
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Sword className="h-6 w-6 shrink-0 text-amber-400" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <StatusBadge status={row.status} />
                  <span>النسخة #{row.content_version}</span>
                  {row.has_unpublished_changes && (
                    <span className="rounded-md border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-200">
                      تغييرات غير منشورة
                    </span>
                  )}
                  {dirty && <span className="text-amber-300">● تغييرات غير محفوظة</span>}
                </div>
                <h1 className="truncate text-lg font-bold text-amber-100">{draft.title}</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ActionBtn onClick={previewDraft} icon={Eye} label="معاينة المسودة" />
              <ActionBtn onClick={previewPublished} icon={Eye} label="معاينة المنشور" />
              <ActionBtn onClick={exportJson} icon={FileDown} label="تصدير JSON" />
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
                <FileUp className="h-3.5 w-3.5" /> استيراد JSON
                <input type="file" accept="application/json" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
              </label>
              <button onClick={saveDraftAction} disabled={busy || !dirty}
                className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-40">
                <Save className="h-3.5 w-3.5" /> حفظ كمسودة
              </button>
              <button onClick={publishAction} disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40">
                <UploadCloud className="h-3.5 w-3.5" /> نشر الآن
              </button>
            </div>
          </div>
          {stats && stats.total_players > 0 && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100">
              <Info className="h-3 w-3" />
              {stats.total_players} لاعباً بدأوا هذه الحملة · {stats.completed_campaign} أكملوها. تعديل المحتوى لن يمس تقدّمهم.
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-6xl border-t border-slate-800 px-4">
          <div className="flex gap-1 text-xs">
            {([
              ["meta", "معلومات الحملة"],
              ["chapters", `الفصول (${draft.chapters.length})`],
              ["json", "JSON خام"],
              ["history", "سجل النسخ"],
            ] as [Tab, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`border-b-2 px-3 py-2 transition ${
                  tab === k
                    ? "border-amber-400 text-amber-200"
                    : "border-transparent text-slate-400 hover:text-amber-200"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {validation && validation.issues.filter(i => i.level === "error").length > 0 && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
            <div className="mb-1 flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-4 w-4" /> النشر معطّل — راجع الأخطاء التالية:
            </div>
            <ul className="list-inside list-disc space-y-0.5 text-xs">
              {validation.issues.filter(i => i.level === "error").slice(0, 6).map((it, i) => <li key={i}>{it.message}</li>)}
            </ul>
          </div>
        )}

        {tab === "meta" && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <MetaField label="العنوان" value={draft.title} onChange={v => setField("title", v)} />
            <MetaField label="Slug" value={draft.slug ?? ""} onChange={v => setField("slug", v || undefined)} />
            <MetaField label="العنوان الفرعي" value={draft.subtitle ?? ""} onChange={v => setField("subtitle", v || undefined)} />
            <MetaField label="الحقبة (era)" value={draft.era ?? ""} onChange={v => setField("era", v || undefined)} />
            <MetaField label="الفترة التاريخية" value={draft.historicalPeriod ?? ""} onChange={v => setField("historicalPeriod", v || undefined)} />
            <MetaField label="World Slug" value={draft.worldSlug ?? ""} onChange={v => setField("worldSlug", v || undefined)} />
            <MetaField label="الترتيب الزمني (رقم)" type="number" value={draft.chronological_order ?? ""}
              onChange={v => setField("chronological_order", v === "" ? undefined : Number(v))} />
            <MetaField label="سنة الفرز (Hijri)" type="number" value={draft.sort_year ?? ""}
              onChange={v => setField("sort_year", v === "" ? undefined : Number(v))} />
            <div>
              <label className={labelCls}>الصعوبة</label>
              <select value={draft.difficulty ?? ""} onChange={e => setField("difficulty", (e.target.value || undefined) as any)}
                className={inputCls}>
                <option value="">— اختر —</option>
                <option value="easy">سهلة</option>
                <option value="medium">متوسطة</option>
                <option value="hard">صعبة</option>
                <option value="legendary">أسطورية</option>
              </select>
            </div>
            <MetaField label="المدة التقديرية" value={draft.estimatedDuration ?? ""} onChange={v => setField("estimatedDuration", v || undefined)} />
            <MetaField label="صورة الغلاف (URL)" value={draft.coverImage ?? ""} onChange={v => setField("coverImage", v || undefined)} />
            <MetaField label="Map Region" value={draft.mapRegion ?? ""} onChange={v => setField("mapRegion", v || undefined)} />
            <div className="md:col-span-2">
              <label className={labelCls}>الوصف</label>
              <textarea value={draft.description ?? ""} onChange={e => setField("description", e.target.value)}
                className={`${inputCls} min-h-[100px]`} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>عناصر يفتحها إكمال الحملة (مفصولة بفواصل)</label>
              <input value={(draft.unlocks ?? []).join(", ")}
                onChange={e => setField("unlocks", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                className={inputCls} />
            </div>
            <div className="md:col-span-2 grid grid-cols-2 gap-2">
              <MetaField label="مكافأة نهائية — XP" type="number"
                value={draft.finalRewards?.xp ?? 0}
                onChange={v => setField("finalRewards", { ...draft.finalRewards, xp: Number(v) || 0 })} />
              <MetaField label="مكافأة نهائية — عملات" type="number"
                value={draft.finalRewards?.coins ?? 0}
                onChange={v => setField("finalRewards", { ...draft.finalRewards, coins: Number(v) || 0 })} />
            </div>
            <KeyArtPanel campaignId={draft.id} title={draft.title} onNotify={notify} />
          </div>
        )}

        {tab === "chapters" && (
          <div className="space-y-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                إضافة/تعديل/حذف/ترتيب الفصول. معرّفات الفصول والأنشطة ثابتة — تعديل المحتوى لا يُلغي تقدّم اللاعبين.
              </p>
              <button onClick={addChapter}
                className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-100 hover:bg-amber-500/25">
                <Plus className="h-3.5 w-3.5" /> فصل جديد
              </button>
            </div>
            {draft.chapters.map((ch, i) => (
              <ChapterEditor
                key={ch.id}
                chapter={ch}
                index={i}
                total={draft.chapters.length}
                progressCount={stats?.per_chapter_completed?.[ch.id]}
                onChange={p => setChapter(i, p)}
                onDelete={() => deleteChapter(i)}
                onDuplicate={() => duplicateChapter(i)}
                onMove={dir => moveChapter(i, dir)}
              />
            ))}
            {draft.chapters.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
                لا توجد فصول. أضف فصلاً لبدء بناء الحملة.
              </p>
            )}
          </div>
        )}

        {tab === "json" && (
          <JsonMode draft={draft} onApply={next => setDraft(next)} />
        )}

        {tab === "history" && (
          <VersionHistory campaignId={campaignId} onRestored={() => reload()} />
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2 text-sm shadow-xl ${
          toast.kind === "ok"
            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
            : "border-red-400/40 bg-red-500/15 text-red-100"
        }`}>
          {toast.kind === "ok"
            ? <CheckCircle2 className="me-1 inline h-4 w-4" />
            : <AlertTriangle className="me-1 inline h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function MetaField({ label, value, onChange, type = "text" }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
    </div>
  );
}

function ActionBtn({ onClick, icon: Icon, label }: { onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "published" ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30"
    : status === "archived" ? "bg-slate-500/15 text-slate-300 border-slate-500/30"
    : "bg-amber-500/15 text-amber-200 border-amber-400/30";
  const label = status === "published" ? "منشورة" : status === "archived" ? "مؤرشفة" : "مسودة";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>{label}</span>;
}
