import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Lock, Check, Star, Compass } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { MAP_REGIONS, ERAS, ARTIFACTS, UPCOMING_REGIONS, explorationPercent } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/map")({
  head: () => ({ meta: [{ title: "خارطة العالم الإسلامي" }] }),
  component: MapPage,
});

function MapPage() {
  const { profile, unlockRegion, findArtifact } = useProfile();
  const [selected, setSelected] = useState<string | null>(null);
  const region = MAP_REGIONS.find((r) => r.id === selected) ?? null;
  const explorePct = explorationPercent(profile.regionsUnlocked);

  const handleUnlock = (rid: string, cost: number, artifactId?: string) => {
    const ok = unlockRegion(rid, cost);
    if (ok && artifactId) findArtifact(artifactId);
  };

  return (
    <AppShell>
      <Screen title="خارطة العالم" subtitle="عالمٌ حيّ يتفتّح كلّما تقدّمت">
        <div className="mb-5 relative overflow-hidden rounded-3xl border border-gold/25 bg-surface p-5">
          <div className="particle-field" />
          <div className="relative flex items-center gap-4">
            <div className="grid size-12 place-items-center rounded-2xl bg-gradient-gold text-primary-foreground"><Compass className="size-6" /></div>
            <div className="flex-1">
              <p className="text-[10px] text-gold">استكشاف العالم</p>
              <p className="font-display text-lg font-bold">{explorePct}٪ مكتشف</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-gradient-gold transition-all" style={{ width: `${explorePct}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="relative h-72 overflow-hidden rounded-3xl border border-gold/20 bg-gradient-to-br from-amber-900/30 via-stone-800/40 to-blue-950/40 shadow-elegant">
          <svg className="absolute inset-0 size-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs><pattern id="dots" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.3" fill="currentColor" className="text-gold" /></pattern></defs>
            <rect width="100" height="100" fill="url(#dots)" />
            <path d="M5,60 Q25,40 50,55 T95,50" stroke="currentColor" strokeWidth="0.3" fill="none" className="text-gold" />
            <path d="M10,30 Q40,20 70,35 T95,30" stroke="currentColor" strokeWidth="0.3" fill="none" className="text-gold" />
          </svg>
          {MAP_REGIONS.map((r, idx) => {
            const unlocked = profile.regionsUnlocked.includes(r.id);
            const active = selected === r.id;
            return (
              <button key={r.id} onClick={() => setSelected(r.id)}
                style={{ right: `${r.x}%`, top: `${r.y}%`, animationDelay: `${idx * 80}ms` }}
                className="absolute -translate-y-1/2 translate-x-1/2 animate-map-reveal" aria-label={r.name}>
                <span className={`relative grid size-10 place-items-center rounded-full border-2 transition ${
                  unlocked ? "border-gold bg-gradient-gold text-primary-foreground shadow-gold animate-gold-pulse" :
                  "border-white/30 bg-surface text-muted-foreground"
                } ${active ? "scale-125" : ""}`}>
                  {unlocked ? <MapPin className="size-4" /> : <Lock className="size-3.5" />}
                </span>
                <span className="absolute right-1/2 mt-1 translate-x-1/2 whitespace-nowrap text-[10px] text-foreground/90">{r.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-surface p-5">
          {region ? (
            <RegionDetail region={region} unlocked={profile.regionsUnlocked.includes(region.id)} onUnlock={handleUnlock} points={profile.points} />
          ) : (
            <p className="text-center text-sm text-muted-foreground">اضغط على إحدى المناطق لاستكشافها</p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Stat label="مناطق" value={`${profile.regionsUnlocked.length}/${MAP_REGIONS.length}`} />
          <Stat label="نقاطك" value={profile.points.toString()} />
          <Stat label="آثار" value={profile.artifactsFound.length.toString()} />
        </div>

        <h3 className="font-display mt-7 mb-3 text-base font-bold">مناطق قادمة</h3>
        <div className="grid grid-cols-2 gap-3">
          {UPCOMING_REGIONS.map((u) => (
            <div key={u.id} className="rounded-2xl border border-dashed border-white/15 bg-surface/60 p-4">
              <div className="flex items-center justify-between">
                <Lock className="size-4 text-muted-foreground" />
                <span className="text-[10px] text-gold/80">قريبًا</span>
              </div>
              <p className="font-display mt-2 text-sm font-bold">{u.name}</p>
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{u.teaser}</p>
            </div>
          ))}
        </div>
      </Screen>
    </AppShell>
  );
}

function RegionDetail({ region, unlocked, onUnlock, points }: { region: typeof MAP_REGIONS[number]; unlocked: boolean; onUnlock: (id: string, cost: number, art?: string) => void; points: number }) {
  const era = ERAS.find((e) => e.id === region.era);
  const artifact = region.unlocksArtifact ? ARTIFACTS.find((a) => a.id === region.unlocksArtifact) : null;
  return (
    <div className="animate-reveal">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] text-gold">{era?.name}</p>
          <h3 className="font-display mt-1 text-xl font-bold">{region.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">العاصمة: {region.capital}</p>
        </div>
        {unlocked ? <Check className="size-5 text-gold" /> : <Lock className="size-5 text-muted-foreground" />}
      </div>
      <p className="mt-3 text-sm text-foreground/90">{region.blurb}</p>
      {artifact && <p className="mt-2 text-xs text-gold">يحتوي على أثر: {artifact.icon} {artifact.name}</p>}
      {!unlocked && (
        <button disabled={points < region.cost}
          onClick={() => onUnlock(region.id, region.cost, region.unlocksArtifact)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold disabled:opacity-40">
          <Star className="size-4" /> افتح بـ {region.cost} نقطة
        </button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-3">
      <p className="font-display text-base font-bold text-gold">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}