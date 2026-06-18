import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { User, Crown, Flame, Star, Trophy, LogOut, Volume2, BellRing, Sparkles, Info, ChevronLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppShell, Screen } from "@/components/AppShell";
import {
  ACHIEVEMENTS, evaluateAchievements, levelFor, CURRENT_SEASON,
  AMBIENCE_TRACKS,
} from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "حسابي" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, login, logout, updateSettings, claimSeason } = useProfile();
  const [name, setName] = useState("");

  const lvl = levelFor(profile.points);
  const achievements = evaluateAchievements(profile);
  const seasonPct = Math.min(100, Math.round((profile.seasonPoints / CURRENT_SEASON.goalPoints) * 100));
  const seasonReady = profile.seasonPoints >= CURRENT_SEASON.goalPoints && !profile.seasonClaimed;

  return (
    <AppShell>
      <Screen title="حسابي" subtitle="تاريخك معنا">
        {/* Identity */}
        <div className="relative overflow-hidden rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant">
          <div className="particle-field" />
          <div className="relative flex items-center gap-4">
            <div className="grid size-16 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground">
              <User className="size-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display truncate text-lg font-bold">{profile.name}</p>
              <p className="text-[11px] text-gold">المستوى {lvl.level} · {lvl.title}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold" style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
              </div>
            </div>
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat icon={<Star className="size-3.5" />} label="نقاط" value={profile.points} />
            <Stat icon={<Flame className="size-3.5" />} label="سلسلة" value={profile.streak} />
            <Stat icon={<Crown className="size-3.5" />} label="حملات" value={profile.campaignsCompleted.length} />
          </div>
        </div>

        {/* Login */}
        {!profile.loggedIn && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-surface p-4">
            <p className="text-xs text-muted-foreground">سجّل اسمك ليُحفظ تقدّمك على هذا الجهاز.</p>
            <div className="mt-3 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسمك"
                className="flex-1 rounded-xl border border-white/10 bg-background px-3 py-2 text-sm outline-none focus:border-gold/40"
              />
              <button
                onClick={() => login(name)}
                className="rounded-xl bg-gradient-gold px-4 py-2 text-xs font-bold text-primary-foreground"
              >ادخل</button>
            </div>
          </div>
        )}

        {/* Season */}
        <div className="mt-5 rounded-2xl border border-gold/25 bg-surface p-4">
          <p className="text-[10px] text-gold">🏆 {CURRENT_SEASON.name}</p>
          <p className="font-display mt-1 text-sm font-bold">{CURRENT_SEASON.tagline}</p>
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
            label="إشعارات في مثل هذا اليوم"
            desc="تذكير يومي بحدثٍ تاريخي"
            value={profile.settings.notifications}
            onChange={(v) => updateSettings({ notifications: v })}
          />
          <SettingToggle
            icon={<Sparkles className="size-4" />}
            label="تقليل الحركة"
            desc="إيقاف الجزيئات والتأثيرات المتحرّكة"
            value={profile.settings.reduceMotion}
            onChange={(v) => updateSettings({ reduceMotion: v })}
          />
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
      </Screen>
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