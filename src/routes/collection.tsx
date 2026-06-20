import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Lock, MapPin, Crown, Swords, BookOpen, Landmark, Scroll, Users, Sparkles, Award, Trophy, Clock, AlertTriangle } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ARTIFACTS, CHARACTERS, MAP_REGIONS, ERAS, STORIES, fogHint, type Era } from "@/lib/data";
import { useProfile } from "@/lib/profile";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { displayBadgeName } from "@/lib/display-names";
import {
  getImportedRegistryItemsByType,
  getMissingRegistryUnlockIds,
  registryItemIcon,
  registryItemRarity,
} from "@/lib/importedUnlocks";
import { pullAllFromCloud } from "@/lib/cloudSync";
import type { ContentRegistryItem, RegistryItemType } from "@/types/contentRegistry";

export const Route = createFileRoute("/collection")({
  head: () => ({ meta: [{ title: "المتحف · أرشيفك التاريخي" }] }),
  component: CollectionPage,
});

type Rarity = "common" | "rare" | "epic" | "legendary";
type SectionId = "figures" | "artifacts" | "battles" | "manuscripts" | "landmarks" | "dynasties" | "badges" | "achievements";

const RARITY_META: Record<Rarity, { label: string; ring: string; chip: string; glow: string }> = {
  common:    { label: "عادي",    ring: "ring-white/10",       chip: "bg-white/10 text-white/70",                        glow: "" },
  rare:      { label: "نادر",    ring: "ring-sky-400/40",     chip: "bg-sky-400/15 text-sky-200",                       glow: "shadow-[0_0_24px_-8px_oklch(0.78_0.14_240/35%)]" },
  epic:      { label: "ملحمي",   ring: "ring-fuchsia-400/45", chip: "bg-fuchsia-400/15 text-fuchsia-200",               glow: "shadow-[0_0_28px_-8px_oklch(0.7_0.2_320/40%)]" },
  legendary: { label: "أسطوري",  ring: "ring-gold/60",        chip: "bg-gradient-gold text-primary-foreground",         glow: "shadow-gold" },
};

// ───── Artifact rarity overrides (legendary/epic/rare/common)
const ARTIFACT_RARITY: Record<string, Rarity> = {
  "kaaba-kiswa": "legendary",
  "hattin-banner": "legendary",
  "salah-letter": "legendary",
  "nuruddin-minbar": "legendary",
  "aqsa-stone": "legendary",
  "khwarizmi-jabr": "epic",
  "baghdad-manuscript": "epic",
  "fatih-cannon": "epic",
  "ain-jalut-arrow": "epic",
  "hattin-map": "epic",
  "mamluk-quran": "rare",
  "cordoba-key": "rare",
  "alhambra-tile": "rare",
  "ottoman-tughra": "rare",
  "doc-jerusalem-khutba": "rare",
  "doc-crusades": "rare",
};
const aRarity = (id: string): Rarity => ARTIFACT_RARITY[id] ?? "common";
const cRarity = (c: { rarity: string }): Rarity => (c.rarity as Rarity) ?? "common";

