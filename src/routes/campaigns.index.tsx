import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, ArrowLeft, Sparkles, BookOpen, Trophy, Award, Zap, Coins, Swords } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ARTIFACTS, CHARACTERS } from "@/lib/data";
import { useProfile } from "@/lib/profile";
import { listEngineCampaigns, campaignProgressFor } from "@/lib/campaign-engine";
import { displayBadgeName, displayArtifactName } from "@/lib/display-names";
import { listPublishedCampaigns } from "@/lib/campaignStorage";
import { useResolvedUnlocks } from "@/lib/campaignUnlocks";
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
  const { profile: _profile } = useProfile();
  const engineCampaigns = listEngineCampaigns();
  // Admin-imported published campaigns (Supabase admin_campaigns → local cache).
  const [importedCampaigns, setImportedCampaigns] = useState<ImportedCampaign[]>([]);
  useEffect(() => {
    setImportedCampaigns(listPublishedCampaigns());
    import("@/lib/cloudSync")
      .then((m) => m.pullCampaignsFromCloud())
      .then(() => setImportedCampaigns(listPublishedCampaigns()))
      .catch(() => {});
  }, []);
  const profile = _profile;


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
                        {complete ? "حملة مكتملة" : "حملة تفاعلية"} · {c.chapters.length.toLocaleString("en-US")} فصول
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
              <ImportedCampaignCard key={c.id} c={c} />
            ))}
          </div>
        )}


        {/* Empty state when no engine or imported campaigns are available */}
        {engineCampaigns.length === 0 && importedCampaigns.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
            <Swords className="mx-auto mb-3 size-8 text-gold/70" />
            <p className="font-display text-base font-bold text-gold">لا توجد حملات متاحة بعد</p>
            <p className="mt-1 text-xs text-muted-foreground">سيتم نشر حملات جديدة قريبًا.</p>
          </div>
        )}
      </Screen>
    </AppShell>
  );
}

function ImportedCampaignCard({ c }: { c: ImportedCampaign }) {
  const fr = c.finalRewards;
  const firstUnlock = fr?.unlocks?.[0];
  const { resolved } = useResolvedUnlocks(firstUnlock ? [firstUnlock] : []);
  const mainReward =
    (fr?.artifactId ? displayArtifactName(fr.artifactId) : undefined) ??
    (resolved[0]?.title ?? undefined);
  const badgeLabel = fr?.badgeId ? displayBadgeName(fr.badgeId) : undefined;
  const xp = fr?.xp;
  const coins = fr?.coins;

  return (
    <Link
      to="/campaigns/imported/$id"
      params={{ id: c.id }}
      className="shadow-elegant relative block overflow-hidden rounded-3xl border border-gold/40 bg-gradient-to-tl from-amber-900/30 via-surface to-stone-900/40 p-6 transition hover:border-gold/60"
    >
      <div className="absolute -left-12 -top-12 size-48 rounded-full bg-gold/20 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-2 text-[10px] tracking-widest text-gold">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5" />
            حملة جديدة · {c.chapters.length.toLocaleString("en-US")} فصول
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

        {(xp || coins || badgeLabel || mainReward) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
            {mainReward && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold">
                <Trophy className="size-3" /> {mainReward}
              </span>
            )}
            {badgeLabel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-0.5 text-fuchsia-200">
                <Award className="size-3" /> {badgeLabel}
              </span>
            )}
            {typeof xp === "number" && xp > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-sky-200">
                <Zap className="size-3" /> {xp} XP
              </span>
            )}
            {typeof coins === "number" && coins > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                <Coins className="size-3" /> {coins}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <BookOpen className="size-3" /> {c.chapters.length.toLocaleString("en-US")} فصلًا
          </span>
          <span className="flex items-center gap-1 text-gold">
            {c.chapters.length === 0 ? "اعرض" : "ابدأ"} <ArrowLeft className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

