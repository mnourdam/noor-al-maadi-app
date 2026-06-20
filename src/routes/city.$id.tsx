import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ArrowRight, Crown, MapPin, Landmark as LandmarkIcon, Sparkles, Users,
  Swords, Scroll, BookOpen, Lock, Compass, Hourglass, Building2, Database,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  CHARACTERS, MAP_REGIONS, ARTIFACTS, STORIES, ERAS, BATTLE_PROFILES,
} from "@/lib/data";
import { CITIES, getCity } from "@/lib/cities";
import { useProfile } from "@/lib/profile";
import { RelatedHistory } from "@/components/RelatedHistory";
import { useEncyclopediaDisplay } from "@/lib/encyclopedia-source";


export const Route = createFileRoute("/city/$id")({
  head: () => ({ meta: [{ title: "المدينة · في قلب الحضارة" }] }),
  component: CityPage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center">
        <h2 className="font-display text-2xl font-bold">المدينة غير موجودة</h2>
        <Link to="/map" className="mt-4 inline-block text-gold">إلى الخارطة</Link>
      </div>
    </AppShell>
  ),
  errorComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center text-muted-foreground">تعذّر فتح صفحة المدينة.</div>
    </AppShell>
  ),
});

function SectionTitle({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className="size-4 text-gold" />
      <h2 className="font-display text-sm font-bold">{label}</h2>
      <div className="ms-2 h-px flex-1 bg-gradient-to-l from-gold/40 to-transparent" />
    </div>
  );
}