// ───── Battles — curated, era + storyId for unlock check
interface Battle { id: string; name: string; era: Era; year: string; location: string; victor: string; summary: string; storyId?: string; rarity: Rarity; icon: string }
const BATTLES: Battle[] = [
  { id: "b-badr",      name: "بدر الكبرى",        era: "seerah",   year: "٢ هـ",     location: "بدر · الحجاز",       victor: "المسلمون",      summary: "أوّل معركةٍ فاصلة، نصرٌ سماوي على عددٍ قليل.", rarity: "legendary", icon: "🌟" },
  { id: "b-yarmouk",   name: "اليرموك",           era: "rashidun", year: "١٥ هـ",    location: "نهر اليرموك · الشام", victor: "خالد بن الوليد", summary: "ستّة أيامٍ كسرت ظهر الروم وفتحت الشام.",       storyId: "yarmouk",     rarity: "legendary", icon: "⚔️" },
  { id: "b-qadisiyyah", name: "القادسية",         era: "rashidun", year: "١٥ هـ",    location: "قرب الكوفة · العراق", victor: "سعد بن أبي وقّاص", summary: "أربعة أيامٍ أنهت إمبراطورية الساسانيين.",     storyId: "qadisiyyah",  rarity: "epic",      icon: "🏹" },
  { id: "b-manzikert", name: "ملاذكرد",           era: "seljuk",   year: "٤٦٣ هـ",   location: "ملاذكرد · الأناضول",  victor: "ألب أرسلان",     summary: "أُسر إمبراطور الروم وفُتحت أبواب الأناضول.",  rarity: "epic",      icon: "🛡️" },
  { id: "b-hattin",    name: "حِطّين",            era: "ayyubid",  year: "٥٨٣ هـ",   location: "سهل حِطّين · فلسطين", victor: "صلاح الدين",     summary: "نهاية الصليبيين وعودة الأذان للأقصى.",        storyId: "hattin",      rarity: "legendary", icon: "🕌" },
  { id: "b-ain-jalut", name: "عين جالوت",         era: "mamluk",   year: "٦٥٨ هـ",   location: "فلسطين",             victor: "قطز وبيبرس",    summary: "أوّل هزيمةٍ كبرى للمغول في التاريخ.",         storyId: "ain-jalut",   rarity: "legendary", icon: "🦁" },
  { id: "b-constantinople", name: "فتح القسطنطينية", era: "ottoman", year: "٨٥٧ هـ", location: "القسطنطينية",         victor: "محمد الفاتح",    summary: "بشارة النبي ﷺ تتحقّق بعد ثمانية قرون.",       storyId: "constantinople", rarity: "legendary", icon: "🏰" },
];

// ───── Landmarks — derived from map regions + curated
interface Landmark { id: string; name: string; era: Era; place: string; summary: string; regionId?: string; rarity: Rarity; icon: string }
const LANDMARKS: Landmark[] = [
  { id: "l-kaaba",     name: "الكعبة المشرّفة", era: "seerah",   place: "مكة المكرّمة",  summary: "قبلة المسلمين وبيت الله العتيق.",       regionId: "hijaz", rarity: "legendary", icon: "🕋" },
  { id: "l-aqsa",      name: "المسجد الأقصى",   era: "ayyubid",  place: "القدس",         summary: "أولى القبلتين وثالث الحرمين.",          rarity: "legendary", icon: "🕌" },
  { id: "l-umayyad",   name: "الجامع الأموي",   era: "umayyad",  place: "دمشق",          summary: "تحفة الأمويين ودرّة الشام.",            regionId: "sham", rarity: "epic", icon: "🏛️" },
  { id: "l-bait-hikma", name: "بيت الحكمة",     era: "abbasid",  place: "بغداد",         summary: "أعظم مركزٍ علميٍّ في زمنه.",            regionId: "iraq", rarity: "epic", icon: "📚" },
  { id: "l-zahra",     name: "مدينة الزهراء",   era: "andalus",  place: "قرطبة",         summary: "مدينة المرايا التي بناها الناصر.",      regionId: "andalus", rarity: "epic", icon: "🌹" },
  { id: "l-alhambra",  name: "قصر الحمراء",     era: "andalus",  place: "غرناطة",        summary: "آخر ما تبقّى من جمال الأندلس.",         regionId: "andalus", rarity: "legendary", icon: "🏯" },
  { id: "l-ayasofya",  name: "آيا صوفيا",       era: "ottoman",  place: "إسطنبول",       summary: "صلّى فيها الفاتح أول جمعة.",            regionId: "anatolia", rarity: "legendary", icon: "🕍" },
  { id: "l-samarkand", name: "ساحة ريغستان",    era: "abbasid",  place: "سمرقند",        summary: "قلب طريق الحرير ومدارس تيمور.",         regionId: "transoxiana", rarity: "rare", icon: "🏛️" },
];

// ───── Profile-derived unlock helpers
function useUnlocks() {
  const { profile } = useProfile();
  return useMemo(() => {
    const eraHasProgress = (era: Era) => {
      const hasArt = ARTIFACTS.some(a => a.era === era && profile.artifactsFound.includes(a.id));
      const hasChar = CHARACTERS.some(c => c.era === era && profile.charactersUnlocked.includes(c.id));
      const hasStory = STORIES.some(s => s.era === era && profile.storiesRead.includes(s.id));
      return hasArt || hasChar || hasStory || profile.unlockedEras.includes(era);
    };
    const eraProgress = (era: Era) => {
      const arts = ARTIFACTS.filter(a => a.era === era);
      const chars = CHARACTERS.filter(c => c.era === era);
      const sts = STORIES.filter(s => s.era === era);
      const total = arts.length + chars.length + sts.length;
      const done =
        arts.filter(a => profile.artifactsFound.includes(a.id)).length +
        chars.filter(c => profile.charactersUnlocked.includes(c.id)).length +
        sts.filter(s => profile.storiesRead.includes(s.id)).length;
      return { done, total };
    };
    return { profile, eraHasProgress, eraProgress };
  }, [profile]);
}

