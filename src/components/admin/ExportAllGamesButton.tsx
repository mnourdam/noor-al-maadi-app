import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  buildGamesExportBundle,
  downloadJsonFile,
  fetchAllGamesByMode,
  gamesExportFileName,
} from "@/lib/games/export";
import { MODE_LABELS_AR, type GameMode } from "@/lib/games/types";

/**
 * Shared "export all" control for every /admin/games/$mode page.
 * Always re-reads the full server-side set for the mode — never the
 * rows currently rendered (filters / search / pagination are irrelevant).
 */
export function ExportAllGamesButton({
  mode,
  knownCount,
  onResult,
}: {
  mode: GameMode;
  /** Rows visible in the admin table — used only to disable the button when empty. */
  knownCount?: number;
  onResult: (kind: "ok" | "err", msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const empty = knownCount === 0;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { rows, error } = await fetchAllGamesByMode(mode);
      if (error) {
        onResult("err", `تعذّر التصدير: ${error}`);
        return;
      }
      if (!rows.length) {
        onResult("err", `لا توجد ألعاب من نوع «${MODE_LABELS_AR[mode]}» للتصدير.`);
        return;
      }
      downloadJsonFile(gamesExportFileName(mode), buildGamesExportBundle(mode, rows));
      onResult("ok", `تم تصدير ${rows.length} لعبة «${MODE_LABELS_AR[mode]}» بنجاح.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy || empty}
      title={empty ? "لا توجد ألعاب من هذا النوع" : "تصدير جميع ألعاب هذا النوع"}
      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      تصدير الكل JSON
    </button>
  );
}
