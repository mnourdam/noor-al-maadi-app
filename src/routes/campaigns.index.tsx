import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, Check, ChevronLeft } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { CAMPAIGNS, ERAS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/campaigns/")({
  head: () => ({ meta: [{ title: "الحملات التاريخية" }] }),
  component: CampaignsIndex,
});

function CampaignsIndex() {
  const { profile, unlockEra } = useProfile();
  return (
    <AppShell>
      <Screen title="الحملات" subtitle="عش كل حقبة كرحلة من المهام والمكافآت">
        <div className="space-y-3">
          {CAMPAIGNS.map((c) => {
            const era = ERAS.find((e) => e.id === c.eraId)!;
            const unlocked = profile.unlockedEras.includes(c.eraId);
            const done = c.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length;
            const complete = profile.campaignsCompleted.includes(c.eraId);
            const pct = Math.round((done / c.missions.length) * 100);
            return (
              <div key={c.eraId} className={`rounded-2xl border p-4 ${unlocked ? "border-gold/20 bg-surface" : "border-white/10 bg-surface/60"}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] text-gold">{era.years}</p>
                    <h3 className="font-display mt-1 text-lg font-bold">{c.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.intro}</p>
                  </div>
                  {complete ? <Check className="size-5 text-gold" /> : !unlocked ? <Lock className="size-5 text-muted-foreground" /> : null}
                </div>
                {unlocked ? (
                  <>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{done} / {c.missions.length} مهمة</span>
                      <Link to="/campaigns/$era" params={{ era: c.eraId }} className="flex items-center gap-1 text-gold">
                        ادخل الحملة <ChevronLeft className="size-3.5" />
                      </Link>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => unlockEra(c.eraId)}
                    className="mt-3 w-full rounded-full bg-gradient-gold py-2 text-xs font-bold text-primary-foreground"
                  >
                    افتح الحملة (مجانًا)
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Screen>
    </AppShell>
  );
}