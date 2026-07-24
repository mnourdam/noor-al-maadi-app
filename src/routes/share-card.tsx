import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ShareCard, type IdentityCardAchievement } from "@/components/ShareCard";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import { useAchievementViews } from "@/lib/achievements/v2/driver";
import { isEarned } from "@/lib/achievements/v2/presentation";
import { useHomeSummary } from "@/lib/stats/homeSummary";
import { ERAS } from "@/lib/app-constants";

/**
 * `/share-card` — Historical Identity Card renderer.
 *
 * All data flows through canonical sources (Home summary, achievement
 * views, profile). The route is the single seam that resolves the
 * favorite-state Arabic name and the top-3 achievements, so the card
 * component itself stays a pure renderer.
 */
export const Route = createFileRoute("/share-card")({
  head: () => ({ meta: [{ title: "بطاقة الهوية التاريخية" }] }),
  component: ShareCardPage,
});

function ShareCardPage() {
  const { user, account, displayName } = useAccount();
  const { profile } = useProfile();
  const views = useAchievementViews();
  const summary = useHomeSummary();

  const username = account?.username ?? "";

  const achievements = useMemo<IdentityCardAchievement[]>(
    () =>
      views.filter(isEarned).map((v) => ({
        id: v.id,
        label: v.displayTitle ?? v.id,
        rarity: v.rarity,
        unlockedAt: v.unlockedAt,
        sortOrder: v.sortOrder,
      })),
    [views],
  );

  const favoriteStateName = useMemo(() => {
    const id = profile.favoriteStateId;
    if (!id) return null;
    return ERAS.find((e) => e.id === id)?.name ?? null;
  }, [profile.favoriteStateId]);

  return (
    <AppShell>
      <Screen title="بطاقة الهوية التاريخية" subtitle="لقطة من رحلتك في إرث">
        <div className="mb-3">
          <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ChevronLeft className="size-4" /> رجوع
          </Link>
        </div>
        <ShareCard
          profile={profile}
          username={username}
          userId={user?.id ?? null}
          displayNameSources={{
            displayName,
            publicName: account?.display_name ?? null,
            username: account?.username ?? null,
            profileName: profile.name,
          }}
          campaignsCompleted={summary.loading ? undefined : summary.campaignsCompleted}
          investigationsCompleted={summary.loading ? undefined : summary.investigationsCompleted}
          storiesCompleted={summary.loading ? undefined : summary.storiesCompleted}
          museumCount={summary.loading ? undefined : summary.museumCount}
          achievements={achievements}
          favoriteStateName={favoriteStateName}
        />
        {!user && (
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            سجّل دخولك ليظهر اسمك واسم المستخدم على البطاقة.
          </p>
        )}
      </Screen>
    </AppShell>
  );
}
