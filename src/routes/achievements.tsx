import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChevronLeft, Trophy, Lock } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { useAchievementViews } from "@/lib/achievements/v2/driver";
import type { AchievementCategory, AchievementView } from "@/lib/achievements/v2";

export const Route = createFileRoute("/achievements")({
  head: () => ({ meta: [{ title: "الإنجازات" }] }),
  component: AchievementsPage,
});

const CATEGORY_META: Record<AchievementCategory, { name: string; tagline: string; icon: string }> = {
  campaigns:      { name: "الحملات التاريخية", tagline: "إنجاز الحملات الكبرى",           icon: "⚔️" },
  investigations: { name: "التحقيقات",          tagline: "قضايا وأسرار",                  icon: "🔍" },
  encyclopedia:   { name: "الموسوعة",           tagline: "الشخصيات والعصور",              icon: "📖" },
  museum:         { name: "المتحف",             tagline: "قطع الأثر والتراث",             icon: "🏛️" },
  atlas:          { name: "الأطلس",             tagline: "الأقاليم والأقطار",             icon: "🗺️" },
  worlds:         { name: "العوالم",            tagline: "استكمال العوالم",               icon: "🌌" },
  economy:        { name: "الثروة والخبرة",    tagline: "الدنانير والنقاط",              icon: "💎" },
  level:          { name: "المستوى",            tagline: "رحلة التقدم",                   icon: "⭐" },
  daily:          { name: "المثابرة اليومية",   tagline: "السلاسل والتحديات",             icon: "🔥" },
  collection:     { name: "الجامع",             tagline: "بناء المجموعة",                 icon: "📦" },
  special:        { name: "خاصة",               tagline: "الإنجازات المميزة",             icon: "👑" },
  seasonal:       { name: "المواسم",            tagline: "إنجازات المواسم",               icon: "🍁" },
};

const CATEGORY_ORDER: AchievementCategory[] = [
  "campaigns", "investigations", "museum", "encyclopedia", "atlas",
  "collection", "level", "economy", "daily", "worlds", "special", "seasonal",
];

function AchievementsPage() {
  const views = useAchievementViews();

  const earnedCount = views.filter((v) => v.state === "unlocked" || v.state === "claimed").length;
  const total = views.length;
  const pct = total > 0 ? Math.round((earnedCount / total) * 100) : 0;

  const byCategory = useMemo(() => {
    const map = new Map<AchievementCategory, AchievementView[]>();
    for (const c of CATEGORY_ORDER) map.set(c, []);
    for (const v of views) {
      const list = map.get(v.category) ?? [];
      list.push(v);
      map.set(v.category, list);
    }
    for (const [k, list] of map) {
      map.set(k, [...list].sort((a, b) => a.sortOrder - b.sortOrder));
    }
    return map;
  }, [views]);

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

        {CATEGORY_ORDER.map((cat) => {
          const items = byCategory.get(cat) ?? [];
          if (items.length === 0) return null;
          const meta = CATEGORY_META[cat];
          const earnedInCat = items.filter((v) => v.state === "unlocked" || v.state === "claimed").length;
          return (
            <section key={cat} className="mt-7">
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <h3 className="font-display flex items-center gap-2 text-sm font-bold">
                    <span className="text-base">{meta.icon}</span>
                    {meta.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">{meta.tagline}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {earnedInCat} / {items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((v) => {
                  const earned = v.state === "unlocked" || v.state === "claimed";
                  const secret = v.state === "locked-secret";
                  const pctA = Math.round(v.progress * 100);
                  const ts = v.unlockedAt ? new Date(v.unlockedAt).getTime() : null;
                  return (
                    <div
                      key={v.id}
                      className={`relative overflow-hidden rounded-2xl border p-3 transition-all ${
                        earned
                          ? "border-gold/40 bg-gold/5 shadow-gold/30 shadow-md"
                          : "border-white/10 bg-surface"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`grid size-12 shrink-0 place-items-center rounded-xl text-xl ${
                            earned ? "bg-gold/20 text-gold" : "bg-white/5 text-muted-foreground"
                          }`}
                        >
                          {secret ? <Lock className="size-5" /> : v.media.icon.ref}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-display truncate text-sm font-bold">
                              {secret ? "إنجاز سرّي" : (v.displayTitle ?? v.id)}
                            </p>
                            {earned && <Trophy className="size-4 shrink-0 text-gold" />}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {secret ? "اكتشف بنفسك…" : (v.displayDescription ?? "")}
                          </p>
                          {!secret && (
                            <div className="mt-2">
                              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full bg-gradient-gold" style={{ width: `${pctA}%` }} />
                              </div>
                              <p className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>{pctA}%</span>
                                {earned && ts && (
                                  <span className="text-gold">
                                    {new Date(ts).toLocaleDateString("ar-EG", { month: "short", day: "numeric" })}
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
