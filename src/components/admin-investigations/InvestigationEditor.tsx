// ============================================================
// Phase C — Structured Investigation Editor.
//
// Loads the row via admin_get_investigation_full, exposes a
// structured Arabic RTL editor for General / Steps / Rewards /
// Related Entities, validates client-side, and saves through the
// transactional import RPC (admin_run_import_batch). There is no
// direct-write fallback: if the RPC fails, the save fails.
// ============================================================
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Save, PlayCircle, RotateCcw, Eye, AlertTriangle,
  Trash2, Copy, Plus, ChevronUp, ChevronDown, CheckCircle2, Info, Loader2, ExternalLink,
} from "lucide-react";
import { Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizeInvestigationRow,
  normalizeRelatedEntities,
} from "@/lib/investigations-normalize";
import { scoreInvestigation } from "@/lib/import/quality";
import { buildInvestigationRelationReport } from "@/lib/import/relations-report";
import {
  buildInvestigationEditorPlan,
  dryRunInvestigationEditor,
  commitInvestigationEditor,
  type RunResult,
} from "@/lib/investigations/editor-plan";
import { canonicalJSON } from "@/lib/import/plan";

// ---------------- Types ----------------

type StepType = "briefing" | "evidence" | "question" | "decision" | "conclusion";
interface Step {
  id: string;
  type: StepType;
  title?: string;
  text?: string;
  prompt?: string;
  options?: string[];
  correctAnswer?: number;
  explanation?: string;
  /** UI-only: true when the step existed on the server row we loaded. */
  __persisted?: boolean;
}
interface Reward {
  xp?: number;
  dinars?: number;
  hearts?: number;
  badge?: string;
  artifact?: string;
}
interface EditorState {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  difficulty: string;
  enabled: boolean;
  reward: Reward;
  steps: Step[];
  related: string[];
  updated_at: string | null;
}

const STEP_TYPES: { key: StepType; label: string }[] = [
  { key: "briefing",   label: "تمهيد" },
  { key: "evidence",   label: "دليل" },
  { key: "question",   label: "سؤال" },
  { key: "decision",   label: "قرار" },
  { key: "conclusion", label: "خلاصة" },
];
const STEP_LABEL: Record<StepType, string> = Object.fromEntries(
  STEP_TYPES.map((s) => [s.key, s.label]),
) as any;

const DIFFICULTIES = [
  { v: "easy", l: "سهل" },
  { v: "medium", l: "متوسط" },
  { v: "hard", l: "صعب" },
];

// ---------------- Helpers ----------------

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "s_" + Math.random().toString(36).slice(2, 10);
}

function stepSummary(s: Step): string {
  const src = s.text || s.prompt || s.title || "";
  return src.trim().slice(0, 90) || "—";
}

function coerceReward(raw: any): Reward {
  const src = (raw && typeof raw === "object") ? raw : {};
  const r: Reward = {};
  if (typeof src.xp === "number") r.xp = src.xp;
  if (typeof src.dinars === "number") r.dinars = src.dinars;
  if (typeof src.hearts === "number") r.hearts = src.hearts;
  if (typeof src.badge === "string" && src.badge.trim()) r.badge = src.badge.trim();
  if (typeof src.artifact === "string" && src.artifact.trim()) r.artifact = src.artifact.trim();
  return r;
}

function toEditorState(raw: any): EditorState {
  const norm = normalizeInvestigationRow(raw ?? {}).data as any;
  const rawSteps: any[] = Array.isArray(norm.steps) ? norm.steps : [];
  const steps: Step[] = rawSteps.map((s) => ({
    id: (typeof s?.id === "string" && s.id) || newId(),
    type: (s?.type as StepType) ?? "briefing",
    title: typeof s?.title === "string" ? s.title : undefined,
    text: typeof s?.text === "string" ? s.text : undefined,
    prompt: typeof s?.prompt === "string" ? s.prompt : undefined,
    options: Array.isArray(s?.options) ? s.options.map((o: any) => String(o ?? "")) : undefined,
    correctAnswer: typeof s?.correctAnswer === "number" ? s.correctAnswer : undefined,
    explanation: typeof s?.explanation === "string" ? s.explanation : undefined,
    __persisted: true,
  }));
  return {
    id: String(norm.id),
    slug: String(norm.slug),
    title: String(norm.title ?? ""),
    subtitle: typeof norm.subtitle === "string" ? norm.subtitle : "",
    description: typeof norm.description === "string" ? norm.description : "",
    difficulty: typeof norm.difficulty === "string" ? norm.difficulty : "easy",
    enabled: norm.enabled !== false,
    reward: coerceReward(norm.reward),
    steps,
    related: Array.isArray(norm.related_entities) ? norm.related_entities.map(String) : [],
    updated_at: typeof norm.updated_at === "string" ? norm.updated_at : null,
  };
}

