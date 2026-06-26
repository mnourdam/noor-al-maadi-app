import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Grid3x3, Wand2, Copy, CheckCircle2, AlertTriangle, ChevronLeft, Download,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  generateCrossword,
  buildCrosswordEnvelope,
  validateCrosswordGame,
  normalizeArabicWord,
  explainUnplaced,
  type WordHint,
} from "@/lib/games/crossword-generator";
import type { CrosswordStage } from "@/lib/games/types";

export const Route = createFileRoute("/admin/games/crossword-generator")({
  head: () => ({
    meta: [
      { title: "مولّد الكلمات المتقاطعة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><CrosswordGeneratorPage /></AdminGate>,
});

interface FormState {
  slug: string;
  title: string;
  description: string;
  era: string;
  theme: string;
  stage_title: string;
  difficulty: number;
  estimated_time: number;
  hearts_penalty: number;
  xp: number;
  coins: number;
  max_attempts: number;
  timer_seconds: number;
  rows: number;
  cols: number;
  pairsText: string;
  allowIsolated: boolean;
  requireConnected: boolean;
}

const DEFAULTS: FormState = {
  slug: "crossword-new",
  title: "الكلمات المتقاطعة",
  description: "",
  era: "",
  theme: "",
  stage_title: "",
  difficulty: 2,
  estimated_time: 6,
  hearts_penalty: 1,
  xp: 60,
  coins: 25,
  max_attempts: 3,
  timer_seconds: 240,
  rows: 0,
  cols: 0,
  pairsText: "صلاح_الدين | قائد فتح القدس\nبغداد | عاصمة الخلافة العباسية\nالقاهرة | عاصمة مصر الفاطمية\nحطين | معركة فاصلة سنة 1187",
  allowIsolated: true,
  requireConnected: false,
};

function createCrosswordSlug(): string {
  const time = Date.now().toString(36);
  const perf = Math.round(performance.now() * 1000).toString(36);
  let random = Math.random().toString(36).slice(2, 8);
  try {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    random = bytes[0].toString(36).slice(0, 8);
  } catch { /* Math.random fallback already set */ }
  return `crossword-${time}-${perf}-${random}`;
}

function parsePairs(text: string): WordHint[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.includes("|") ? "|" : line.includes("\t") ? "\t" : "،";
      const [w, ...rest] = line.split(sep);
      return { word: (w ?? "").trim().replace(/_/g, " "), hint: rest.join(sep).trim() };
    })
    .filter((p) => p.word && p.hint);
}

function CrosswordGeneratorPage() {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [stage, setStage] = useState<CrosswordStage | null>(null);
  const [generatedSlug, setGeneratedSlug] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const updateSlug = (v: string) => {
    setGeneratedSlug(v);
    update("slug", v);
  };

  const handleGenerate = () => {
    setErrors([]);
    setWarning(null);
    setStage(null);
    const pairs = parsePairs(form.pairsText);
    if (pairs.length < 2) {
      setErrors(["أدخل كلمتين على الأقل بصيغة:   كلمة | تلميح"]);
      return;
    }
    const result = generateCrossword(pairs, {
      rows: form.rows || undefined,
      cols: form.cols || undefined,
      seed: Date.now() & 0xffff,
      allowIsolated: form.allowIsolated,
      requireConnected: form.requireConnected,
    });
    if (!result.ok) {
      const lines = [
        result.error,
        `حُجم الشبكة المُجرَّب: ${result.attemptedSize}×${result.attemptedSize}`,
        ...result.details.map((d) => `• ${explainUnplaced(d)}`),
      ];
      setErrors(lines);
      return;
    }
    // Always assign a fresh unique slug per generation so each save creates a
    // new record. Keep it in dedicated state so the JSON cannot briefly reuse
    // the previous form slug while React batches stage/form updates.
    const uniqueSlug = createCrosswordSlug();
    console.info("[crossword.trace] generator.generated-slug", {
      slug: uniqueSlug,
      previousFormSlug: form.slug,
    });
    setGeneratedSlug(uniqueSlug);
    setForm((f) => ({ ...f, slug: uniqueSlug }));
    setStage(result.stage);
    if (result.placed !== pairs.length) {
      setWarning(`تم وضع ${result.placed} من أصل ${pairs.length} كلمة على شبكة ${result.gridSize}×${result.gridSize}.`);
    }
  };


  const envelope = useMemo(() => {
    if (!stage) return null;
    const envelopeSlug = generatedSlug ?? form.slug;
    const built = buildCrosswordEnvelope(stage, {
      slug: envelopeSlug,
      title: form.title,
      description: form.description || undefined,
      difficulty: Math.min(5, Math.max(1, form.difficulty)),
      estimated_time: form.estimated_time,
      hearts_penalty: form.hearts_penalty,
      xp: form.xp,
      coins: form.coins,
      era: form.era || undefined,
      theme: form.theme || undefined,
      max_attempts: form.max_attempts,
      timer_seconds: form.timer_seconds,
      stage_title: form.stage_title || undefined,
    });
    console.info("[crossword.trace] generator.json-object", {
      slug: built.slug,
      generatedSlug,
      formSlug: form.slug,
      identical: built.slug === generatedSlug || built.slug === form.slug,
    });
    return built;
  }, [stage, form, generatedSlug]);

  const envelopeJson = useMemo(
    () => (envelope ? JSON.stringify(envelope, null, 2) : ""),
    [envelope],
  );

  const finalIssues = useMemo(
    () => (envelope ? validateCrosswordGame(envelope as any) : []),
    [envelope],
  );

  const copyJson = async () => {
    if (!envelopeJson) return;
    await navigator.clipboard.writeText(envelopeJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadJson = () => {
    if (!envelopeJson) return;
    const blob = new Blob([envelopeJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Grid3x3 className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">مولّد الكلمات المتقاطعة</h1>
              <p className="text-sm text-slate-400">ابنِ شبكة صالحة تلقائيًا من قائمة كلمات وتلميحاتها</p>
            </div>
          </div>
          <Link to="/admin/games/$mode" params={{ mode: "crossword" }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
            <ChevronLeft className="h-3.5 w-3.5" /> إدارة الكلمات المتقاطعة
          </Link>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          {/* Inputs */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold text-amber-200">المدخلات</h2>
            <div className="grid grid-cols-2 gap-2">
                <Field label="المعرف (slug)" value={form.slug} onChange={updateSlug} />
              <Field label="العنوان العام" value={form.title} onChange={(v) => update("title", v)} hint="عام — لا يكشف الإجابات" />
              <Field label="عنوان المرحلة (اختياري)" value={form.stage_title} onChange={(v) => update("stage_title", v)} />
              <Field label="الحقبة" value={form.era} onChange={(v) => update("era", v)} />
              <Field label="الموضوع" value={form.theme} onChange={(v) => update("theme", v)} />
              <NumField label="الصعوبة 1–5" value={form.difficulty} onChange={(v) => update("difficulty", v)} />
              <NumField label="الوقت المتوقع (د)" value={form.estimated_time} onChange={(v) => update("estimated_time", v)} />
              <NumField label="خسارة القلوب" value={form.hearts_penalty} onChange={(v) => update("hearts_penalty", v)} />
              <NumField label="نقاط XP" value={form.xp} onChange={(v) => update("xp", v)} />
              <NumField label="دنانير" value={form.coins} onChange={(v) => update("coins", v)} />
              <NumField label="عدد المحاولات" value={form.max_attempts} onChange={(v) => update("max_attempts", v)} />
              <NumField label="المؤقّت (ث)" value={form.timer_seconds} onChange={(v) => update("timer_seconds", v)} />
              <NumField label="صفوف (اختياري)" value={form.rows} onChange={(v) => update("rows", v)} />
              <NumField label="أعمدة (اختياري)" value={form.cols} onChange={(v) => update("cols", v)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                الكلمات والتلميحات — سطر لكل زوج بصيغة:&nbsp;
                <span className="text-amber-300">كلمة | تلميح</span>
                <span className="text-slate-500"> (استخدم _ بدل المسافة داخل الكلمة)</span>
              </label>
              <textarea
                value={form.pairsText}
                onChange={(e) => update("pairsText", e.target.value)}
                dir="rtl"
                rows={10}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-7 text-slate-200 focus:border-amber-400 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={form.allowIsolated}
                  onChange={(e) => update("allowIsolated", e.target.checked)} />
                السماح بكلمات معزولة (احتياطي)
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={form.requireConnected}
                  onChange={(e) => update("requireConnected", e.target.checked)} />
                اشتراط شبكة متصلة بالكامل
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400">
                <Wand2 className="h-3.5 w-3.5" /> توليد الشبكة
              </button>
              <button onClick={() => { setGeneratedSlug(null); setForm(DEFAULTS); }}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400">
                إعادة تعيين
              </button>
            </div>
            {errors.length > 0 && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
                {errors.map((e, i) => <div key={i} className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{e}</div>)}
              </div>
            )}
            {warning && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">⚠ {warning}</div>
            )}
          </div>

          {/* Preview */}
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold text-amber-200">المعاينة</h2>
            {!stage && <p className="text-xs text-slate-500">اضغط «توليد الشبكة» لعرض النتيجة.</p>}
            {stage && <GridPreview stage={stage} />}
            {stage && (
              <div className="space-y-1 text-xs text-slate-300">
                <p>الشبكة: {stage.rows}×{stage.cols} — {stage.clues.length} كلمة</p>
                {finalIssues.length === 0 ? (
                  <p className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> صالح — يمر بكامل التحقق.</p>
                ) : (
                  <ul className="text-red-300">
                    {finalIssues.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        {envelope && (
          <section className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-amber-200">JSON الناتج</h2>
              <div className="flex gap-2">
                <button onClick={copyJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10">
                  <Copy className="h-3.5 w-3.5" /> {copied ? "تم النسخ" : "نسخ JSON"}
                </button>
                <button onClick={downloadJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400">
                  <Download className="h-3.5 w-3.5" /> تنزيل
                </button>
              </div>
            </div>
            <pre dir="ltr" className="max-h-[420px] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-200">{envelopeJson}</pre>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-400">{label}{hint && <em className="not-italic text-slate-500"> — {hint}</em>}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none" />
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none" />
    </label>
  );
}

function GridPreview({ stage }: { stage: CrosswordStage }) {
  const grid: (string | null)[][] = Array.from({ length: stage.rows }, () => Array(stage.cols).fill(null));
  const numAt: Record<string, number> = {};
  const sorted = [...stage.clues].sort((a, b) => a.row - b.row || a.col - b.col);
  let n = 1;
  for (const c of sorted) {
    const k = `${c.row}-${c.col}`;
    if (!numAt[k]) numAt[k] = n++;
  }
  for (const c of stage.clues) {
    for (let i = 0; i < c.answer.length; i++) {
      const r = c.direction === "down" ? c.row + i : c.row;
      const col = c.direction === "across" ? c.col + i : c.col;
      grid[r][col] = c.answer[i];
    }
  }
  return (
    <div className="overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
      <div className="inline-grid gap-px bg-slate-800"
        style={{ gridTemplateColumns: `repeat(${stage.cols}, 28px)` }}>
        {grid.map((row, r) => row.map((cell, c) => {
          const num = numAt[`${r}-${c}`];
          return (
            <div key={`${r}-${c}`}
              className={`relative grid h-7 w-7 place-items-center text-[13px] font-bold ${
                cell ? "bg-amber-50 text-slate-900" : "bg-slate-900"
              }`}>
              {num && cell && <span className="absolute right-0.5 top-0 text-[8px] font-normal text-slate-600">{num}</span>}
              <span>{cell ?? ""}</span>
            </div>
          );
        }))}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">عدد الحروف المختلفة: {Array.from(new Set(stage.clues.flatMap((c) => c.answer.split("")))).length}</p>
      <p className="sr-only">{normalizeArabicWord("test")}</p>
    </div>
  );
}
