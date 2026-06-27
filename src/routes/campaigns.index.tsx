import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, BookOpen, Trophy, Award, Zap, Coins, Swords, CheckCircle2 } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { useProfile } from "@/lib/profile";
import { displayBadgeName, displayArtifactName } from "@/lib/display-names";
import { fetchPublishedCampaigns } from "@/lib/supabaseCampaigns";
import { useResolvedUnlocks } from "@/lib/campaignUnlocks";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import type { Campaign as ImportedCampaign } from "@/types/campaign";
import { androidMark, isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";

export const Route = createFileRoute("/campaigns/")({
  head: () => ({ meta: [{ title: "الحملات التاريخية" }] }),
  component: CampaignsHub,
});

function CampaignsHub() {
  androidMark("render:Campaigns");
  if (isAndroidUltraStableMode()) return <AndroidStableCampaigns />;
  return <CampaignsHubFull />;
}

function CampaignsHubFull() {
  useProfile();
  const { data: importedCampaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", "published"],
    queryFn: fetchPublishedCampaigns,
  });

  return (
    <AppShell>
      <Screen title="الحملات" subtitle="رحلاتٌ مصمَّمة تأخذك عبر العصور">
        {isLoading && (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">جاري التحميل…</div>
        )}

        {!isLoading && importedCampaigns.length > 0 && (
          <div className="mb-6 space-y-3">
            {importedCampaigns.map((c) => (
              <ImportedCampaignCard key={c.id} c={c} />
            ))}
          </div>
        )}

        {!isLoading && importedCampaigns.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
            <Swords className="mx-auto mb-3 size-8 text-gold/70" />
            <p className="font-display text-base font-bold text-gold">لا توجد حملات منشورة حاليًا.</p>
          </div>
        )}
      </Screen>
    </AppShell>
  );
}

function AndroidStableCampaigns() {
  return (
    <AppShell>
      <Screen title="الحملات" subtitle="وضع أندرويد المستقر">
        <div className="rounded-3xl border border-gold/25 bg-surface p-5">
          <Swords className="mb-3 size-8 text-gold" />
          <h2 className="font-display text-xl font-bold text-foreground">الحملات في الوضع المستقر</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            تم إيقاف تحميل قائمة الحملات الثقيلة تلقائيًا داخل APK أثناء التشخيص. يمكنك فتح التحديات اليومية أو الموسوعة أثناء اختبار الثبات.
          </p>
          <div className="mt-4 grid gap-2">
            <Link to="/adventure" className="flex items-center justify-between rounded-2xl border border-white/10 bg-background p-4 text-sm font-bold text-foreground">
              التحديات <ArrowLeft className="size-4 text-gold" />
            </Link>
            <Link to="/" className="flex items-center justify-between rounded-2xl border border-white/10 bg-background p-4 text-sm font-bold text-foreground">
              الرئيسية <ArrowLeft className="size-4 text-gold" />
            </Link>
          </div>
        </div>
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

