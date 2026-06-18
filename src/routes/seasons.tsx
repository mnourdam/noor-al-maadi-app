import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Sparkles, Lock, Trophy, Calendar as CalendarIcon } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { SEASONS, currentSeason, seasonStatus, type Season } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/seasons")({
  head: () => ({ meta: [{ title: "أرشيف المواسم" }] }),
  component: SeasonsPage,
});

const MONTH_NAMES_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function SeasonsPage() {
  const { profile, claimSeason } = useProfile();
  const active = currentSeason();

  return (
    <AppShell>
      <Screen title="أرشيف المواسم" subtitle="رحلة كل شهر · مكافأة لكل موسم">
        <div className="mb-4">
          <Link to="/profile" className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold">
            <ChevronLeft className="size-3.5" /> العودة إلى حسابي
          </Link>
        </div>

        <div className="space-y-3">
          {SEASONS.map((s) => {
            const status = seasonStatus(s);
            const isActive = s.id === active.id;
            return (
              <SeasonCard
                key={s.id}
                season={s}
                status={status}
                isActiveSeason={isActive}
                seasonPoints={isActive ? profile.seasonPoints : 0}
                claimed={isActive ? profile.seasonClaimed : false}
                onClaim={
                  isActive
                    ? () => claimSeason(s.reward.points, s.reward.title)
                    : undefined
                }
              />
            );
          })}
        </div>

        <p className="mt-8 text-center text-[10px] text-white/40">
          {SEASONS.length} موسمًا · موسم لكل شهر من السنة
        </p>
      </Screen>
    </AppShell>
  );
}

function SeasonCard({
  season, status, isActiveSeason, seasonPoints, claimed, onClaim,
}: {
  season: Season;
  status: "active" | "archived" | "locked";
  isActiveSeason: boolean;
  seasonPoints: number;
  claimed: boolean;
  onClaim?: () => void;
}) {
  const pct = Math.min(100, Math.round((seasonPoints / season.goalPoints) * 100));
  const ready = isActiveSeason && seasonPoints >= season.goalPoints && !claimed;
  const monthLabel = MONTH_NAMES_AR[season.month - 1];

  const tone =
    status === "active"   ? "border-gold/50 bg-surface shadow-elegant"
  : status === "archived" ? "border-white/10 bg-surface/60 opacity-90"
  :                          "border-white/8 bg-surface/40 opacity-60";

  const badgeColor =
    status === "active"   ? "bg-gradient-gold text-primary-foreground"
  : status === "archived" ? "bg-white/10 text-white/70"
  :                          "bg-white/5 text-white/50";

  const statusLabel =
    status === "active"   ? "نشط الآن"
  : status === "archived" ? "منتهٍ"
  :                          "مقفل";

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 ${tone}`}>
      {status === "active" && <div className="arabesque-layer" />}
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CalendarIcon className="size-3 text-gold/70" />
              <p className="text-[10px] tracking-[0.2em] text-gold/80">
                {monthLabel} · {season.theme}
              </p>
            </div>
            <p className="font-display mt-1 text-base font-bold">{season.name}</p>
            <p className="mt-1 text-[11px] text-white/65">{season.tagline}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold ${badgeColor}`}>
            {statusLabel}
          </span>
        </div>

        {/* Progress / status */}
        {status === "active" && (
          <>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] tabular-nums text-white/60">
                {Math.min(seasonPoints, season.goalPoints)}/{season.goalPoints}
              </span>
            </div>
            {ready && (
              <button
                onClick={onClaim}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground"
              >
                <Sparkles className="size-3.5" /> استلم مكافأة الموسم
              </button>
            )}
            {claimed && (
              <p className="mt-3 text-[10px] text-gold">✓ استلمتَ مكافأة الموسم</p>
            )}
            {!ready && !claimed && (
              <p className="mt-2 text-[10px] text-white/45">
                ينتهي: {season.endsAt} · الهدف: {season.goalPoints} نقطة
              </p>
            )}
          </>
        )}

        {status === "archived" && (
          <p className="mt-3 text-[10px] text-white/45">
            انتهى هذا الموسم · {season.endsAt}
          </p>
        )}

        {status === "locked" && (
          <p className="mt-3 inline-flex items-center gap-1 text-[10px] text-white/45">
            <Lock className="size-3" /> يُفتح في {monthLabel}
          </p>
        )}

        {/* Rewards */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-1 text-[10px] text-gold">
            <Trophy className="size-3" /> +{season.reward.points} نقطة
          </span>
          {season.reward.title && (
            <span className="rounded-full border border-gold/30 bg-gold/5 px-2 py-1 text-[10px] text-gold">
              لقب: {season.reward.title}
            </span>
          )}
          {season.reward.artifact && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70">
              قطعة: {season.reward.artifact}
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/55">
            شارة: {season.badge}
          </span>
        </div>
      </div>
    </div>
  );
}