/** Strip UI-only fields and produce the DB-shape row. */
function toPersistedShape(s: EditorState): Record<string, unknown> {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title.trim(),
    subtitle: s.subtitle.trim() || null,
    description: s.description.trim() || null,
    difficulty: s.difficulty || "easy",
    enabled: !!s.enabled,
    reward: s.reward as any,
    steps: s.steps.map((st) => {
      const out: any = { id: st.id, type: st.type };
      if (st.title !== undefined) out.title = st.title;
      if (st.text !== undefined) out.text = st.text;
      if (st.prompt !== undefined) out.prompt = st.prompt;
      if (st.options !== undefined) out.options = st.options;
      if (st.correctAnswer !== undefined) out.correctAnswer = st.correctAnswer;
      if (st.explanation !== undefined) out.explanation = st.explanation;
      return out;
    }),
    related_entities: s.related.slice(),
  };
}

// ---------------- Client-side validation ----------------

interface Validation {
  blockers: string[];
  warnings: string[];
}
function validate(state: EditorState, raw: any): Validation {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!state.title.trim()) blockers.push("العنوان مطلوب.");
  if (state.steps.length === 0) blockers.push("يجب أن يحتوي التحقيق على خطوة واحدة على الأقل.");

  const ids = new Set<string>();
  state.steps.forEach((s, i) => {
    if (!s.id) blockers.push(`الخطوة #${i + 1}: معرّف مفقود.`);
    else if (ids.has(s.id)) blockers.push(`الخطوة #${i + 1}: معرّف مكرر (${s.id}).`);
    ids.add(s.id);

    if (s.type === "briefing" || s.type === "evidence" || s.type === "conclusion") {
      if (!s.text || !s.text.trim()) blockers.push(`الخطوة #${i + 1} (${STEP_LABEL[s.type]}): النص مطلوب.`);
    }
    if (s.type === "question" || s.type === "decision") {
      if (!s.prompt || !s.prompt.trim()) blockers.push(`الخطوة #${i + 1} (${STEP_LABEL[s.type]}): السؤال مطلوب.`);
      const opts = s.options ?? [];
      if (opts.length < 2) blockers.push(`الخطوة #${i + 1}: يجب توفير خيارين على الأقل.`);
      const trimmed = opts.map((o) => (o ?? "").trim());
      if (trimmed.some((o) => !o)) blockers.push(`الخطوة #${i + 1}: يوجد خيار فارغ.`);
      const dup = new Set<string>();
      for (const o of trimmed) {
        if (o && dup.has(o)) { blockers.push(`الخطوة #${i + 1}: خيارات مكررة.`); break; }
        dup.add(o);
      }
      if (s.type === "question") {
        if (typeof s.correctAnswer !== "number" || s.correctAnswer < 0 || s.correctAnswer >= opts.length) {
          blockers.push(`الخطوة #${i + 1}: يجب تحديد إجابة صحيحة صالحة.`);
        } else {
          const ans = trimmed[s.correctAnswer]?.toLowerCase() ?? "";
          const pr = (s.prompt ?? "").toLowerCase();
          if (ans.length > 3 && pr.includes(ans)) warnings.push(`الخطوة #${i + 1}: نص السؤال يبدو أنه يكشف الإجابة.`);
        }
      }
    }
  });

  // Reward validation
  const r = state.reward;
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "number" && v < 0) blockers.push(`المكافأة ${k} لا يمكن أن تكون سالبة.`);
    if (typeof v === "number" && v > 10000) warnings.push(`المكافأة ${k} تبدو مرتفعة (${v}).`);
  }

  // Legacy coins conflict (from raw)
  const rawReward = (raw?.reward ?? {}) as any;
  if (
    typeof rawReward.coins === "number" &&
    typeof rawReward.dinars === "number" &&
    rawReward.coins !== rawReward.dinars
  ) {
    blockers.push(`تعارض في المكافأة القديمة: coins=${rawReward.coins} ≠ dinars=${rawReward.dinars}. عدّل قيمة الدنانير يدوياً لإكمال الحفظ.`);
  }

  // Related entities: canonical strings only
  const relInvalid = state.related.filter((r) => !/^([a-z0-9_-]+:)?[a-z0-9_-]+$/i.test(r.trim()));
  if (relInvalid.length) warnings.push(`علاقات بصيغة غير قياسية: ${relInvalid.slice(0, 3).join("، ")}${relInvalid.length > 3 ? "…" : ""}.`);
  const relDup = state.related.filter((r, i, a) => a.indexOf(r) !== i);
  if (relDup.length) warnings.push(`علاقات مكررة: ${Array.from(new Set(relDup)).join("، ")}.`);

  return { blockers, warnings };
}

