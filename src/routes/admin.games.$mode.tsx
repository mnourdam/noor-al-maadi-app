import { createFileRoute, useParams } from "@tanstack/react-router";
import { AdminGate } from "@/lib/admin-guard";
import { AdminGameManager } from "@/components/admin/AdminGameManager";
import { GAME_MODES, type GameMode } from "@/lib/games/types";

export const Route = createFileRoute("/admin/games/$mode")({
  head: () => ({
    meta: [
      { title: "إدارة لعبة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AdminGameModePage /></AdminGate>,
});

function AdminGameModePage() {
  const { mode } = useParams({ from: "/admin/games/$mode" });
  if (!GAME_MODES.includes(mode as GameMode)) {
    return (
      <div dir="rtl" className="p-6 text-center text-sm text-slate-400">
        نمط لعبة غير معروف: {mode}
      </div>
    );
  }
  return <AdminGameManager mode={mode as GameMode} />;
}
