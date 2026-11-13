import { useUiLanguage } from "@/lib/ui-language/store";
import { useEffect, useState } from "react";
import { Heart, Coins, Star, Flame, Trophy, Sparkles, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { deriveStreak, type ProfileState } from "@/lib/profile";
import {
  HEART_MAX,
  getEffectiveHearts,
  msUntilNextHeart,
  formatHeartTimer,
} from "@/lib/hearts";
import { HEART_COST_DINARS } from "@/lib/economy";
import { useBuyHeart } from "@/hooks/useBuyHeart";
import { useRecommendedInvestigation } from "@/lib/investigations/recommend";
import { toast } from "sonner";
import { levelFor } from "@/lib/progression";

/* ──────────────────────────────────────────────
 * Shared shell — premium Irth navy + parchment gold
 * ──────────────────────────────────────────────*/
function PopShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const { language, direction } = useUiLanguage();
  return (
    <div lang={language} dir={direction} className="space-y-3 text-start">
      <div className="flex items-center gap-2 border-b border-gold/20 pb-2">
        <span className="grid size-7 place-items-center rounded-full bg-gold/15 text-gold">
          {icon}
        </span>
        <h3 className="font-display text-sm font-bold text-gold">{title}</h3>
      </div>
      <div className="space-y-2 text-[12px] leading-relaxed text-white/80">
        {children}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5">
      <span className="text-[11px] text-white/55">{label}</span>
      <span className="font-display text-sm font-bold text-gold tabular-nums">
        {value}
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────
 * Hearts — includes atomic purchase action
 * ──────────────────────────────────────────────*/
export function HeartsPopover({ profile }: { profile: ProfileState }) {
  const { messages } = useUiLanguage();
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();
  const hearts = getEffectiveHearts(profile, now);
  const full = hearts >= HEART_MAX;
  const next = msUntilNextHeart(profile, now);
  const dinars = profile.dinars ?? 0;
  const canAfford = dinars >= HEART_COST_DINARS;
  const { buy, inFlight, needsReconciliation } = useBuyHeart();
  const navigate = useNavigate();
  const recommendation = useRecommendedInvestigation();

  const onBuy = async () => {
    if (inFlight || full || needsReconciliation) return;
    // Result wording follows the language chosen when this purchase was started.
    const purchaseMessages = messages;
    const res = await buy();
    if (res.status === "purchased") {
      toast.success(purchaseMessages.heartPurchased);
    } else if (res.status === "unresolved") {
      toast.message(purchaseMessages.heartUnresolved);
    } else if (res.status === "insufficient_dinars") {
      toast.error(purchaseMessages.balanceInsufficient, { description: purchaseMessages.currentBalanceToast.replace("{amount}", (res.dinars ?? dinars).toLocaleString("en-US")) });
    } else if (res.status === "hearts_full") {
      toast.message(purchaseMessages.heartsFull);
    } else if (res.status === "unauthorized") {
      toast.error(purchaseMessages.signInRequired);
    } else {
      toast.error(purchaseMessages.purchaseFailed);
    }
  };

  const onPlayInvestigation = () => {
    if (!recommendation.slug) return;
    navigate({ to: "/investigation/$id", params: { id: recommendation.slug } });
  };

  const investigationLabel =
    recommendation.kind === "continue" ? messages.continueInvestigation : messages.playInvestigation;

  return (
    <PopShell icon={<Heart className="size-4" />} title={full ? messages.heartsFull : messages.restoreHeart}>
      {full ? (
        <p className="text-white/70">{messages.journeyReady}</p>
      ) : (
        <p className="text-white/70">
          {messages.heartOptions}
        </p>
      )}
      <StatRow label={messages.currentHearts} value={`${hearts}/${HEART_MAX}`} />
      {!full && (
        <StatRow label={messages.nextHeartAfter} value={formatHeartTimer(next)} />
      )}
      <StatRow label={messages.yourBalance} value={`${dinars.toLocaleString("en-US")} ${messages.dinarShort}`} />
      {!full && (
        <div className="pt-1">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onBuy}
              disabled={inFlight || needsReconciliation || !canAfford}
              aria-label={messages.buyHeartLabel.replace("{cost}", String(HEART_COST_DINARS))}
              className="motion-tap inline-flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg bg-gradient-to-l from-amber-500 to-yellow-600 px-2 py-2 text-[12.5px] font-bold text-navy shadow-sm transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">
                <Heart className="size-4" strokeWidth={2} />
                {inFlight ? messages.buyingHeart : messages.buyHeart}
              </span>
              <span className="text-[10.5px] font-medium text-navy/80">
                {HEART_COST_DINARS} {messages.dinarUnit}
              </span>
            </button>
            <button
              type="button"
              onClick={onPlayInvestigation}
              disabled={!recommendation.ready || !recommendation.slug}
              aria-label={investigationLabel}
              className="motion-tap inline-flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg border border-gold/40 bg-white/5 px-2 py-2 text-[12.5px] font-bold text-gold transition hover:bg-white/10 active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">
                <Search className="size-4" strokeWidth={2} />
                {investigationLabel}
              </span>
              <span className="text-[10.5px] font-medium text-gold/70">
                {messages.solveForHeart}
              </span>
            </button>
          </div>
          {needsReconciliation && (
            <p className="mt-1.5 text-[10.5px] text-amber-200">{messages.heartReconcileWarning}</p>
          )}
          {!canAfford && (
            <p className="mt-1.5 text-[10.5px] text-red-300/80">{messages.heartUnaffordable}</p>
          )}
          {recommendation.ready && !recommendation.slug && (
            <p className="mt-1.5 text-[10.5px] text-white/55">
              {messages.noInvestigation}
            </p>
          )}
          <p className="mt-1.5 text-[10.5px] text-white/45">
            {messages.heartRefills}
          </p>
        </div>
      )}
    </PopShell>
  );
}


/* ──────────────────────────────────────────────
 * Dinars
 * ──────────────────────────────────────────────*/
export function DinarsPopover({ profile }: { profile: ProfileState }) {
  const { messages } = useUiLanguage();
  return (
    <PopShell icon={<Coins className="size-4" />} title={messages.dinars}>
      <p className="text-white/70">
        {messages.dinarsExplanation}
      </p>
      <StatRow
        label={messages.currentBalance}
        value={profile.dinars.toLocaleString("en-US")}
      />
    </PopShell>
  );
}

/* ──────────────────────────────────────────────
 * XP / level
 * ──────────────────────────────────────────────*/
export function XPPopover({ profile }: { profile: ProfileState }) {
  const { messages } = useUiLanguage();
  const info = levelFor(profile.points);
  const pct = Math.round(info.progress * 100);
  return (
    <PopShell icon={<Star className="size-4" />} title={messages.experience}>
      <p className="text-white/70">
        {messages.xpExplanation}
      </p>
      <StatRow
        label={messages.currentXP}
        value={profile.points.toLocaleString("en-US")}
      />
      <div className="rounded-lg bg-white/5 px-2.5 py-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-white/55">
            {messages.levelLabel} {info.level} · <bdi lang="ar" dir="rtl">{info.title}</bdi>
          </span>
          {info.next && (
            <span className="text-white/45">
              {messages.nextLevelLabel} <bdi lang="ar" dir="rtl">{info.next.title}</bdi>
            </span>
          )}
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-l from-amber-300 to-yellow-600"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-white/55 tabular-nums">
          <span>{pct}%</span>
          {info.next ? (
            <span>
              <Trophy className="me-1 inline size-3 text-gold" />
              {messages.pointsRemaining.replace("{amount}", info.toNext.toLocaleString("en-US"))}
            </span>
          ) : (
            <span>
              <Sparkles className="me-1 inline size-3 text-gold" />
              {messages.highestLevel}
            </span>
          )}
        </div>
      </div>
    </PopShell>
  );
}

/* ──────────────────────────────────────────────
 * Streak
 * ──────────────────────────────────────────────*/
function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function msUntilEndOfDay(): number {
  const d = new Date();
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0);
  return Math.max(0, end.getTime() - d.getTime());
}
function formatHMS(ms: number, hours: string, minutes: string): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}${hours} ${m}${minutes}`;
}

export function StreakPopover({ profile }: { profile: ProfileState }) {
  const { messages } = useUiLanguage();
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const today = isoToday();
  const derived = deriveStreak(profile.streak, profile.lastActiveDay);
  const liveStreak = derived.streak;
  const activeToday = profile.lastActiveDay === today;
  const broken = derived.status === "expired";
  return (
    <PopShell icon={<Flame className="size-4" />} title={messages.streak}>
      <p className="text-white/70">
        {broken
          ? messages.streakBroken
          : activeToday
          ? messages.streakSafe
          : messages.streakMaintain}
      </p>
      <StatRow
        label={messages.currentStreak}
        value={`${liveStreak.toLocaleString("en-US")} ${messages.daysUnit}`}
      />
      {profile.lastActiveDay && (
        <StatRow label={messages.lastActiveDay} value={profile.lastActiveDay} />
      )}
      {!activeToday && !broken && liveStreak > 0 && (
        <StatRow label={messages.timeBeforeRisk} value={formatHMS(msUntilEndOfDay(), messages.hoursShort, messages.minutesShort)} />
      )}
    </PopShell>
  );
}
