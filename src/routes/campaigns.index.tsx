import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Swords, Lock, Crown, Check, ArrowLeft, Sparkles, BookOpen, Trophy, Award, Zap } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { CAMPAIGNS, ERAS, UPCOMING_CAMPAIGNS, ARTIFACTS, CHARACTERS } from "@/lib/data";
import { useProfile } from "@/lib/profile";
import { listEngineCampaigns, campaignProgressFor } from "@/lib/campaign-engine";
import { displayBadgeName } from "@/lib/display-names";
import { listPublishedCampaigns } from "@/lib/campaignStorage";
import type { Campaign as ImportedCampaign } from "@/types/campaign";

const artifactName = (id?: string) => (id ? ARTIFACTS.find((a) => a.id === id)?.name ?? id : undefined);
const characterName = (id?: string) => (id ? CHARACTERS.find((c) => c.id === id)?.name ?? id : undefined);

function RewardRow({ main, badge, xp }: { main?: string; badge?: string; xp?: number }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
      {main && (
        <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold">
          <Trophy className="size-3" /> {main}
        </span>
      )}
      {badge && (
        <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-0.5 text-fuchsia-200">
          <Award className="size-3" /> {badge}
        </span>
      )}
      {typeof xp === "number" && xp > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-sky-200">
          <Zap className="size-3" /> {xp} XP
        </span>
      )}
    </div>
  );
}

export const Route = createFileRoute("/campaigns/")({
  head: () => ({ meta: [{ title: "الحملات التاريخية" }] }),
  component: CampaignsHub,
});

