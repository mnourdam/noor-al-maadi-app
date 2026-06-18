import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Lock, Check, Star, Compass, Sparkles, Scroll, Users, Landmark as LandmarkIcon, Swords, ArrowLeft } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import {
  MAP_REGIONS, ERAS, ARTIFACTS, CHARACTERS, STORIES, CAMPAIGNS,
  UPCOMING_REGIONS, explorationPercent, type MapRegion,
} from "@/lib/data";
import { useProfile } from "@/lib/profile";
import { RelatedHistory } from "@/components/RelatedHistory";
import { citiesInRegion } from "@/lib/cities";
import { Building2 } from "lucide-react";
import { packEntitiesForBridge, allPackEntities } from "@/lib/packs/registry";
import { entityHref } from "@/components/EncyclopediaCard";
import type { PackEntity } from "@/lib/packs/types";

export const Route = createFileRoute("/map")({
  head: () => ({ meta: [{ title: "خارطة العالم الإسلامي" }] }),
  component: MapPage,
});

// Trade / pilgrimage routes drawn between region label points (SVG coords)
const ROUTES: { from: string; to: string }[] = [
  { from: "andalus", to: "maghrib" },
  { from: "maghrib", to: "egypt" },
  { from: "egypt",   to: "sham" },
  { from: "sham",    to: "anatolia" },
  { from: "sham",    to: "iraq" },
  { from: "iraq",    to: "hijaz" },
  { from: "iraq",    to: "khorasan" },
  { from: "khorasan",to: "transoxiana" },
  { from: "khorasan",to: "hind" },
];

