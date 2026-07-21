import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ShareCard } from "@/components/ShareCard";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import { fetchMyReferralCode } from "@/lib/social";

export const Route = createFileRoute("/share-card")({
  head: () => ({ meta: [{ title: "بطاقة الهوية التاريخية" }] }),
  component: ShareCardPage,
});

function ShareCardPage() {
  const { user, account, displayName } = useAccount();
  const { profile } = useProfile();
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => { if (user) fetchMyReferralCode(user.id).then(setCode); }, [user]);

  const username = account?.username ?? "";

  return (
    <AppShell>
      <Screen title="بطاقة الهوية التاريخية" subtitle="شارك إنجازك مع أصدقائك">
        <div className="mb-3"><Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="size-4" /> رجوع</Link></div>
        <ShareCard
          profile={profile}
          username={username}
          displayNameSources={{
            displayName,
            publicName: account?.display_name ?? null,
            username: account?.username ?? null,
            profileName: profile.name,
          }}
          referralCode={code}
        />
      </Screen>
    </AppShell>
  );
}