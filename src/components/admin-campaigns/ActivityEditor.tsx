// ============================================================
// ActivityEditor — visual form for one CampaignActivity.
// Supports every question type used by the player app.
// ============================================================

import { Trash2, ChevronUp, ChevronDown, Copy } from "lucide-react";
import type { CampaignActivity, CampaignQuestionType } from "@/types/campaign";
import { coerceRichText } from "@/lib/campaigns/richText";

const TYPE_LABELS: Record<CampaignQuestionType, string> = {
  reading_then_question: "قراءة ثم سؤال",
  multiple_choice: "اختيار من متعدد",
  true_false: "صح أو خطأ",
  arrange_events: "ترتيب أحداث",
  decision_choice: "قرار تاريخي",
  match_pairs: "مطابقة أزواج",
  fill_blank: "أكمل الفراغ",
  reflection_prompt: "سؤال تأملي",
};

interface Props {
  activity: CampaignActivity;
  index: number;
  total: number;
  onChange: (patch: Partial<CampaignActivity>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  progressCount?: number;
}

const inputCls = "w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 focus:border-amber-400 focus:outline-none";
const labelCls = "block text-[11px] font-semibold text-amber-300/80 mb-1";

export function ActivityEditor({ activity, index, total, onChange, onDelete, onDuplicate, onMove, progressCount }: Props) {
  const a = activity;

  const setOption = (i: number, val: string) => {
    const opts = [...(a.options ?? [])];
    opts[i] = val;
    onChange({ options: opts });
  };
  const addOption = () => onChange({ options: [...(a.options ?? []), ""] });
  const removeOption = (i: number) => onChange({ options: (a.options ?? []).filter((_, j) => j !== i) });

  const setPair = (i: number, key: "left" | "right", val: string) => {
    const pairs = [...(a.pairs ?? [])];
    pairs[i] = { ...pairs[i], [key]: val };
    onChange({ pairs });
  };
  const addPair = () => onChange({ pairs: [...(a.pairs ?? []), { left: "", right: "" }] });
  const removePair = (i: number) => onChange({ pairs: (a.pairs ?? []).filter((_, j) => j !== i) });

  const setOrderItem = (i: number, val: string) => {
    const arr = [...(a.correctOrder ?? [])];
    arr[i] = val;
    onChange({ correctOrder: arr });
  };
  const addOrderItem = () => onChange({ correctOrder: [...(a.correctOrder ?? []), ""] });
  const removeOrderItem = (i: number) => onChange({ correctOrder: (a.correctOrder ?? []).filter((_, j) => j !== i) });

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono">
            {index + 1}
          </span>
          <select
            value={a.type}
            onChange={e => onChange({ type: e.target.value as CampaignQuestionType })}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-amber-200 focus:border-amber-400 focus:outline-none"
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <span className="font-mono text-[10px] text-slate-500">{a.id}</span>
          {progressCount != null && progressCount > 0 && (
            <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
              {progressCount} لاعب أكملوا هذا الفصل
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconBtn onClick={() => onMove(-1)} disabled={index === 0} icon={ChevronUp} />
          <IconBtn onClick={() => onMove(1)} disabled={index === total - 1} icon={ChevronDown} />
          <IconBtn onClick={onDuplicate} icon={Copy} />
          <IconBtn onClick={onDelete} icon={Trash2} danger />
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        <div>
          <label className={labelCls}>نص السؤال / التعليمات</label>
          <textarea value={a.prompt} onChange={e => onChange({ prompt: e.target.value })}
            className={`${inputCls} min-h-[60px]`} />
        </div>

        {(a.type === "reading_then_question" || a.contextText) && (
          <div>
            <label className={labelCls}>نص السياق / القراءة</label>
            <textarea value={coerceRichText(a.contextText)} onChange={e => onChange({ contextText: e.target.value })}
              className={`${inputCls} min-h-[80px]`} />
          </div>
        )}

        {(a.type === "multiple_choice" || a.type === "reading_then_question" || a.type === "decision_choice") && (
          <div>
            <label className={labelCls}>الخيارات</label>
            <div className="space-y-1.5">
              {(a.options ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name={`correct-${a.id}`}
                    checked={a.correctAnswer === i}
                    onChange={() => onChange({ correctAnswer: i })}
                    className="accent-amber-400"
                  />
                  <input value={opt} onChange={e => setOption(i, e.target.value)} className={inputCls} />
                  <IconBtn onClick={() => removeOption(i)} icon={Trash2} danger />
                </div>
              ))}
              <button onClick={addOption} className="rounded-md border border-dashed border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:text-amber-300">
                + إضافة خيار
              </button>
            </div>
          </div>
        )}

        {a.type === "true_false" && (
          <div>
            <label className={labelCls}>الإجابة الصحيحة</label>
            <div className="flex gap-2">
              {["true", "false"].map(v => (
                <button key={v}
                  onClick={() => onChange({ correctAnswer: v === "true" })}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    String(a.correctAnswer) === v
                      ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                      : "border-slate-700 text-slate-400"
                  }`}>
                  {v === "true" ? "صح" : "خطأ"}
                </button>
              ))}
            </div>
          </div>
        )}

        {a.type === "arrange_events" && (
          <div>
            <label className={labelCls}>الترتيب الصحيح (من الأول للأخير)</label>
            <div className="space-y-1.5">
              {(a.correctOrder ?? []).map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 text-center text-xs text-slate-500">{i + 1}</span>
                  <input value={item} onChange={e => setOrderItem(i, e.target.value)} className={inputCls} />
                  <IconBtn onClick={() => removeOrderItem(i)} icon={Trash2} danger />
                </div>
              ))}
              <button onClick={addOrderItem} className="rounded-md border border-dashed border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:text-amber-300">
                + إضافة عنصر
              </button>
            </div>
          </div>
        )}

        {a.type === "match_pairs" && (
          <div>
            <label className={labelCls}>الأزواج (اليسار ↔ اليمين)</label>
            <div className="space-y-1.5">
              {(a.pairs ?? []).map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={p.left} onChange={e => setPair(i, "left", e.target.value)}
                    placeholder="اليسار" className={inputCls} />
                  <span className="text-slate-500">↔</span>
                  <input value={p.right} onChange={e => setPair(i, "right", e.target.value)}
                    placeholder="اليمين" className={inputCls} />
                  <IconBtn onClick={() => removePair(i)} icon={Trash2} danger />
                </div>
              ))}
              <button onClick={addPair} className="rounded-md border border-dashed border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:text-amber-300">
                + إضافة زوج
              </button>
            </div>
          </div>
        )}

        {a.type === "fill_blank" && (
          <div>
            <label className={labelCls}>الإجابة الصحيحة (نص)</label>
            <input value={String(a.correctAnswer ?? "")} onChange={e => onChange({ correctAnswer: e.target.value })} className={inputCls} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>تفسير الإجابة الصحيحة</label>
            <textarea value={a.feedbackCorrect ?? ""} onChange={e => onChange({ feedbackCorrect: e.target.value })}
              className={`${inputCls} min-h-[50px]`} />
          </div>
          <div>
            <label className={labelCls}>تفسير الإجابة الخاطئة</label>
            <textarea value={a.feedbackWrong ?? ""} onChange={e => onChange({ feedbackWrong: e.target.value })}
              className={`${inputCls} min-h-[50px]`} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <NumField label="XP" value={a.xpReward ?? 10} onChange={n => onChange({ xpReward: n })} />
          <NumField label="عملات" value={a.coinsReward ?? 5} onChange={n => onChange({ coinsReward: n })} />
          <NumField label="خصم قلب" value={a.heartsPenalty ?? 1} onChange={n => onChange({ heartsPenalty: n })} />
        </div>

        <div>
          <label className={labelCls}>تلميح (اختياري)</label>
          <input value={a.hint ?? ""} onChange={e => onChange({ hint: e.target.value })} className={inputCls} />
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value) || 0)}
        className={inputCls} />
    </div>
  );
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