// ============================================================
// Component
// ============================================================
export function InvestigationEditor({ investigationId }: { investigationId: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rawRow, setRawRow] = useState<any | null>(null);
  const [initialState, setInitialState] = useState<EditorState | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState<null | "dry" | "save">(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err" | "info"; msg: string } | null>(null);
  const [dryReport, setDryReport] = useState<RunResult | null>(null);
  const [dryHash, setDryHash] = useState<string | null>(null);
  const [removalApproved, setRemovalApproved] = useState(false);
  /** Stable step ID pending removal — resolved to a current index at confirm
   * time so reorders between open and confirm cannot target the wrong step. */
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [showLocalPreview, setShowLocalPreview] = useState(false);
  const notifyRef = useRef<number | null>(null);

  const notify = (kind: "ok" | "err" | "info", msg: string) => {
    setToast({ kind, msg });
    if (notifyRef.current) window.clearTimeout(notifyRef.current);
    notifyRef.current = window.setTimeout(() => setToast(null), 3800);
  };

  // ---- Load ----
  const load = useCallback(async () => {
    setLoading(true); setLoadError(null); setDryReport(null); setDryHash(null);
    try {
      const { data, error } = await supabase.rpc("admin_get_investigation_full" as any, {
        p_id_or_slug: investigationId,
      });
      if (error) throw error;
      if (!data) { setLoadError("التحقيق غير موجود."); setLoading(false); return; }
      setRawRow(data);
      const s = toEditorState(data);
      setInitialState(s);
      setState(s);
    } catch (e: any) {
      setLoadError(e?.message ?? "تعذّر تحميل التحقيق.");
    } finally {
      setLoading(false);
    }
  }, [investigationId]);
  useEffect(() => { load(); }, [load]);

  // ---- Dirty tracking ----
  const dirty = useMemo(() => {
    if (!initialState || !state) return false;
    return canonicalJSON(toPersistedShape(initialState)) !== canonicalJSON(toPersistedShape(state));
  }, [initialState, state]);

  // Invalidate any dry-run when state changes or removal approval flips.
  useEffect(() => {
    setDryReport(null);
    setDryHash(null);
  }, [state, removalApproved]);

  // Unsaved-change protection covers ALL navigation paths:
  //  • internal <Link> / programmatic navigate()
  //  • browser back / forward (router history)
  //  • Android hardware back — AndroidBackHandler calls
  //    router.history.back(), which TanStack Router routes through the
  //    same blocker registry.
  //  • hard reload / tab close via enableBeforeUnload.
  // A clean editor produces no prompt; a dirty editor renders the
  // Arabic resolver dialog below.
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });

  // ---- Validation, quality, relations ----
  const validation = useMemo(
    () => state ? validate(state, rawRow) : { blockers: [], warnings: [] },
    [state, rawRow],
  );
  const quality = useMemo(
    () => state ? scoreInvestigation({
      slug: state.slug, title: state.title, description: state.description,
      reward: state.reward as any,
      steps: state.steps as any,
      related_entities: state.related,
    }) : null,
    [state],
  );
  const relationReport = useMemo(
    () => state ? buildInvestigationRelationReport({ related_entities: state.related }, true) : null,
    [state],
  );

  // Detect removals vs. initial (persisted) set.
  const removed = useMemo(() => {
    if (!initialState || !state) return [];
    const nowIds = new Set(state.steps.map((s) => s.id));
    return initialState.steps.filter((s) => !nowIds.has(s.id));
  }, [initialState, state]);
  const removalPending = removed.length > 0 && !removalApproved;

  // ---- Actions ----
  const setStep = (idx: number, patch: Partial<Step>) => setState((s) => {
    if (!s) return s;
    const next = s.steps.slice();
    next[idx] = { ...next[idx], ...patch };
    return { ...s, steps: next };
  });
  const move = (idx: number, delta: -1 | 1) => setState((s) => {
    if (!s) return s;
    const j = idx + delta;
    if (j < 0 || j >= s.steps.length) return s;
    const next = s.steps.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    return { ...s, steps: next };
  });
  const addStep = (type: StepType) => setState((s) => {
    if (!s) return s;
    const st: Step = { id: newId(), type, __persisted: false };
    if (type === "briefing" || type === "evidence" || type === "conclusion") st.text = "";
    if (type === "question" || type === "decision") {
      st.prompt = ""; st.options = ["", ""]; if (type === "question") st.correctAnswer = 0;
    }
    return { ...s, steps: [...s.steps, st] };
  });
  const duplicateStep = (idx: number) => setState((s) => {
    if (!s) return s;
    const src = s.steps[idx];
    const copy: Step = { ...src, id: newId(), __persisted: false, options: src.options ? [...src.options] : undefined };
    const next = s.steps.slice();
    next.splice(idx + 1, 0, copy);
    return { ...s, steps: next };
  });
  const removeStep = (idx: number) => {
    if (!state) return;
    const target = state.steps[idx];
    if (!target) return;
    // Newly-added (not persisted) → no destructive approval required.
    if (!target.__persisted) {
      setState((s) => {
        if (!s) return s;
        const next = s.steps.slice();
        next.splice(idx, 1);
        return { ...s, steps: next };
      });
      return;
    }
    // Persisted → require dialog approval, keyed by stable step id so
    // reorders between "open" and "confirm" cannot target the wrong row.
    setPendingRemoveId(target.id);
  };

  const confirmRemoval = () => {
    const targetId = pendingRemoveId;
    if (!targetId) { setPendingRemoveId(null); return; }
    setState((s) => {
      if (!s) return s;
      const idx = s.steps.findIndex((st) => st.id === targetId);
      if (idx < 0) return s;
      const next = s.steps.slice();
      next.splice(idx, 1);
      return { ...s, steps: next };
    });
    setPendingRemoveId(null);
    setRemovalApproved(true);
    notify("info", "تم تسجيل موافقة الحذف. يجب تشغيل التشغيل التجريبي مجدداً قبل الحفظ.");
  };

  const resetLocal = () => {
    if (!initialState) return;
    if (dirty && !confirm("سيتم تجاهل جميع التغييرات المحلية. المتابعة؟")) return;
    setState(initialState);
    setRemovalApproved(false);
  };

  const goBack = () => {
    // The `useBlocker` resolver above prompts on dirty state — no need
    // for a second confirm() here. A clean editor navigates immediately.
    navigate({ to: "/admin/investigations", search: {} });
  };

  // ---- Dry-run ----
  const runDry = async () => {
    if (!state || !initialState) return;
    if (validation.blockers.length) { notify("err", "أصلح مشاكل التحقق قبل التشغيل التجريبي."); return; }
    if (removalPending) { notify("err", "يوجد حذف يتطلب موافقة صريحة."); return; }
    setBusy("dry"); setDryReport(null); setDryHash(null);
    try {
      const { plan, planHash } = buildInvestigationEditorPlan({
        id: state.id, slug: state.slug,
        draft: toPersistedShape(state),
        versionSignal: initialState.updated_at,
        allowRemovals: removed.length > 0 && removalApproved,
      });
      const res = await dryRunInvestigationEditor(plan);
      setDryReport(res);
      if (res.ok) { setDryHash(planHash); notify("ok", "نجح التشغيل التجريبي — يمكن الحفظ الآن."); }
      else if (res.stale) notify("err", "قام مشرف آخر بتحديث التحقيق. أعِد التحميل قبل المتابعة.");
      else notify("err", res.error ?? "فشل التشغيل التجريبي.");
    } catch (e: any) {
      notify("err", e?.message ?? "خطأ في التشغيل التجريبي.");
    } finally { setBusy(null); }
  };

  // ---- Commit ----
  const runSave = async () => {
    if (!state || !initialState) return;
    if (validation.blockers.length) { notify("err", "أصلح مشاكل التحقق أولاً."); return; }
    if (removalPending) { notify("err", "يوجد حذف يتطلب موافقة صريحة."); return; }
    const { plan, planHash } = buildInvestigationEditorPlan({
      id: state.id, slug: state.slug,
      draft: toPersistedShape(state),
      versionSignal: initialState.updated_at,
      allowRemovals: removed.length > 0 && removalApproved,
    });
    if (!dryHash || dryHash !== planHash) {
      notify("err", "تغيّرت الخطة منذ آخر تشغيل تجريبي. شغّل التشغيل التجريبي مجدداً.");
      return;
    }
    setBusy("save");
    try {
      const res = await commitInvestigationEditor(plan);
      if (!res.ok) {
        if (res.stale) notify("err", "قام مشرف آخر بتحديث التحقيق. أعِد التحميل قبل المتابعة.");
        else notify("err", res.error ?? "فشل الحفظ داخل معاملة الخادم.");
        return;
      }
      notify("ok", "تم حفظ التحقيق بنجاح.");
      // Refresh authoritative row.
      await load();
      setRemovalApproved(false);
    } catch (e: any) {
      notify("err", e?.message ?? "فشل الحفظ.");
    } finally { setBusy(null); }
  };

  // ---- Render ----
  if (loading) return <Shell><div className="p-10 text-center text-slate-400">جارٍ التحميل…</div></Shell>;
  if (loadError) return (
    <Shell>
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-100">
        <div className="font-semibold">تعذّر التحميل</div>
        <div className="mt-1 text-sm">{loadError}</div>
        <div className="mt-3 flex gap-2">
          <button onClick={load} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200">إعادة المحاولة</button>
          <Link to="/admin/investigations" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200">رجوع</Link>
        </div>
      </div>
    </Shell>
  );
  if (!state) return null;

  return (
    <Shell>
      {/* Header */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:border-amber-400">
            <ArrowLeft className="inline h-3.5 w-3.5" /> رجوع
          </button>
          <div>
            <h1 className="text-xl font-bold text-amber-100">تحرير التحقيق</h1>
            <div className="text-xs text-slate-400" dir="ltr">{state.slug}</div>
          </div>
          {dirty && <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">تغييرات غير محفوظة</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/investigation/${state.slug}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400">
            <ExternalLink className="h-3.5 w-3.5" /> معاينة (الحفظ الحالي)
          </a>
          <button onClick={() => setShowLocalPreview(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400">
            <Eye className="h-3.5 w-3.5" /> معاينة محلية غير محفوظة
          </button>
          <button onClick={resetLocal} disabled={!dirty}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 disabled:opacity-40">
            <RotateCcw className="h-3.5 w-3.5" /> تجاهل التغييرات
          </button>
          <button onClick={runDry} disabled={busy !== null || !dirty || validation.blockers.length > 0 || removalPending}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-40">
            {busy === "dry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />} تشغيل تجريبي
          </button>
          <button onClick={runSave} disabled={busy !== null || !dryHash || validation.blockers.length > 0 || removalPending}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-40">
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} حفظ التغييرات
          </button>
        </div>
      </header>

      {/* Validation & quality panel */}
      <ValidationPanel
        validation={validation}
        quality={quality}
        relationReport={relationReport}
        removedCount={removed.length}
        removalApproved={removalApproved}
        dryReport={dryReport}
        dryHash={dryHash}
      />

      {/* General information */}
      <Section title="المعلومات العامة">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="العنوان" required>
            <input value={state.title} onChange={(e) => setState((s) => s && ({ ...s, title: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </Field>
          <Field label="Slug (غير قابل للتغيير)">
            <input value={state.slug} readOnly dir="ltr"
              className="w-full cursor-not-allowed rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-400" />
          </Field>
          <Field label="عنوان فرعي">
            <input value={state.subtitle} onChange={(e) => setState((s) => s && ({ ...s, subtitle: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </Field>
          <Field label="الصعوبة">
            <select value={state.difficulty} onChange={(e) => setState((s) => s && ({ ...s, difficulty: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
              {DIFFICULTIES.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
            </select>
          </Field>
          <Field label="الوصف" full>
            <textarea value={state.description} onChange={(e) => setState((s) => s && ({ ...s, description: e.target.value }))}
              rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </Field>
          <Field label="الحالة">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
              <input type="checkbox" checked={state.enabled} onChange={(e) => setState((s) => s && ({ ...s, enabled: e.target.checked }))} />
              مفعّل للاعبين
            </label>
          </Field>
        </div>
      </Section>

      {/* Rewards */}
      <Section title="المكافآت">
        <RewardEditor reward={state.reward} legacyRaw={rawRow?.reward}
          onChange={(reward) => setState((s) => s && ({ ...s, reward }))} />
      </Section>

      {/* Related entities */}
      <Section title="العلاقات (الكيانات المرتبطة)">
        <RelatedEditor
          related={state.related}
          onChange={(related) => setState((s) => s && ({ ...s, related }))}
          rawRelated={rawRow?.related_entities}
        />
      </Section>

      {/* Steps */}
      <Section title={`الخطوات (${state.steps.length})`}>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {STEP_TYPES.map((st) => (
            <button key={st.key} onClick={() => addStep(st.key)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-amber-400">
              <Plus className="h-3 w-3" /> {st.label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {state.steps.map((s, i) => (
            <StepCard key={s.id} step={s} index={i} total={state.steps.length}
              onPatch={(p) => setStep(i, p)}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              onDuplicate={() => duplicateStep(i)}
              onRemove={() => removeStep(i)}
            />
          ))}
          {state.steps.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
              لا توجد خطوات — أضف خطوة للبدء.
            </div>
          )}
        </div>
      </Section>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2 text-sm shadow-xl ${
          toast.kind === "ok" ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
            : toast.kind === "err" ? "border-red-400/40 bg-red-500/15 text-red-100"
            : "border-slate-500/40 bg-slate-800 text-slate-100"
        }`}>
          {toast.kind === "ok" ? <CheckCircle2 className="me-1 inline h-4 w-4" />
            : toast.kind === "err" ? <AlertTriangle className="me-1 inline h-4 w-4" />
            : <Info className="me-1 inline h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Removal confirmation dialog — keyed by stable step id */}
      {pendingRemoveId && (
        <RemovalDialog
          step={
            initialState?.steps.find((s) => s.id === pendingRemoveId) ??
            state.steps.find((s) => s.id === pendingRemoveId) ??
            null
          }
          onCancel={() => setPendingRemoveId(null)}
          onConfirm={confirmRemoval}
        />
      )}

      {/* Unsaved-changes navigation blocker (covers Link, navigate,
          browser back, Android back, hard reload/tab close). */}
      {blocker.status === "blocked" && (
        <UnsavedChangesDialog
          onStay={blocker.reset}
          onDiscard={blocker.proceed}
        />
      )}

      {/* Local preview dialog */}
      {showLocalPreview && (
        <LocalPreviewDialog state={state} onClose={() => setShowLocalPreview(false)} />
      )}
    </Shell>
  );
}

// ---------------- Sub-components ----------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-5">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="mb-3 text-sm font-bold text-amber-200">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs text-slate-400">
        {label}{required && <span className="text-red-300"> *</span>}
      </span>
      {children}
    </label>
  );
}

function ValidationPanel({
  validation, quality, relationReport, removedCount, removalApproved, dryReport, dryHash,
}: {
  validation: Validation;
  quality: ReturnType<typeof scoreInvestigation> | null;
  relationReport: ReturnType<typeof buildInvestigationRelationReport> | null;
  removedCount: number; removalApproved: boolean;
  dryReport: RunResult | null; dryHash: string | null;
}) {
  const relIssues = relationReport?.resolutions.filter(
    (r) => r.status !== "valid" && r.status !== "remapped") ?? [];
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <span className={validation.blockers.length ? "text-red-300" : "text-emerald-300"}>
          التحقق: {validation.blockers.length ? `${validation.blockers.length} مشكلة` : "سليم"}
        </span>
        {quality && (
          <span className="text-amber-300">جودة: {quality.score}/100 · {quality.label}</span>
        )}
        {relIssues.length > 0 && <span className="text-amber-300">مشاكل علاقات: {relIssues.length}</span>}
        {removedCount > 0 && (
          <span className={removalApproved ? "text-emerald-300" : "text-red-300"}>
            حذف خطوات مستمرة: {removedCount} {removalApproved ? "(تمت الموافقة)" : "(بحاجة موافقة)"}
          </span>
        )}
        {dryReport?.ok && dryHash && <span className="text-emerald-300">التشغيل التجريبي: ✓</span>}
        {dryReport && !dryReport.ok && <span className="text-red-300">التشغيل التجريبي: ✗ {dryReport.error ?? ""}</span>}
      </div>
      {(validation.blockers.length > 0 || validation.warnings.length > 0) && (
        <ul className="mt-2 list-inside list-disc space-y-0.5">
          {validation.blockers.map((b, i) => <li key={`b${i}`} className="text-red-200">{b}</li>)}
          {validation.warnings.map((w, i) => <li key={`w${i}`} className="text-amber-200">{w}</li>)}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-slate-500">
        <Info className="me-1 inline h-3 w-3" />
        تأثير الحفظ على تقدّم اللاعبين غير متاح في هذه المرحلة (المرحلة G). لا يمنح الحفظ أيّ مكافآت.
      </p>
    </section>
  );
}

function RewardEditor({ reward, legacyRaw, onChange }: {
  reward: Reward; legacyRaw: any; onChange: (r: Reward) => void;
}) {
  const legacyCoins = legacyRaw && typeof legacyRaw === "object" && typeof legacyRaw.coins === "number";
  const conflict = legacyCoins && typeof legacyRaw.dinars === "number" && legacyRaw.dinars !== legacyRaw.coins;
  const num = (v: string): number | undefined => {
    if (v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return (
    <div className="space-y-2">
      {conflict && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
          تعارض في المكافأة القديمة: dinars={legacyRaw.dinars} vs coins={legacyRaw.coins}. حدّد قيمة الدنانير الصحيحة يدوياً؛ يتم رفض الحفظ حتى تُحلّ.
        </div>
      )}
      {legacyCoins && !conflict && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
          تم عرض قيمة <code>coins</code> القديمة كـ <code>dinars</code>. سيتم الحفظ باستخدام <code>dinars</code> فقط.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="XP">
          <input type="number" value={reward.xp ?? ""} onChange={(e) => onChange({ ...reward, xp: num(e.target.value) })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
        </Field>
        <Field label="دنانير (dinars)">
          <input type="number" value={reward.dinars ?? ""} onChange={(e) => onChange({ ...reward, dinars: num(e.target.value) })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
        </Field>
        <Field label="قلوب">
          <input type="number" value={reward.hearts ?? ""} onChange={(e) => onChange({ ...reward, hearts: num(e.target.value) })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
        </Field>
        <Field label="شارة (badge)">
          <input value={reward.badge ?? ""} onChange={(e) => onChange({ ...reward, badge: e.target.value.trim() || undefined })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" dir="ltr" />
        </Field>
        <Field label="قطعة أثرية (artifact)" full>
          <input value={reward.artifact ?? ""} onChange={(e) => onChange({ ...reward, artifact: e.target.value.trim() || undefined })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" dir="ltr" />
        </Field>
      </div>
    </div>
  );
}

function RelatedEditor({ related, onChange, rawRelated }: {
  related: string[]; onChange: (r: string[]) => void; rawRelated: any;
}) {
  const [draft, setDraft] = useState("");
  const rawIsLegacy = Array.isArray(rawRelated) && rawRelated.some((x) => x && typeof x === "object");
  const normalizedFromRaw = useMemo(() => normalizeRelatedEntities(rawRelated), [rawRelated]);
  return (
    <div className="space-y-2">
      {rawIsLegacy && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
          تم تحويل صيغة قديمة (كائنات) إلى سلاسل قياسية. سيحفظ التحقيق العلاقات بصيغة <code>type:slug</code>.
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {related.length === 0 && <span className="text-xs text-slate-500">لا توجد علاقات.</span>}
        {related.map((r, i) => (
          <span key={`${r}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-mono text-slate-200" dir="ltr">
            {r}
            <button onClick={() => onChange(related.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-300" title="إزالة">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="type:slug مثل event:saqifah-meeting"
          dir="ltr"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-slate-200" />
        <button onClick={() => {
          const v = draft.trim(); if (!v) return;
          if (related.includes(v)) { setDraft(""); return; }
          onChange([...related, v]); setDraft("");
        }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-amber-400">
          إضافة
        </button>
      </div>
      {rawIsLegacy && normalizedFromRaw.list.length > 0 && (
        <p className="text-[11px] text-slate-500">
          الحفظ سينتج: <code dir="ltr">{normalizedFromRaw.list.join(", ")}</code>
        </p>
      )}
    </div>
  );
}

function StepCard({ step, index, total, onPatch, onMoveUp, onMoveDown, onDuplicate, onRemove }: {
  step: Step; index: number; total: number;
  onPatch: (p: Partial<Step>) => void;
  onMoveUp: () => void; onMoveDown: () => void;
  onDuplicate: () => void; onRemove: () => void;
}) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950/50">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">#{index + 1}</span>
          <select value={step.type} onChange={(e) => onPatch({ type: e.target.value as StepType })}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs">
            {STEP_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <span className="font-mono text-[10px] text-slate-500" dir="ltr" title="stable id">{step.id}</span>
          {!step.__persisted && <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">جديد</span>}
        </div>
        <div className="flex items-center gap-1">
          <IconAction onClick={onMoveUp} disabled={index === 0} icon={ChevronUp} title="أعلى" />
          <IconAction onClick={onMoveDown} disabled={index === total - 1} icon={ChevronDown} title="أسفل" />
          <IconAction onClick={onDuplicate} icon={Copy} title="نسخ" />
          <IconAction onClick={onRemove} icon={Trash2} title="حذف" danger />
        </div>
      </header>
      <div className="p-3 text-sm">
        <div className="mb-1 text-[10px] text-slate-500">ملخّص: {stepSummary(step)}</div>
        <StepBody step={step} onPatch={onPatch} />
      </div>
    </article>
  );
}

function StepBody({ step, onPatch }: { step: Step; onPatch: (p: Partial<Step>) => void }) {
  if (step.type === "briefing" || step.type === "evidence" || step.type === "conclusion") {
    return (
      <div className="space-y-2">
        <Field label="العنوان (اختياري)">
          <input value={step.title ?? ""} onChange={(e) => onPatch({ title: e.target.value || undefined })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
        </Field>
        <Field label="النص" required>
          <textarea value={step.text ?? ""} onChange={(e) => onPatch({ text: e.target.value })}
            rows={4} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
        </Field>
      </div>
    );
  }
  // question / decision
  const opts = step.options ?? [];
  return (
    <div className="space-y-2">
      <Field label="السؤال / القرار" required>
        <textarea value={step.prompt ?? ""} onChange={(e) => onPatch({ prompt: e.target.value })}
          rows={2} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
      </Field>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
          <span>الخيارات {step.type === "question" ? "(حدّد الإجابة الصحيحة)" : "(اختياري تحديد إجابة صحيحة)"}</span>
          <button onClick={() => onPatch({ options: [...opts, ""] })} className="rounded border border-slate-700 px-2 py-0.5 text-[11px] hover:border-amber-400">+ خيار</button>
        </div>
        <div className="space-y-1.5">
          {opts.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name={`correct-${step.id}`} checked={step.correctAnswer === i}
                onChange={() => onPatch({ correctAnswer: i })} title="إجابة صحيحة" />
              <input value={o} onChange={(e) => {
                const next = opts.slice(); next[i] = e.target.value; onPatch({ options: next });
              }} className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm" />
              <button onClick={() => {
                const next = opts.filter((_, j) => j !== i);
                let ca = step.correctAnswer;
                if (typeof ca === "number") {
                  if (ca === i) ca = undefined;
                  else if (ca > i) ca = ca - 1;
                }
                onPatch({ options: next, correctAnswer: ca });
              }} className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:border-red-400 hover:text-red-300">
                إزالة
              </button>
            </div>
          ))}
        </div>
      </div>
      <Field label="التفسير (اختياري)">
        <textarea value={step.explanation ?? ""} onChange={(e) => onPatch({ explanation: e.target.value || undefined })}
          rows={2} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
      </Field>
    </div>
  );
}

function IconAction({ onClick, icon: Icon, title, disabled, danger }: {
  onClick: () => void; icon: any; title: string; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex h-7 w-7 items-center justify-center rounded border ${
        disabled ? "cursor-not-allowed border-slate-800 text-slate-600"
          : danger ? "border-red-400/30 text-red-300 hover:bg-red-500/10"
          : "border-slate-700 text-slate-300 hover:border-amber-400/40 hover:text-amber-300"
      }`}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function RemovalDialog({ step, onCancel, onConfirm }: {
  step: Step | null | undefined; onCancel: () => void; onConfirm: () => void;
}) {
  const [ok, setOk] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-950 p-5 shadow-2xl">
        <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-red-200">
          <AlertTriangle className="h-4 w-4" /> تأكيد الحذف
        </h3>
        <p className="mb-3 text-sm text-slate-300">
          سيتم حذف هذه الخطوة نهائياً من التحقيق:
        </p>
        {step && (
          <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-200">
            <div><b>النوع:</b> {STEP_LABEL[step.type]}</div>
            {step.title && <div><b>العنوان:</b> {step.title}</div>}
            <div dir="ltr"><b>ID:</b> <code>{step.id}</code></div>
          </div>
        )}
        <label className="mb-3 flex items-start gap-2 text-xs text-red-200">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5" />
          <span>أفهم أن هذه الخطوة ستُحذف من التحقيق</span>
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300">إلغاء</button>
          <button onClick={onConfirm} disabled={!ok}
            className="rounded-lg border border-red-500/50 bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-100 disabled:opacity-40">
            تأكيد الحذف
          </button>
        </div>
      </div>
    </div>
  );
}

function LocalPreviewDialog({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const payload = useMemo(() => JSON.stringify(toPersistedShape(state), null, 2), [state]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 p-5 text-slate-100 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-amber-100">معاينة محلية غير محفوظة</h3>
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-2 py-1 text-xs">إغلاق</button>
        </div>
        <p className="mb-2 text-[11px] text-slate-500">
          هذه معاينة للحمولة المحلية فقط — لم يتم كتابتها إلى قاعدة البيانات.
        </p>
        <pre dir="ltr" className="max-h-[70vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-[11px] leading-snug text-slate-200">{payload}</pre>
      </div>
    </div>
  );
}
