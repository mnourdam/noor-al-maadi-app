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
  return (
    <div dir="rtl" className="space-y-3 text-right">
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
  const { buy, inFlight } = useBuyHeart();
  const navigate = useNavigate();
  const recommendation = useRecommendedInvestigation();

  const onBuy = async () => {
    if (inFlight || full) return;
    const res = await buy();
    if (res.status === "purchased") {
      toast.success("تمت استعادة قلب");
    } else if (res.status === "insufficient_dinars") {
      toast.error("رصيدك غير كافٍ", { description: `رصيدك الحالي: ${(res.dinars ?? dinars).toLocaleString("en-US")} دينارًا` });
    } else if (res.status === "hearts_full") {
      toast.message("قلوبك مكتملة");
    } else if (res.status === "unauthorized") {
      toast.error("يلزم تسجيل الدخول");
    } else {
      toast.error("تعذّرت العملية، حاول مجددًا");
    }
  };

  const onPlayInvestigation = () => {
    if (!recommendation.slug) return;
    navigate({ to: "/investigation/$id", params: { id: recommendation.slug } });
  };

  const investigationLabel =
    recommendation.kind === "continue" ? "متابعة التحقيق" : "العب تحقيقًا";

  return (
    <PopShell icon={<Heart className="size-4" />} title={full ? "قلوبك مكتملة" : "استعادة قلب"}>
      {full ? (
        <p className="text-white/70">أنت مستعد لمواصلة رحلتك.</p>
      ) : (
        <p className="text-white/70">
          يمكنك انتظار امتلاء القلب التالي، أو استعادة قلب فورًا بشراء أو بحل تحقيق تاريخي.
        </p>
      )}
      <StatRow label="القلوب الحالية" value={`${hearts}/${HEART_MAX}`} />
      {!full && (
        <StatRow label="القلب التالي بعد" value={formatHeartTimer(next)} />
      )}
      <StatRow label="رصيدك" value={`${dinars.toLocaleString("en-US")} د.`} />
      {!full && (
        <div className="pt-1">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onBuy}
              disabled={inFlight || !canAfford}
              aria-label={`شراء قلب مقابل ${HEART_COST_DINARS} دينارًا`}
              className="motion-tap inline-flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg bg-gradient-to-l from-amber-500 to-yellow-600 px-2 py-2 text-[12.5px] font-bold text-navy shadow-sm transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">
                <Heart className="size-4" strokeWidth={2} />
                {inFlight ? "جارٍ الشراء…" : "شراء قلب"}
              </span>
              <span className="text-[10.5px] font-medium text-navy/80">
                {HEART_COST_DINARS} دينارًا
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
                استعِد قلبًا بحلّه
              </span>
            </button>
          </div>
          {!canAfford && (
            <p className="mt-1.5 text-[10.5px] text-red-300/80">رصيدك غير كافٍ لشراء قلب الآن.</p>
          )}
          {recommendation.ready && !recommendation.slug && (
            <p className="mt-1.5 text-[10.5px] text-white/55">
              لا توجد تحقيقات متاحة الآن — انتظر عودة القلب تلقائيًا.
            </p>
          )}
          <p className="mt-1.5 text-[10.5px] text-white/45">
            كل قلب يعود تلقائيًا بعد فترة من الزمن.
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
  return (
    <PopShell icon={<Coins className="size-4" />} title="الدنانير">
      <p className="text-white/70">
        تكسب الدنانير من إكمال الفصول، التحديات، التحقيقات والإنجازات. ستُستخدم
        لاحقًا لفتح عناصر وتخصيصات داخل إرث.
      </p>
      <StatRow
        label="رصيدك الحالي"
        value={profile.dinars.toLocaleString("en-US")}
      />
    </PopShell>
  );
}

/* ──────────────────────────────────────────────
 * XP / level
 * ──────────────────────────────────────────────*/
export function XPPopover({ profile }: { profile: ProfileState }) {
  const info = levelFor(profile.points);
  const pct = Math.round(info.progress * 100);
  return (
    <PopShell icon={<Star className="size-4" />} title="الخبرة">
      <p className="text-white/70">
        ترتفع خبرتك كلما تقدمت في الحملات والألعاب والتحقيقات.
      </p>
      <StatRow
        label="الخبرة الحالية"
        value={profile.points.toLocaleString("en-US")}
      />
      <div className="rounded-lg bg-white/5 px-2.5 py-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-white/55">
            المستوى {info.level} · {info.title}
          </span>
          {info.next && (
            <span className="text-white/45">
              التالي: {info.next.title}
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
              متبقّي {info.toNext.toLocaleString("en-US")} نقطة
            </span>
          ) : (
            <span>
              <Sparkles className="me-1 inline size-3 text-gold" />
              أعلى مستوى
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
function formatHMS(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}س ${m}د`;
}

export function StreakPopover({ profile }: { profile: ProfileState }) {
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
    <PopShell icon={<Flame className="size-4" />} title="الحماسة">
      <p className="text-white/70">
        {broken
          ? "انقطعت سلسلتك. أكمل نشاطًا مؤهلًا لبدء سلسلة جديدة."
          : activeToday
          ? "حماستك محفوظة اليوم."
          : "أكمل فصلًا أو تحديًا اليوم للحفاظ على السلسلة."}
      </p>
      <StatRow
        label="السلسلة الحالية"
        value={`${liveStreak.toLocaleString("en-US")} يوم`}
      />
      {profile.lastActiveDay && (
        <StatRow label="آخر يوم نشاط" value={profile.lastActiveDay} />
      )}
      {!activeToday && !broken && liveStreak > 0 && (
        <StatRow label="الوقت قبل المخاطرة" value={formatHMS(msUntilEndOfDay())} />
      )}
    </PopShell>
  );
}
