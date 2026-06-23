// ============================================================
// /admin/migration — legacy migration tool retired.
// All seeding now flows through /admin/import (admin_campaigns)
// and /admin/encyclopedia (encyclopedia_entities). No more
// pack-based one-time migration.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/admin/migration")({
  head: () => ({ meta: [{ title: "ترحيل المحتوى — إرث" }] }),
  component: MigrationStub,
});

function MigrationStub() {
  return (
    <AppShell>
      <Screen title="ترحيل المحتوى" subtitle="انتهت مهمة ترحيل الحزم القديمة">
        <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
          <p className="font-display text-base font-bold text-gold">
            هذه الأداة لم تعد مطلوبة.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            الموسوعة والحملات تُدار الآن من لوحة المشرف مباشرة.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              to="/admin/encyclopedia"
              className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
            >
              الموسوعة <ArrowLeft className="size-3.5" />
            </Link>
            <Link
              to="/admin/import"
              className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
            >
              استيراد الحملات <ArrowLeft className="size-3.5" />
            </Link>
          </div>
        </div>
      </Screen>
    </AppShell>
  );
}
