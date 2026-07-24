import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ShareCard, type IdentityCardAchievement } from "@/components/ShareCard";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import { useAchievementViews } from "@/lib/achievements/v2/driver";
import { isEarned } from "@/lib/achievements/v2/presentation";

/**
 * Phase 2 (Referrals removal): `/share-card` is the internal renderer for
 * the Historical Identity Card. The route is kept for backward
 * compatibility (legacy APKs / bookmarks land here). All referral and QR
 * parameters have been removed — the card is a pure player-journey summary
 * with no invite semantics.
 */
export const Route = createFileRoute("/share-card")({
  head: () => ({ meta: [{ title: "بطاقة الهوية التاريخية" }] }),
  component: ShareCardPage,
});

function ShareCardPage() {
  const { user, account, displayName } = useAccount();
  const { profile } = useProfile();
  const views = useAchievementViews();

  const username = account?.username ?? "";
  const achievements = useMemo(() => {
    const earned = views.filter(isEarned);
    const top: IdentityCardAchievement[] = earned
      .slice(-3)
      .reverse()
      .map((v) => ({ id: v.id, label: v.definition.title }));
    return { total: earned.length, top };
  }, [views]);

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
          displayNameSources={{
            displayName,
            publicName: account?.display_name ?? null,
            username: account?.username ?? null,
            profileName: profile.name,
          }}
          investigationsCompleted={profile.investigationsCompleted?.length ?? 0}
          achievements={achievements}
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