// ───── Reusable card
function Card({ unlocked, rarity, icon, title, subtitle, footer, onClick, mystery }: {
  unlocked: boolean; rarity: Rarity; icon: string; title: string; subtitle: string; footer?: string;
  onClick: () => void; mystery?: { title: string; clue: string };
}) {
  const meta = RARITY_META[rarity];
  return (
    <button
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-surface text-right transition-all duration-300 hover:-translate-y-0.5
        ${unlocked ? `ring-1 ${meta.ring} ${meta.glow}` : "opacity-70"}`}
    >
      {/* rarity wash */}
      {unlocked && (
        <div className={`pointer-events-none absolute inset-0 opacity-60
          ${rarity === "legendary" ? "bg-gradient-to-br from-gold/15 via-gold/0 to-transparent" :
            rarity === "epic"      ? "bg-gradient-to-br from-fuchsia-400/15 via-fuchsia-400/0 to-transparent" :
            rarity === "rare"      ? "bg-gradient-to-br from-sky-400/15 via-sky-400/0 to-transparent" :
                                     "bg-gradient-to-br from-white/5 to-transparent"}`} />
      )}
      {/* fog wash for locked */}
      {!unlocked && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.85_0.02_80/0.08),transparent_60%),radial-gradient(circle_at_70%_80%,oklch(0.82_0.05_240/0.07),transparent_60%)]" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40" />
        </>
      )}
      {/* sheen */}
      {unlocked && rarity !== "common" && (
        <div className="pointer-events-none absolute -inset-x-10 -top-12 h-24 rotate-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      )}
      <div className="relative p-3">
        <div className="flex items-start justify-between gap-2">
          <div className={`relative grid size-12 place-items-center overflow-hidden rounded-xl text-2xl
            ${unlocked ? "bg-black/30 ring-1 ring-white/10" : "bg-black/50 ring-1 ring-white/5"}`}>
            {unlocked ? icon : (
              <>
                <span className="select-none text-2xl opacity-20 blur-[3px] grayscale">{icon}</span>
                <Lock className="absolute size-3.5 text-gold/70" />
              </>
            )}
          </div>
          {unlocked ? (
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide ${meta.chip}`}>
              {meta.label}
            </span>
          ) : (
            <span className="rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-bold tracking-wide text-gold/70 ring-1 ring-gold/20">
              في الضباب
            </span>
          )}
        </div>
        <p className={`font-display mt-2 line-clamp-1 text-sm font-bold ${unlocked ? "" : "italic text-gold/85"}`}>
          {unlocked ? title : (mystery?.title ?? "أثرٌ في الضباب")}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[10px] text-gold/80">
          {unlocked ? subtitle : "مجهولٌ بعد"}
        </p>
        <p className="mt-1 line-clamp-2 min-h-[28px] text-[10px] leading-snug text-muted-foreground">
          {unlocked ? (footer ?? "") : (mystery?.clue ?? "اكمل رحلتك لتكشف هذا اللغز")}
        </p>
      </div>
    </button>
  );
}

