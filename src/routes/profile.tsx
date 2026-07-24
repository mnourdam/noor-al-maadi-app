import { createFileRoute, Link } from "@tanstack/react-router";
import { countMyUnreadFeedback } from "@/lib/feedback/api";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Crown, Flame, Star, Trophy, LogOut, Volume2, BellRing, Sparkles, Info,
  ChevronLeft, IdCard, Pencil, Check, Calendar, Compass, Heart, MapPin,
  Coins, Gift, Bell, Music, Zap, LayoutGrid, TrendingUp, Medal, ScrollText,
  Users2, Settings as SettingsIcon, X, BookOpen, Swords, Landmark, Search,
  Map as MapIcon, Copy, Share2, QrCode, ChevronRight, Lock, Hourglass,
  Type as TypeIcon, Sprout, Inbox, Mail, Package, Gem, Award,
} from "lucide-react";
import { z } from "zod";

import { toWesternDigits } from "@/lib/formatNumber";
import { useAudioSettings } from "@/hooks/useAudioSettings";
import { AppShell, Screen } from "@/components/AppShell";
import { CinematicPageBackdrop } from "@/components/CinematicPageBackdrop";
import profileHeaderArt from "@/assets/hero/22-scholar-journey.jpg?url";
import { isAndroidNativeApp } from "@/lib/androidFreezeDiagnostics";
import {
  levelFor,
  ERAS,
} from "@/lib/app-constants";
import { useAchievementViews } from "@/lib/achievements/v2/driver";
import type { AchievementView } from "@/lib/achievements/v2";
import {
  CATEGORY_ICON, CATEGORY_META, CATEGORY_ORDER, RARITY_STYLE, SECRET_STYLE, isEarned,
} from "@/lib/achievements/v2/presentation";
import {
  useAchievementCompletion, useNearestAchievement, useLatestUnlockedAchievement,
} from "@/lib/achievements/v2/selectors";
import { useProfile } from "@/lib/profile";
import { useCanonicalInvestigationProgress } from "@/lib/investigations/progress";
import { useAllWorldsProgress } from "@/lib/worlds-progress";
import { useCampaignRecommendation } from "@/lib/campaignRecommendationService";
import { useUnifiedDiscoveryFeed, type DiscoveryItem } from "@/lib/playerDiscoveries";
import { STREAK_MILESTONES, getEffectiveHearts, HEART_MAX, msUntilNextHeart } from "@/lib/hearts";
import { AccountSection } from "@/components/AccountSection";
import { CommunityHubSection } from "@/components/CommunityHubSection";
import { Avatar } from "@/components/Avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { DEFAULT_NOTIFICATION_PREFS, ensurePermission } from "@/lib/notifications";
import { DEFAULT_AVATAR_ID } from "@/lib/avatars";
import { useAccount } from "@/lib/account";
import { clearLocalPlayerProgress } from "@/lib/resetProgress";
import { ModalPortal } from "@/components/ModalPortal";
// Phase 2 (Referrals removal): `@/lib/referrals` was deleted. Referral
// stats, share buttons, and the standalone `/referrals` route are gone.
import { fetchMyNewsletterSubscription, setMyNewsletterSubscription } from "@/lib/newsletter";
import { AndroidTextEntryInput, AndroidTextEntryTextarea, readAndroidTextEntryResult } from "@/components/AndroidTextEntry";
import { ReadingScale } from "@/components/ReadingScale";


type TabId = "overview" | "progress" | "achievements" | "seasons" | "settings";

const TAB_IDS = ["overview", "progress", "achievements", "seasons", "settings"] as const;

const profileSearchSchema = z.object({
  // `tab` accepts any known tab id (case-insensitive). Legacy `/achievements`
  // redirects here with `?tab=achievements`; other surfaces may also deep-link
  // straight to a specific section.
  tab: z.enum(TAB_IDS).optional(),
  achievement: z.string().min(1).max(128).optional(),
}).partial();

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "حسابي" }] }),
  validateSearch: (search) => profileSearchSchema.parse(search),
  component: ProfilePage,
});

const TABS: { id: TabId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "نظرة", icon: LayoutGrid },
  { id: "progress", label: "التقدم", icon: TrendingUp },
  { id: "achievements", label: "الإنجازات", icon: Medal },
  // Seasons tab hidden for LC1 — feature deferred post-beta. Renderer kept intact.
  // { id: "seasons", label: "المواسم", icon: ScrollText },
  // Referrals tab removed in Phase 2 (Referrals removal).
  { id: "settings", label: "الإعدادات", icon: SettingsIcon },
];

const TAB_STORAGE_KEY = "irth.profile.tab";


