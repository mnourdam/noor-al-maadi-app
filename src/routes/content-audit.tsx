// ============================================================
// /content-audit — legacy admin tool retired.
// Auditing now lives at /admin/encyclopedia-audit and reads
// exclusively from Supabase.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/content-audit")({
  head: () => ({ meta: [{ title: "تدقيق المحتوى — إرث" }] }),
  component: ContentAuditStub,
});

function ContentAuditStub() {
  return (
    <AppShell>
      <Screen title="تدقيق المحتوى" subtitle="انتقلت أدوات التدقيق إلى لوحة المشرف">
        <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
          <p className="font-display text-base font-bold text-gold">
            تم نقل هذه الأداة إلى لوحة المشرف.
          </p>
          <Link
            to="/admin/encyclopedia-audit"
            className="mt-4 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
          >
            افتح تدقيق الموسوعة <ArrowLeft className="size-3.5" />
          </Link>
        </div>
      </Screen>
    </AppShell>
  );
}
