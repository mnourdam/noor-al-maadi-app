// ============================================================
// /figure/$id — Supabase-only stub (legacy route detached)
// ============================================================

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/figure/$id")({
  head: () => ({ meta: [{ title: "شخصية — إرث" }] }),
  component: FigureStub,
});

function FigureStub() {
  const { id } = useParams({ from: "/figure/$id" });
  return (
    <AppShell>
      <Screen title="الشخصية" subtitle="انتقلت بطاقات الشخصيات إلى الموسوعة">
        <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
          <Users className="mx-auto mb-3 size-8 text-gold/70" />
          <p className="font-display text-base font-bold text-gold">الشخصية "{id}" لم تعد متاحة هنا</p>
          <p className="mt-1 text-xs text-muted-foreground">
            تجد جميع الشخصيات المتاحة الآن في الموسوعة.
          </p>
          <Link
            to="/encyclopedia/type/$type"
            params={{ type: "figure" }}
            className="mt-4 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
          >
            تصفح الشخصيات <ArrowLeft className="size-3.5" />
          </Link>
        </div>
      </Screen>
    </AppShell>
  );
}
