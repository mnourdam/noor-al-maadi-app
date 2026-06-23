// ============================================================
// /play/chapter — Supabase-only stub (legacy era chapter player)
// ------------------------------------------------------------
// Legacy era-pack chapter playback has been retired. The active
// chapter player lives at /campaigns/imported/$id/chapter/$chapter
// and reads exclusively from admin_campaigns.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/play/chapter")({
  head: () => ({ meta: [{ title: "فصل — إرث" }] }),
  component: PlayChapterStub,
});

function PlayChapterStub() {
  return (
    <AppShell>
      <Screen title="الفصل" subtitle="تم تحديث تجربة الحملات">
        <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
          <BookOpen className="mx-auto mb-3 size-8 text-gold/70" />
          <p className="font-display text-base font-bold text-gold">انتقلت الحملات إلى التجربة الجديدة</p>
          <p className="mt-1 text-xs text-muted-foreground">
            اختر حملة من قائمة الحملات للمتابعة.
          </p>
          <Link
            to="/campaigns"
            className="mt-4 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold"
          >
            استعرض الحملات <ArrowLeft className="size-3.5" />
          </Link>
        </div>
      </Screen>
    </AppShell>
  );
}