function CityPage() {
  const { id } = useParams({ from: "/city/$id" });
  const { profile } = useProfile();
  const city = getCity(id);
  if (!city) throw notFound();

  const region = MAP_REGIONS.find((r) => r.id === city.regionId);
  const unlocked = profile.regionsUnlocked.includes(city.regionId);
  const era = ERAS.find((e) => e.id === city.era);

  const characters = useMemo(
    () => CHARACTERS.filter((c) => city.characterIds.includes(c.id)),
    [city],
  );
  const battles = useMemo(
    () => Object.values(BATTLE_PROFILES).filter((b) => city.battleIds.includes(b.id)),
    [city],
  );
  const artifacts = useMemo(
    () => ARTIFACTS.filter((a) => city.artifactIds.includes(a.id)),
    [city],
  );
  const stories = useMemo(
    () => STORIES.filter((s) => city.storyIds.includes(s.id)),
    [city],
  );
  const sisters = useMemo(
    () => CITIES.filter((c) => c.id !== city.id && (c.regionId === city.regionId || c.eras.some((e) => city.eras.includes(e)))).slice(0, 6),
    [city],
  );

  return (
    <AppShell>
      {/* HERO */}
      <section className="relative -mt-2 overflow-hidden">
        <div className={`relative h-[44vh] min-h-[320px] w-full bg-gradient-to-b ${city.toneClass}`}>
          <div className="arabesque-layer absolute inset-0 opacity-40" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(0,0,0,0.6),_transparent_60%)]" />

          {/* Header chips */}
          <div className="relative z-10 flex items-start justify-between px-5 pt-6">
            <Link to="/map" className="rounded-full bg-black/40 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur">
              <ArrowRight className="me-1 inline size-3" /> الخارطة
            </Link>
            {era && (
              <span className="rounded-full border border-gold/30 bg-black/40 px-3 py-1 text-[10px] text-gold backdrop-blur">
                ⌘ {era.name}
              </span>
            )}
          </div>

          {/* Title */}
          <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-6">
            <div className="flex items-end gap-3">
              <div className="grid size-16 place-items-center rounded-2xl bg-black/40 text-4xl ring-1 ring-white/10 backdrop-blur">
                {city.glyph}
              </div>
              <div className="min-w-0 flex-1">
                {city.honorific && (
                  <p className="text-[11px] tracking-[0.2em] text-gold/85">{city.honorific}</p>
                )}
                <h1 className="font-display text-3xl font-bold leading-tight">{city.name}</h1>
                <p className="mt-1 text-[11px] text-white/70">{city.romanized} · {city.founded}</p>
              </div>
            </div>
            <p className="mt-3 max-w-md font-display text-[13px] leading-7 text-white/85">
              {city.tagline}
            </p>
          </div>
        </div>
      </section>

      {/* Locked notice (fog) */}
      {!unlocked && (
        <div className="mx-5 mt-4 rounded-2xl border border-gold/25 bg-black/35 p-4">
          <div className="flex items-start gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-black/40 text-lg">🌫️</div>
            <div className="min-w-0">
              <p className="font-display text-[13px] font-bold text-gold">في ضباب التاريخ</p>
              <p className="mt-1 text-[12px] text-white/75">{city.fogClue}</p>
              {region && (
                <Link
                  to="/map"
                  className="mt-3 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] text-gold"
                >
                  <Compass className="size-3" />
                  اكشف إقليم {region.name} لتفتح المدينة
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BODY */}
      <div className="px-5 pt-6 space-y-7">
        {/* Identity */}
        <section>
          <SectionTitle icon={Sparkles} label="هوية المدينة" />
          <div className="rounded-2xl border border-white/10 bg-surface p-4">
            <ul className="space-y-2.5">
              {city.identity.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-7 text-foreground/90">
                  <span className="mt-1.5 inline-block size-1.5 rounded-full bg-gold" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Significance / story */}
        <section>
          <SectionTitle icon={BookOpen} label="حكاية المدينة" />
          <div className="rounded-2xl border border-gold/15 bg-gradient-to-br from-gold/5 via-transparent to-transparent p-4 space-y-3">
            {city.significance.map((p, i) => (
              <p key={i} className="font-display text-[13px] leading-8 text-foreground/90">{p}</p>
            ))}
          </div>
        </section>

        {/* Civilization hub */}
        <section>
          <SectionTitle icon={Crown} label="بوّابة الحضارة" />
          <Link
            to="/campaigns/$era"
            params={{ era: city.civilization.eraId }}
            className="block overflow-hidden rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/15 via-black/30 to-black/40 p-4 transition hover:border-gold/50"
          >
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-xl bg-black/50 text-2xl">⌘</div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gold/80">حضارة هذه المدينة</p>
                <p className="font-display text-base font-bold">{city.civilization.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{city.civilization.blurb}</p>
              </div>
              <ArrowRight className="size-4 rotate-180 text-gold/80" />
            </div>
          </Link>
        </section>

        {/* Landmarks */}
        <section>
          <SectionTitle icon={LandmarkIcon} label="معالم المدينة" />
          <div className="grid grid-cols-2 gap-2.5">
            {city.landmarks.map((l) => (
              <div key={l.id} className="rounded-2xl border border-white/10 bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-black/40 text-xl">{l.icon}</span>
                  <p className="font-display text-[12px] font-bold line-clamp-1">{l.name}</p>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground line-clamp-3">{l.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Era timeline */}
        {city.eraNotes.length > 0 && (
          <section>
            <SectionTitle icon={Hourglass} label="عبر العصور" />
            <div className="relative space-y-3 border-s border-gold/25 ps-4">
              {city.eraNotes.map((n, i) => {
                const e = ERAS.find((x) => x.id === n.eraId);
                return (
                  <div key={i} className="relative">
                    <span className="absolute -start-[22px] top-1.5 size-2.5 rounded-full bg-gold ring-2 ring-black" />
                    <p className="text-[10px] text-gold/80">{e?.name}</p>
                    <p className="font-display text-[13px] font-bold">{n.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{n.note}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Famous people */}
        {characters.length > 0 && (
          <section>
            <SectionTitle icon={Users} label="من أهل هذه المدينة" />
            <div className="grid grid-cols-3 gap-2.5">
              {characters.map((c) => {
                const open = profile.charactersUnlocked.includes(c.id);
                const inner = (
                  <div className={`rounded-2xl border border-white/10 bg-surface p-3 text-center ${open ? "" : "opacity-70"}`}>
                    <div className="mx-auto grid size-12 place-items-center rounded-xl bg-black/30 text-2xl">
                      {open ? c.avatar : <Lock className="size-3.5 text-muted-foreground" />}
                    </div>
                    <p className="font-display mt-2 text-[11px] font-bold line-clamp-1">{open ? c.name : "؟؟؟"}</p>
                    <p className="mt-0.5 text-[9px] text-gold/80 line-clamp-1">{open ? c.title : "اسمٌ خفيّ"}</p>
                  </div>
                );
                return open
                  ? <Link key={c.id} to="/figure/$id" params={{ id: c.id }}>{inner}</Link>
                  : <div key={c.id}>{inner}</div>;
              })}
            </div>
          </section>
        )}

        {/* Battles */}
        {battles.length > 0 && (
          <section>
            <SectionTitle icon={Swords} label="معارك مرتبطة" />
            <div className="space-y-2">
              {battles.map((b) => (
                <Link
                  key={b.id}
                  to="/battle/$id"
                  params={{ id: b.id }}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3 hover:border-gold/40"
                >
                  <div className="grid size-10 place-items-center rounded-xl bg-black/40 text-xl">{b.hero}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[13px] font-bold line-clamp-1">{b.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">{b.subtitle} · {b.year}</p>
                  </div>
                  <ArrowRight className="size-3.5 rotate-180 text-gold/70" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Stories */}
        {stories.length > 0 && (
          <section>
            <SectionTitle icon={Scroll} label="قصص من هذه المدينة" />
            <div className="space-y-2">
              {stories.map((s) => (
                <Link
                  key={s.id}
                  to="/story/$id"
                  params={{ id: s.id }}
                  className="block rounded-2xl border border-white/10 bg-surface p-3 hover:border-gold/40"
                >
                  <p className="font-display text-[13px] font-bold line-clamp-1">{s.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{s.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Sister cities */}
        {sisters.length > 0 && (
          <section>
            <SectionTitle icon={Building2} label="مدنٌ شقيقة" />
            <div className="grid grid-cols-2 gap-2.5">
              {sisters.map((c) => {
                const open = profile.regionsUnlocked.includes(c.regionId);
                return (
                  <Link
                    key={c.id}
                    to="/city/$id"
                    params={{ id: c.id }}
                    className={`rounded-2xl border border-white/10 bg-surface p-3 hover:border-gold/40 ${open ? "" : "opacity-80"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid size-9 place-items-center rounded-xl bg-black/40 text-xl">
                        {open ? c.glyph : "🌫️"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-display text-[12px] font-bold line-clamp-1">{open ? c.name : (c.honorific ?? "مدينةٌ خفيّة")}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
                          {open ? (c.civilization?.name ?? c.tagline) : c.fogClue}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Knowledge Graph integration */}
        <RelatedHistory entity={{ kind: "city", id: city.id }} />
      </div>
    </AppShell>
  );
}
