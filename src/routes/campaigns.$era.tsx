import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChevronRight, BookOpen, Search, ListOrdered, GitBranch, Trophy, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CAMPAIGNS, ERAS, ARTIFACTS, CHARACTERS, type Mission, type MissionType } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/campaigns/$era")({
  head: () => ({ meta: [{ title: "حملة تاريخية" }] }),
  component: CampaignPage,
  notFoundComponent: () => <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">الحملة غير موجودة.</div></AppShell>,
  errorComponent: () => <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">تعذّر تحميل الحملة.</div></AppShell>,
});

const ICONS: Record<MissionType, React.ReactNode> = {
  story: <BookOpen className="size-4" />,
  investigation: <Search className="size-4" />,
  timeline: <ListOrdered className="size-4" />,
  decision: <GitBranch className="size-4" />,
};
const TYPE_LABEL: Record<MissionType, string> = {
  story: "قصة", investigation: "تحقيق", timeline: "ترتيب", decision: "قرار",
};

function CampaignPage() {
  const { era } = useParams({ from: "/campaigns/$era" });
  const { profile, completeCampaign, findArtifact, unlockCharacter } = useProfile();
  const campaign = CAMPAIGNS.find((c) => c.eraId === era);
  const eraInfo = ERAS.find((e) => e.id === era);

  const allDone = campaign ? campaign.missions.every((m) => profile.missionsCompleted.includes(m.id)) : false;
  const alreadyClaimed = campaign ? profile.campaignsCompleted.includes(campaign.eraId) : false;

  useEffect(() => {
    if (campaign && allDone && !alreadyClaimed) {
      completeCampaign(campaign.eraId, campaign.finalReward.points);
      if (campaign.finalReward.artifact) findArtifact(campaign.finalReward.artifact);
      if (campaign.finalReward.character) unlockCharacter(campaign.finalReward.character);
    }
  }, [allDone, alreadyClaimed, campaign, completeCampaign, findArtifact, unlockCharacter]);

  if (!campaign || !eraInfo) return null;

  const finalChar = campaign.finalReward.character ? CHARACTERS.find((c) => c.id === campaign.finalReward.character) : null;
  const finalArtifact = campaign.finalReward.artifact ? ARTIFACTS.find((a) => a.id === campaign.finalReward.artifact) : null;

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Link to="/campaigns" className="flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronRight className="size-4" /> العودة للحملات
        </Link>

        <div className="mt-5 overflow-hidden rounded-3xl border border-gold/20 bg-surface p-6 shadow-elegant">
          <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/20 blur-3xl" />
          <p className="text-[10px] text-gold">{eraInfo.years}</p>
          <h1 className="font-display mt-1 text-2xl font-bold">{campaign.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{campaign.intro}</p>
        </div>

        <h2 className="font-display mt-6 mb-3 text-base font-bold">المهام</h2>
        <ol className="space-y-3">
          {campaign.missions.map((m, i) => (
            <MissionRow key={m.id} index={i + 1} mission={m} done={profile.missionsCompleted.includes(m.id)} />
          ))}
        </ol>

        <div className="mt-6 rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/15 to-transparent p-5">
          <div className="flex items-center gap-2 text-xs text-gold">
            <Trophy className="size-4" /> مكافأة الإتمام
          </div>
          <p className="mt-2 text-sm text-muted-foreground">+{campaign.finalReward.points} نقطة</p>
          {finalChar && <p className="mt-1 text-sm">🎴 شخصية: <span className="font-bold">{finalChar.name}</span></p>}
          {finalArtifact && <p className="mt-1 text-sm">{finalArtifact.icon} أثر: <span className="font-bold">{finalArtifact.name}</span></p>}
          {alreadyClaimed && (
            <p className="mt-3 flex items-center gap-1 text-xs text-gold"><Check className="size-3.5" /> تمّ استلام المكافأة</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function MissionRow({ index, mission, done }: { index: number; mission: Mission; done: boolean }) {
  const linkProps = missionLink(mission);
  return (
    <li>
      <Link
        {...linkProps}
        className={`flex items-center gap-3 rounded-2xl border p-4 transition ${done ? "border-gold/30 bg-gold/5" : "border-white/10 bg-surface hover:border-gold/40"}`}
      >
        <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${done ? "bg-gradient-gold text-primary-foreground" : "bg-gold/15 text-gold"}`}>
          {done ? <Check className="size-5" /> : ICONS[mission.type]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-gold">المهمة {index} · {TYPE_LABEL[mission.type]}</p>
          <p className="font-display mt-0.5 truncate text-sm font-bold">{mission.title}</p>
        </div>
        <span className="text-xs text-muted-foreground">+{mission.reward}</span>
      </Link>
    </li>
  );
}

function missionLink(m: Mission): any {
  switch (m.type) {
    case "story": return { to: "/story/$id", params: { id: m.refId }, search: { mission: m.id } };
    case "investigation": return { to: "/play/investigate", search: { id: m.refId, mission: m.id } };
    case "timeline": return { to: "/play/timeline", search: { id: m.refId, mission: m.id } };
    case "decision": return { to: "/play/decisions", search: { id: m.refId, mission: m.id } };
  }
}