function MapPage() {
  const { profile, unlockRegion, findArtifact } = useProfile();
  const [selectedId, setSelectedId] = useState<string>("hijaz");
  const explorePct = explorationPercent(profile.regionsUnlocked);
  const region = MAP_REGIONS.find((r) => r.id === selectedId) ?? MAP_REGIONS[0];

  const handleUnlock = (r: MapRegion) => {
    const ok = unlockRegion(r.id, r.cost);
    if (ok && r.unlocksArtifact) findArtifact(r.unlocksArtifact);
  };

  return (
    <AppShell>
      <Screen title="خارطة العالم الإسلامي" subtitle="رحلةٌ في خرائط الرحّالة القُدامى">
        {/* Compass / progress header */}
        <div className="mb-5 relative overflow-hidden rounded-3xl border border-gold/25 bg-surface p-5">
          <div className="particle-field" />
          <div className="relative flex items-center gap-4">
            <div className="grid size-12 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground">
              <Compass className="size-6" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gold">استكشاف العالم</p>
              <p className="font-display text-lg font-bold">{explorePct}٪ مكتشف · {profile.regionsUnlocked.length}/{MAP_REGIONS.length} أقاليم</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold transition-all" style={{ width: `${explorePct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Illustrated parchment map */}
        <WorldMapCanvas
          unlocked={profile.regionsUnlocked}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        {/* Region detail */}
        <RegionPanel region={region} unlocked={profile.regionsUnlocked.includes(region.id)} points={profile.points} onUnlock={handleUnlock} />

        {/* Knowledge graph for the selected region */}
        <RelatedHistory entity={{ kind: "region", id: region.id }} title={`شبكة ${region.name} التاريخية`} />

        {/* Encyclopedia entities tied to this region (cities, landmarks, battles, events) */}
        <RegionEncyclopediaRail regionId={region.id} />

        {/* Quick rail of regions */}
        <h3 className="font-display mt-7 mb-3 text-base font-bold">الأقاليم المعروفة</h3>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
          {MAP_REGIONS.map((r) => {
            const u = profile.regionsUnlocked.includes(r.id);
            const active = r.id === selectedId;
            return (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                className={`shrink-0 w-36 rounded-2xl border p-3 text-right transition ${
                  active ? "border-gold bg-surface-2 shadow-gold" :
                  u ? "border-gold/30 bg-surface" : "border-white/10 bg-surface/60"
                }`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg">{r.glyph ?? "📍"}</span>
                  {u ? <Check className="size-3.5 text-gold" /> : <Lock className="size-3.5 text-muted-foreground" />}
                </div>
                <p className="font-display mt-2 text-sm font-bold">{r.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">{r.capital}</p>
              </button>
            );
          })}
        </div>

        {/* Upcoming horizons */}
        <h3 className="font-display mt-7 mb-3 text-base font-bold flex items-center gap-2">
          <Sparkles className="size-4 text-gold" /> آفاقٌ على الطريق
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {UPCOMING_REGIONS.map((u) => (
            <div key={u.id} className="relative overflow-hidden rounded-2xl border border-dashed border-white/15 bg-surface/60 p-4">
              <div className="absolute inset-0 fog-layer opacity-50" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <Lock className="size-4 text-muted-foreground" />
                  <span className="text-[10px] text-gold/80">قريبًا</span>
                </div>
                <p className="font-display mt-2 text-sm font-bold">{u.name}</p>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{u.teaser}</p>
              </div>
            </div>
          ))}
        </div>
      </Screen>
    </AppShell>
  );
}

// ============================================================
// SVG WORLD MAP
// ============================================================
function WorldMapCanvas({
  unlocked, selectedId, onSelect,
}: { unlocked: string[]; selectedId: string; onSelect: (id: string) => void }) {
  const regionsById = useMemo(
    () => Object.fromEntries(MAP_REGIONS.map((r) => [r.id, r])) as Record<string, MapRegion>,
    [],
  );

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-amber-900/30 map-parchment map-vignette shadow-elegant" dir="ltr">
      {/* Title cartouche */}
      <div className="absolute right-3 top-3 z-10 rounded-xl border border-amber-900/40 bg-amber-50/70 px-3 py-1.5 text-[10px] font-bold text-amber-950 shadow-sm" dir="rtl">
        ⚜︎ أطلس العالم الإسلامي ⚜︎
      </div>
      {/* Compass rose */}
      <div className="absolute left-3 bottom-3 z-10 text-amber-900/70">
        <svg width="44" height="44" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" strokeWidth="0.3" strokeDasharray="1 1" />
          <path d="M20,3 L23,20 L20,37 L17,20 Z" fill="currentColor" opacity="0.7" />
          <path d="M3,20 L20,17 L37,20 L20,23 Z" fill="currentColor" opacity="0.45" />
          <text x="20" y="9" textAnchor="middle" fontSize="4" fill="currentColor" fontWeight="700">N</text>
        </svg>
      </div>

      <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet" className="block w-full h-[420px]">
        <defs>
          <pattern id="seaHatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="3" stroke="oklch(0.55 0.08 230 / 0.35)" strokeWidth="0.18" />
          </pattern>
          <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="3" />
            <feDisplacementMap in="SourceGraphic" scale="0.4" />
          </filter>
          <radialGradient id="goldGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.92 0.14 82 / 0.9)" />
            <stop offset="100%" stopColor="oklch(0.82 0.14 82 / 0)" />
          </radialGradient>
          <radialGradient id="fogGrad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="oklch(0.95 0.02 80 / 0.85)" />
            <stop offset="100%" stopColor="oklch(0.85 0.03 70 / 0.1)" />
          </radialGradient>
        </defs>

        {/* Sea hatch background */}
        <rect width="100" height="60" fill="url(#seaHatch)" opacity="0.4" />

        {/* Mediterranean / great seas curves */}
        <g className="ink-stroke-light" fill="none" strokeWidth="0.25">
          <path d="M2,18 Q20,22 38,20 T70,20 Q82,18 98,20" />
          <path d="M2,46 Q22,50 44,48 T80,48 Q90,48 98,46" />
          <path d="M52,4 Q60,8 70,6 T96,4" />
        </g>

        {/* Routes between regions */}
        <g>
          {ROUTES.map((rt, i) => {
            const a = regionsById[rt.from];
            const b = regionsById[rt.to];
            if (!a || !b || a.labelX == null || b.labelX == null) return null;
            const bothUnlocked = unlocked.includes(rt.from) && unlocked.includes(rt.to);
            return (
              <path key={i}
                d={`M${a.labelX},${a.labelY} Q${(a.labelX! + b.labelX!) / 2},${Math.min(a.labelY!, b.labelY!) - 3} ${b.labelX},${b.labelY}`}
                fill="none"
                stroke={bothUnlocked ? "oklch(0.6 0.16 50 / 0.85)" : "oklch(0.4 0.08 50 / 0.35)"}
                strokeWidth="0.25"
                strokeDasharray="0.8 0.8"
                className={bothUnlocked ? "route-dash" : ""}
              />
            );
          })}
        </g>

        {/* Regions */}
        {MAP_REGIONS.map((r) => {
          const isUnlocked = unlocked.includes(r.id);
          const isActive = selectedId === r.id;
          return (
            <g key={r.id} onClick={() => onSelect(r.id)} className="cursor-pointer">
              <path
                d={r.polygon}
                fill={isUnlocked
                  ? (isActive ? "oklch(0.82 0.11 75 / 0.85)" : "oklch(0.78 0.09 75 / 0.6)")
                  : "oklch(0.35 0.05 50 / 0.55)"}
                stroke={isActive ? "oklch(0.45 0.16 50)" : "oklch(0.32 0.08 40 / 0.85)"}
                strokeWidth={isActive ? 0.45 : 0.3}
                filter="url(#rough)"
              />

              {/* Landmarks (only when unlocked) */}
              {isUnlocked && r.landmarks?.map((lm) => (
                <g key={lm.id} className="landmark-pulse">
                  <circle cx={lm.x} cy={lm.y} r="0.9" fill="url(#goldGlow)" />
                  <circle cx={lm.x} cy={lm.y} r="0.5" fill="oklch(0.55 0.18 50)" stroke="oklch(0.95 0.02 80)" strokeWidth="0.1" />
                  <text x={lm.x} y={lm.y - 1.2} textAnchor="middle" fontSize="1.4" fill="oklch(0.22 0.06 40)" fontWeight="700"
                    style={{ fontFamily: "var(--font-display)" }}>
                    {lm.name}
                  </text>
                </g>
              ))}

              {/* Region label */}
              {r.labelX != null && r.labelY != null && (
                <g style={{ pointerEvents: "none" }}>
                  <text x={r.labelX} y={r.labelY}
                    textAnchor="middle"
                    fontSize="2.2"
                    fontWeight="800"
                    fill={isUnlocked ? "oklch(0.18 0.06 40)" : "oklch(0.92 0.05 80 / 0.85)"}
                    style={{ fontFamily: "var(--font-display)", letterSpacing: "0.05em" }}>
                    {r.name}
                  </text>
                </g>
              )}

              {/* Fog veil + silhouette for locked regions */}
              {!isUnlocked && (
                <g style={{ pointerEvents: "none" }}>
                  <path d={r.polygon} fill="url(#fogGrad)" opacity="0.85" />
                  <text x={r.labelX ?? r.x} y={(r.labelY ?? r.y) + 3} textAnchor="middle"
                    fontSize="3.5" opacity="0.55">
                    {r.glyph ?? "❓"}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Drifting sail in the western sea */}
        <g className="sail-drift" transform="translate(28 50)">
          <path d="M0,0 L2.5,-3 L2.5,0 Z" fill="oklch(0.95 0.04 80)" stroke="oklch(0.3 0.08 40)" strokeWidth="0.1" />
          <line x1="2.5" y1="-3" x2="2.5" y2="0.5" stroke="oklch(0.3 0.08 40)" strokeWidth="0.15" />
        </g>
      </svg>
    </div>
  );
}

// ============================================================
// REGION DETAIL PANEL
// ============================================================
function RegionPanel({
  region, unlocked, points, onUnlock,
}: { region: MapRegion; unlocked: boolean; points: number; onUnlock: (r: MapRegion) => void }) {
  const era = ERAS.find((e) => e.id === region.era);
  const artifact = region.unlocksArtifact ? ARTIFACTS.find((a) => a.id === region.unlocksArtifact) : null;
  const chars = (region.characterIds ?? []).map((id) => CHARACTERS.find((c) => c.id === id)).filter(Boolean) as typeof CHARACTERS;
  const stories = (region.storyIds ?? []).map((id) => STORIES.find((s) => s.id === id)).filter(Boolean) as typeof STORIES;
  const campaign = region.campaignEra ? CAMPAIGNS.find((c) => c.eraId === region.campaignEra) : null;
  const completion = unlocked
    ? Math.min(100, 25 + (chars.length + stories.length + (artifact ? 1 : 0)) * 12)
    : 0;

  return (
    <div className="mt-5 relative overflow-hidden rounded-3xl border border-gold/25 bg-surface shadow-elegant animate-reveal">
      <div className="arabesque-layer" />
      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] text-gold">{era?.name} · {era?.years}</p>
            <h3 className="font-display mt-1 text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">{region.glyph}</span> {region.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">العاصمة: {region.capital}</p>
            {region.theme && <p className="mt-1 text-[11px] text-gold/80">{region.theme}</p>}
          </div>
          <span className={`grid size-10 place-items-center rounded-full border-2 ${
            unlocked ? "border-gold bg-gradient-gold text-primary-foreground" : "border-white/20 bg-surface-2 text-muted-foreground"
          }`}>
            {unlocked ? <Check className="size-5" /> : <Lock className="size-4" />}
          </span>
        </div>

        <p className="mt-3 text-sm leading-7 text-foreground/90">{region.blurb}</p>

        {/* Completion */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>اكتمال الإقليم</span>
            <span className="text-gold">{completion}٪</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-gold transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <MiniStat icon={<LandmarkIcon className="size-3.5" />} label="معالم" value={(region.landmarks?.length ?? 0).toString()} />
          <MiniStat icon={<Users className="size-3.5" />} label="شخصيات" value={chars.length.toString()} />
          <MiniStat icon={<Scroll className="size-3.5" />} label="حكايات" value={stories.length.toString()} />
          <MiniStat icon={<Star className="size-3.5" />} label="آثار" value={(artifact ? 1 : 0).toString()} />
        </div>

        {/* Landmarks */}
        {unlocked && (region.landmarks?.length ?? 0) > 0 && (
          <div className="mt-4">
            <p className="text-[10px] text-gold mb-1.5">معالم بارزة</p>
            <div className="flex flex-wrap gap-1.5">
              {region.landmarks!.map((l) => (
                <span key={l.id} className="rounded-full border border-gold/30 bg-surface-2 px-2.5 py-1 text-[11px]">
                  {l.icon} {l.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Great cities of this region */}
        {citiesInRegion(region.id).length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <Building2 className="size-3.5 text-gold" />
              <p className="text-[10px] text-gold">مدن هذا الإقليم</p>
              <div className="h-px flex-1 bg-gradient-to-l from-gold/30 to-transparent" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {citiesInRegion(region.id).map((c) => (
                <Link
                  key={c.id}
                  to="/city/$id"
                  params={{ id: c.id }}
                  className={`flex items-center gap-2 rounded-2xl border border-white/10 bg-surface-2 p-2.5 hover:border-gold/40 ${unlocked ? "" : "opacity-80"}`}
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-black/40 text-xl">
                    {unlocked ? c.glyph : "🌫️"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[12px] font-bold line-clamp-1">
                      {unlocked ? c.name : (c.honorific ?? "مدينةٌ خفيّة")}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
                      {unlocked ? (c.civilization?.name ?? c.tagline) : c.fogClue}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Characters preview */}
        {unlocked && chars.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] text-gold mb-1.5">شخصيات الإقليم</p>
            <div className="flex gap-2">
              {chars.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-surface-2 px-3 py-1.5">
                  <span className="text-base">{c.avatar}</span>
                  <span className="text-[11px] font-bold">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Artifact */}
        {artifact && (
          <div className="mt-4 rounded-2xl border border-gold/30 bg-surface-2 p-3 text-xs">
            <p className="text-[10px] text-gold">أثر الإقليم</p>
            <p className="mt-1 font-bold">{artifact.icon} {artifact.name}</p>
            <p className="mt-0.5 text-muted-foreground text-[11px]">{artifact.description}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-2">
          {!unlocked ? (
            <button disabled={points < region.cost} onClick={() => onUnlock(region)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold disabled:opacity-40">
              <Compass className="size-4" /> ارحل واكتشف · {region.cost} نقطة
            </button>
          ) : (
            <>
              {campaign && (
                <Link to="/campaigns/$era" params={{ era: campaign.eraId }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold">
                  <Swords className="size-4" /> ادخل حملة {era?.name}
                </Link>
              )}
              {stories.length > 0 && (
                <Link to="/story/$id" params={{ id: stories[0].id }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-surface-2 py-2.5 text-xs">
                  <Scroll className="size-4 text-gold" /> اقرأ: {stories[0].title}
                </Link>
              )}
            </>
          )}
          {!unlocked && points < region.cost && (
            <p className="text-center text-[11px] text-muted-foreground">
              تحتاج {region.cost - points} نقطة إضافية لاكتشاف هذا الإقليم
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-2 p-2">
      <div className="flex items-center justify-center gap-1 text-gold">{icon}<span className="font-display text-sm font-bold">{value}</span></div>
      <p className="mt-0.5 text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

// ============================================================
// Region encyclopedia rail — auto-aggregates pack entities tied
// to this region either directly (bridges.regionId) or via a
// city in the region (bridges.cityId → region match).
// ============================================================
function RegionEncyclopediaRail({ regionId }: { regionId: string }) {
  const direct = packEntitiesForBridge("regionId", regionId);
  const regionCityIds = new Set(citiesInRegion(regionId).map((c) => c.id));
  const viaCity = allPackEntities().filter((e) => {
    const c = e.bridges?.cityId;
    return c && regionCityIds.has(c);
  });
  const seen = new Set<string>();
  const all: PackEntity[] = [];
  for (const e of [...direct, ...viaCity]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id); all.push(e);
  }
  if (all.length === 0) return null;

  const TYPE_LABEL: Record<string, string> = {
    state: "دولة", figure: "شخصية", city: "مدينة", battle: "معركة",
    event: "حدث", landmark: "معلم", artifact: "أثر", achievement: "إنجاز",
  };
  const ORDER = ["city","landmark","battle","event","figure","state","artifact","achievement"];
  const sorted = [...all].sort(
    (a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.timelinePosition - b.timelinePosition,
  );

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] tracking-[0.25em] text-gold">من الموسوعة</span>
        <div className="h-px flex-1 bg-gradient-to-l from-gold/30 to-transparent" />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {sorted.map((e) => (
          <Link
            key={e.id}
            to={entityHref(e) as "/"}
            className="shrink-0 w-44 rounded-2xl border border-white/10 bg-surface-2 p-3 text-right transition hover:border-gold/40"
          >
            <div className="flex items-center justify-between">
              <span className="grid size-9 place-items-center rounded-xl bg-black/40 text-lg">
                {e.image?.glyph ?? "✦"}
              </span>
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-[9px] text-gold/80">
                {TYPE_LABEL[e.type] ?? e.type}
              </span>
            </div>
            <p className="font-display mt-2 text-[12px] font-bold line-clamp-1">{e.title}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{e.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}