import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Screen } from "@/components/AppShell";

export const Route = createFileRoute("/play/timeline")({
  head: () => ({ meta: [{ title: "ترتيب الخط الزمني" }] }),
  component: TimelinePlay,
});

function TimelinePlay() {
  return (
    <AppShell>
      <Screen title="ترتيب الأحداث" subtitle="سيتوفر المحتوى قريبًا من قاعدة البيانات الرسمية">
        <div className="rounded-2xl border border-white/10 bg-surface p-6 text-center text-sm text-muted-foreground">
          لا توجد تحديات زمنية منشورة حاليًا.
        </div>
        <div className="mt-4 text-center">
          <Link to="/encyclopedia" className="inline-flex rounded-xl bg-gradient-gold px-4 py-2 text-sm font-bold text-primary-foreground shadow-gold">
            تصفّح الموسوعة
          </Link>
        </div>
      </Screen>
    </AppShell>
  );
}
