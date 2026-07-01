import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import type { Campaign } from "@/types/campaign";
import { validateCampaign } from "@/lib/campaignStorage";

interface Props {
  draft: Campaign;
  onApply: (next: Campaign) => void;
}

export function JsonMode({ draft, onApply }: Props) {
  const [text, setText] = useState(() => JSON.stringify(draft, null, 2));
  const [issues, setIssues] = useState<{ level: string; message: string }[]>([]);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");

  const parseAndCheck = () => {
    try {
      const parsed = JSON.parse(text);
      // Preserve stable id — never let JSON mode swap the campaign id.
      parsed.id = draft.id;
      const res = validateCampaign(parsed);
      setIssues(res.issues);
      if (res.ok && res.normalized) {
        // Preserve existing chapter/activity ids when the JSON matches by title/order.
        const preserved = mergeStableIds(res.normalized, draft);
        onApply(preserved);
        setStatus("ok");
      } else {
        setStatus("err");
      }
    } catch (e: any) {
      setIssues([{ level: "error", message: `JSON غير صالح: ${e.message}` }]);
      setStatus("err");
    }
  };

  const resetFromDraft = () => {
    setText(JSON.stringify(draft, null, 2));
    setIssues([]);
    setStatus("idle");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={parseAndCheck}
          className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-500/25">
          <Check className="me-1 inline h-3.5 w-3.5" /> تطبيق JSON على المسودة
        </button>
        <button onClick={resetFromDraft}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
          إعادة تحميل من المسودة الحالية
        </button>
        <button onClick={() => navigator.clipboard?.writeText(text)}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
          <Copy className="me-1 inline h-3.5 w-3.5" /> نسخ
        </button>
        {status === "ok" && <span className="text-xs text-emerald-300">تم تطبيق JSON على المسودة بنجاح.</span>}
      </div>

      {issues.length > 0 && (
        <div className={`space-y-1 rounded-lg border p-3 text-xs ${
          issues.some(i => i.level === "error")
            ? "border-red-500/40 bg-red-500/10 text-red-100"
            : "border-amber-500/40 bg-amber-500/10 text-amber-100"
        }`}>
          <div className="mb-1 flex items-center gap-1 font-semibold">
            <AlertTriangle className="h-4 w-4" /> {issues.some(i => i.level === "error") ? "أخطاء" : "تحذيرات"}
          </div>
          <ul className="list-inside list-disc space-y-0.5">
            {issues.map((it, i) => <li key={i}>{it.message}</li>)}
          </ul>
        </div>
      )}

      <textarea value={text} onChange={e => setText(e.target.value)}
        dir="ltr"
        className="h-[520px] w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-amber-400 focus:outline-none"
      />
      <p className="text-[11px] text-slate-500">
        ملاحظة: تعديل JSON لا يغيّر معرّف الحملة أبداً، ويحاول الحفاظ على معرّفات الفصول والأنشطة الموجودة لضمان بقاء تقدّم اللاعبين مرتبطاً بالمحتوى القديم.
      </p>
    </div>
  );
}

/**
 * Preserve existing chapter/activity IDs by matching against the current draft
 * whenever the incoming JSON row lacks a stable id OR provides an id that
 * already exists in the current draft. New rows keep their fresh ids.
 */
function mergeStableIds(incoming: Campaign, current: Campaign): Campaign {
  const currentChaptersById = new Map(current.chapters.map(c => [c.id, c]));
  const currentChaptersByOrder = new Map(current.chapters.map(c => [c.order, c]));

  const chapters = incoming.chapters.map((ch, i) => {
    const match = currentChaptersById.get(ch.id) ?? currentChaptersByOrder.get(ch.order ?? i + 1);
    const chapterId = match?.id ?? ch.id;

    const currentActsById = new Map((match?.activities ?? []).map(a => [a.id, a]));
    const currentActsByPrompt = new Map((match?.activities ?? []).map(a => [a.prompt, a]));
    const activities = ch.activities.map(a => {
      const m = currentActsById.get(a.id) ?? currentActsByPrompt.get(a.prompt);
      return { ...a, id: m?.id ?? a.id };
    });
    return { ...ch, id: chapterId, activities };
  });
  return { ...incoming, chapters };
}
