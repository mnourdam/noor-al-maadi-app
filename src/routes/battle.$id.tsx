// ============================================================
// /battle/$id — Supabase-only stub (legacy route detached)
// ------------------------------------------------------------
// Battle content now lives in encyclopedia_entities. The legacy
// hard-coded battle profile (lib/data) has been removed from the
// runtime; this stub keeps the route reachable for any cached
// links and redirects discovery into the encyclopedia.
// ============================================================

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Swords } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/battle/$id")({
  head: () => ({ meta: [{ title: "معركة — إرث" }] }),
  component: BattleStub,
});

function BattleStub() {
  const { id } = useParams({ from: "/battle/$id" });
  return (
    <AppShell>
      <Screen title="المعركة" subtitle="انتقل محتوى المعارك إلى الموسوعة">
        <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
          <Swords className="mx-auto mb-3 size-8 text-gold/70" />
          <p className="font-display text-base font-bold text-gold">المعركة "{id}" لم تعد متاحة هنا</p>
          <p className="mt-1 text-xs text-muted-foreground">
            تجد جميع المعارك المتاحة الآن في الموسوعة.
          </p>
          <Link
            to="/encyclopedia/type/$type"
            params={{ type: "battle" }}
            className="mt-4 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
          >
            تصفح المعارك <ArrowLeft className="size-3.5" />
          </Link>
        </div>
      </Screen>
    </AppShell>
  );
}