function ProfilePage() {
  const {
    profile, login, logout, updateSettings, claimSeason, setBio, setFavorites,
    claimStreakMilestone, spendDinarsForHeart, setAvatar, setNotificationPrefs,
  } = useProfile();
  const { user, account, displayName: accountDisplayName, updateDisplayName, updateUsername, isUsernameAvailable, signOut } = useAccount();
  const displayName = user ? (accountDisplayName || "مستخدم إرث") : (profile.name || "ضيف");
  const androidNative = isAndroidNativeApp();

  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTabState] = useState<TabId>(() => search.tab ?? "overview");
  useEffect(() => {
    if (typeof window === "undefined") return;
    // URL wins over storage. Otherwise, restore last visited tab.
    if (search.tab) return;
    const saved = window.localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
    if (saved && TABS.some((t) => t.id === saved)) setTabState(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (search.tab && search.tab !== tab) setTabState(search.tab);
  }, [search.tab, tab]);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(TAB_STORAGE_KEY, tab);
  }, [tab]);
  const setTab = (next: TabId) => {
    setTabState(next);
    void navigate({
      search: (prev: z.infer<typeof profileSearchSchema>) => ({ ...prev, tab: next === "overview" ? undefined : next }),
      replace: true,
    });
  };


  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName === "ضيف" ? "" : displayName);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [achDetail, setAchDetail] = useState<AchievementView | null>(null);

  // ===== Username editing =====
  const currentUsername = account?.username ?? "";
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(currentUsername);
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [usernameAvail, setUsernameAvail] = useState<null | "checking" | "free" | "taken" | "invalid">(null);

  useEffect(() => { if (!editingUsername) setUsernameDraft(currentUsername); }, [currentUsername, editingUsername]);

  // Debounced availability check.
  useEffect(() => {
    if (!editingUsername) { setUsernameAvail(null); return; }
    const v = usernameDraft.trim();
    if (!v || v === currentUsername) { setUsernameAvail(null); return; }
    if (!/^[A-Za-z0-9_.\-\u0600-\u06FF]+$/.test(v) || v.length < 3 || v.length > 24) {
      setUsernameAvail("invalid"); return;
    }
    setUsernameAvail("checking");
    let cancelled = false;
    const t = setTimeout(async () => {
      const ok = await isUsernameAvailable(v);
      if (!cancelled) setUsernameAvail(ok ? "free" : "taken");
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [usernameDraft, editingUsername, currentUsername, isUsernameAvailable]);

  async function saveUsername() {
    const v = usernameDraft.trim();
    if (!v) { setUsernameMsg({ ok: false, text: "اسم المستخدم فارغ" }); return; }
    setUsernameBusy(true); setUsernameMsg(null);
    const r = await updateUsername(v);
    setUsernameBusy(false);
    if (!r.ok) { setUsernameMsg({ ok: false, text: r.error ?? "تعذّر تغيير اسم المستخدم" }); return; }
    setUsernameMsg({ ok: true, text: "تم تغيير اسم المستخدم" });
    setEditingUsername(false);
    setTimeout(() => setUsernameMsg(null), 2200);
  }


  const lvl = levelFor(profile.points);
  const canonicalInvForAch = useCanonicalInvestigationProgress();
  void canonicalInvForAch; // canonical hook still mounted for cache; v2 engine reads it internally
  const achievementViews = useAchievementViews();
  const achViewMap = useMemo(
    () => new Map<string, AchievementView>(achievementViews.map((v) => [v.id, v])),
    [achievementViews],
  );
  const earnedCount = achievementViews.filter(isEarned).length;

  // Deep-link: `?achievement=<id>` (e.g. from notifications or the retired
  // /achievements redirect) opens the trophy dialog once views hydrate.
  useEffect(() => {
    const id = search.achievement;
    if (!id) return;
    const view = achViewMap.get(id);
    if (!view) return;
    setAchDetail(view);
    void navigate({
      search: (prev: z.infer<typeof profileSearchSchema>) => ({ ...prev, achievement: undefined }),
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.achievement, achViewMap]);


  // Seasons removed — see Phase 3B cleanup. No season progress is computed.



  const now = Date.now();
  const effHearts = getEffectiveHearts(profile, now);
  const minsToHeart = Math.max(1, Math.ceil(msUntilNextHeart(profile, now) / 60_000));

  const joinDate = useMemo(() => {
    if (!profile.lastActiveDay) return null;
    const d = new Date(profile.lastActiveDay);
    d.setDate(d.getDate() - Math.max(0, profile.streak - 1));
    return toWesternDigits(d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }));
  }, [profile.lastActiveDay, profile.streak]);

  async function saveName() {
    const v = (nameInputRef.current?.value ?? nameDraft).trim();
    setNameDraft(v);
    if (v.length < 2) { setNameMsg({ ok: false, text: "الاسم قصير جداً" }); return; }
    setNameBusy(true); setNameMsg(null);
    const r = user ? await updateDisplayName(v) : { ok: true as const };
    setNameBusy(false);
    if (!r.ok) { setNameMsg({ ok: false, text: r.error ?? "تعذّر حفظ الاسم" }); return; }
    setNameMsg({ ok: true, text: "تم حفظ الاسم" });
    setEditingName(false);
    setTimeout(() => setNameMsg(null), 2000);
  }

  useEffect(() => {
    if (!androidNative) return;
    const result = readAndroidTextEntryResult("profile.displayName", "/profile");
    if (!result) return;
    const v = result.value.trim().slice(0, 60);
    if (v.length < 2) { setNameMsg({ ok: false, text: "الاسم قصير جداً" }); return; }
    setNameDraft(v);
    setNameBusy(true); setNameMsg(null);
    void (async () => {
      const r = user ? await updateDisplayName(v) : { ok: true as const };
      if (!user) login(v);
      setNameBusy(false);
      if (!r.ok) { setNameMsg({ ok: false, text: r.error ?? "تعذّر حفظ الاسم" }); return; }
      setNameMsg({ ok: true, text: "تم حفظ الاسم" });
      setEditingName(false);
      setTimeout(() => setNameMsg(null), 2000);
    })();
  }, [androidNative, login, updateDisplayName, user]);

  return (
    <AppShell>
      <CinematicPageBackdrop image={profileHeaderArt} alt="عمارة إسلامية" />
      <Screen title="حسابي" subtitle="رحلتك التاريخية">

        {/* ============== CINEMATIC HERO ============== */}
        <section className="relative overflow-hidden rounded-3xl border border-gold/30 parchment-dark shadow-elegant">
          <div className="arabesque-layer opacity-60" />
          <div className="particle-field" />
          <div className="relative p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <button
                onClick={() => setPickingAvatar(true)}
                className="relative shrink-0 transition-transform hover:scale-[1.02]"
                aria-label="تغيير الصورة"
              >
                <span className="absolute -inset-1 rounded-full bg-gradient-gold opacity-30 blur-md" />
                <span className="relative block rounded-full ring-2 ring-gold/50 ring-offset-2 ring-offset-background">
                  <Avatar avatarId={profile.avatarId ?? DEFAULT_AVATAR_ID} size="lg" />
                </span>
                <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full border border-gold/50 bg-background text-gold">
                  <Pencil className="size-3" />
                </span>
              </button>

              <div className="min-w-0 flex-1 pt-1">
                {!editingName ? (
                  <div className="flex items-center gap-2">
                    <h2 className="font-display truncate text-xl font-bold leading-tight">{displayName}</h2>
                    {user && (
                      <button
                        onClick={() => { setNameDraft(displayName === "ضيف" ? "" : displayName); setEditingName(true); setNameMsg(null); }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gold/30 px-2 py-0.5 text-[10px] text-gold hover:bg-gold/10"
                        aria-label="تعديل الاسم"
                      ><Pencil className="size-3" /></button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <AndroidTextEntryInput
                      ref={nameInputRef}
                      value={nameDraft}
                      onValueChange={(next) => setNameDraft(next.slice(0, 60))}
                      autoFocus={!androidNative}
                      autoComplete="name"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={60}
                      placeholder="اسمك الظاهر"
                      modalTitle="تعديل الاسم"
                      modalLabel="اكتب الاسم الذي سيظهر في ملفك"
                      androidEntryKey="profile.displayName"
                      className="min-w-0 flex-1 rounded-lg border border-gold/30 bg-background px-2 py-1 text-sm outline-none focus:border-gold"
                    />
                    <button onClick={saveName} disabled={nameBusy} className="rounded-full bg-gradient-gold px-3 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-50">{nameBusy ? "..." : "حفظ"}</button>
                    <button onClick={() => { setEditingName(false); setNameMsg(null); }} className="rounded-full border border-white/15 px-3 py-1 text-[10px] text-muted-foreground hover:bg-white/5">إلغاء</button>
                  </div>
                )}
                {nameMsg && <p className={`mt-1 text-[10px] ${nameMsg.ok ? "text-emerald-300" : "text-rose-300"}`}>{nameMsg.text}</p>}

                {/* Username editor */}
                {user && (
                  <div className="mt-1.5">
                    {!editingUsername ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="truncate">@{currentUsername || "—"}</span>
                        <button
                          onClick={() => { setUsernameDraft(currentUsername); setEditingUsername(true); setUsernameMsg(null); }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gold/30 px-2 py-0.5 text-[10px] text-gold hover:bg-gold/10"
                          aria-label="تعديل اسم المستخدم"
                        ><Pencil className="size-3" /> اسم المستخدم</button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">@</span>
                          <AndroidTextEntryInput
                            value={usernameDraft}
                            onValueChange={(next) => setUsernameDraft(next.slice(0, 24))}
                            autoComplete="username"
                            autoCorrect="off"
                            spellCheck={false}
                            maxLength={24}
                            placeholder="username"
                            modalTitle="تعديل اسم المستخدم"
                            modalLabel="يستخدم في البحث وعنوان الملف الشخصي"
                            androidEntryKey="profile.username"
                            className="min-w-0 flex-1 rounded-lg border border-gold/30 bg-background px-2 py-1 text-sm outline-none focus:border-gold"
                          />
                          <button
                            onClick={saveUsername}
                            disabled={usernameBusy || usernameAvail === "taken" || usernameAvail === "invalid" || usernameAvail === "checking" || !usernameDraft.trim() || usernameDraft.trim() === currentUsername}
                            className="rounded-full bg-gradient-gold px-3 py-1 text-[10px] font-bold text-primary-foreground disabled:opacity-50"
                          >{usernameBusy ? "..." : "حفظ"}</button>
                          <button onClick={() => { setEditingUsername(false); setUsernameMsg(null); }} className="rounded-full border border-white/15 px-3 py-1 text-[10px] text-muted-foreground hover:bg-white/5">إلغاء</button>
                        </div>
                        <p className="mt-1 text-[10px]">
                          {usernameAvail === "checking" && <span className="text-muted-foreground">جاري التحقق…</span>}
                          {usernameAvail === "free"     && <span className="inline-flex items-center gap-1 text-emerald-300"><Check className="size-3" /> متاح</span>}
                          {usernameAvail === "taken"    && <span className="text-rose-300">مستخدم بالفعل</span>}
                          {usernameAvail === "invalid"  && <span className="text-rose-300">حروف غير مسموح بها أو طول غير صالح (٣–٢٤)</span>}
                          {!usernameAvail               && <span className="text-muted-foreground">٣–٢٤ حرفاً. حروف، أرقام و . _ -</span>}
                        </p>
                      </div>
                    )}
                    {usernameMsg && <p className={`mt-1 text-[10px] ${usernameMsg.ok ? "text-emerald-300" : "text-rose-300"}`}>{usernameMsg.text}</p>}
                  </div>
                )}


                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-gold">
                    <Crown className="size-3" /> {lvl.title}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-background/50 px-2 py-0.5 text-foreground/70">
                    <Star className="size-3 text-gold" /> المستوى {lvl.level}
                  </span>
                  {joinDate && (
                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-white/10 bg-background/50 px-2 py-0.5 text-muted-foreground">
                      <Calendar className="size-3" /> منذ {joinDate}
                    </span>
                  )}
                </div>

                {/* XP bar */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-gold/80"><Sparkles className="size-3" /> الخبرة</span>
                    <span className="font-display text-foreground/80">
                      {profile.points.toLocaleString("en-US")}
                      {lvl.next ? ` / ${lvl.next.min.toLocaleString("en-US")}` : " · أقصى مستوى"}
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="absolute inset-y-0 right-0 bg-gradient-gold transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.round(lvl.progress * 100)}%` }}
                    />
                  </div>
                  {lvl.next && (
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      المتبقي <span className="font-display text-foreground/80">{lvl.toNext.toLocaleString("en-US")}</span> نقطة للوصول إلى
                      {" "}<span className="text-gold">{lvl.next.title}</span>
                      {" "}<span className="text-foreground/60">(م.{lvl.next.level})</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Stat strip */}
            <div className="mt-5 grid grid-cols-4 gap-2">
              <HeroStat icon={<Sparkles className="size-4" />} label="نقاط" value={profile.points} />
              <HeroStat icon={<Coins className="size-4" />} label="دنانير" value={profile.dinars} />
              <HeroStat icon={<Flame className="size-4 text-orange-400" />} label="سلسلة" value={profile.streak} />
              <HeroStat icon={<Trophy className="size-4" />} label="إنجاز" value={earnedCount} />
            </div>

            {/* Hearts + season micro */}
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-background/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[10px] tracking-[0.18em] text-gold/80"><Heart className="size-3" /> القلوب</span>
                  <span className="text-[10px] text-muted-foreground">{effHearts < HEART_MAX ? `قلب جديد بعد ${minsToHeart}د` : "ممتلئة"}</span>
                </div>
                <div className="mt-1 flex items-center gap-0.5 text-red-400">
                  {Array.from({ length: HEART_MAX }).map((_, i) => (
                    <Heart key={i} className={`size-4 ${i < effHearts ? "fill-red-500 text-red-500" : "text-white/20"}`} />
                  ))}
                  {effHearts < HEART_MAX && (
                    <button
                      onClick={() => spendDinarsForHeart()}
                      disabled={profile.dinars < 20}
                      className="ms-auto inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] text-gold disabled:opacity-40"
                    ><Coins className="size-3" /> 20</button>
                  )}
                </div>
              </div>
              {/* Season micro-card removed — Seasons demo deleted in Phase 3B. */}

            </div>
          </div>
        </section>

        {/* ============== TABS ============== */}
        <nav
          className="sticky top-0 z-30 mt-5 -mx-4 border-y border-gold/15 bg-background/85 px-4 py-2 backdrop-blur-md"
          role="tablist" aria-label="أقسام الحساب"
        >
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`relative shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-display transition-colors ${
                    active
                      ? "bg-gradient-gold text-primary-foreground font-bold shadow-elegant"
                      : "border border-white/10 text-muted-foreground hover:text-foreground hover:border-gold/30"
                  }`}
                >
                  <Icon className="size-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div key={tab} className="mt-5 animate-fade-in">
          {tab === "overview" && (
            <OverviewTab
              profile={profile}
              views={achievementViews}
              seasonPct={seasonPct}
              seasonReady={seasonReady}
              claimSeason={claimSeason}
              onSeeAllAchievements={() => setTab("achievements")}
            />
          )}

          {tab === "progress" && <ProgressTab profile={profile} lvl={lvl} />}
          {tab === "achievements" && (
            <AchievementsTab views={achievementViews} onOpen={(v) => setAchDetail(v)} />
          )}
          {tab === "seasons" && <SeasonsTab seasonPct={seasonPct} seasonReady={seasonReady} claimSeason={claimSeason} seasonClaimed={profile.seasonClaimed} seasonPoints={profile.seasonPoints} />}
          {/* referrals tab removed in Phase 2 */}
          {tab === "settings" && (
            <SettingsTab
              profile={profile}
              displayName={displayName}
              joinDate={joinDate}
              lvl={lvl}
              setBio={setBio}
              setFavorites={setFavorites}
              updateSettings={updateSettings}
              setNotificationPrefs={setNotificationPrefs}
              claimStreakMilestone={claimStreakMilestone}
              onReset={() => setConfirmReset(true)}
            />
          )}
        </div>

        {/* Reset dialog */}
        {confirmReset && (
          <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 animate-fade-in"
            role="dialog" aria-modal="true"
            onClick={() => !resetting && setConfirmReset(false)}
          >
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-gold/30 bg-surface p-5 shadow-elegant animate-scale-in">
              <h3 className="font-display text-lg font-bold text-gold">تأكيد حذف التقدم</h3>
              <p className="mt-2 text-sm leading-7 text-foreground/85">
                سيتم حذف التقدم المحلي على هذا الجهاز (الحملات، المتحف، الإنجازات، القلوب، الدنانير، الخبرة، الستريك، وإشعاراتك المحلية) وتسجيل الخروج. إذا كان لديك تقدم محفوظ في الحساب فقد تتم استعادته عند تسجيل الدخول مجددًا.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button disabled={resetting} onClick={() => setConfirmReset(false)} className="rounded-full border border-white/15 px-4 py-2 text-sm text-muted-foreground hover:bg-white/5 disabled:opacity-50">إلغاء</button>
                <button
                  disabled={resetting}
                  onClick={async () => {
                    setResetting(true);
                    try {
                      clearLocalPlayerProgress();
                      logout();
                      if (user) { try { await signOut(); } catch { /* ignore */ } }
                    } finally {
                      setResetting(false);
                      setConfirmReset(false);
                      if (typeof window !== "undefined") window.location.assign("/");
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-l from-rose-600 to-rose-500 px-4 py-2 text-sm font-bold text-white shadow-elegant disabled:opacity-60"
                ><LogOut className="size-4" /> {resetting ? "جارٍ الحذف…" : "حذف التقدم والخروج"}</button>
              </div>
            </div>
          </div>
          </ModalPortal>
        )}

        {/* Achievement detail dialog */}
        {achDetail && (
          <AchievementDialog
            view={achDetail}
            onClose={() => setAchDetail(null)}
          />
        )}
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

/* ============================================================
   OVERVIEW TAB
============================================================ */
function OverviewTab({
  profile, views, seasonPct, seasonReady, claimSeason, onSeeAllAchievements,
}: {
  profile: ReturnType<typeof useProfile>["profile"];
  views: AchievementView[];
  seasonPct: number;
  seasonReady: boolean;
  claimSeason: ReturnType<typeof useProfile>["claimSeason"];
  onSeeAllAchievements: () => void;
}) {
  void views;
  const latestEarned = useLatestUnlockedAchievement();
  const nearest = useNearestAchievement();
  // Canonical discovery feed — replaces legacy profile.artifactsFound/charactersUnlocked scan.
  const discoveries = useUnifiedDiscoveryFeed(1);
  const recentDiscovery: DiscoveryItem | null = discoveries[0] ?? null;

  return (
    <div className="space-y-4">
      <Link
        to="/campaigns"
        className="group flex items-center gap-3 rounded-3xl border border-gold/40 bg-gradient-to-l from-gold/10 to-transparent p-4 transition-colors hover:border-gold/60"
      >
        <div className="grid size-12 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground shadow-elegant">
          <Swords className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold">واصل رحلتك</p>
          <p className="text-[11px] text-muted-foreground">حملات تاريخية تنتظر إكمالها</p>
        </div>
        <ChevronLeft className="size-5 text-gold transition-transform group-hover:-translate-x-1" />
      </Link>

      {/* Current-season card hidden for LC1 — Seasons deferred post-beta. */}
      {false && (
        <div className="grid grid-cols-1 gap-3">
          <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] text-gold/80">
                <ScrollText className="size-3.5" /> الموسم الحالي
              </span>
            </div>
            <p className="font-display mt-1 text-sm font-bold">{CURRENT_SEASON.name}</p>
            <p className="line-clamp-2 mt-0.5 text-[11px] text-muted-foreground leading-5">{CURRENT_SEASON.tagline}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-gold transition-[width] duration-700" style={{ width: `${seasonPct}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {Math.min(profile.seasonPoints, CURRENT_SEASON.goalPoints)}/{CURRENT_SEASON.goalPoints}
            </p>
            {seasonReady && (
              <button
                onClick={() => claimSeason(CURRENT_SEASON.reward.points, CURRENT_SEASON.reward.title, CURRENT_SEASON.reward.dinars, CURRENT_SEASON.reward.artifact)}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-gold py-2 text-[11px] font-bold text-primary-foreground"
              ><Sparkles className="size-3.5" /> استلم مكافأة الموسم</button>
            )}
          </div>
        </div>
      )}

      {/* Investigations — heart recovery loop */}
      <Link
        to="/investigations"
        className="group relative block overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 via-surface to-surface p-5 transition hover:border-gold/60"
      >
        <div className="arabesque-layer pointer-events-none absolute inset-0 opacity-20" aria-hidden />
        <div className="relative flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-gold text-primary-foreground shadow-lg">
            <Search className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] tracking-[0.18em] text-gold/80">
              <Sparkles className="size-3" /> حلقة التعافي
            </div>
            <h3 className="font-display mt-1 text-base font-bold">تحقيقات تاريخية</h3>
            <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
              اختبر ذكاءك، اكشف الخيوط، واستعد قلوبك عندما تحتاج.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-300"><Heart className="size-3" /> استعد القلوب</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold"><Zap className="size-3" /> XP</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-300"><Coins className="size-3" /> دنانير</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"><ScrollText className="size-3" /> خيوط جديدة</span>
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-gold px-4 py-1.5 text-[11px] font-bold text-primary-foreground">
              <Search className="size-3.5" /> ابدأ تحقيقًا
              <ChevronLeft className="size-3.5 transition group-hover:-translate-x-0.5" />
            </div>
          </div>
        </div>
      </Link>

      {/* Latest achievement */}
      <div className="rounded-2xl border border-gold/25 bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] text-gold/80">
            <Trophy className="size-3.5" /> آخر إنجاز
          </span>
          <button
            type="button"
            onClick={onSeeAllAchievements}
            className="text-[10px] text-gold hover:underline"
          >
            كل الإنجازات
          </button>
        </div>
        {latestEarned ? (
          <AchievementMini view={latestEarned} />
        ) : nearest ? (
          <>
            <p className="mt-2 text-[11px] text-muted-foreground">أقرب إنجاز للفتح:</p>
            <AchievementMini view={nearest} />
          </>
        ) : (
          <p className="mt-3 text-[12px] text-muted-foreground">ابدأ رحلتك لتفتح إنجازك الأول.</p>
        )}
      </div>

      {/* Recent discovery (canonical unified feed) */}
      {recentDiscovery && (
        <Link
          to={recentDiscovery.destinationRoute}
          className="flex items-center gap-3 rounded-2xl border border-gold/25 bg-surface p-4 hover:border-gold/50 transition-colors"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
            <Landmark className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] tracking-[0.18em] text-gold/80">آخر اكتشاف</p>
            <p className="font-display truncate text-sm font-bold">{recentDiscovery.title}</p>
            {recentDiscovery.subtitle ? (
              <p className="line-clamp-1 text-[11px] text-muted-foreground">{recentDiscovery.subtitle}</p>
            ) : null}
          </div>
          <ChevronLeft className="size-4 text-gold" />
        </Link>
      )}
    </div>
  );
}


function AchievementMini({ view }: { view: AchievementView }) {
  const earned = isEarned(view);
  const Icon = CATEGORY_ICON[view.category];
  const pct = Math.min(100, Math.round(view.progress * 100));
  const title = view.state === "locked-secret" ? "إنجاز سرّي" : (view.displayTitle ?? view.id);
  const desc = view.state === "locked-secret" ? "اكتشفه بنفسك خلال رحلتك." : (view.displayDescription ?? "");
  return (
    <div className={`mt-3 flex items-center gap-3 rounded-2xl border p-3 ${earned ? "border-gold/40 bg-gold/5" : "border-white/10 bg-background/40"}`}>
      <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${earned ? "bg-gradient-gold text-primary-foreground" : "bg-gold/10 text-gold"}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-sm font-bold">{title}</p>
        <p className="line-clamp-1 text-[11px] text-muted-foreground">{desc}</p>
        {!earned && pct > 0 && pct < 100 && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {earned && <Trophy className="size-4 shrink-0 text-gold" />}
    </div>
  );
}

/* ============================================================
   PROGRESS TAB
============================================================ */
function ProgressTab({
  profile, lvl,
}: { profile: ReturnType<typeof useProfile>["profile"]; lvl: ReturnType<typeof levelFor> }) {
  // Canonical inputs — every metric comes from a v2 canonical service.
  // Do NOT read legacy profile arrays (storiesRead, artifactsFound,
  // charactersUnlocked, regionsUnlocked, timelinesCompleted, decisionsCompleted).
  const worldsAgg = useAllWorldsProgress();
  const canonicalInv = useCanonicalInvestigationProgress();
  const { recommendation: campaignRec } = useCampaignRecommendation();
  const achCompletion = useAchievementCompletion();

  // Aggregate world roll-ups → totals across every world.
  const canonical = useMemo(() => {
    let campaignsCompleted = 0, campaignsTotal = 0;
    let invCompleted = 0, invTotal = 0;
    let entitiesDiscovered = 0, entitiesTotal = 0;
    let museumFound = 0, museumTotal = 0;
    let worldsComplete = 0;
    let worldsTotal = 0;
    if (worldsAgg.ready) {
      for (const { progress } of worldsAgg.byWorld.values()) {
        campaignsCompleted += progress.campaigns.completed;
        campaignsTotal     += progress.campaigns.total;
        invCompleted       += progress.investigations.completed;
        invTotal           += progress.investigations.total;
        entitiesDiscovered += progress.entities.discovered;
        entitiesTotal      += progress.entities.total;
        museumFound        += progress.museum.discovered;
        museumTotal        += progress.museum.total;
        worldsTotal        += 1;
        if (progress.overallPct >= 100) worldsComplete += 1;
      }
    }
    // Investigations total: fall back to the canonical hook when world index
    // hasn't hydrated yet (guest / cold-start).
    if (invTotal === 0 && canonicalInv.count > invCompleted) {
      invCompleted = canonicalInv.count;
    }
    return {
      campaigns:      { current: campaignsCompleted, goal: Math.max(campaignsTotal, campaignsCompleted, 1) },
      investigations: { current: invCompleted,       goal: Math.max(invTotal,       invCompleted,       1) },
      entities:       { current: entitiesDiscovered, goal: Math.max(entitiesTotal,  entitiesDiscovered, 1) },
      museum:         { current: museumFound,        goal: Math.max(museumTotal,    museumFound,        1) },
      worlds:         { current: worldsComplete,     goal: Math.max(worldsTotal,    1) },
    };
  }, [worldsAgg, canonicalInv]);

  // Next streak milestone (canonical, from hearts.ts).
  const nextStreakMs = useMemo(() => STREAK_MILESTONES.find((m) => m.days > profile.streak) ?? null, [profile.streak]);

  const xpPct = Math.round(lvl.progress * 100);

  const modules: {
    icon: typeof BookOpen;
    label: string;
    current: number;
    goal: number;
    to?: string;
  }[] = [
    { icon: Swords,     label: "الحملات التاريخية", current: canonical.campaigns.current,      goal: canonical.campaigns.goal,      to: "/campaigns" },
    { icon: Search,     label: "التحقيقات",           current: canonical.investigations.current, goal: canonical.investigations.goal, to: "/investigations" },
    { icon: BookOpen,   label: "الموسوعة",            current: canonical.entities.current,       goal: canonical.entities.goal,       to: "/encyclopedia" },
    { icon: Landmark,   label: "المتحف",              current: canonical.museum.current,         goal: canonical.museum.goal,         to: "/collection" },
    { icon: Compass,    label: "العوالم المكتملة",   current: canonical.worlds.current,         goal: canonical.worlds.goal,         to: "/worlds" },
  ];

  return (
    <div className="space-y-4">
      {/* Level ring */}
      <div className="rounded-3xl border border-gold/25 bg-surface p-5">
        <div className="flex items-center gap-4">
          <CircularProgress value={xpPct} size={88} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] tracking-[0.18em] text-gold/80">المستوى الحالي</p>
            <p className="font-display text-lg font-bold">{lvl.title}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              المستوى {lvl.level} · {profile.points.toLocaleString("en-US")} نقطة
            </p>
          </div>
        </div>
      </div>

      {/* Next campaign step — from shared recommendation service. */}
      {campaignRec && (
        <Link
          to={campaignRec.cta.to.path}
          params={campaignRec.cta.to.params}
          className="group flex items-center gap-3 rounded-2xl border border-gold/30 bg-gradient-to-l from-gold/10 to-transparent p-4 transition-colors hover:border-gold/60"
        >
          <div className="grid size-11 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground shadow-elegant">
            <Swords className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] tracking-[0.18em] text-gold/80">
              {campaignRec.priority === "resume" ? "استئناف الحملة" : "ابدأ حملة جديدة"}
            </p>
            <p className="font-display truncate text-sm font-bold">{campaignRec.campaign.title}</p>
            {campaignRec.chapter?.title ? (
              <p className="line-clamp-1 text-[11px] text-muted-foreground">
                الفصل: {campaignRec.chapter.title}
              </p>
            ) : null}
          </div>
          <ChevronLeft className="size-5 text-gold transition-transform group-hover:-translate-x-1" />
        </Link>
      )}


      {/* Canonical modules grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {modules.map((it) => {
          const Icon = it.icon;
          const pct = Math.min(100, Math.round((it.current / Math.max(1, it.goal)) * 100));
          const body = (
            <div className="rounded-2xl border border-white/10 bg-surface p-4 transition-colors hover:border-gold/40">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold truncate">{it.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {it.current.toLocaleString("en-US")} / {it.goal.toLocaleString("en-US")}
                  </p>
                </div>
                <span className="font-display text-sm text-gold">{pct}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
          return it.to ? (
            <Link key={it.label} to={it.to}>{body}</Link>
          ) : (
            <div key={it.label}>{body}</div>
          );
        })}

        {/* Streak module — from canonical STREAK_MILESTONES. */}
        <div className="rounded-2xl border border-white/10 bg-surface p-4 sm:col-span-2">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-orange-500/15 text-orange-300">
              <Flame className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold truncate">سلسلة الأيام</p>
              <p className="text-[11px] text-muted-foreground">
                {profile.streak.toLocaleString("en-US")} يوم متتالٍ
                {nextStreakMs ? ` · التالي: ${nextStreakMs.days}` : ""}
              </p>
            </div>
            {nextStreakMs && (
              <span className="font-display text-sm text-orange-300">
                {Math.min(100, Math.round((profile.streak / nextStreakMs.days) * 100))}%
              </span>
            )}
          </div>
          {nextStreakMs && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-l from-orange-400 to-amber-300 transition-[width] duration-700"
                style={{ width: `${Math.min(100, (profile.streak / nextStreakMs.days) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Achievements snapshot (uses the same shared selectors as the trophy hall) */}
      <div className="rounded-2xl border border-gold/25 bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold">
            <Trophy className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">الإنجازات</p>
            <p className="text-[11px] text-muted-foreground">
              {achCompletion.earned.toLocaleString("en-US")} / {achCompletion.total.toLocaleString("en-US")}
            </p>
          </div>
          <span className="font-display text-sm text-gold">{achCompletion.pct}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-gold transition-[width] duration-700" style={{ width: `${achCompletion.pct}%` }} />
        </div>
      </div>
    </div>
  );
}


function CircularProgress({ value, size = 88 }: { value: number; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-white/10" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="url(#xpGrad)" strokeWidth={stroke} strokeLinecap="round" fill="none"
          strokeDasharray={c} strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        <defs>
          <linearGradient id="xpGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--gold, 42 70% 55%))" />
            <stop offset="100%" stopColor="#f5d77a" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-base font-bold text-gold">{value}%</span>
      </div>
    </div>
  );
}

/* ============================================================
   ACHIEVEMENTS TAB
============================================================ */
function AchievementsTab({
  views, onOpen,
}: {
  views: AchievementView[];
  onOpen: (v: AchievementView) => void;
}) {
  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((catId) => {
      const items = views
        .filter((v) => v.category === catId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const earned = items.filter(isEarned).length;
      const pct = items.length ? Math.round((earned / items.length) * 100) : 0;
      return { catId, meta: CATEGORY_META[catId], items, earned, pct };
    }).filter((g) => g.items.length > 0);
  }, [views]);

  const totalEarned = useMemo(() => views.filter(isEarned).length, [views]);
  const totalPct = views.length ? Math.round((totalEarned / views.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gold/25 bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-gradient-gold text-primary-foreground">
            <Trophy className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">خزانة الإنجازات</p>
            <p className="text-[11px] text-muted-foreground">{totalEarned} من {views.length} مفتوحة</p>
          </div>
          <span className="font-display text-lg text-gold">{totalPct}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-gold transition-[width] duration-700" style={{ width: `${totalPct}%` }} />
        </div>
      </div>

      {grouped.map(({ catId, meta, items, earned, pct }) => {
        const Icon = CATEGORY_ICON[catId];
        return (
          <section key={catId} className="rounded-3xl border border-white/10 bg-surface/60 p-4">
            <header className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold">{meta.name}</p>
                <p className="text-[11px] text-muted-foreground">{earned}/{items.length} · {pct}%</p>
              </div>
              <div className="w-20 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold" style={{ width: `${pct}%` }} />
              </div>
            </header>
            <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
              {items.map((v) => {
                const earnedItem = isEarned(v);
                const pctItem = Math.min(100, Math.round(v.progress * 100));
                const secret = v.state === "locked-secret";
                const style = secret ? SECRET_STYLE : RARITY_STYLE[v.rarity];
                const ItemIcon = CATEGORY_ICON[v.category];
                return (
                  <button
                    key={v.id}
                    onClick={() => onOpen(v)}
                    className={`group relative flex flex-col items-center gap-1 rounded-2xl border ${style.ring} p-2.5 text-center transition-all hover:scale-[1.03] hover:border-gold/60 ${earnedItem ? "bg-gold/5" : "bg-background/40"}`}
                  >
                    <div className={`grid size-12 place-items-center rounded-full border ${style.ring} ${earnedItem ? "bg-gradient-gold text-primary-foreground" : "bg-background text-foreground/60"}`}>
                      {secret ? <Lock className="size-5" /> : <ItemIcon className="size-5" />}
                    </div>
                    <p className="font-display line-clamp-1 text-[10px] font-bold leading-tight">
                      {secret ? "إنجاز سرّي" : (v.displayTitle ?? v.id)}
                    </p>
                    {!earnedItem && !secret && (
                      <div className="w-full h-0.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-gold/60" style={{ width: `${pctItem}%` }} />
                      </div>
                    )}
                    {earnedItem && (
                      <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-elegant">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AchievementDialog({
  view, onClose,
}: {
  view: AchievementView;
  onClose: () => void;
}) {
  const earned = isEarned(view);
  const secret = view.state === "locked-secret" && !earned;
  const style = secret ? SECRET_STYLE : RARITY_STYLE[view.rarity];
  const pct = Math.min(100, Math.round(view.progress * 100));
  const Icon = CATEGORY_ICON[view.category];
  const rewards = view.rewards ?? {};
  const hasRewards = Boolean(rewards.xp || rewards.dinars || rewards.titleId || rewards.museumItemId || rewards.cosmeticId);

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 animate-fade-in" role="dialog" aria-modal="true" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-gold/30 bg-surface p-6 shadow-elegant animate-scale-in">
        <button onClick={onClose} aria-label="إغلاق" className="absolute top-3 left-3 grid size-8 place-items-center rounded-full border border-white/10 bg-background/60 text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className={`grid size-20 place-items-center rounded-full border-2 ${style.ring} ${earned ? "bg-gradient-gold text-primary-foreground" : "bg-background text-foreground/60"}`}>
            {secret ? <Lock className="size-8" /> : <Icon className="size-8" />}
          </div>
          <span className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${style.chip}`}>{style.label}</span>
          <h3 className="font-display mt-2 text-lg font-bold">
            {secret ? "إنجاز سرّي" : (view.displayTitle ?? view.id)}
          </h3>
          <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
            {secret ? "اكتشفه بنفسك خلال رحلتك." : (view.displayDescription ?? "")}
          </p>
        </div>

        {!secret && (
          <div className="mt-5">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>التقدم</span>
              <span className="font-display text-gold">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
            {earned && view.unlockedAt && (
              <p className="mt-2 text-[10px] text-gold">
                فُتح في {new Date(view.unlockedAt).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })}
              </p>
            )}
          </div>
        )}

        {hasRewards && !secret && (
          <div className="mt-5">
            <p className="mb-2 text-[10px] tracking-[0.18em] text-gold/80">المكافآت</p>
            <div className="flex flex-wrap gap-1.5">
              {rewards.xp ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2.5 py-1 text-[11px] text-gold">
                  <Sparkles className="size-3" /> +{rewards.xp} نقطة
                </span>
              ) : null}
              {rewards.dinars ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2.5 py-1 text-[11px] text-gold">
                  <Coins className="size-3" /> +{rewards.dinars} دينار
                </span>
              ) : null}
              {rewards.titleId ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2.5 py-1 text-[11px] text-gold">
                  <Crown className="size-3" /> لقب: {rewards.titleId}
                </span>
              ) : null}
              {rewards.museumItemId ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2.5 py-1 text-[11px] text-gold">
                  <Landmark className="size-3" /> قطعة متحف
                </span>
              ) : null}
              {rewards.cosmeticId ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2.5 py-1 text-[11px] text-gold">
                  <Medal className="size-3" /> زخرفة
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  );
}

/* ============================================================
   SEASONS TAB
============================================================ */
function SeasonsTab({
  seasonPct, seasonReady, claimSeason, seasonClaimed, seasonPoints,
}: {
  seasonPct: number; seasonReady: boolean; seasonClaimed: boolean; seasonPoints: number;
  claimSeason: ReturnType<typeof useProfile>["claimSeason"];
}) {
  const currentMonth = new Date().getMonth() + 1;
  const archive = SEASONS.filter((s) => (s.month ?? 0) < currentMonth);
  const upcoming = SEASONS.filter((s) => (s.month ?? 0) > currentMonth);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-gold/30 parchment-dark p-5 shadow-elegant">
        <div className="arabesque-layer opacity-50" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-gold">
            <ScrollText className="size-3.5" /> الموسم الحالي
          </div>
          <h3 className="font-display mt-2 text-xl font-bold">{CURRENT_SEASON.name}</h3>
          <p className="mt-1 text-[12px] leading-6 text-foreground/80">{CURRENT_SEASON.tagline}</p>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{Math.min(seasonPoints, CURRENT_SEASON.goalPoints).toLocaleString("en-US")} / {CURRENT_SEASON.goalPoints.toLocaleString("en-US")}</span>
              <span className="font-display text-gold">{seasonPct}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-black/40 ring-1 ring-gold/20">
              <div className="h-full bg-gradient-gold transition-[width] duration-700" style={{ width: `${seasonPct}%` }} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <RewardChip><Sparkles className="size-3" /> +{CURRENT_SEASON.reward.points} نقطة</RewardChip>
            {CURRENT_SEASON.reward.dinars && <RewardChip><Coins className="size-3" /> +{CURRENT_SEASON.reward.dinars} دينار</RewardChip>}
            {CURRENT_SEASON.reward.title && <RewardChip><Crown className="size-3" /> {CURRENT_SEASON.reward.title}</RewardChip>}
            {CURRENT_SEASON.reward.artifact && <RewardChip><Landmark className="size-3" /> أثر نادر</RewardChip>}
          </div>

          {seasonReady && (
            <button
              onClick={() => claimSeason(CURRENT_SEASON.reward.points, CURRENT_SEASON.reward.title, CURRENT_SEASON.reward.dinars, CURRENT_SEASON.reward.artifact)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-elegant"
            ><Sparkles className="size-4" /> استلم مكافأة الموسم</button>
          )}
          {seasonClaimed && (
            <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-gold"><Check className="size-3" /> استلمتَ مكافأة الموسم</p>
          )}
        </div>
      </section>

      {archive.length > 0 && (
        <section>
          <h4 className="font-display mb-3 inline-flex items-center gap-2 text-sm font-bold">
            <Hourglass className="size-4 text-gold" /> الأرشيف
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {archive.map((s) => <SeasonCard key={s.id} season={s} state="archived" />)}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h4 className="font-display mb-3 inline-flex items-center gap-2 text-sm font-bold">
            <Calendar className="size-4 text-gold" /> القادم
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {upcoming.map((s) => <SeasonCard key={s.id} season={s} state="upcoming" />)}
          </div>
        </section>
      )}
    </div>
  );
}

function RewardChip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] text-gold">{children}</span>;
}

function SeasonCard({ season, state }: { season: typeof SEASONS[number]; state: "archived" | "upcoming" }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-3.5 ${state === "archived" ? "border-gold/20 bg-surface" : "border-white/10 bg-surface/60"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] text-gold/80">
          {state === "archived" ? <Hourglass className="size-3" /> : <Lock className="size-3" />}
          {state === "archived" ? "منتهٍ" : "قادم"}
        </span>
        <span className="text-[10px] text-muted-foreground">{season.endsAt}</span>
      </div>
      <p className="font-display mt-1 truncate text-sm font-bold">{season.name}</p>
      <p className="line-clamp-2 mt-0.5 text-[11px] leading-5 text-muted-foreground">{season.tagline}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {season.reward.title && <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/5 px-2 py-0.5 text-[10px] text-gold"><Crown className="size-2.5" /> {season.reward.title}</span>}
        {season.reward.artifact && <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/5 px-2 py-0.5 text-[10px] text-gold"><Landmark className="size-2.5" /> أثر</span>}
      </div>
    </div>
  );
}

/* ============================================================
   REFERRALS TAB removed in Phase 2 (Referrals removal). The
   entire ReferralsTab component and its MiniStat helper were
   deleted alongside `@/lib/referrals`.
============================================================ */


/* ============================================================
   SETTINGS TAB
============================================================ */
function SettingsTab({
  profile, displayName, joinDate, lvl, setBio, setFavorites, updateSettings,
  setNotificationPrefs, claimStreakMilestone, onReset,
}: {
  profile: ReturnType<typeof useProfile>["profile"];
  displayName: string;
  joinDate: string | null;
  lvl: ReturnType<typeof levelFor>;
  setBio: ReturnType<typeof useProfile>["setBio"];
  setFavorites: ReturnType<typeof useProfile>["setFavorites"];
  updateSettings: ReturnType<typeof useProfile>["updateSettings"];
  setNotificationPrefs: ReturnType<typeof useProfile>["setNotificationPrefs"];
  claimStreakMilestone: ReturnType<typeof useProfile>["claimStreakMilestone"];
  onReset: () => void;
}) {
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(profile.bio ?? "");
  const bioRef = useRef<HTMLTextAreaElement | null>(null);
  const prefs = profile.settings.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
  const favState = ERAS.find((e) => e.id === profile.favoriteStateId);

  useEffect(() => {
    if (!isAndroidNativeApp()) return;
    const result = readAndroidTextEntryResult("profile.bio", "/profile");
    if (!result) return;
    const v = result.value.trim().slice(0, 240);
    setBio(v);
    setBioDraft(v);
    setEditingBio(false);
  }, [setBio]);

  return (
    <ReadingScale className="space-y-5">

      {/* Account */}
      <SettingsGroup title="الحساب" icon={IdCard}>
        <AccountSection />
      </SettingsGroup>

      {/* Community hub — premium social entry point */}
      <CommunityHubSection />



      {/* Identity card */}
      <SettingsGroup title="بطاقة الهوية التاريخية" icon={IdCard}>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <IdRow icon={<Crown className="size-3" />} label="اللقب" value={lvl.title} />
          <IdRow icon={<Star className="size-3" />} label="المستوى" value={`${lvl.level}`} />
          <IdRow icon={<Calendar className="size-3" />} label="الانضمام" value={joinDate ?? "—"} />
          <IdRow icon={<Flame className="size-3" />} label="السلسلة" value={`${profile.streak} يومًا`} />
        </div>
        <label className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-background/40 px-3 py-2">
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
        {favState && <p className="mt-2 text-[10px] text-muted-foreground">دولتك: <span className="text-gold">{favState.name}</span></p>}

        <div className="mt-3 rounded-xl border border-gold/20 bg-background/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] tracking-[0.18em] text-gold">نبذة عني</p>
            {!editingBio ? (
              <button onClick={() => { setBioDraft(profile.bio ?? ""); setEditingBio(true); }} className="inline-flex items-center gap-1 rounded-full border border-gold/30 px-2 py-0.5 text-[10px] text-gold hover:bg-gold/10"><Pencil className="size-3" /> تعديل</button>
            ) : (
              <button onClick={() => { const v = (bioRef.current?.value ?? bioDraft).trim().slice(0, 240); setBio(v); setBioDraft(v); setEditingBio(false); }} className="inline-flex items-center gap-1 rounded-full bg-gradient-gold px-2 py-0.5 text-[10px] font-bold text-primary-foreground"><Check className="size-3" /> حفظ</button>
            )}
          </div>
          {editingBio ? (
            <AndroidTextEntryTextarea
              ref={bioRef}
              value={bioDraft}
              onValueChange={(next) => setBioDraft(next.slice(0, 240))}
              rows={3}
              maxLength={240}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="مثال: مهتم بتاريخ الشام والحروب الصليبية."
              modalTitle="نبذة عني"
              modalLabel="اكتب نبذة قصيرة عن اهتماماتك التاريخية"
              androidEntryKey="profile.bio"
              className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-background px-3 py-2 text-[12px] leading-6 outline-none focus:border-gold/40"
            />
          ) : (
            <p className="mt-2 text-[12px] leading-6 text-foreground/85">
              {profile.bio?.trim() ? profile.bio : <span className="italic text-muted-foreground">لم تكتب نبذةً بعد.</span>}
            </p>
          )}
        </div>

        {/* Phase 2 entry point: the Historical Identity Card was moved out
            of the retired Referrals tab and lives here as a shareable
            player summary (no QR, no invite semantics). */}
        <Link
          to="/share-card"
          className="mt-3 flex items-center gap-3 rounded-2xl border border-gold/30 bg-gradient-to-l from-gold/10 to-transparent p-3.5 hover:border-gold/60"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
            <IdCard className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">افتح بطاقة الهوية التاريخية</p>
            <p className="text-[11px] text-muted-foreground">لقطة قابلة للمشاركة من رحلتك في إرث.</p>
          </div>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </Link>
      </SettingsGroup>

      {/* Streak milestones — Phase 3A: fully server-authoritative auto-grant.
          Manual claim UI is retired; the server credits XP/Dinars on the
          qualifying activity that advances the streak past the milestone. */}
      <SettingsGroup title="مكافآت السلسلة" icon={Flame}>
        <div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-background/40 p-2.5">
          <div className="min-w-0">
            <p className="font-display text-[12px] font-bold">حالة اليوم</p>
            <p className="text-[10px] text-muted-foreground">
              {profile.lastActiveDay === new Date().toISOString().slice(0, 10)
                ? "تم احتساب اليوم ✓"
                : "أكمل نشاطًا مؤهلاً اليوم لمتابعة السلسلة"}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-sm font-bold text-gold">{profile.streak} يوم</p>
            <p className="text-[10px] text-muted-foreground">أطول سلسلة: {profile.longestStreak || profile.streak}</p>
          </div>
        </div>
        <div className="space-y-2">
          {STREAK_MILESTONES.map((m) => {
            const claimed = (profile.streakMilestonesClaimed ?? []).includes(m.days);
            const reached = profile.streak >= m.days;
            return (
              <div key={m.days} className={`flex items-center gap-3 rounded-xl border p-2.5 ${claimed ? "border-gold/30 bg-gold/5" : reached ? "border-gold/40 bg-gold/10" : "border-white/10 bg-background/40"}`}>
                <div className="grid size-9 place-items-center rounded-lg bg-gold/15 text-gold"><Gift className="size-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[12px] font-bold">{m.days} يوم · {m.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {m.xp ? `+${m.xp} نقطة · ` : ""}{m.dinars ? `+${m.dinars} دينار` : ""}
                    {m.badge ? " · شارة" : ""}{m.title ? " · لقب" : ""}{m.artifact ? " · قطعة" : ""}
                  </p>
                </div>
                {claimed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-1 text-[10px] font-bold text-gold"><Check className="size-3" /> مُستلَم</span>
                ) : (
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-muted-foreground">
                    {reached ? "قيد الإيداع" : `متبقي ${m.days - profile.streak} يوم`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </SettingsGroup>

      {/* Notifications */}
      <SettingsGroup title="الإشعارات" icon={Bell}>
        <SettingToggle
          icon={<BellRing className="size-4" />} label="تفعيل الإشعارات" desc="مفتاح رئيسي لكل أنواع الإشعارات"
          value={prefs.master}
          onChange={async (v) => { if (v) await ensurePermission(); setNotificationPrefs({ master: v }); updateSettings({ notifications: v }); }}
        />
        <SettingToggle icon={<Calendar className="size-4" />} label="حدث في مثل هذا اليوم" desc="تذكير يومي بحدثٍ تاريخي" value={prefs.daily && prefs.master} onChange={(v) => setNotificationPrefs({ daily: v })} />
        <SettingToggle icon={<Compass className="size-4" />} label="تنبيهات العودة" desc="فضول تاريخي إن غبت يومًا كاملاً" value={prefs.reengagement && prefs.master} onChange={(v) => setNotificationPrefs({ reengagement: v })} />
        <SettingToggle icon={<Crown className="size-4" />} label="إشعارات الحملات" desc="عند فتح حملة جديدة أو سرّية" value={prefs.campaign && prefs.master} onChange={(v) => setNotificationPrefs({ campaign: v })} />
        <SettingToggle icon={<Sparkles className="size-4" />} label="إشعارات المواسم" desc="بدء موسم جديد أو مكافأة جاهزة" value={prefs.season && prefs.master} onChange={(v) => setNotificationPrefs({ season: v })} />
        <SettingToggle icon={<Flame className="size-4" />} label="تذكير التحدي اليومي" desc="تذكير محلي على جهازك كل يومين تقريبًا" value={(prefs.dailyChallenge ?? true) && prefs.master} onChange={(v) => setNotificationPrefs({ dailyChallenge: v })} />
      </SettingsGroup>

      {/* Newsletter (Irth news & updates) — optional, independent of auth emails */}
      <SettingsGroup title="نشرة إرث" icon={Mail}>
        <NewsletterSetting />
      </SettingsGroup>

      {/* Audio */}
      <SettingsGroup title="الصوت" icon={Music}>
        <AudioSettings />
      </SettingsGroup>

      {/* Appearance */}
      <SettingsGroup title="المظهر" icon={Sparkles}>
        <SettingToggle icon={<Zap className="size-4" />} label="تقليل الحركة" desc="إيقاف الجزيئات والتأثيرات المتحرّكة" value={profile.settings.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
      </SettingsGroup>

      {/* Reading Comfort */}
      <SettingsGroup title="راحة القراءة" icon={TypeIcon}>
        <p className="mb-3 text-[11px] leading-6 text-muted-foreground">
          يطبَّق فقط على الشاشات النصّية: الموسوعة، فصول الحملات، التحقيقات، الاختبارات، وصفحات الشخصيات والمدن والمعارك والأحداث. لا يؤثر على الواجهة الرئيسية أو شريط التنقّل.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: "sm" as const, label: "صغير", desc: "الافتراضي", sample: "النص" },
            { id: "md" as const, label: "متوسّط", desc: "أوضح", sample: "النص" },
            { id: "lg" as const, label: "كبير", desc: "أكبر للقراءة", sample: "النص" },
          ]).map((opt) => {
            const active = (profile.settings.textSize ?? "sm") === opt.id;
            const sampleClass = opt.id === "sm" ? "text-[13px]" : opt.id === "md" ? "text-[15px]" : "text-[17px]";
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateSettings({ textSize: opt.id })}
                aria-pressed={active}
                className={`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 transition ${
                  active
                    ? "border-gold/60 bg-gold/10 shadow-[0_0_0_1px_oklch(0.82_0.14_82/0.35)_inset]"
                    : "border-white/10 bg-background/40 hover:border-gold/30"
                }`}
              >
                <span className={`font-display font-bold text-foreground ${sampleClass}`}>{opt.sample}</span>
                <span className="text-[11px] font-bold text-gold">{opt.label}</span>
                <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                {active && (
                  <span className="absolute top-1.5 left-1.5 inline-flex size-4 items-center justify-center rounded-full bg-gradient-gold text-primary-foreground">
                    <Check className="size-2.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </SettingsGroup>


      {/* Community feedback */}
      <SettingsGroup title="ساهم في تطوير إرث" icon={Sprout}>
        <Link to="/feedback/new" className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-background/40 p-3 hover:border-gold/30">
          <div className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold"><Sprout className="size-4" /></div>
          <div className="min-w-0 flex-1 text-right">
            <p className="font-display text-sm font-bold">إرسال مساهمة جديدة</p>
            <p className="text-[11px] text-muted-foreground">اقتراح، تصحيح، أو ملاحظة تساعدنا على تطوير إرث.</p>
          </div>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </Link>
        <FeedbackInboxLink />
      </SettingsGroup>

      {/* About */}

      <SettingsGroup title="حول إرث" icon={Info}>
        <Link to="/about" className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-background/40 p-3 hover:border-gold/30">
          <div className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold"><Info className="size-4" /></div>
          <div className="min-w-0 flex-1 text-right">
            <p className="font-display text-sm font-bold">عن المشروع</p>
            <p className="text-[11px] text-muted-foreground">الإصدار والميزات</p>
          </div>
          <ChevronLeft className="size-4 text-muted-foreground" />
        </Link>
      </SettingsGroup>

      {profile.loggedIn && (
        <button onClick={onReset} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/5 py-3 text-xs text-rose-200 hover:bg-rose-500/10">
          <LogOut className="size-4" /> تسجيل الخروج وإعادة التهيئة
        </button>
      )}
    </ReadingScale>

  );
}

function SettingsGroup({ title, icon: Icon, children }: { title: string; icon: typeof Bell; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-gold/20 bg-surface/60 p-4">
      <div className="mb-3 inline-flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-lg bg-gold/15 text-gold"><Icon className="size-3.5" /></div>
        <p className="font-display text-sm font-bold">{title}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function AudioSettings() {
  const [audio, setAudio] = useAudioSettings();
  return (
    <>
      <SettingToggle icon={<Volume2 className="size-4" />} label="تشغيل الصوت" desc="المفتاح الرئيسي للصوت في التطبيق" value={audio.soundEnabled} onChange={(v) => setAudio({ soundEnabled: v })} />
      <SettingToggle icon={<Music className="size-4" />} label="الخلفية الصوتية" desc="نغمات أجواء خفيفة أثناء التصفّح" value={audio.ambienceEnabled && audio.soundEnabled} onChange={(v) => setAudio({ ambienceEnabled: v })} />
      <SettingToggle icon={<Zap className="size-4" />} label="مؤثرات الإنجاز" desc="نغمة قصيرة عند إكمال نشاط أو فتح مكافأة" value={audio.sfxEnabled && audio.soundEnabled} onChange={(v) => setAudio({ sfxEnabled: v })} />
      <div className="mt-2 rounded-xl border border-white/10 bg-background/40 p-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>مستوى الصوت</span>
          <span className="text-gold">{Math.round(audio.masterVolume * 100)}%</span>
        </div>
        <input
          type="range" min={0} max={100} step={5}
          value={Math.round(audio.masterVolume * 100)}
          onChange={(e) => setAudio({ masterVolume: Number(e.target.value) / 100 })}
          className="w-full accent-amber-400" aria-label="مستوى الصوت"
        />
      </div>
    </>
  );
}

/* ============================================================
   SHARED PIECES
============================================================ */
function HeroStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-background/50 p-2.5 text-center">
      <div className="flex items-center justify-center gap-1 text-gold">
        {icon}<span className="font-display text-base font-bold">{value.toLocaleString("en-US")}</span>
      </div>
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
    <button onClick={() => onChange(!value)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-background/40 p-3 text-right hover:border-gold/30">
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

function NewsletterSetting() {
  const { user } = useAccount();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!user) { setLoading(false); return; }
    setLoading(true);
    fetchMyNewsletterSubscription()
      .then((sub) => { if (mounted) setSubscribed(!!sub.subscribed); })
      .catch(() => { if (mounted) setError("تعذّر تحميل التفضيلات."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [user]);

  const onToggle = async (next: boolean) => {
    if (!user) return;
    const prev = subscribed;
    setSubscribed(next);
    setSaving(true);
    setError(null);
    try {
      const result = await setMyNewsletterSubscription(next);
      setSubscribed(!!result.subscribed);
    } catch {
      setSubscribed(prev);
      setError("تعذّر حفظ التفضيل. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <p className="rounded-xl border border-white/10 bg-background/40 p-3 text-[12px] text-muted-foreground">
        سجّل الدخول لإدارة اشتراكك في نشرة إرث.
      </p>
    );
  }

  return (
    <>
      <SettingToggle
        icon={<Mail className="size-4" />}
        label="استلام أخبار وتحديثات إرث بالبريد"
        desc={loading || saving ? "..." : "اختياري — لا يؤثر على رسائل تسجيل الدخول أو استعادة كلمة المرور"}
        value={subscribed}
        onChange={onToggle}
      />
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
      <p className="mt-2 text-[11px] leading-6 text-muted-foreground">
        لن نرسل حاليًا أي بريد تسويقي. يمكنك تعديل هذا الخيار في أي وقت.
      </p>
    </>
  );
}


function FeedbackInboxLink() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      countMyUnreadFeedback().then((n) => { if (mounted) setUnread(n); }).catch(() => {});
    };
    refresh();
    const channel = supabase
      .channel("profile-feedback-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_issues" }, refresh)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);
  return (
    <Link to="/feedback" className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-background/40 p-3 hover:border-gold/30">
      <div className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold"><Inbox className="size-4" /></div>
      <div className="min-w-0 flex-1 text-right">
        <div className="flex items-center gap-2">
          <p className="font-display text-sm font-bold">مساهماتي والردود</p>
          {unread > 0 && (
            <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {unread > 0 ? `لديك ${unread} رد${unread > 1 ? "ودًا" : "ًا"} جديدًا من فريق إرث.` : "تابع حوارك مع فريق إرث."}
        </p>
      </div>
      <ChevronLeft className="size-4 text-muted-foreground" />
    </Link>
  );
}