function CampaignsHub() {
  const { profile } = useProfile();
  const engineCampaigns = listEngineCampaigns();
  // Surface admin-imported published campaigns (localStorage) without
  // touching the existing card design. SSR-safe via post-mount hook.
  const [importedCampaigns, setImportedCampaigns] = useState<ImportedCampaign[]>([]);
  useEffect(() => {
    setImportedCampaigns(listPublishedCampaigns());
    // Refresh from cloud, then re-read local cache.
    import("@/lib/cloudSync")
      .then((m) => m.pullCampaignsFromCloud())
      .then(() => setImportedCampaigns(listPublishedCampaigns()))
      .catch(() => {});
  }, []);
  // Campaigns superseded by an engine campaign (by matching pack/era id)
  // are hidden from the legacy lists so users always enter via the new
  // chapter player — fixes the "Salah al-Din card doesn't open" issue
  // caused by the duplicate legacy flagship card pointing at /campaigns/$era.
  const supersededEras = new Set(
    engineCampaigns
      .map((c) => c.packId)
      .filter((p): p is string => Boolean(p)),
  );
  const legacyCampaigns = CAMPAIGNS.filter((c) => !supersededEras.has(c.eraId));

  return (
    <AppShell>
      <Screen title="الحملات" subtitle="رحلاتٌ مصمَّمة تأخذك عبر العصور">
        {/* === Campaign Engine (data-driven) === */}
        {engineCampaigns.length > 0 && (
          <div className="mb-6 space-y-4">
            {engineCampaigns.map((c) => {
              const p = campaignProgressFor(c, profile);
              const complete = p.completed || p.percent >= 100;
              const mainReward = artifactName(c.finalReward.artifactId)
                ?? (c.finalReward.characterIds?.[0] ? characterName(c.finalReward.characterIds[0]) : undefined)
                ?? c.finalReward.title;
              return (
                <Link
                  key={c.id}
                  to="/play/campaign/$id"
                  params={{ id: c.id }}
                  className={`shadow-elegant relative block overflow-hidden rounded-3xl border p-6 ${
                    complete
                      ? "border-gold/60 bg-gradient-to-tl from-gold/20 via-surface to-amber-900/30 ring-1 ring-gold/40"
                      : "border-gold/40 bg-gradient-to-tl from-amber-900/40 via-surface to-stone-900/40"
                  }`}
                >
                  <div className="particle-field" />
                  <div className="absolute -left-12 -top-12 size-48 rounded-full bg-gold/20 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-2 text-[10px] tracking-widest text-gold">
                      <span className="inline-flex items-center gap-1.5">
                        {complete ? <Crown className="size-3.5" /> : <Sparkles className="size-3.5" />}
                        {complete ? "حملة مكتملة" : "حملة تفاعلية"} · {c.chapters.length.toLocaleString("ar-EG")} فصول
                      </span>
                      <span className="rounded-full border border-gold/40 bg-black/30 px-2 py-0.5 font-display text-[11px] font-bold tracking-normal text-gold">
                        {p.percent}٪
                      </span>
                    </div>
                    <h2 className="font-display mt-2 text-2xl font-bold shimmer-text">{c.title}</h2>
                    {c.subtitle && <p className="mt-1 text-sm text-gold/80">{c.subtitle}</p>}
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.intro}</p>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-gradient-gold transition-all" style={{ width: `${p.percent}%` }} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground inline-flex items-center gap-1"><BookOpen className="size-3" /> {p.completedChapters}/{p.totalChapters} فصلًا</span>
                      <span className="flex items-center gap-1 text-gold">{complete ? "اعرض" : p.completedChapters > 0 ? "تابع" : "ابدأ"} <ArrowLeft className="size-3.5" /></span>
                    </div>
                    <RewardRow main={mainReward} badge={c.finalReward.badgeName ?? displayBadgeName(c.finalReward.badgeId)} xp={c.finalReward.xp} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* === Imported published campaigns (admin-managed) === */}
        {importedCampaigns.length > 0 && (
          <div className="mb-6 space-y-3">
            {importedCampaigns.map((c) => (
              <Link
                key={c.id}
                to="/campaigns/imported/$id"
                params={{ id: c.id }}
                className="shadow-elegant relative block overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-tl from-amber-900/30 via-surface to-stone-900/40 p-6 transition hover:border-gold/60"
              >
                <div className="absolute -left-12 -top-12 size-48 rounded-full bg-gold/20 blur-3xl" />
                <div className="relative">
                  <div className="flex items-center justify-between gap-2 text-[10px] tracking-widest text-gold">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="size-3.5" />
                      حملة جديدة · {c.chapters.length.toLocaleString("ar-EG")} فصول
                    </span>
                    {c.historicalPeriod && (
                      <span className="rounded-full border border-gold/40 bg-black/30 px-2 py-0.5 text-[10px] text-gold">
                        {c.historicalPeriod}
                      </span>
                    )}
                  </div>
                  <h2 className="font-display mt-2 text-2xl font-bold shimmer-text">{c.title}</h2>
                  {c.subtitle && <p className="mt-1 text-sm text-gold/80">{c.subtitle}</p>}
                  {c.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}
                  <div className="mt-3 flex items-center justify-end text-xs">
                    <span className="flex items-center gap-1 text-gold">
                      {c.chapters.length === 0 ? "اعرض" : "ابدأ"} <ArrowLeft className="size-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Flagship */}
        {legacyCampaigns.filter((c) => c.flagship).map((c) => {
          const era = ERAS.find((e) => e.id === c.eraId);
          const done = c.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length;
          const pct = Math.round((done / c.missions.length) * 100);
          const complete = profile.campaignsCompleted.includes(c.eraId) || pct >= 100;
          const mainReward = artifactName(c.finalReward.artifact) ?? characterName(c.finalReward.character);
          return (
            <Link
              key={c.eraId}
              to="/campaigns/$era"
              params={{ era: c.eraId }}
              className={`shadow-elegant relative mb-5 block overflow-hidden rounded-3xl border p-6 ${
                complete
                  ? "border-gold/60 bg-gradient-to-tl from-gold/20 via-surface to-amber-900/30 ring-1 ring-gold/40"
                  : "border-gold/40 bg-gradient-to-tl from-amber-900/40 via-surface to-stone-900/40"
              }`}
            >
              <div className="particle-field" />
              <div className="absolute -left-12 -top-12 size-48 rounded-full bg-gold/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between gap-2 text-[10px] text-gold">
                  <span className="inline-flex items-center gap-1.5"><Crown className="size-3.5" /> الحملة الكبرى · {era?.name}</span>
                  <span className="rounded-full border border-gold/40 bg-black/30 px-2 py-0.5 font-display text-[11px] font-bold text-gold">{pct}٪</span>
                </div>
                <h2 className="font-display mt-2 text-2xl font-bold shimmer-text">{c.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.intro}</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground inline-flex items-center gap-1"><BookOpen className="size-3" /> {done}/{c.missions.length} فصلًا</span>
                  <span className="flex items-center gap-1 text-gold">{complete ? "اعرض" : done > 0 ? "تابع" : "ادخل"} <ArrowLeft className="size-3.5" /></span>
                </div>
                <RewardRow main={mainReward} xp={c.finalReward.points} />
              </div>
            </Link>
          );
        })}

        <h3 className="font-display mb-3 text-sm font-bold text-muted-foreground">حملات العصور</h3>
        <div className="space-y-3">
          {legacyCampaigns.filter((c) => !c.flagship).map((c) => {
            const era = ERAS.find((e) => e.id === c.eraId);
            const unlocked = profile.unlockedEras.includes(c.eraId);
            const done = c.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length;
            const pct = Math.round((done / c.missions.length) * 100);
            const complete = profile.campaignsCompleted.includes(c.eraId);
            const mainReward = artifactName(c.finalReward.artifact) ?? characterName(c.finalReward.character);
            return (
              <Link
                key={c.eraId}
                to="/campaigns/$era"
                params={{ era: c.eraId }}
                className={`block rounded-2xl border p-4 transition ${
                  complete ? "border-gold/50 bg-gradient-to-bl from-gold/10 via-surface to-transparent ring-1 ring-gold/30"
                  : unlocked ? "border-white/10 bg-surface hover:border-gold/40"
                  : "border-dashed border-gold/25 bg-surface/60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`grid size-12 shrink-0 place-items-center rounded-xl ${complete ? "bg-gradient-gold text-primary-foreground shadow-gold" : unlocked ? "bg-gold/15 text-gold" : "bg-black/40 text-gold/70 ring-1 ring-gold/20"}`}>
                    {complete ? <Check className="size-5" /> : unlocked ? <Swords className="size-5" /> : <Lock className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[10px] text-gold">{era?.name} · {era?.years}</p>
                      <span className="shrink-0 text-[10px] font-display font-bold text-gold/80">{pct}٪</span>
                    </div>
                    <p className="font-display mt-0.5 truncate text-sm font-bold">{c.title}</p>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{!unlocked ? "مغلقة · ترقّب الفتح قريبًا" : c.intro}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><BookOpen className="size-3" /> {c.missions.length} فصول</span>
                      {mainReward && <span className="inline-flex items-center gap-1 text-gold/80"><Trophy className="size-3" /> {mainReward}</span>}
                      {c.finalReward.points > 0 && <span className="inline-flex items-center gap-1 text-sky-300/80"><Zap className="size-3" /> {c.finalReward.points}</span>}
                    </div>
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