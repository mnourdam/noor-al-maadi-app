// ============================================================
// /city/$id — Supabase-only stub (legacy route detached)
// ============================================================

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, MapPin } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/city/$id")({
  head: () => ({ meta: [{ title: "مدينة — إرث" }] }),
  component: CityStub,
});

function CityStub() {
  const { id } = useParams({ from: "/city/$id" });
  return (
    <AppShell>
      <Screen title="المدينة" subtitle="انتقلت بطاقات المدن إلى الموسوعة">
        <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
          <MapPin className="mx-auto mb-3 size-8 text-gold/70" />
          <p className="font-display text-base font-bold text-gold">المدينة "{id}" لم تعد متاحة هنا</p>
          <p className="mt-1 text-xs text-muted-foreground">
            تجد جميع المدن المتاحة الآن في الموسوعة.
          </p>
          <Link
            to="/encyclopedia/type/$type"
            params={{ type: "city" }}
            className="mt-4 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
          >
            تصفح المدن <ArrowLeft className="size-3.5" />
          </Link>
        </div>
      </Screen>
    </AppShell>
  );
}
