import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChevronLeft, Trophy, Lock } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { useProfile } from "@/lib/profile";
import { useCanonicalInvestigationProgress } from "@/lib/investigations/progress";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  evaluateAchievements,
  type AchievementCategory,
} from "@/lib/app-constants";

export const Route = createFileRoute("/achievements")({
  head: () => ({ meta: [{ title: "الإنجازات" }] }),
  component: AchievementsPage,
});

function AchievementsPage() {
  const { profile } = useProfile();
  const canonicalInv = useCanonicalInvestigationProgress();
  const evals = useMemo(
    () => evaluateAchievements(profile, { investigationsCompletedCount: canonicalInv.count }),
    [profile, canonicalInv.count],
  );
  const earnedAt = profile.achievementsEarned ?? {};

  const earnedCount = evals.filter((e) => e.earned).length;
  const total = ACHIEVEMENTS.length;
  const pct = Math.round((earnedCount / total) * 100);

  const byCategory = useMemo(() => {
    const map = new Map<AchievementCategory, typeof ACHIEVEMENTS>();
    for (const cat of ACHIEVEMENT_CATEGORIES) map.set(cat.id, []);
    for (const a of ACHIEVEMENTS) {
      map.get(a.category)!.push(a);
    }
    return map;
  }, []);

  return (
    <AppShell>
      <Screen title="الإنجازات" subtitle={`${earnedCount} من ${total} إنجازًا`}>
        <div className="mb-4">
          <Link
            to="/profile"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            الحساب
          </Link>
        </div>

        {/* Overall progress */}
        <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-5 shadow-elegant">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center rounded-2xl bg-gold/20 text-gold">
              <Trophy className="size-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold">رحلتك في الإنجازات</p>
              <p className="text-xs text-muted-foreground">واصل اللعب لفتح المزيد</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="font-display shrink-0 text-2xl font-bold text-gold">{pct}%</div>
          </div>
        </div>

        {/* Per category */}
        {ACHIEVEMENT_CATEGORIES.map((cat) => {
          const items = byCategory.get(cat.id) ?? [];
          if (items.length === 0) return null;
          const earnedInCat = items.filter((a) => evals.find((e) => e.id === a.id)?.earned).length;
          return (
            <section key={cat.id} className="mt-7">
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <h3 className="font-display flex items-center gap-2 text-sm font-bold">
                    <span className="text-base">{cat.icon}</span>
                    {cat.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">{cat.tagline}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {earnedInCat} / {items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((a) => {
                  const p = evals.find((x) => x.id === a.id)!;
                  const secret = a.secret && !p.earned;
                  const pctA = Math.round((p.current / a.goal) * 100);
                  const ts = earnedAt[a.id];
                  return (
                    <div
                      key={a.id}
                      className={`relative overflow-hidden rounded-2xl border p-3 transition-all ${
                        p.earned
                          ? "border-gold/40 bg-gold/5 shadow-gold/30 shadow-md"
                          : "border-white/10 bg-surface"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`grid size-12 shrink-0 place-items-center rounded-xl text-xl ${
                            p.earned ? "bg-gold/20 text-gold" : "bg-white/5 text-muted-foreground"
                          }`}
                        >
                          {secret ? <Lock className="size-5" /> : a.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-display truncate text-sm font-bold">
                              {secret ? "إنجاز سرّي" : a.name}
                            </p>
                            {p.earned && <Trophy className="size-4 shrink-0 text-gold" />}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {secret ? "اكتشف بنفسك…" : a.desc}
                          </p>
                          {!secret && (
                            <div className="mt-2">
                              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full bg-gradient-gold"
                                  style={{ width: `${pctA}%` }}
                                />
                              </div>
                              <p className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>
                                  {p.current} / {a.goal}
                                </span>
                                {p.earned && ts && (
                                  <span className="text-gold">
                                    {new Date(ts).toLocaleDateString("ar-EG", {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                )}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <div className="h-8" />
      </Screen>
    </AppShell>
  );
}
