import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import {
  ArrowRight, BookOpen, Search, ListOrdered, GitBranch, Lock, Check, Crown,
  Trophy, Sparkles, Scroll, MapPin, Quote, X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  CAMPAIGNS, ERAS, ARTIFACTS, CHARACTERS, CHAPTER_LORE,
  FLAGSHIP_CHAPTERS, type Mission,
} from "@/lib/data";
import { useProfile } from "@/lib/profile";
import salahuddinHero from "@/assets/salahuddin-hero.jpg";

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

const FLAGSHIP_HERO: Record<string, string> = {
  ayyubid: salahuddinHero,
};

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

  // Group missions by chapter
  const groups: { chapter: string | null; missions: Mission[] }[] = [];
  for (const m of campaign.missions) {
    const key = m.chapter ?? null;
    const last = groups[groups.length - 1];
    if (last && last.chapter === key) last.missions.push(m);
    else groups.push({ chapter: key, missions: [m] });
  }

  const flagship = !!campaign.flagship;
  const heroSrc = FLAGSHIP_HERO[campaign.eraId];

  // Reveal modal: open automatically the first time `claimed` flips true
  const [revealOpen, setRevealOpen] = useState(false);
  const onClaim = () => {
    completeCampaign(campaign.eraId, campaign.finalReward.points);
    setRevealOpen(true);
  };

  return (
    <AppShell>
      <div className="animate-reveal pb-8">
        {/* === CINEMATIC HERO === */}
        {flagship && heroSrc ? (
          <FlagshipHero
            src={heroSrc}
            title={campaign.title}
            intro={campaign.intro}
            eraName={eraDef?.name ?? ""}
            eraYears={eraDef?.years ?? ""}
            done={done}
            total={total}
            pct={pct}
          />
        ) : (
          <SimpleHero
            title={campaign.title}
            intro={campaign.intro}
            eraName={eraDef?.name ?? ""}
            eraYears={eraDef?.years ?? ""}
            pct={pct}
            done={done}
            total={total}
          />
        )}

        <div className="px-5">
          {/* === REWARDS PREVIEW (flagship only) === */}
          {flagship && (
            <RewardsPreview
              character={finalChar}
              artifact={finalArt}
              points={campaign.finalReward.points}
              unlocked={claimed}
            />
          )}

          {!flagship && (finalChar || finalArt || campaign.finalReward.points) && (
            <div className="mt-5 rounded-2xl border border-gold/30 bg-gold/5 p-4">
              <p className="text-[10px] text-gold">المكافأة الكبرى عند إتمام الحملة</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                {finalChar && <span>🎴 {finalChar.name}</span>}
                {finalArt && <span>{finalArt.icon} {finalArt.name}</span>}
                <span className="text-gold">+{campaign.finalReward.points} نقطة</span>
              </div>
            </div>
          )}

          {/* === CHAPTER JOURNEY === */}
          <div className="mt-8 flex items-center gap-3">
            <Scroll className="size-4 text-gold" />
            <h3 className="font-display text-base font-bold">{flagship ? "فصول الرحلة" : "مهام الرحلة"}</h3>
            <span className="ms-auto text-[11px] text-muted-foreground">{done}/{total}</span>
          </div>
          <div className="gold-divider mt-2 mb-5" />

          {flagship ? (
            <FlagshipChapterJourney missionsCompleted={profile.missionsCompleted} />
          ) : (
            <SimpleMissionList groups={groups} missionsCompleted={profile.missionsCompleted} missions={campaign.missions} />
          )}

          {/* === CLAIM === */}
          <div className="mt-8">
            {allDone && !claimed ? (
              <button
                onClick={onClaim}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-gold py-4 text-sm font-bold text-primary-foreground shadow-gold animate-gold-pulse"
              >
                <span className="absolute inset-0 -translate-x-full bg-white/30 transition-transform duration-700 group-hover:translate-x-full" />
                <Sparkles className="relative size-4" />
                <span className="relative">استلم المكافأة الكبرى</span>
              </button>
            ) : claimed ? (
              <button
                onClick={() => setRevealOpen(true)}
                className="w-full rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center transition hover:bg-gold/15"
              >
                <Trophy className="mx-auto size-6 text-gold" />
                <p className="font-display mt-2 text-base font-bold text-gold">أتممتَ هذه الحملة</p>
                <p className="mt-1 text-[11px] text-muted-foreground">انقر لرؤية الأرشيف الختامي</p>
              </button>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4 text-center text-[11px] text-muted-foreground">
                أكمل جميع الفصول ليُفتح ختام الحملة.
              </div>
            )}
          </div>
        </div>
      </div>

      {revealOpen && flagship && (
        <CampaignFinaleModal
          onClose={() => setRevealOpen(false)}
          character={finalChar}
          artifact={finalArt}
          points={campaign.finalReward.points}
        />
      )}
    </AppShell>
  );
}

