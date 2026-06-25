import { createFileRoute, Link } from "@tanstack/react-router";
import { Gamepad2, Grid3x3, Clock, HelpCircle, Link2, LayoutGrid, ChevronLeft } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import { MODE_LABELS_AR, MODE_TAGLINES_AR, GAME_MODES, type GameMode } from "@/lib/games/types";

export const Route = createFileRoute("/admin/games/")({
  head: () => ({
    meta: [
      { title: "إدارة الألعاب — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AdminGamesHub /></AdminGate>,
});

const MODE_ICON: Record<GameMode, React.ComponentType<{ className?: string }>> = {
  crossword: Grid3x3,
  chronology: Clock,
  who_am_i: HelpCircle,
  connections: Link2,
  memory: LayoutGrid,
};

function AdminGamesHub() {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Gamepad2 className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">إدارة الألعاب</h1>
              <p className="text-sm text-slate-400">إطار JSON قابل للتوسيع للتحديات التاريخية</p>
            </div>
          </div>
          <Link to="/admin" className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
            <ChevronLeft className="h-3.5 w-3.5" /> لوحة الإدارة
          </Link>
        </header>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {GAME_MODES.map((m) => {
            const Icon = MODE_ICON[m];
            return (
              <Link key={m} to="/admin/games/$mode" params={{ mode: m }}
                className="group flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-amber-400/60 hover:bg-slate-900">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h2 className="text-base font-bold text-amber-100">{MODE_LABELS_AR[m]}</h2>
                </div>
                <p className="text-sm leading-6 text-slate-400">{MODE_TAGLINES_AR[m]}</p>
                <span className="text-xs text-amber-300/80 group-hover:text-amber-300">إدارة المحتوى ←</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
