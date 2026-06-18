import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Search, ListOrdered, GitBranch, Lock, Check, Crown, Trophy, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CAMPAIGNS, ERAS, ARTIFACTS, CHARACTERS, type Mission } from "@/lib/data";
import { useProfile } from "@/lib/profile";

const TYPE_ICON = {
  story: BookOpen,
  investigation: Search,
  timeline: ListOrdered,
  decision: GitBranch,
} as const;

const TYPE_LABEL = {
  story: "قصة",
  investigation: "تحقيق",
  timeline: "خط زمني",
  decision: "قرار",
} as const;

export const Route = createFileRoute("/campaigns/$era")({
  head: () => ({ meta: [{ title: "حملة تاريخية" }] }),
  component: CampaignPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center">
        <p className="text-muted-foreground">الحملة غير موجودة.</p>
        <Link to="/campaigns" className="mt-4 inline-block text-gold">عودة للحملات</Link>
      </div>
    </AppShell>
  ),
  errorComponent: () => (
    <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">تعذّر تحميل الحملة.</div></AppShell>
  ),
});

function missionLink(m: Mission) {
  switch (m.type) {
    case "story": return { to: "/story/$id" as const, params: { id: m.refId }, search: { mission: m.id } };
    case "investigation": return { to: "/play/investigate" as const, search: { id: m.refId, mission: m.id } };
    case "timeline": return { to: "/play/timeline" as const, search: { id: m.refId, mission: m.id } };
    case "decision": return { to: "/play/decisions" as const, search: { id: m.refId, mission: m.id } };
  }
}

function CampaignPage() {
  const { era } = useParams({ from: "/campaigns/$era" });
  const campaign = CAMPAIGNS.find((c) => c.eraId === era);
  if (!campaign) throw notFound();

  const { profile, completeCampaign } = useProfile();
  const eraDef = ERAS.find((e) => e.id === campaign.eraId);
  const done = campaign.missions.filter((m) => profile.missionsCompleted.includes(m.id)).length;
  const total = campaign.missions.length;
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;
  const claimed = profile.campaignsCompleted.includes(campaign.eraId);

  const finalChar = campaign.finalReward.character ? CHARACTERS.find((c) => c.id === campaign.finalReward.character) : null;
  const finalArt = campaign.finalReward.artifact ? ARTIFACTS.find((a) => a.id === campaign.finalReward.artifact) : null;

  // Group missions by chapter (for flagship)
  const groups: { chapter: string | null; missions: Mission[] }[] = [];
  for (const m of campaign.missions) {
    const key = m.chapter ?? null;
    const last = groups[groups.length - 1];
    if (last && last.chapter === key) last.missions.push(m);
    else groups.push({ chapter: key, missions: [m] });
  }

  return (
    <AppShell>
      <div className="animate-reveal px-5 pt-8">
        <Link to="/campaigns" className="flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowRight className="size-4" /> الحملات
        </Link>

        {/* HERO */}
        <div className={`relative mt-5 overflow-hidden rounded-3xl border p-6 shadow-elegant ${
          campaign.flagship ? "border-gold/40 bg-gradient-to-tl from-amber-900/40 via-surface to-stone-900/40" : "border-gold/20 bg-surface"
        }`}>
          {campaign.flagship && <div className="particle-field" />}
          <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[10px] text-gold">
              {campaign.flagship && <Crown className="size-3.5" />}
              {eraDef?.name} · {eraDef?.years}
            </div>
            <h1 className={`font-display mt-2 text-2xl font-bold leading-snug ${campaign.flagship ? "shimmer-text" : ""}`}>{campaign.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{campaign.intro}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-gold transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{done}/{total} مهمة · {pct}٪</p>
          </div>
        </div>

        {/* FINAL REWARD */}
        {(finalChar || finalArt || campaign.finalReward.points) && (
          <div className="mt-5 rounded-2xl border border-gold/30 bg-gold/5 p-4">
            <p className="text-[10px] text-gold">المكافأة الكبرى عند إتمام الحملة</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {finalChar && <span>🎴 {finalChar.name}</span>}
              {finalArt && <span>{finalArt.icon} {finalArt.name}</span>}
              <span className="text-gold">+{campaign.finalReward.points} نقطة</span>
            </div>
          </div>
        )}

        {/* MISSIONS */}
        <h3 className="font-display mt-7 mb-3 text-base font-bold">مهام الرحلة</h3>
        <ol className="relative space-y-3 border-r-2 border-dashed border-white/10 pr-5">
          {groups.map((g, gi) => (
            <li key={gi} className="space-y-3">
              {g.chapter && (
                <p className="-mr-5 mt-2 mb-1 text-[11px] font-bold text-gold/90">{g.chapter}</p>
              )}
              {g.missions.map((m, idx) => {
                const Icon = TYPE_ICON[m.type];
                const completed = profile.missionsCompleted.includes(m.id);
                const prev = campaign.missions[campaign.missions.indexOf(m) - 1];
                const locked = !!prev && !profile.missionsCompleted.includes(prev.id) && !completed;
                const link = missionLink(m);
                const inner = (
                  <div className={`relative flex items-center gap-3 rounded-2xl border p-4 transition ${
                    completed ? "border-gold/40 bg-gold/5" : locked ? "border-white/5 bg-surface/60 opacity-70" : "border-white/10 bg-surface hover:border-gold/40"
                  }`}>
                    <span className={`absolute -right-[31px] top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-background ${completed ? "bg-gold" : "bg-white/20"}`} />
                    <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${completed ? "bg-gradient-gold text-primary-foreground" : "bg-gold/15 text-gold"}`}>
                      {locked ? <Lock className="size-4" /> : completed ? <Check className="size-5" /> : <Icon className="size-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-gold/80">{TYPE_LABEL[m.type]} · مهمة {idx + 1}</p>
                      <p className="font-display mt-0.5 truncate text-sm font-bold">{m.title}</p>
                    </div>
                    <span className="text-[10px] text-gold">+{m.reward}</span>
                  </div>
                );
                return (
                  <div key={m.id}>
                    {locked ? inner : (
                      <Link {...link}>{inner}</Link>
                    )}
                  </div>
                );
              })}
            </li>
          ))}
        </ol>

        {/* CLAIM */}
        <div className="mt-7 mb-4">
          {allDone && !claimed ? (
            <button
              onClick={() => completeCampaign(campaign.eraId, campaign.finalReward.points)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-4 text-sm font-bold text-primary-foreground shadow-gold"
            >
              <Sparkles className="size-4" /> استلم المكافأة الكبرى
            </button>
          ) : claimed ? (
            <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center">
              <Trophy className="mx-auto size-6 text-gold" />
              <p className="font-display mt-2 text-base font-bold text-gold">أتممتَ هذه الحملة</p>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}