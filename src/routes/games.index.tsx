import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Grid3x3, Clock, HelpCircle, Link2, LayoutGrid, ChevronLeft, Star, CheckCircle2, Lock } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { listPublishedGames, fetchMyCompletedGameIds, type GameRow } from "@/lib/games/store";
import { MODE_LABELS_AR, MODE_TAGLINES_AR, GAME_MODES, type GameMode } from "@/lib/games/types";

export const Route = createFileRoute("/games/")({
  head: () => ({ meta: [{ title: "الألعاب التاريخية — إرث" }] }),
  component: GamesIndex,
});

const MODE_ICON: Record<GameMode, React.ComponentType<{ className?: string }>> = {
  crossword: Grid3x3,
  chronology: Clock,
  who_am_i: HelpCircle,
  connections: Link2,
  memory: LayoutGrid,
};

function GamesIndex() {
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [list, done] = await Promise.all([
        listPublishedGames(),
        fetchMyCompletedGameIds(),
      ]);
      setGames(list);
      setCompleted(done);
    })();
  }, []);

  return (
    <AppShell>
      <Screen title="الألعاب التاريخية" subtitle="تحديات قصيرة تربطك بالتاريخ — اختر نمطًا للبدء">
        <div className="mb-4">
          <Link to="/adventure" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-amber-300">
            <ChevronLeft className="h-3.5 w-3.5" /> العودة إلى قاعة التحديات
          </Link>
        </div>

        <div dir="rtl" className="grid gap-4 md:grid-cols-2">
          {GAME_MODES.map((m) => {
            const Icon = MODE_ICON[m];
            const inMode = (games ?? []).filter((g) => g.mode === m);
            return (
              <div key={m} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="mb-2 flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-amber-100">{MODE_LABELS_AR[m]}</h3>
                    <p className="text-[11px] text-slate-400">{MODE_TAGLINES_AR[m]}</p>
                  </div>
                </div>
                {games === null && <p className="text-xs text-slate-500">جارٍ التحميل…</p>}
                {games !== null && inMode.length === 0 && (
                  <p className="text-xs text-slate-500">قريبًا — لا توجد تحديات منشورة بعد.</p>
                )}
                <ul className="space-y-1">
                  {inMode.slice(0, 4).map((g) => {
                    const done = completed.has(g.id);
                    if (done) {
                      // Completed challenges are permanent discoveries — no replay.
                      return (
                        <li key={g.id}>
                          <div
                            aria-disabled="true"
                            className="flex cursor-not-allowed items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-xs text-slate-300 opacity-80"
                          >
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Lock className="h-3 w-3 shrink-0 text-emerald-300/80" />
                              <span className="truncate line-through decoration-emerald-400/40">{g.title}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" /> مكتمل ✓
                            </span>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={g.id}>
                        <Link to="/games/$mode/$slug" params={{ mode: g.mode, slug: g.slug }}
                          className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 hover:border-amber-400">
                          <span className="truncate">{g.title}</span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                            <Star className="h-3 w-3" /> {g.difficulty}/5
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Screen>
    </AppShell>
  );
}