// ============================================================
// HERO — flagship cinematic
// ============================================================
function FlagshipHero(props: {
  src: string; title: string; intro: string;
  eraName: string; eraYears: string;
  done: number; total: number; pct: number;
}) {
  return (
    <div className="px-3 pt-3">
      <Link to="/campaigns" className="mb-3 flex items-center gap-1 px-2 text-xs text-muted-foreground">
        <ArrowRight className="size-3.5" /> الحملات
      </Link>
      <div className="relative overflow-hidden rounded-3xl border border-gold/40 shadow-elegant hero-vignette">
        <img
          src={props.src}
          alt={props.title}
          width={1920}
          height={1080}
          className="h-[280px] w-full object-cover animate-curtain"
        />
        <div className="absolute inset-0 arabesque-bg" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 z-10 p-5">
          <div className="flex items-center gap-2 text-[10px] tracking-widest text-gold">
            <Crown className="size-3.5" />
            <span>حملة العَلَم — {props.eraName} · {props.eraYears}</span>
          </div>
          <h1 className="font-display mt-1.5 text-3xl font-bold leading-snug shimmer-text">
            {props.title}
          </h1>
          <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-foreground/90">
            {props.intro}
          </p>
        </div>
      </div>

      {/* Progress band */}
      <div className="mx-1 -mt-1 rounded-b-3xl border border-t-0 border-gold/30 bg-surface/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 text-gold"><MapPin className="size-3" /> رحلة الفصول</span>
          <span>{props.done}/{props.total} فصلًا · {props.pct}٪</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-gold transition-all duration-700" style={{ width: `${props.pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function SimpleHero(props: {
  title: string; intro: string; eraName: string; eraYears: string;
  pct: number; done: number; total: number;
}) {
  return (
    <div className="px-5 pt-8">
      <Link to="/campaigns" className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowRight className="size-4" /> الحملات
      </Link>
      <div className="relative overflow-hidden rounded-3xl border border-gold/20 bg-surface p-6 shadow-elegant">
        <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative">
          <div className="text-[10px] text-gold">{props.eraName} · {props.eraYears}</div>
          <h1 className="font-display mt-2 text-2xl font-bold leading-snug">{props.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{props.intro}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-gold transition-all" style={{ width: `${props.pct}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{props.done}/{props.total} مهمة · {props.pct}٪</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REWARDS PREVIEW
// ============================================================
function RewardsPreview(props: {
  character: ReturnType<typeof CHARACTERS.find> | null;
  artifact: ReturnType<typeof ARTIFACTS.find> | null;
  points: number;
  unlocked: boolean;
}) {
  return (
    <div className="mt-6 rounded-3xl border border-gold/25 bg-gradient-to-br from-amber-900/20 via-surface to-stone-900/20 p-5">
      <div className="flex items-center gap-2">
        <Trophy className="size-4 text-gold" />
        <p className="font-display text-sm font-bold text-gold">جوائز ختام الحملة</p>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        تُكشف هذه الجوائز فقط حين تُكمل الفصول الثمانية وتختم الحملة.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {props.character && (
          <RewardCard
            title="شخصية أسطورية"
            name={props.character.name}
            sub={props.character.title}
            badge={props.character.avatar}
            locked={!props.unlocked}
            rarity="legendary"
          />
        )}
        {props.artifact && (
          <RewardCard
            title="أثر نادر"
            name={props.artifact.name}
            sub={props.artifact.description}
            badge={props.artifact.icon}
            locked={!props.unlocked}
            rarity="rare"
          />
        )}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-gold/20 bg-background/40 px-3 py-2 text-[11px]">
        <span className="text-muted-foreground">+ نقاط الإنجاز الكبرى</span>
        <span className="font-display text-base font-bold text-gold">+{props.points}</span>
      </div>
    </div>
  );
}

function RewardCard(props: {
  title: string; name: string; sub: string; badge: string;
  locked: boolean; rarity: "legendary" | "rare";
}) {
  const tone = props.rarity === "legendary"
    ? "border-gold/50 bg-gradient-to-b from-gold/15 to-transparent"
    : "border-amber-300/30 bg-gradient-to-b from-amber-300/10 to-transparent";
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] tracking-widest text-gold/80">{props.title}</span>
        {props.locked ? <Lock className="size-3 text-muted-foreground" /> : <Check className="size-3 text-gold" />}
      </div>
      <div className={`mx-auto mt-2 grid size-12 place-items-center rounded-full bg-background/60 text-2xl ${props.locked ? "opacity-40 grayscale" : ""}`}>
        {props.badge}
      </div>
      <p className={`font-display mt-2 text-center text-xs font-bold ${props.locked ? "text-muted-foreground" : "text-foreground"}`}>
        {props.locked ? "؟؟؟" : props.name}
      </p>
      <p className="mt-0.5 line-clamp-2 text-center text-[9px] text-muted-foreground">
        {props.locked ? "تُكشف عند ختام الحملة" : props.sub}
      </p>
    </div>
  );
}

// ============================================================
// CHAPTER JOURNEY (flagship)
// ============================================================
function ChapterJourney(props: {
  groups: { chapter: string | null; missions: Mission[] }[];
  missionsCompleted: string[];
  missions: Mission[];
}) {
  return (
    <div className="relative pr-6">
      <div className="chapter-rail absolute right-2 top-0 bottom-0" aria-hidden />
      <div className="space-y-6">
        {props.groups.map((g, gi) => {
          const allChapterMissions = g.missions;
          const completedInChapter = allChapterMissions.filter((m) => props.missionsCompleted.includes(m.id)).length;
          const chapterDone = completedInChapter === allChapterMissions.length;
          return (
            <ChapterBlock
              key={gi}
              index={gi}
              chapter={g.chapter}
              missions={g.missions}
              all={props.missions}
              completed={props.missionsCompleted}
              chapterDone={chapterDone}
              completedInChapter={completedInChapter}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// FLAGSHIP CHAPTER JOURNEY — one card per chapter, links to player
// ============================================================
function FlagshipChapterJourney(props: { missionsCompleted: string[] }) {
  return (
    <div className="relative pr-6">
      <div className="chapter-rail absolute right-2 top-0 bottom-0" aria-hidden />
      <div className="space-y-5">
        {FLAGSHIP_CHAPTERS.map((ch, i) => {
          const completed = props.missionsCompleted.includes(ch.missionId);
          const prev = FLAGSHIP_CHAPTERS[i - 1];
          const locked = !!prev && !props.missionsCompleted.includes(prev.missionId) && !completed;
          return (
            <div key={ch.id} className="animate-reveal">
              <div className="-mr-[3px] flex items-start gap-3">
                <div className={`chapter-seal shrink-0 ${completed ? "ring-2 ring-gold" : ""} ${locked ? "opacity-40 grayscale" : ""}`}>
                  {completed ? <Check className="size-5" /> : <span className="text-lg">{ch.index.toLocaleString("en-US")}</span>}
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-[10px] tracking-widest text-gold/70">{ch.era}</p>
                  <h4 className={`font-display text-base font-bold ${locked ? "text-muted-foreground" : "text-foreground"}`}>
                    الفصل {ch.index.toLocaleString("en-US")} · {ch.title}
                  </h4>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <MapPin className="size-3 text-gold/70" /> {ch.setting}
                  </p>
                </div>
              </div>

              <div className="mr-[34px] mt-3">
                {locked ? (
                  <div className="rounded-2xl border border-white/10 bg-surface/40 p-4 text-center">
                    <Lock className="mx-auto size-4 text-muted-foreground" />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">يُفتح هذا الفصل عند إتمام ما قبله.</p>
                  </div>
                ) : (
                  <div className="parchment-dark relative overflow-hidden rounded-2xl border border-gold/30 p-4">
                    <div className="absolute inset-0 arabesque-bg" aria-hidden />
                    <div className="relative">
                      <p className="font-display text-[13px] leading-relaxed text-foreground/95">{ch.hook}</p>
                      {ch.quote && (
                        <blockquote className="mt-3 rounded-xl border-r-2 border-gold/60 bg-background/30 px-3 py-2">
                          <Quote className="mb-1 size-3 text-gold/70" />
                          <p className="font-display text-[12px] italic text-foreground/90">«{ch.quote}»</p>
                          {ch.quoteBy && <p className="mt-1 text-[10px] text-gold/80">— {ch.quoteBy}</p>}
                        </blockquote>
                      )}

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {ch.stages.map((s, si) => (
                          <span key={si} className="rounded-full border border-gold/25 bg-background/40 px-2 py-0.5 text-[10px] text-gold/90">
                            {STAGE_LABEL[s.kind]}
                          </span>
                        ))}
                      </div>

                      <Link
                        to="/play/chapter"
                        search={{ id: ch.id }}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-2.5 text-xs font-bold text-primary-foreground shadow-gold"
                      >
                        <Sparkles className="size-3.5" />
                        {completed ? "إعادة لعب الفصل" : "ابدأ الفصل"}
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STAGE_LABEL: Record<string, string> = {
  scene: "مشهد",
  investigation: "تحقيق",
  decision: "قرار",
  timeline: "ترتيب",
  discovery: "اكتشاف",
};

function ChapterBlock(props: {
  index: number;
  chapter: string | null;
  missions: Mission[];
  all: Mission[];
  completed: string[];
  chapterDone: boolean;
  completedInChapter: number;
}) {
  const firstMission = props.missions[0];
  const lore = CHAPTER_LORE[firstMission.id];
  // Chapter is locked if all preceding missions in the campaign aren't all done up to start
  const firstIdx = props.all.indexOf(firstMission);
  const previousAllDone = firstIdx === 0 || props.all.slice(0, firstIdx).every((mm) => props.completed.includes(mm.id));
  const opened = previousAllDone || props.completedInChapter > 0;

  return (
    <div className="animate-reveal">
      {/* Chapter header — seal + title */}
      <div className="-mr-[3px] flex items-start gap-3">
        <div className={`chapter-seal shrink-0 ${props.chapterDone ? "ring-2 ring-gold" : ""} ${opened ? "" : "opacity-40 grayscale"}`}>
          {props.chapterDone ? <Check className="size-5" /> : <span className="text-lg">{toArabicDigit(props.index + 1)}</span>}
        </div>
        <div className="flex-1 pt-1">
          <p className="text-[10px] tracking-widest text-gold/70">{lore?.era ?? "فصل"}</p>
          <h4 className={`font-display text-base font-bold ${opened ? "text-foreground" : "text-muted-foreground"}`}>
            {props.chapter ?? `الفصل ${props.index + 1}`}
          </h4>
          {lore?.setting && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="size-3 text-gold/70" /> {lore.setting}
            </p>
          )}
        </div>
      </div>

      {/* Chapter atmosphere card */}
      {opened && lore && (
        <div className="parchment-dark relative mr-[34px] mt-3 overflow-hidden rounded-2xl border border-gold/30 p-4">
          <div className="absolute inset-0 arabesque-bg" aria-hidden />
          <div className="relative">
            <p className="font-display text-[13px] leading-relaxed text-foreground/95">
              {lore.hook}
            </p>
            {lore.quote && (
              <blockquote className="mt-3 rounded-xl border-r-2 border-gold/60 bg-background/30 px-3 py-2">
                <Quote className="mb-1 size-3 text-gold/70" />
                <p className="font-display text-[12px] italic text-foreground/90">«{lore.quote}»</p>
                {lore.quoteBy && <p className="mt-1 text-[10px] text-gold/80">— {lore.quoteBy}</p>}
              </blockquote>
            )}
            {lore.reward && (
              <p className="mt-3 flex items-center gap-1 text-[10px] text-gold/90">
                <Sparkles className="size-3" /> {lore.reward}
              </p>
            )}
          </div>
        </div>
      )}

      {!opened && (
        <div className="mr-[34px] mt-3 rounded-2xl border border-white/10 bg-surface/40 p-4 text-center">
          <Lock className="mx-auto size-4 text-muted-foreground" />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            يُفتح هذا الفصل عند إتمام ما قبله.
          </p>
        </div>
      )}

      {/* Missions inside chapter */}
      <div className="mr-[34px] mt-3 space-y-2">
        {props.missions.map((m) => {
          const Icon = TYPE_ICON[m.type];
          const completed = props.completed.includes(m.id);
          const idxInAll = props.all.indexOf(m);
          const prev = props.all[idxInAll - 1];
          const locked = !!prev && !props.completed.includes(prev.id) && !completed;
          const link = missionLink(m);
          const inner = (
            <div className={`relative flex items-center gap-3 rounded-2xl border p-3 transition ${
              completed
                ? "border-gold/40 bg-gold/5"
                : locked
                  ? "border-white/5 bg-surface/40 opacity-70"
                  : "border-white/10 bg-surface hover:border-gold/40 hover:bg-surface-2"
            }`}>
              <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${completed ? "bg-gradient-gold text-primary-foreground" : "bg-gold/15 text-gold"}`}>
                {locked ? <Lock className="size-4" /> : completed ? <Check className="size-4" /> : <Icon className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gold/80">{TYPE_LABEL[m.type]}</p>
                <p className="font-display mt-0.5 truncate text-[13px] font-bold">{m.title}</p>
              </div>
              <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] text-gold">+{m.reward}</span>
            </div>
          );
          return (
            <div key={m.id}>
              {locked ? inner : <Link {...link}>{inner}</Link>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// SIMPLE LIST (non-flagship)
// ============================================================
function SimpleMissionList(props: {
  groups: { chapter: string | null; missions: Mission[] }[];
  missionsCompleted: string[];
  missions: Mission[];
}) {
  return (
    <ol className="relative space-y-3 border-r-2 border-dashed border-white/10 pr-5">
      {props.groups.map((g, gi) => (
        <li key={gi} className="space-y-3">
          {g.chapter && <p className="-mr-5 mt-2 mb-1 text-[11px] font-bold text-gold/90">{g.chapter}</p>}
          {g.missions.map((m, idx) => {
            const Icon = TYPE_ICON[m.type];
            const completed = props.missionsCompleted.includes(m.id);
            const prev = props.missions[props.missions.indexOf(m) - 1];
            const locked = !!prev && !props.missionsCompleted.includes(prev.id) && !completed;
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
            return <div key={m.id}>{locked ? inner : <Link {...link}>{inner}</Link>}</div>;
          })}
        </li>
      ))}
    </ol>
  );
}

// ============================================================
// FINALE MODAL
// ============================================================
function CampaignFinaleModal(props: {
  onClose: () => void;
  character: ReturnType<typeof CHARACTERS.find> | null;
  artifact: ReturnType<typeof ARTIFACTS.find> | null;
  points: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 px-4 backdrop-blur-md">
      <div className="parchment-dark relative w-full max-w-md overflow-hidden rounded-3xl border border-gold/50 p-6 shadow-elegant animate-curtain">
        <div className="absolute inset-0 arabesque-bg" aria-hidden />
        <button
          onClick={props.onClose}
          className="absolute left-3 top-3 z-10 grid size-8 place-items-center rounded-full border border-white/20 bg-background/40 text-muted-foreground"
          aria-label="إغلاق"
        >
          <X className="size-4" />
        </button>
        <div className="relative text-center">
          <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-gradient-gold text-3xl shadow-gold animate-stamp">
            🕌
          </div>
          <p className="text-[10px] tracking-[0.3em] text-gold">حملة العَلَم</p>
          <h2 className="font-display mt-1 text-2xl font-bold shimmer-text">عاد الأذان إلى الأقصى</h2>
          <p className="mt-2 text-xs text-muted-foreground animate-ink">
            في رجب 583 هـ، اكتمل ما بدأه نور الدين. ها أنت قد ختمت الرحلة.
          </p>
          <div className="gold-divider mt-4 mb-4" />
          <div className="grid grid-cols-2 gap-3 text-right">
            {props.character && (
              <div className="rounded-2xl border border-gold/40 bg-background/40 p-3">
                <p className="text-[9px] tracking-widest text-gold">شخصية أسطورية</p>
                <p className="font-display mt-1 text-sm font-bold">{props.character.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{props.character.title}</p>
              </div>
            )}
            {props.artifact && (
              <div className="rounded-2xl border border-amber-300/40 bg-background/40 p-3">
                <p className="text-[9px] tracking-widest text-gold">أثر نادر</p>
                <p className="font-display mt-1 text-sm font-bold">{props.artifact.icon} {props.artifact.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{props.artifact.description}</p>
              </div>
            )}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            + <span className="font-display text-base font-bold text-gold">{props.points}</span> نقطة إنجاز كبرى
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link
              to="/collection"
              className="rounded-2xl border border-gold/40 px-3 py-2.5 text-xs text-gold transition hover:bg-gold/10"
              onClick={props.onClose}
            >
              زر أرشيف الحملة
            </Link>
            <Link
              to="/campaigns"
              className="rounded-2xl bg-gradient-gold px-3 py-2.5 text-xs font-bold text-primary-foreground shadow-gold"
              onClick={props.onClose}
            >
              ابدأ حملة جديدة
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function toArabicDigit(n: number) {
  return n.toLocaleString("en-US");
}