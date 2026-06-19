import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Crown, Flame, Star, Trophy, LogOut, Volume2, BellRing, Sparkles, Info, ChevronLeft, Wrench, IdCard, Pencil, Check, Calendar, Compass, Heart, MapPin, Coins, Search, Gift, Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppShell, Screen } from "@/components/AppShell";
import {
  ACHIEVEMENTS, evaluateAchievements, levelFor, CURRENT_SEASON,
  AMBIENCE_TRACKS, ERAS, CHARACTERS, ARTIFACTS,
} from "@/lib/data";
import { useProfile } from "@/lib/profile";
import { STREAK_MILESTONES, getEffectiveHearts, HEART_MAX, msUntilNextHeart } from "@/lib/hearts";
import { AccountSection } from "@/components/AccountSection";
import { Avatar } from "@/components/Avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { DEFAULT_NOTIFICATION_PREFS, ensurePermission } from "@/lib/notifications";
import { DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { useAccount } from "@/lib/account";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "حسابي" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, logout, updateSettings, claimSeason, setBio, setFavorites, claimStreakMilestone, spendDinarsForHeart, setAvatar, setNotificationPrefs } = useProfile();
  const { account, user } = useAccount();
  const displayName = account?.username ?? (user ? profile.name : profile.name) ?? "ضيف";
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(profile.bio ?? "");
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const prefs = profile.settings.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;

  const lvl = levelFor(profile.points);
  const achievements = evaluateAchievements(profile);
  const seasonPct = Math.min(100, Math.round((profile.seasonPoints / CURRENT_SEASON.goalPoints) * 100));
  const seasonReady = profile.seasonPoints >= CURRENT_SEASON.goalPoints && !profile.seasonClaimed;

  const discoveryPct = useMemo(() => {
    const total = CHARACTERS.length + ARTIFACTS.length;
    const done = profile.charactersUnlocked.length + profile.artifactsFound.length;
    return total ? Math.round((done / total) * 100) : 0;
  }, [profile.charactersUnlocked.length, profile.artifactsFound.length]);

  const joinDate = useMemo(() => {
    // Approximate the join date using the active streak: lastActiveDay - streak days.
    if (!profile.lastActiveDay) return null;
    const d = new Date(profile.lastActiveDay);
    d.setDate(d.getDate() - Math.max(0, profile.streak - 1));
    return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  }, [profile.lastActiveDay, profile.streak]);

  const favState = ERAS.find((e) => e.id === profile.favoriteStateId);
  const favFigure = CHARACTERS.find((c) => c.id === profile.favoriteFigureId);

  const now = Date.now();
  const effHearts = getEffectiveHearts(profile, now);
  const minsToHeart = Math.max(1, Math.ceil(msUntilNextHeart(profile, now) / 60_000));

  return (
    <AppShell>
      <Screen title="حسابي" subtitle="تاريخك معنا">
        {/* Identity */}
        <div className="relative overflow-hidden rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant">
          <div className="particle-field" />
          <div className="relative flex items-center gap-4">
            <button
              onClick={() => setPickingAvatar(true)}
              className="relative shrink-0"
              aria-label="تغيير الصورة"
            >
              <Avatar avatarId={profile.avatarId ?? DEFAULT_AVATAR_ID} size="lg" />
              <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border border-gold/40 bg-background text-gold">
                <Pencil className="size-3" />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-display truncate text-lg font-bold">{displayName}</p>
              <p className="text-[11px] text-gold">المستوى {lvl.level} · {lvl.title}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold" style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
              </div>
            </div>
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat icon={<Star className="size-3.5" />} label="نقاط" value={profile.points} />
            <Stat icon={<Coins className="size-3.5" />} label="دنانير" value={profile.dinars} />
            <Stat icon={<Flame className="size-3.5" />} label="سلسلة" value={profile.streak} />
          </div>
          <div className="relative mt-2 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl border border-white/10 bg-background/40 p-2">
              <div className="flex items-center justify-center gap-0.5 text-red-400">
                {Array.from({ length: HEART_MAX }).map((_, i) => (
                  <Heart key={i} className={`size-3.5 ${i < effHearts ? "fill-red-500 text-red-500" : "text-white/20"}`} />
                ))}
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                قلوب · {effHearts < HEART_MAX ? `قلب جديد بعد ${minsToHeart}د` : "ممتلئة"}
              </p>
            </div>
            <Stat icon={<Crown className="size-3.5" />} label="حملات" value={profile.campaignsCompleted.length} />
          </div>
          {effHearts < HEART_MAX && (
            <button
              onClick={() => spendDinarsForHeart()}
              disabled={profile.dinars < 20}
              className="relative mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-gold/30 bg-gold/5 py-2 text-[11px] text-gold disabled:opacity-40"
            >
              <Heart className="size-3.5" /> استرجع قلبًا مقابل <Coins className="size-3" /> 20
            </button>
          )}
        </div>

        {/* Investigations CTA */}
        <Link to="/investigations" className="mt-4 flex items-center gap-3 rounded-2xl border border-gold/25 bg-surface p-4">
          <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
            <Search className="size-5" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="font-display text-sm font-bold">التحقيقات التاريخية</p>
            <p className="text-[11px] text-muted-foreground">قرائن، تلميحات، ومكافآت بالدنانير</p>
          </div>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </Link>

        {/* Streak milestones */}
        <div className="mt-5 rounded-2xl border border-gold/25 bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="font-display text-sm font-bold inline-flex items-center gap-2">
              <Flame className="size-4 text-orange-400" /> سلسلتك اليومية
            </p>
            <span className="text-[11px] text-muted-foreground">{profile.streak.toLocaleString("ar-EG")} يوم</span>
          </div>
          <div className="mt-3 space-y-2">
            {STREAK_MILESTONES.map((m) => {
              const claimed = (profile.streakMilestonesClaimed ?? []).includes(m.days);
              const ready = profile.streak >= m.days && !claimed;
              return (
                <div key={m.days} className={`flex items-center gap-3 rounded-xl border p-3 ${claimed ? "border-gold/30 bg-gold/5" : ready ? "border-gold/50 bg-gold/10" : "border-white/10 bg-background/40"}`}>
                  <div className="grid size-9 place-items-center rounded-lg bg-gold/15 text-gold">
                    <Gift className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[12px] font-bold">{m.days} يوم · {m.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {m.xp ? `+${m.xp} نقطة · ` : ""}{m.dinars ? `+${m.dinars} دينار` : ""}
                      {m.badge ? " · شارة" : ""}{m.artifact ? " · أثر" : ""}{m.title ? " · لقب" : ""}
                    </p>
                  </div>
                  {claimed ? (
                    <span className="text-[10px] text-gold">✓ مُستلَم</span>
                  ) : (
                    <button
                      onClick={() => claimStreakMilestone(m.days)}
                      disabled={!ready}
                      className="rounded-full bg-gradient-gold px-3 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-40"
                    >
                      {ready ? "استلم" : "مقفل"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Historical Identity Card */}
        <div className="mt-5"><AccountSection /></div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Link to="/friends" className="flex flex-col items-center gap-1 rounded-2xl border border-gold/25 bg-surface p-3 text-xs">
            <span className="text-base">👥</span> الأصدقاء
          </Link>
          <Link to="/referrals" className="flex flex-col items-center gap-1 rounded-2xl border border-gold/25 bg-surface p-3 text-xs">
            <span className="text-base">🎁</span> حَمَلة الإرث
          </Link>
          <Link to="/share-card" className="flex flex-col items-center gap-1 rounded-2xl border border-gold/25 bg-surface p-3 text-xs">
            <span className="text-base">🪪</span> مشاركة البطاقة
          </Link>
        </div>

        {/* Historical Identity Card */}
        <div className="mt-5 relative overflow-hidden rounded-3xl border border-gold/30 parchment-dark p-5 shadow-elegant">
          <div className="arabesque-layer" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] text-gold">
                <IdCard className="size-3.5" /> بطاقة الهوية التاريخية
              </div>
              <span className="rounded-full border border-gold/40 bg-black/30 px-2 py-0.5 text-[10px] text-gold">إرث · {displayName}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <IdRow icon={<Crown className="size-3" />} label="اللقب" value={lvl.title} />
              <IdRow icon={<Star className="size-3" />} label="المستوى" value={`${lvl.level}`} />
              <IdRow icon={<Calendar className="size-3" />} label="تاريخ الانضمام" value={joinDate ?? "—"} />
              <IdRow icon={<Flame className="size-3" />} label="السلسلة" value={`${profile.streak} يومًا`} />
              <IdRow icon={<Sparkles className="size-3" />} label="مجموع النقاط" value={`${profile.points}`} />
              <IdRow icon={<Compass className="size-3" />} label="نسبة الاكتشاف" value={`${discoveryPct}٪`} />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <label className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-background/40 px-3 py-2">
                <span className="inline-flex items-center gap-2 text-[11px] text-gold/80"><MapPin className="size-3" /> الدولة المفضّلة</span>
                <select
                  value={profile.favoriteStateId ?? ""}
                  onChange={(e) => setFavorites({ favoriteStateId: e.target.value })}
                  className="min-w-0 flex-1 bg-transparent text-right text-xs outline-none"
                >
                  <option value="">— اختر —</option>
                  {ERAS.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-background/40 px-3 py-2">
                <span className="inline-flex items-center gap-2 text-[11px] text-gold/80"><Heart className="size-3" /> الشخصية المفضّلة</span>
                <select
                  value={profile.favoriteFigureId ?? ""}
                  onChange={(e) => setFavorites({ favoriteFigureId: e.target.value })}
                  className="min-w-0 flex-1 bg-transparent text-right text-xs outline-none"
                >
                  <option value="">— اختر —</option>
                  {CHARACTERS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </div>

            {(favState || favFigure) && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                {favState && <>دولتك: <span className="text-gold">{favState.name}</span> · </>}
                {favFigure && <>شخصيتك: <span className="text-gold">{favFigure.name}</span></>}
              </p>
            )}

            {/* Bio */}
            <div className="mt-3 rounded-xl border border-gold/20 bg-background/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] tracking-[0.2em] text-gold">نبذة عني</p>
                {!editingBio ? (
                  <button
                    onClick={() => { setBioDraft(profile.bio ?? ""); setEditingBio(true); }}
                    className="inline-flex items-center gap-1 rounded-full border border-gold/30 px-2 py-0.5 text-[10px] text-gold hover:bg-gold/10"
                  ><Pencil className="size-3" /> تعديل</button>
                ) : (
                  <button
                    onClick={() => { setBio(bioDraft.trim()); setEditingBio(false); }}
                    className="inline-flex items-center gap-1 rounded-full bg-gradient-gold px-2 py-0.5 text-[10px] font-bold text-primary-foreground"
                  ><Check className="size-3" /> حفظ</button>
                )}
              </div>
              {editingBio ? (
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value.slice(0, 240))}
                  rows={3}
                  placeholder="مثال: مهتم بتاريخ الشام والحروب الصليبية."
                  className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-background px-3 py-2 text-[12px] leading-6 outline-none focus:border-gold/40"
                />
              ) : (
                <p className="mt-2 text-[12px] leading-6 text-foreground/85">
                  {profile.bio?.trim() ? profile.bio : <span className="italic text-muted-foreground">لم تكتب نبذةً بعد. اضغط «تعديل» لتعريف نفسك.</span>}
                </p>
              )}
            </div>
          </div>
        </div>


        {/* Season */}
        <div className="mt-5 rounded-2xl border border-gold/25 bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] text-gold">🏆 {CURRENT_SEASON.name}</p>
              <p className="font-display mt-1 text-sm font-bold">{CURRENT_SEASON.tagline}</p>
            </div>
            <Link
              to="/seasons"
              className="shrink-0 rounded-full border border-gold/30 px-2.5 py-1 text-[10px] text-gold hover:bg-gold/10"
            >
              كل المواسم
            </Link>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-gold" style={{ width: `${seasonPct}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{Math.min(profile.seasonPoints, CURRENT_SEASON.goalPoints)}/{CURRENT_SEASON.goalPoints}</p>
          {seasonReady && (
            <button
              onClick={() => claimSeason(CURRENT_SEASON.reward.points, CURRENT_SEASON.reward.title)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground"
            ><Sparkles className="size-3.5" /> استلم مكافأة الموسم</button>
          )}
          {profile.seasonClaimed && <p className="mt-2 text-[10px] text-gold">✓ استلمتَ مكافأة الموسم</p>}
        </div>

        {/* Titles */}
        {profile.titlesEarned.length > 0 && (
          <div className="mt-5">
            <h3 className="font-display mb-2 text-sm font-bold">ألقابك</h3>
            <div className="flex flex-wrap gap-2">
              {profile.titlesEarned.map((t) => (
                <span key={t} className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] text-gold">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Achievements */}
        <h3 className="font-display mt-7 mb-3 text-sm font-bold">الإنجازات</h3>
        <div className="space-y-2">
          {ACHIEVEMENTS.map((a) => {
            const p = achievements.find((x) => x.id === a.id)!;
            const pct = Math.round((p.current / a.goal) * 100);
            const secret = a.secret && !p.earned;
            return (
              <div key={a.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${p.earned ? "border-gold/40 bg-gold/5" : "border-white/10 bg-surface"}`}>
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-lg">{secret ? "❔" : a.icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-display truncate text-sm font-bold">{secret ? "إنجاز سرّي" : a.name}</p>
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">{secret ? "اكتشف بنفسك…" : a.desc}</p>
                  {!secret && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                {p.earned && <Trophy className="size-4 shrink-0 text-gold" />}
              </div>
            );
          })}
        </div>

        {/* Settings */}
        <h3 className="font-display mt-7 mb-3 text-sm font-bold">الإعدادات</h3>
        <div className="space-y-2">
          <SettingToggle
            icon={<Volume2 className="size-4" />}
            label="موسيقى الأجواء"
            desc="نغمات هادئة تتبع العصر الذي تستكشفه"
            value={profile.settings.ambienceEnabled}
            onChange={(v) => updateSettings({ ambienceEnabled: v })}
          />
          <SettingToggle
            icon={<BellRing className="size-4" />}
            label="تفعيل الإشعارات"
            desc="مفتاح رئيسي لكل أنواع الإشعارات"
            value={prefs.master}
            onChange={async (v) => { if (v) await ensurePermission(); setNotificationPrefs({ master: v }); updateSettings({ notifications: v }); }}
          />
          <SettingToggle
            icon={<Sparkles className="size-4" />}
            label="تقليل الحركة"
            desc="إيقاف الجزيئات والتأثيرات المتحرّكة"
            value={profile.settings.reduceMotion}
            onChange={(v) => updateSettings({ reduceMotion: v })}
          />
        </div>

        {/* Notification preferences */}
        <div className="mt-5 rounded-2xl border border-gold/25 bg-surface p-4">
          <p className="font-display mb-1 inline-flex items-center gap-2 text-sm font-bold">
            <Bell className="size-4 text-gold" /> تفضيلات الإشعارات
          </p>
          <p className="mb-3 text-[11px] text-muted-foreground">
            تحكّم بنوع التنبيهات التي تصلك. تتطلّب «تفعيل الإشعارات» أعلاه.
          </p>
          <div className="space-y-2 opacity-100">
            <SettingToggle
              icon={<Calendar className="size-4" />}
              label="حدث في مثل هذا اليوم"
              desc="تذكير يومي بحدثٍ تاريخي"
              value={prefs.daily && prefs.master}
              onChange={(v) => setNotificationPrefs({ daily: v })}
            />
            <SettingToggle
              icon={<Compass className="size-4" />}
              label="تنبيهات العودة"
              desc="فضول تاريخي إن غبت يومًا كاملاً"
              value={prefs.reengagement && prefs.master}
              onChange={(v) => setNotificationPrefs({ reengagement: v })}
            />
            <SettingToggle
              icon={<Crown className="size-4" />}
              label="إشعارات الحملات"
              desc="عند فتح حملة جديدة أو سرّية"
              value={prefs.campaign && prefs.master}
              onChange={(v) => setNotificationPrefs({ campaign: v })}
            />
            <SettingToggle
              icon={<Sparkles className="size-4" />}
              label="إشعارات المواسم"
              desc="بدء موسم جديد أو مكافأة جاهزة"
              value={prefs.season && prefs.master}
              onChange={(v) => setNotificationPrefs({ season: v })}
            />
          </div>
        </div>

        {profile.settings.ambienceEnabled && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-surface p-3">
            <p className="text-[10px] text-gold">مقاطع الأجواء</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {AMBIENCE_TRACKS.map((t) => (
                <span key={t.id} className="rounded-full border border-white/10 bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{t.name}</span>
              ))}
            </div>
          </div>
        )}

        {profile.loggedIn && (
          <button
            onClick={logout}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-surface py-3 text-xs text-muted-foreground"
          ><LogOut className="size-4" /> تسجيل الخروج وإعادة التهيئة</button>
        )}

        <Link
          to="/about"
          className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-gold/25 bg-surface p-3"
        >
          <div className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold">
            <Info className="size-4" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="font-display text-sm font-bold">حول إرث</p>
            <p className="text-[11px] text-muted-foreground">عن المشروع والإصدار والميزات</p>
          </div>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </Link>

        <h3 className="font-display mt-6 mb-2 text-[11px] text-muted-foreground">أدوات المطوّر</h3>
        <Link
          to="/content-audit"
          className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3"
        >
          <div className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold">
            <Wrench className="size-4" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="font-display text-sm font-bold">تدقيق المحتوى</p>
            <p className="text-[11px] text-muted-foreground">إحصاءات الحِزَم، التغطية، والثغرات</p>
          </div>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </Link>
      </Screen>
      {pickingAvatar && (
        <AvatarPicker
          currentId={profile.avatarId ?? DEFAULT_AVATAR_ID}
          onPick={(id) => setAvatar(id)}
          onClose={() => setPickingAvatar(false)}
        />
      )}
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/40 p-2">
      <div className="flex items-center justify-center gap-1 text-gold">{icon}<span className="font-display text-sm font-bold">{value}</span></div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function IdRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-background/40 px-2.5 py-1.5">
      <span className="inline-flex items-center gap-1.5 text-[10px] text-gold/80">{icon}{label}</span>
      <span className="truncate text-[11px] font-display font-bold">{value}</span>
    </div>
  );
}

function SettingToggle({ icon, label, desc, value, onChange }: { icon: React.ReactNode; label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3 text-right"
    >
      <div className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-bold">{label}</p>
        <p className="line-clamp-1 text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <span className={`relative h-5 w-9 rounded-full transition ${value ? "bg-gradient-gold" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 size-4 rounded-full bg-white transition ${value ? "right-0.5" : "right-[18px]"}`} />
      </span>
    </button>
  );
}