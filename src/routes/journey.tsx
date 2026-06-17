import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Lock, Check } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ERAS, STORIES } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/journey")({
  head: () => ({ meta: [{ title: "خارطة الرحلة" }] }),
  component: JourneyPage,
});

function JourneyPage() {
  const { profile, unlockEra } = useProfile();

  return (
    <AppShell>
      <Screen title="خارطة الرحلة" subtitle="ارحل بين حقب التاريخ الإسلامي">
        <ol className="relative space-y-4 border-r-2 border-dashed border-gold/30 pr-6">
          {ERAS.map((e, i) => {
            const unlocked = profile.unlockedEras.includes(e.id);
            const storyCount = STORIES.filter((s) => s.era === e.id).length;
            return (
              <li key={e.id} className="relative">
                <span className={`absolute -right-[35px] top-3 grid size-7 place-items-center rounded-full border-2 border-background text-xs font-bold ${unlocked ? "bg-gradient-gold text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}>
                  {i + 1}
                </span>
                <div className={`rounded-2xl border p-4 transition ${unlocked ? "border-gold/30 bg-surface" : "border-white/10 bg-surface/60"}`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-bold">{e.name}</h3>
                      <p className="mt-0.5 text-xs text-gold">{e.years}</p>
                    </div>
                    {unlocked ? <Check className="size-5 text-gold" /> : <Lock className="size-5 text-muted-foreground" />}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{e.tagline}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{storyCount} قصص</span>
                    {unlocked ? (
                      <Link to="/" className="text-xs text-gold">استكشف</Link>
                    ) : (
                      <button onClick={() => unlockEra(e.id)} className="rounded-full bg-gradient-gold px-3 py-1 text-[11px] font-bold text-primary-foreground">
                        افتح بـ ٥٠ نقطة
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Screen>
    </AppShell>
  );
}