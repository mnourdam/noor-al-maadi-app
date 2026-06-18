import { createFileRoute, Link } from "@tanstack/react-router";
import { Swords, Lock, Crown, Check, ArrowLeft } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { CAMPAIGNS, ERAS, UPCOMING_CAMPAIGNS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/campaigns/")({
  head: () => ({ meta: [{ title: "الحملات التاريخية" }] }),
  component: CampaignsHub,
});

function CampaignsHub() {
  const { profile } = useProfile();

  return (
    <AppShell>
      <Screen title="الحملات" subtitle="رحلاتٌ مصمَّمة تأخذك عبر العصور">
        {/* Flagship */}
        {CAMPAIGNS.filter((c) => c.flagship).map((c) => {
          const era = ERAS.find((e) => e.id === c.eraId);
          const done = c.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length;
          const pct = Math.round((done / c.missions.length) * 100);
          return (
            <Link
              key={c.eraId}
              to="/campaigns/$era"
              params={{ era: c.eraId }}
              className="shadow-elegant relative mb-5 block overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-tl from-amber-900/40 via-surface to-stone-900/40 p-6"
            >
              <div className="particle-field" />
              <div className="absolute -left-12 -top-12 size-48 rounded-full bg-gold/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-2 text-[10px] text-gold">
                  <Crown className="size-3.5" /> الحملة الكبرى · {era?.name}
                </div>
                <h2 className="font-display mt-2 text-2xl font-bold shimmer-text">{c.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.intro}</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{done}/{c.missions.length} فصلًا · {pct}٪</span>
                  <span className="flex items-center gap-1 text-gold">ادخل <ArrowLeft className="size-3.5" /></span>
                </div>
              </div>
            </Link>
          );
        })}

        <h3 className="font-display mb-3 text-sm font-bold text-muted-foreground">حملات العصور</h3>
        <div className="space-y-3">
          {CAMPAIGNS.filter((c) => !c.flagship).map((c) => {
            const era = ERAS.find((e) => e.id === c.eraId);
            const unlocked = profile.unlockedEras.includes(c.eraId);
            const done = c.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length;
            const pct = Math.round((done / c.missions.length) * 100);
            const complete = profile.campaignsCompleted.includes(c.eraId);
            return (
              <Link
                key={c.eraId}
                to="/campaigns/$era"
                params={{ era: c.eraId }}
                className={`block rounded-2xl border p-4 transition ${
                  complete ? "border-gold/40 bg-gold/5" : unlocked ? "border-white/10 bg-surface hover:border-gold/40" : "border-white/5 bg-surface/60 opacity-70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${complete ? "bg-gradient-gold text-primary-foreground" : "bg-gold/15 text-gold"}`}>
                    {complete ? <Check className="size-5" /> : unlocked ? <Swords className="size-5" /> : <Lock className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-gold">{era?.name} · {era?.years}</p>
                    <p className="font-display mt-0.5 truncate text-sm font-bold">{c.title}</p>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{c.intro}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{done}/{c.missions.length} مهمة</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <h3 className="font-display mb-3 mt-7 text-sm font-bold text-muted-foreground">حملات قادمة</h3>
        <div className="space-y-2">
          {UPCOMING_CAMPAIGNS.map((u) => (
            <div key={u.id} className="rounded-2xl border border-dashed border-white/15 bg-surface/60 p-3">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-bold">{u.name}</p>
                <span className="text-[10px] text-gold/80">{u.eta}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{u.teaser}</p>
            </div>
          ))}
        </div>
      </Screen>
    </AppShell>
  );
}