import { useEffect, useMemo, useState } from "react";
import {
  Upload, Download, FileJson, RefreshCw, Eye, EyeOff, Archive,
  Copy, Trash2, CheckCircle2, AlertTriangle, X, ExternalLink, Landmark,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { validateGameJson } from "@/lib/games/schemas";
import { EXAMPLE_GAMES } from "@/lib/games/examples";
import { listGamesByMode, type GameRow } from "@/lib/games/store";
import { MODE_LABELS_AR, MODE_TAGLINES_AR, type GameMode, type GameStatus } from "@/lib/games/types";
import {
  extractMuseumUnlocks,
  validateMuseumUnlocks,
  type UnlockValidationReport,
} from "@/lib/games/museumUnlocks";
import {
  downloadJsonFile,
  parseGamesImportPayload,
  serializeGame,
} from "@/lib/games/export";
import { ExportAllGamesButton } from "@/components/admin/ExportAllGamesButton";


interface Toast { kind: "ok" | "err"; msg: string }

function statusLabel(s: GameStatus): string {
  return s === "published" ? "منشور" : s === "draft" ? "مسودة" : "مؤرشف";
}

export function AdminGameManager({ mode }: { mode: GameMode }) {
  const [rows, setRows] = useState<GameRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [importText, setImportText] = useState("");
  const [validationReport, setValidationReport] = useState<string[]>([]);
  const [unlockReport, setUnlockReport] = useState<UnlockValidationReport | null>(null);


  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = async () => {
    const { rows: r, error } = await listGamesByMode(mode);
    if (error) { setErr(error); return; }
    setRows(r);
    setErr(null);
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mode]);

  const exampleJson = useMemo(
    () => JSON.stringify(EXAMPLE_GAMES[mode], null, 2),
    [mode],
  );

  const downloadExample = () => {
    const blob = new Blob([exampleJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${mode}-example.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportGame = (g: GameRow) => {
    downloadJsonFile(`${g.slug}.json`, serializeGame(g));
  };

  /** Import a single already-parsed envelope. Returns per-item outcome. */
  const importOne = async (
    parsed: unknown,
  ): Promise<{ ok: boolean; title: string; lines: string[] }> => {
    const result = validateGameJson(mode, parsed);
    if (!result.ok) {
      const label = (parsed as { slug?: string })?.slug ?? "(بدون معرف)";
      return { ok: false, title: label, lines: result.errors.map((e) => `${label} — ${e}`) };
    }
    const v = result.value;
    // Merge unified rewards block — rewards.* overrides top-level.
    const xpReward = v.rewards?.xp ?? v.xp;
    const coinReward = v.rewards?.coins ?? v.coins;
    const museumUnlocks = extractMuseumUnlocks(v);

    // Validate museum unlock targets exist in the encyclopedia.
    let unlockReportLocal: UnlockValidationReport | null = null;
    if (museumUnlocks.length) {
      unlockReportLocal = await validateMuseumUnlocks(museumUnlocks);
      setUnlockReport(unlockReportLocal);
      if (unlockReportLocal.missing.length) {
        return {
          ok: false,
          title: v.slug,
          lines: [
            `${v.slug} — لا يمكن الاستيراد: ${unlockReportLocal.missing.length} مقتنى غير موجود في الموسوعة.`,
            ...unlockReportLocal.missing.map((m) => `• ${m.raw}`),
          ],
        };
      }
    }

    const mergedMeta = { ...(v.metadata ?? {}) } as Record<string, unknown>;
    if (museumUnlocks.length) mergedMeta.museum_unlocks = museumUnlocks;
    else delete mergedMeta.museum_unlocks;

    const payload = {
      slug: v.slug,
      mode: v.mode,
      title: v.title,
      description: v.description ?? null,
      difficulty: v.difficulty,
      estimated_time: v.estimated_time,
      xp_reward: xpReward,
      coin_reward: coinReward,
      hearts_penalty: v.hearts_penalty,
      related_entities: v.related_entities,
      metadata: mergedMeta,
      stages: v.stages,
      status: "draft" as GameStatus,
    };
    const { data: inserted, error } = await supabase
      .from("games")
      .insert(payload as any)
      .select("id, slug")
      .single();
    if (error) {
      const dup = (error as any).code === "23505" || /duplicate|unique/i.test(error.message);
      return {
        ok: false,
        title: v.slug,
        lines: [
          dup
            ? `${v.slug} — المعرف مستخدم بالفعل. غيّر slug ثم أعد المحاولة.`
            : `${v.slug} — ${error.message}`,
        ],
      };
    }
    console.info("[games.import] inserted", inserted);

    const lines = [`✓ تم استيراد "${v.title}" كمسودة.`];
    if (unlockReportLocal?.duplicates.length) {
      lines.push(`⚠ مقتنيات مكررة تم توحيدها: ${unlockReportLocal.duplicates.join("، ")}`);
    }
    if (unlockReportLocal?.resolved.length) {
      lines.push(`✓ سيتم فتح ${unlockReportLocal.resolved.length} مقتنى عند أول إكمال.`);
    }
    return { ok: true, title: v.title, lines };
  };

  const importJson = async () => {
    setValidationReport([]);
    setUnlockReport(null);
    let parsed: unknown;
    try { parsed = JSON.parse(importText); }
    catch (e) {
      setValidationReport([`JSON غير صالح: ${(e as Error).message}`]);
      return;
    }
    // Accepts a single game object, a bare array, or a bulk export bundle.
    const payload = parseGamesImportPayload(parsed);
    if (!payload.ok) {
      setValidationReport([payload.error]);
      return;
    }

    const lines: string[] = [];
    let okCount = 0;
    for (const item of payload.items) {
      const r = await importOne(item);
      if (r.ok) okCount += 1;
      lines.push(...r.lines);
    }

    if (payload.bulk) {
      lines.unshift(
        `${okCount === payload.items.length ? "✓" : "⚠"} تم استيراد ${okCount} من ${payload.items.length} لعبة.`,
      );
    }
    setValidationReport(lines);
    if (okCount > 0) {
      setImportText("");
      notify("ok", `تم استيراد ${okCount} لعبة كمسودة.`);
      void refresh();
    } else {
      notify("err", "فشل الاستيراد — راجع التقرير.");
    }
  };


  const setStatus = async (g: GameRow, status: GameStatus) => {
    const patch: Record<string, unknown> = { status };
    if (status === "published") patch.published_at = new Date().toISOString();
    const { error } = await supabase.from("games").update(patch as any).eq("id", g.id);
    if (error) return notify("err", error.message);
    notify("ok", `تم تحديث الحالة إلى ${statusLabel(status)}.`);
    void refresh();
  };

  const duplicate = async (g: GameRow) => {
    const newSlug = `${g.slug}-copy-${Date.now().toString(36).slice(-4)}`;
    const { error } = await supabase.from("games").insert({
      slug: newSlug,
      mode: g.mode,
      title: `${g.title} (نسخة)`,
      description: g.description,
      difficulty: g.difficulty,
      estimated_time: g.estimated_time,
      xp_reward: g.xp_reward,
      coin_reward: g.coin_reward,
      hearts_penalty: g.hearts_penalty,
      related_entities: g.related_entities,
      metadata: g.metadata,
      stages: g.stages,
      status: "draft",
    } as any);
    if (error) return notify("err", error.message);
    notify("ok", "تم تكرار اللعبة كمسودة.");
    void refresh();
  };

  const remove = async (g: GameRow) => {
    if (!confirm(`حذف "${g.title}"؟ لا يمكن التراجع.`)) return;
    const { error } = await supabase.from("games").delete().eq("id", g.id);
    if (error) return notify("err", error.message);
    notify("ok", "تم الحذف.");
    void refresh();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-amber-100">{MODE_LABELS_AR[mode]}</h1>
            <p className="text-sm text-slate-400">{MODE_TAGLINES_AR[mode]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin/games" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              ← الألعاب
            </Link>
            <button onClick={refresh} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </button>
            <button onClick={downloadExample} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10">
              <Download className="h-3.5 w-3.5" /> تنزيل نموذج JSON
            </button>
            {mode === "crossword" && (
              <Link to="/admin/games/crossword-generator"
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400">
                مولّد الكلمات المتقاطعة ←
              </Link>
            )}
          </div>
        </header>

        {err && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            تعذّر التحميل: {err}
          </div>
        )}

        {/* Import card */}
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-amber-300">
            <Upload className="h-4 w-4" />
            <h2 className="text-sm font-semibold">استيراد لعبة JSON</h2>
          </div>
          <p className="mb-3 text-xs leading-6 text-slate-300">
            الصق محتوى ملف JSON صالحًا. يتم الاستيراد دائمًا كـ«مسودة»؛ لن يظهر للاعبين قبل النشر.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            dir="ltr"
            spellCheck={false}
            rows={8}
            placeholder={exampleJson.slice(0, 200) + " ..."}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-400 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={importJson} disabled={!importText.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40">
              <FileJson className="h-3.5 w-3.5" /> تحقّق واستورد
            </button>
            <button onClick={() => setImportText(exampleJson)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400">
              املأ بنموذج جاهز
            </button>
          </div>
          {validationReport.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs">
              {validationReport.map((line, i) => (
                <li key={i} className={
                  line.startsWith("✓") ? "text-emerald-300"
                  : line.startsWith("⚠") ? "text-amber-300"
                  : "text-red-300"
                }>
                  {line}
                </li>
              ))}
            </ul>
          )}
          {unlockReport && (unlockReport.resolved.length > 0 || unlockReport.missing.length > 0) && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <div className="mb-2 flex items-center gap-1.5 font-semibold text-amber-200">
                <Landmark className="h-3.5 w-3.5" /> مقتنيات المتحف المرتبطة
              </div>
              {unlockReport.resolved.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {unlockReport.resolved.map((r) => (
                    <li key={`${r.type}:${r.slug}`} className="flex items-center justify-between gap-2 text-emerald-200/90">
                      <span>✓ {r.title}</span>
                      <span className="text-[10px] text-slate-400">{r.type}:{r.slug}</span>
                    </li>
                  ))}
                </ul>
              )}
              {unlockReport.missing.length > 0 && (
                <ul className="space-y-1">
                  {unlockReport.missing.map((m, i) => (
                    <li key={i} className="text-red-300">✗ غير موجود: {m.raw}</li>
                  ))}
                </ul>
              )}
              {unlockReport.duplicates.length > 0 && (
                <p className="mt-2 text-amber-300">⚠ تكرارات: {unlockReport.duplicates.join("، ")}</p>
              )}
            </div>
          )}

        </section>

        {/* List */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">الألعاب المستوردة</h2>
          {rows === null && <p className="text-xs text-slate-500">جارٍ التحميل…</p>}
          {rows && rows.length === 0 && (
            <p className="text-xs text-slate-500">لا توجد ألعاب بعد. استورد ملف JSON لبدء البناء.</p>
          )}
          <ul className="space-y-2">
            {rows?.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-slate-100">{g.title}</span>
                    <StatusBadge status={g.status} />
                    {(g.metadata as any)?.sample && (
                      <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-300">عيّنة</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {g.slug} · {g.stages?.length ?? 0} مرحلة · مستوى {g.difficulty}/5 · ~{g.estimated_time} د
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Link to="/games/$mode/$slug" params={{ mode: g.mode, slug: g.slug }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-amber-400 hover:text-amber-300">
                    <ExternalLink className="h-3 w-3" /> معاينة
                  </Link>
                  {g.status !== "published" ? (
                    <button onClick={() => setStatus(g, "published")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/10">
                      <Eye className="h-3 w-3" /> نشر
                    </button>
                  ) : (
                    <button onClick={() => setStatus(g, "draft")} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-amber-400">
                      <EyeOff className="h-3 w-3" /> إلغاء النشر
                    </button>
                  )}
                  <button onClick={() => setStatus(g, "archived")} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-amber-400">
                    <Archive className="h-3 w-3" /> أرشفة
                  </button>
                  <button onClick={() => duplicate(g)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-amber-400">
                    <Copy className="h-3 w-3" /> تكرار
                  </button>
                  <button onClick={() => exportGame(g)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-amber-400">
                    <Download className="h-3 w-3" /> تصدير
                  </button>
                  <button onClick={() => remove(g)} className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10">
                    <Trash2 className="h-3 w-3" /> حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {toast && (
          <div className={`fixed bottom-4 right-4 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm shadow-lg ${
            toast.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/40 bg-red-500/10 text-red-200"
          }`}>
            {toast.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {toast.msg}
            <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: GameStatus }) {
  const cls = status === "published"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    : status === "draft"
    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
    : "border-slate-600 bg-slate-800/60 text-slate-300";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>{statusLabel(status)}</span>;
}
