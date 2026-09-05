// ============================================================
// ChapterEditor — visual form for one CampaignChapter.
// ============================================================

import { useState } from "react";
import { ChevronUp, ChevronDown, Copy, Trash2, Plus, ChevronRight, AlertTriangle } from "lucide-react";
import type { CampaignChapter, CampaignActivity, CampaignQuestionType } from "@/types/campaign";
import { ACTIVITY_DEFAULTS } from "@/types/campaign";
import { ActivityEditor } from "./ActivityEditor";
import { uid } from "@/lib/campaignStorage";
import { uploadChapterImage, removeChapterImageObject } from "@/lib/campaign-chapter-image";

interface Props {
  chapter: CampaignChapter;
  index: number;
  total: number;
  progressCount?: number;
  onChange: (patch: Partial<CampaignChapter>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}

const inputCls = "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-amber-400 focus:outline-none";
const labelCls = "block text-[11px] font-semibold text-amber-300/80 mb-1";

export function ChapterEditor({ chapter, index, total, progressCount, onChange, onDelete, onDuplicate, onMove }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  const pickChapterImage = async (file: File | null) => {
    if (!file) return;
    setImgBusy(true);
    setImgError(null);
    try {
      const url = await uploadChapterImage(chapter.id, file, chapter.imageUrl ?? null);
      onChange({ imageUrl: url });
    } catch (err) {
      setImgError(err instanceof Error ? err.message : "فشل رفع صورة الفصل.");
    } finally {
      setImgBusy(false);
    }
  };

  const removeChapterImage = async () => {
    if (!chapter.imageUrl) return;
    if (!confirm("حذف صورة هذا الفصل؟")) return;
    setImgBusy(true);
    setImgError(null);
    const prev = chapter.imageUrl;
    onChange({ imageUrl: undefined });
    try {
      await removeChapterImageObject(prev);
    } catch { /* ignore — the field is already cleared */ }
    setImgBusy(false);
  };


  const setActivity = (i: number, patch: Partial<CampaignActivity>) => {
    const list = [...chapter.activities];
    list[i] = { ...list[i], ...patch };
    onChange({ activities: list });
  };

  const addActivity = (type: CampaignQuestionType = "multiple_choice") => {
    const nw: CampaignActivity = {
      id: uid("act"),
      type,
      prompt: "",
      options: type === "multiple_choice" ? ["", ""] : undefined,
      xpReward: ACTIVITY_DEFAULTS.xpReward,
      coinsReward: ACTIVITY_DEFAULTS.coinsReward,
      heartsPenalty: ACTIVITY_DEFAULTS.heartsPenalty,
    };
    onChange({ activities: [...chapter.activities, nw] });
  };

  const removeActivity = (i: number) => {
    if (!confirm("حذف هذا النشاط؟ الحذف نهائي لهذه المسودة.")) return;
    onChange({ activities: chapter.activities.filter((_, j) => j !== i) });
  };

  const duplicateActivity = (i: number) => {
    const src = chapter.activities[i];
    const copy = { ...src, id: uid("act") };
    const list = [...chapter.activities];
    list.splice(i + 1, 0, copy);
    onChange({ activities: list });
  };

  const moveActivity = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= chapter.activities.length) return;
    const list = [...chapter.activities];
    [list[i], list[j]] = [list[j], list[i]];
    onChange({ activities: list });
  };

  const handleDelete = () => {
    if (progressCount && progressCount > 0) {
      const ok = confirm(
        `تحذير: ${progressCount} لاعباً/لاعبةً أكملوا هذا الفصل بالفعل.\n` +
        `سيبقى تقدّمهم محفوظاً، لكن الفصل لن يظهر لهم بعد الآن.\n\n` +
        `هل تريد حذف الفصل من المسودة؟`
      );
      if (!ok) return;
    } else if (!confirm(`حذف الفصل "${chapter.title}"؟`)) {
      return;
    }
    onDelete();
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex items-center justify-between gap-2 p-3">
        <button onClick={() => setExpanded(x => !x)} className="flex min-w-0 items-center gap-2 text-right">
          <ChevronRight className={`h-4 w-4 text-amber-400 transition ${expanded ? "rotate-90" : ""}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span>فصل {index + 1}</span>
              <span className="font-mono">{chapter.id}</span>
              {progressCount != null && progressCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200">
                  <AlertTriangle className="h-3 w-3" /> {progressCount} أكمل
                </span>
              )}
            </div>
            <div className="truncate text-sm font-semibold text-amber-100">
              {chapter.title || "بدون عنوان"}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500">{chapter.activities.length} نشاط</span>
          <IconBtn onClick={() => onMove(-1)} disabled={index === 0} icon={ChevronUp} />
          <IconBtn onClick={() => onMove(1)} disabled={index === total - 1} icon={ChevronDown} />
          <IconBtn onClick={onDuplicate} icon={Copy} />
          <IconBtn onClick={handleDelete} icon={Trash2} danger />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-800 p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={labelCls}>العنوان</label>
              <input value={chapter.title} onChange={e => onChange({ title: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>العنوان الفرعي</label>
              <input value={chapter.subtitle ?? ""} onChange={e => onChange({ subtitle: e.target.value })} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>المقدمة (introText)</label>
              <textarea value={chapter.introText ?? ""} onChange={e => onChange({ introText: e.target.value })}
                className={`${inputCls} min-h-[70px]`} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>نص القراءة التاريخية (historicalReadingText)</label>
              <textarea value={chapter.historicalReadingText ?? ""} onChange={e => onChange({ historicalReadingText: e.target.value })}
                className={`${inputCls} min-h-[100px]`} />
            </div>
            <div>
            <div className="md:col-span-2">
              <label className={labelCls}>صورة الفصل (اختيارية — صورة واحدة)</label>
              <div className="flex flex-wrap items-center gap-2">
                {chapter.imageUrl ? (
                  <img
                    src={chapter.imageUrl}
                    alt=""
                    className="h-20 w-32 rounded-md border border-slate-700 object-cover"
                  />
                ) : (
                  <div className="grid h-20 w-32 place-items-center rounded-md border border-dashed border-slate-700 text-[10px] text-slate-500">
                    لا توجد صورة
                  </div>
                )}
                <label className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-bold ${imgBusy ? "cursor-not-allowed border-slate-700 text-slate-400 opacity-50" : "border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"}`}>
                  {imgBusy ? "جارٍ الرفع…" : chapter.imageUrl ? "استبدال الصورة" : "رفع صورة"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={imgBusy}
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null;
                      e.currentTarget.value = "";
                      void pickChapterImage(f);
                    }}
                  />
                </label>
                {chapter.imageUrl && (
                  <button
                    type="button"
                    disabled={imgBusy}
                    onClick={() => void removeChapterImage()}
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    حذف الصورة
                  </button>
                )}
              </div>
              {imgError && <p className="mt-1 text-[11px] text-red-300">{imgError}</p>}
            </div>
            <div>
              <label className={labelCls}>الترتيب (order)</label>
              <input type="number" value={chapter.order}
                onChange={e => onChange({ order: Number(e.target.value) || 0 })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>يتطلب فصلاً سابقاً (id)</label>
              <input value={chapter.unlockRequirement ?? ""}
                onChange={e => onChange({ unlockRequirement: e.target.value || undefined })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>مكافأة الفصل — XP</label>
              <input type="number" value={chapter.rewards?.xp ?? 0}
                onChange={e => onChange({ rewards: { ...chapter.rewards, xp: Number(e.target.value) || 0 } })}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>مكافأة الفصل — عملات</label>
              <input type="number" value={chapter.rewards?.coins ?? 0}
                onChange={e => onChange({ rewards: { ...chapter.rewards, coins: Number(e.target.value) || 0 } })}
                className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>عناصر المتحف التي يفتحها الفصل (مفصولة بفواصل)</label>
              <input
                value={(chapter.rewards?.unlocks ?? []).join(", ")}
                onChange={e => onChange({
                  rewards: {
                    ...chapter.rewards,
                    unlocks: e.target.value.split(",").map(s => s.trim()).filter(Boolean),
                  },
                })}
                className={inputCls}
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-amber-100">الأنشطة ({chapter.activities.length})</h4>
              <div className="flex gap-1">
                {(["multiple_choice", "true_false", "reading_then_question", "arrange_events", "match_pairs", "fill_blank", "decision_choice", "reflection_prompt"] as CampaignQuestionType[]).map(t => (
                  <button key={t} onClick={() => addActivity(t)}
                    className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:border-amber-400 hover:text-amber-300">
                    <Plus className="me-1 inline h-3 w-3" />
                    {shortTypeLabel(t)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {chapter.activities.map((a, i) => (
                <ActivityEditor
                  key={a.id}
                  activity={a}
                  index={i}
                  total={chapter.activities.length}
                  onChange={p => setActivity(i, p)}
                  onDelete={() => removeActivity(i)}
                  onDuplicate={() => duplicateActivity(i)}
                  onMove={dir => moveActivity(i, dir)}
                />
              ))}
              {chapter.activities.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-3 text-center text-xs text-slate-500">
                  لا توجد أنشطة بعد. أضف نشاطاً من الأعلى.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function shortTypeLabel(t: CampaignQuestionType): string {
  return {
    reading_then_question: "قراءة",
    multiple_choice: "اختيار",
    true_false: "صح/خطأ",
    arrange_events: "ترتيب",
    decision_choice: "قرار",
    match_pairs: "أزواج",
    fill_blank: "فراغ",
    reflection_prompt: "تأملي",
  }[t];
}

function IconBtn({ onClick, icon: Icon, disabled, danger }: {
  onClick: () => void; icon: any; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-md border p-1.5 transition disabled:opacity-30 ${
        danger
          ? "border-red-400/30 text-red-300 hover:bg-red-500/10"
          : "border-slate-700 text-slate-400 hover:border-amber-400/40 hover:text-amber-300"
      }`}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