// ───── Reveal dialog
interface RevealItem { rarity: Rarity; icon: string; title: string; subtitle: string; lines: string[]; }
function RevealDialog({ item, onClose }: { item: RevealItem | null; onClose: () => void }) {
  const open = !!item;
  const meta = item ? RARITY_META[item.rarity] : RARITY_META.common;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm overflow-hidden border-white/10 bg-surface p-0 [&>button]:text-gold">
        {item && (
          <div className="relative">
            <div className={`relative overflow-hidden p-6 text-center
              ${item.rarity === "legendary" ? "bg-gradient-to-b from-gold/25 via-gold/5 to-transparent" :
                item.rarity === "epic"      ? "bg-gradient-to-b from-fuchsia-400/20 via-fuchsia-400/5 to-transparent" :
                item.rarity === "rare"      ? "bg-gradient-to-b from-sky-400/20 via-sky-400/5 to-transparent" :
                                              "bg-gradient-to-b from-white/10 to-transparent"}`}>
              <div className="pointer-events-none absolute inset-0 opacity-50" style={{
                backgroundImage: "radial-gradient(circle at 20% 30%, oklch(0.82 0.14 82 / 0.25), transparent 40%), radial-gradient(circle at 80% 70%, oklch(0.82 0.14 82 / 0.15), transparent 45%)",
              }} />
              <div className="reward-burst relative mx-auto grid size-24 place-items-center rounded-2xl bg-black/40 text-5xl ring-1 ring-white/10 animate-gold-pulse">
                {item.icon}
              </div>
              <span className={`mt-3 inline-block rounded-full px-3 py-1 text-[10px] font-bold tracking-wider ${meta.chip}`}>
                <Sparkles className="me-1 inline size-3" />
                {meta.label} · اكتُشف
              </span>
              <DialogTitle className="font-display shimmer-text mt-2 text-2xl font-extrabold">
                {item.title}
              </DialogTitle>
              <p className="mt-1 text-xs text-gold/90">{item.subtitle}</p>
            </div>
            <div className="space-y-2 p-5 text-[12.5px] leading-7 text-foreground/85">
              {item.lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
            <div className="px-5 pb-5">
              <button onClick={onClose} className="bg-gradient-gold shadow-gold w-full rounded-xl py-2.5 text-sm font-bold text-primary-foreground">
                أضف إلى أرشيفي
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───── Section header with completion bar
function SectionBar({ icon: Icon, title, done, total, accent }: { icon: any; title: string; done: number; total: number; accent: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-gold" />
          <h2 className="font-display text-sm font-bold">{title}</h2>
        </div>
        <span className="text-[10px] text-muted-foreground">{done}/{total} · {pct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${accent}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const SECTIONS: { id: SectionId; label: string; icon: any }[] = [
  { id: "figures",      label: "شخصيات",  icon: Users },
  { id: "artifacts",    label: "آثار",    icon: Crown },
  { id: "battles",      label: "معارك",   icon: Swords },
  { id: "manuscripts",  label: "مخطوطات", icon: BookOpen },
  { id: "landmarks",    label: "معالم",   icon: Landmark },
  { id: "dynasties",    label: "دول",     icon: Scroll },
  { id: "badges",       label: "شارات",   icon: Award },
  { id: "achievements", label: "إنجازات", icon: Trophy },
];

function CollectionPage() {
  const { profile, eraHasProgress, eraProgress } = useUnlocks();
  const [section, setSection] = useState<SectionId>("figures");
  const [reveal, setReveal] = useState<RevealItem | null>(null);
  const navigate = useNavigate();

  // counts per section
  const artifactsOnly = ARTIFACTS.filter(a => a.type !== "manuscript");
  const manuscripts   = ARTIFACTS.filter(a => a.type === "manuscript");

  // Imported registry items merged into each museum section.
  // figures section absorbs registry "figure" + "scholar".
  const importedFigures      = useMemo(() => [
    ...getImportedRegistryItemsByType("figure"),
    ...getImportedRegistryItemsByType("scholar"),
  ], []);
  const importedArtifacts    = useMemo(() => getImportedRegistryItemsByType("artifact"), []);
  const importedBattles      = useMemo(() => getImportedRegistryItemsByType("battle"), []);
  const importedLandmarks    = useMemo(() => getImportedRegistryItemsByType("city"), []);
  const importedDynasties    = useMemo(() => getImportedRegistryItemsByType("dynasty"), []);
  const importedBadges       = useMemo(() => getImportedRegistryItemsByType("badge"), []);
  const importedAchievements = useMemo(() => getImportedRegistryItemsByType("achievement"), []);

  const importedUnlockedCount = (arr: Array<{ unlocked: boolean }>) => arr.filter(i => i.unlocked).length;

  const counts: Record<SectionId, { done: number; total: number }> = {
    figures:      {
      done:  profile.charactersUnlocked.length + importedUnlockedCount(importedFigures),
      total: CHARACTERS.length + importedFigures.length,
    },
    artifacts:    {
      done:  artifactsOnly.filter(a => profile.artifactsFound.includes(a.id)).length + importedUnlockedCount(importedArtifacts),
      total: artifactsOnly.length + importedArtifacts.length,
    },
    battles:      {
      done:  BATTLES.filter(b => !b.storyId || profile.storiesRead.includes(b.storyId)).length + importedUnlockedCount(importedBattles),
      total: BATTLES.length + importedBattles.length,
    },
    manuscripts:  { done: manuscripts.filter(a => profile.artifactsFound.includes(a.id)).length, total: manuscripts.length },
    landmarks:    {
      done:  LANDMARKS.filter(l => !l.regionId || profile.regionsUnlocked.includes(l.regionId)).length + importedUnlockedCount(importedLandmarks),
      total: LANDMARKS.length + importedLandmarks.length,
    },
    dynasties:    {
      done:  ERAS.filter(e => eraHasProgress(e.id)).length + importedUnlockedCount(importedDynasties),
      total: ERAS.length + importedDynasties.length,
    },
    badges:       { done: importedUnlockedCount(importedBadges),       total: importedBadges.length },
    achievements: { done: importedUnlockedCount(importedAchievements), total: importedAchievements.length },
  };

  // Hide badges/achievements pills entirely when there are no imported items there.
  const visibleSections = SECTIONS.filter(s => {
    if (s.id === "badges")       return importedBadges.length > 0;
    if (s.id === "achievements") return importedAchievements.length > 0;
    return true;
  });

  const totalDone = Object.values(counts).reduce((s, c) => s + c.done, 0);
  const totalAll  = Object.values(counts).reduce((s, c) => s + c.total, 0);
  const prestige  = totalAll ? Math.round((totalDone / totalAll) * 100) : 0;

  return (
    <AppShell>
      <Screen title="المتحف">
        {/* Prestige header */}
        <div className="relative mb-4 overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/15 via-gold/5 to-transparent p-4">
          <div className="pointer-events-none absolute inset-0 opacity-30" style={{
            backgroundImage: "radial-gradient(circle at 15% 20%, oklch(0.82 0.14 82 / 0.4), transparent 35%), radial-gradient(circle at 85% 80%, oklch(0.82 0.14 82 / 0.25), transparent 40%)",
          }} />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[10px] tracking-[0.2em] text-gold/80">أرشيفك التاريخي</p>
              <h1 className="font-display shimmer-text mt-1 text-2xl font-extrabold">إرثٌ يكبر معك</h1>
              <p className="mt-1 text-[11px] text-muted-foreground">كلّ قطعةٍ مكتشفة تُضيف فصلًا لمتحفك الخاص.</p>
            </div>
            <div className="text-center">
              <p className="font-display text-3xl font-extrabold text-gold">{prestige}%</p>
              <p className="text-[10px] text-muted-foreground">{totalDone}/{totalAll}</p>
            </div>
          </div>
          <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-black/30">
            <div className="bg-gradient-gold h-full rounded-full" style={{ width: `${prestige}%` }} />
          </div>
        </div>

        {/* Recent unlocks — "آخر المقتنيات" */}
        <RecentUnlocks />

        {/* Section pills */}
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {visibleSections.map(s => {
            const active = section === s.id;
            const Icon = s.icon;
            const c = counts[s.id];
            return (
              <button key={s.id} onClick={() => setSection(s.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all
                  ${active ? "border-gold/50 bg-gold/15 text-gold shadow-gold" : "border-white/10 bg-surface text-muted-foreground"}`}>
                <Icon className="size-3.5" />
                <span className="font-medium">{s.label}</span>
                <span className="text-[10px] opacity-70">{c.done}/{c.total}</span>
              </button>
            );
          })}
        </div>

        {/* Figures */}
        {section === "figures" && (
          <>
            <SectionBar icon={Users} title="شخصيات تاريخية" done={counts.figures.done} total={counts.figures.total} accent="bg-gradient-gold" />
            <div className="grid grid-cols-2 gap-3">
              {CHARACTERS.map(c => {
                const open = profile.charactersUnlocked.includes(c.id);
                const r = cRarity(c);
                return (
                  <Card key={c.id} unlocked={open} rarity={r} icon={c.avatar}
                    title={c.name} subtitle={c.title} footer={c.power}
                    mystery={fogHint(c.id)}
                    onClick={() => {
                      if (open) navigate({ to: "/figure/$id", params: { id: c.id } });
                    }} />
                );
              })}
              {importedFigures.map(item => (
                <ImportedCard key={`imp-${item.id}`} item={item} setReveal={setReveal} />
              ))}
            </div>
          </>
        )}

        {/* Artifacts */}
        {section === "artifacts" && (
          <>
            <SectionBar icon={Crown} title="آثار وكنوز" done={counts.artifacts.done} total={counts.artifacts.total} accent="bg-gradient-gold" />
            <div className="grid grid-cols-2 gap-3">
              {artifactsOnly.map(a => {
                const open = profile.artifactsFound.includes(a.id);
                const r = aRarity(a.id);
                return (
                  <Card key={a.id} unlocked={open} rarity={r} icon={a.icon}
                    title={a.name} subtitle={`${a.typeLabel} · ${ERAS.find(e => e.id === a.era)?.name}`}
                    mystery={fogHint(a.id)}
                    onClick={() => open && setReveal({
                      rarity: r, icon: a.icon, title: a.name,
                      subtitle: `${a.typeLabel} · ${ERAS.find(e => e.id === a.era)?.name}`,
                      lines: [a.description],
                    })} />
                );
              })}
              {importedArtifacts.map(item => (
                <ImportedCard key={`imp-${item.id}`} item={item} setReveal={setReveal} />
              ))}
            </div>
          </>
        )}

        {/* Battles */}
        {section === "battles" && (
          <>
            <SectionBar icon={Swords} title="معارك فاصلة" done={counts.battles.done} total={counts.battles.total} accent="bg-gradient-to-r from-rose-500 to-gold" />
            <div className="grid grid-cols-2 gap-3">
              {BATTLES.map(b => {
                const open = !b.storyId || profile.storiesRead.includes(b.storyId);
                return (
                  <Card key={b.id} unlocked={open} rarity={b.rarity} icon={b.icon}
                    title={b.name} subtitle={`${b.year} · ${b.location}`} footer={`النصر: ${b.victor}`}
                    mystery={fogHint(b.id)}
                    onClick={() => { if (open) navigate({ to: "/battle/$id", params: { id: b.id } }); }} />
                );
              })}
              {importedBattles.map(item => (
                <ImportedCard key={`imp-${item.id}`} item={item} setReveal={setReveal} />
              ))}
            </div>
          </>
        )}

        {/* Manuscripts */}
        {section === "manuscripts" && (
          <>
            <SectionBar icon={BookOpen} title="كتب ومخطوطات" done={counts.manuscripts.done} total={counts.manuscripts.total} accent="bg-gradient-to-r from-amber-500 to-gold" />
            <div className="space-y-2.5">
              {manuscripts.map(m => {
                const open = profile.artifactsFound.includes(m.id);
                const r = aRarity(m.id);
                const meta = RARITY_META[r];
                const fog = fogHint(m.id);
                return (
                  <button key={m.id} onClick={() => open && setReveal({
                    rarity: r, icon: m.icon, title: m.name,
                    subtitle: `${m.typeLabel} · ${ERAS.find(e => e.id === m.era)?.name}`,
                    lines: [m.description],
                  })}
                    className={`flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3 text-right transition-all ${open ? `ring-1 ${meta.ring}` : "opacity-70"}`}>
                    <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-black/40 text-2xl ring-1 ring-white/10">
                      {open ? m.icon : (
                        <>
                          <span className="select-none text-2xl opacity-20 blur-[3px] grayscale">{m.icon}</span>
                          <Lock className="absolute size-3.5 text-gold/70" />
                        </>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`font-display truncate text-sm font-bold ${open ? "" : "italic text-gold/85"}`}>{open ? m.name : fog.title}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${open ? meta.chip : "bg-black/40 text-gold/70 ring-1 ring-gold/20"}`}>{open ? meta.label : "في الضباب"}</span>
                      </div>
                      <p className="text-[10px] text-gold/80">{open ? `${m.typeLabel} · ${ERAS.find(e => e.id === m.era)?.name}` : "مخطوطٌ مجهول"}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{open ? m.description : fog.clue}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Landmarks */}
        {section === "landmarks" && (
          <>
            <SectionBar icon={Landmark} title="معالم خالدة" done={counts.landmarks.done} total={counts.landmarks.total} accent="bg-gradient-to-r from-teal-500 to-gold" />
            <div className="grid grid-cols-2 gap-3">
              {LANDMARKS.map(l => {
                const open = !l.regionId || profile.regionsUnlocked.includes(l.regionId);
                return (
                  <Card key={l.id} unlocked={open} rarity={l.rarity} icon={l.icon}
                    title={l.name} subtitle={l.place} footer={ERAS.find(e => e.id === l.era)?.name}
                    mystery={fogHint(l.id)}
                    onClick={() => open && setReveal({
                      rarity: l.rarity, icon: l.icon, title: l.name,
                      subtitle: `${l.place} · ${ERAS.find(e => e.id === l.era)?.name}`,
                      lines: [l.summary],
                    })} />
                );
              })}
              {importedLandmarks.map(item => (
                <ImportedCard key={`imp-${item.id}`} item={item} setReveal={setReveal} />
              ))}
            </div>
            <Link to="/map" className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-gold/30 bg-gold/5 py-2 text-xs text-gold">
              <MapPin className="size-3.5" /> اكتشف المعالم على الخارطة
            </Link>
          </>
        )}

        {/* Dynasties */}
        {section === "dynasties" && (
          <>
            <SectionBar icon={Scroll} title="دول وحضارات" done={counts.dynasties.done} total={counts.dynasties.total} accent="bg-gradient-gold" />
            <div className="space-y-2.5">
              {ERAS.map(e => {
                const open = eraHasProgress(e.id);
                const { done, total } = eraProgress(e.id);
                const pct = total ? Math.round((done / total) * 100) : 0;
                const r: Rarity = pct >= 80 ? "legendary" : pct >= 40 ? "epic" : pct > 0 ? "rare" : "common";
                const meta = RARITY_META[r];
                return (
                  <button key={e.id} onClick={() => open && setReveal({
                    rarity: r, icon: "📜", title: e.name,
                    subtitle: `${e.years} · ${e.tagline}`,
                    lines: [`اكتشفت ${done} من ${total} عنصرًا من هذه الحقبة (${pct}%).`, "تابع رحلتك لتكشف باقي إرثها."],
                  })}
                    className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-surface p-3 text-right transition-all ${open ? `ring-1 ${meta.ring}` : "opacity-70"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-display text-sm font-bold">{e.name}</p>
                        <p className="text-[10px] text-gold/80">{e.years}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${meta.chip}`}>{meta.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{e.tagline}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
                      <div className="bg-gradient-gold h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{done}/{total} مكتشف · {pct}%</p>
                  </button>
                );
              })}
            </div>
            {importedDynasties.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {importedDynasties.map(item => (
                  <ImportedCard key={`imp-${item.id}`} item={item} setReveal={setReveal} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Badges (imported only) */}
        {section === "badges" && (
          <>
            <SectionBar icon={Award} title="شارات" done={counts.badges.done} total={counts.badges.total} accent="bg-gradient-to-r from-amber-500 to-gold" />
            <div className="grid grid-cols-2 gap-3">
              {importedBadges.map(item => (
                <ImportedCard key={`imp-${item.id}`} item={item} setReveal={setReveal} />
              ))}
            </div>
          </>
        )}

        {/* Achievements (imported only) */}
        {section === "achievements" && (
          <>
            <SectionBar icon={Trophy} title="إنجازات" done={counts.achievements.done} total={counts.achievements.total} accent="bg-gradient-to-r from-emerald-500 to-gold" />
            <div className="grid grid-cols-2 gap-3">
              {importedAchievements.map(item => (
                <ImportedCard key={`imp-${item.id}`} item={item} setReveal={setReveal} />
              ))}
            </div>
          </>
        )}


        {totalDone === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-white/15 p-6 text-center text-xs text-muted-foreground">
            متحفك في انتظارك. ابدأ بحملة <Link to="/campaigns" className="text-gold underline-offset-4 hover:underline">صلاح الدين</Link> لتكشف أوّل قطعة.
          </div>
        )}
      </Screen>
      <RevealDialog item={reveal} onClose={() => setReveal(null)} />
    </AppShell>
  );
}

// ───── Recent unlocks ribbon
function RecentUnlocks() {
  const { profile } = useProfile();
  type Recent = { key: string; icon: string; kind: string; title: string; subtitle: string };
  const recents: Recent[] = [];

  const lastChar = [...profile.charactersUnlocked].slice(-1)[0];
  const c = lastChar ? CHARACTERS.find((x) => x.id === lastChar) : undefined;
  if (c) recents.push({ key: `c-${c.id}`, icon: c.avatar, kind: "شخصية", title: c.name, subtitle: c.title });

  const lastArtifact = [...profile.artifactsFound].slice(-1)[0];
  const a = lastArtifact ? ARTIFACTS.find((x) => x.id === lastArtifact) : undefined;
  if (a) recents.push({ key: `a-${a.id}`, icon: a.icon, kind: "أثر", title: a.name, subtitle: a.typeLabel });

  const lastTitle = [...profile.titlesEarned].slice(-1)[0];
  if (lastTitle) recents.push({ key: `t-${lastTitle}`, icon: "👑", kind: "لقب", title: lastTitle, subtitle: "مُنح حديثًا" });

  const lastBadge = [...profile.badges].slice(-1)[0];
  if (lastBadge) recents.push({ key: `b-${lastBadge}`, icon: "🏅", kind: "شارة", title: displayBadgeName(lastBadge), subtitle: "إنجاز جديد" });

  // Build a small recency timeline from the tail of all unlock arrays.
  const timeline = [
    ...profile.charactersUnlocked.slice(-3).reverse().map((id) => {
      const ch = CHARACTERS.find((x) => x.id === id);
      return ch ? { id: `tc-${id}`, icon: ch.avatar, label: ch.name, kind: "شخصية" } : null;
    }),
    ...profile.artifactsFound.slice(-3).reverse().map((id) => {
      const ar = ARTIFACTS.find((x) => x.id === id);
      return ar ? { id: `ta-${id}`, icon: ar.icon, label: ar.name, kind: "أثر" } : null;
    }),
  ].filter(Boolean).slice(0, 6) as { id: string; icon: string; label: string; kind: string }[];

  return (
    <div className="mb-5 rounded-2xl border border-gold/20 bg-surface/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] text-gold">
          <Sparkles className="size-3.5" /> آخر المقتنيات
        </div>
        {timeline.length > 0 && (
          <span className="text-[10px] text-muted-foreground">{timeline.length} اكتشاف حديث</span>
        )}
      </div>
      {recents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-background/30 p-4 text-center text-[11px] text-muted-foreground">
          لا توجد مقتنيات بعد — ابدأ حملةً ليبدأ متحفك في النمو.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {recents.map((r) => (
              <div key={r.key} className="flex items-center gap-2 rounded-xl border border-gold/20 bg-gradient-to-bl from-gold/10 via-surface to-transparent p-2.5">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-black/40 text-lg ring-1 ring-gold/30">{r.icon}</div>
                <div className="min-w-0">
                  <p className="text-[9px] tracking-widest text-gold/80">{r.kind}</p>
                  <p className="truncate font-display text-[12px] font-bold">{r.title}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{r.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
          {timeline.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="mb-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="size-3" /> أحدث الاكتشافات
              </p>
              <ol className="relative space-y-1.5 pe-3">
                {timeline.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-[11px]">
                    <span className="grid size-6 place-items-center rounded-full bg-gold/15 text-[12px]">{t.icon}</span>
                    <span className="truncate font-display text-foreground">{t.label}</span>
                    <span className="text-[10px] text-muted-foreground">· {t.kind}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ───── Imported registry item card (admin-imported via campaigns)
function ImportedCard({
  item,
  setReveal,
}: {
  item: ContentRegistryItem & { unlocked: boolean };
  setReveal: (r: RevealItem | null) => void;
}) {
  const rarity = registryItemRarity(item);
  const icon = registryItemIcon(item);
  const subtitle = item.subtitle ?? item.historicalPeriod ?? item.category ?? "مستورد";
  const footer = item.description?.slice(0, 80);
  return (
    <Card
      unlocked={item.unlocked}
      rarity={rarity}
      icon={icon}
      title={item.name}
      subtitle={subtitle}
      footer={footer}
      mystery={{ title: "عنصرٌ مستورد", clue: "أكمل الحملة المرتبطة لتكشفه." }}
      onClick={() => {
        if (!item.unlocked) return;
        setReveal({
          rarity,
          icon,
          title: item.name,
          subtitle,
          lines: [
            item.description ?? "عنصرٌ مستورد من حملةٍ إدارية.",
            ...(item.historicalPeriod ? [`الحقبة: ${item.historicalPeriod}`] : []),
          ],
        });
      }}
    />
  );
}
