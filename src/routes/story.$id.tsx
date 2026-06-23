// ============================================================
// /story/$id — Supabase-only stub (legacy hardcoded stories removed)
// ============================================================

import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, BookOpen } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/story/$id")({
  head: () => ({ meta: [{ title: "قصة — إرث" }] }),
  component: StoryStub,
});

function StoryStub() {
  const { id } = useParams({ from: "/story/$id" });
  return (
    <AppShell>
      <Screen title="القصة" subtitle="انتقل محتوى القصص إلى الموسوعة">
        <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
          <BookOpen className="mx-auto mb-3 size-8 text-gold/70" />
          <p className="font-display text-base font-bold text-gold">القصة "{id}" لم تعد متاحة هنا</p>
          <p className="mt-1 text-xs text-muted-foreground">
            استعرض المحتوى المتاح الآن في الموسوعة.
          </p>
          <Link
            to="/encyclopedia"
            className="mt-4 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
          >
            افتح الموسوعة <ArrowLeft className="size-3.5" />
          </Link>
        </div>
      </Screen>
    </AppShell>
  );
}
