import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Crown, Swords, Flag, Scroll, Sparkles, Users, Landmark, BookOpen, Compass } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { getBattleProfile, ERAS, CHARACTERS, MAP_REGIONS, ARTIFACTS, fogHint, type BattleProfile } from "@/lib/data";
import { useProfile } from "@/lib/profile";
import { RelatedHistory } from "@/components/RelatedHistory";

export const Route = createFileRoute("/battle/$id")({
  head: ({ params }) => {
    const b = getBattleProfile(params.id);
    return { meta: [{ title: b ? `${b.name} · معركةٌ خالدة` : "معركة" }] };
  },
  notFoundComponent: () => (
    <AppShell>
      <Screen title="معركة"><p className="text-sm text-muted-foreground">المعركة غير موجودة.</p></Screen>
    </AppShell>
  ),
  errorComponent: ({ reset }) => {
    const router = useRouter();
    return (
      <AppShell>
        <Screen title="معركة">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm">
            تعذّر فتح المعركة.
            <button onClick={() => { router.invalidate(); reset(); }} className="ms-2 text-gold underline">حاول مجدّدًا</button>
          </div>
        </Screen>
      </AppShell>
    );
  },
  loader: ({ params }) => {
    const b = getBattleProfile(params.id);
    if (!b) throw notFound();
    return { battle: b };
  },
  component: BattlePage,
});

function BattlePage() {
  const battle = Route.useLoaderData().battle as BattleProfile;
  const { profile } = useProfile();
  const navigate = useNavigate();
  const era = ERAS.find(e => e.id === battle.era);

  const relatedChars = battle.relatedCharacterIds.map(id => CHARACTERS.find(c => c.id === id)).filter(Boolean) as typeof CHARACTERS;
  const relatedRegions = battle.relatedRegionIds.map(id => MAP_REGIONS.find(r => r.id === id)).filter(Boolean);
  const relatedArtifacts = battle.relatedArtifactIds.map(id => ARTIFACTS.find(a => a.id === id)).filter(Boolean) as typeof ARTIFACTS;

  const totalRelated = relatedChars.length + relatedRegions.length + relatedArtifacts.length;
  const doneRelated =
    relatedChars.filter(c => profile.charactersUnlocked.includes(c.id)).length +
    relatedRegions.filter(r => r && profile.regionsUnlocked.includes(r.id)).length +
    relatedArtifacts.filter(a => profile.artifactsFound.includes(a.id)).length;
  const discovery = totalRelated ? Math.round((doneRelated / totalRelated) * 100) : 0;

  return (
    <AppShell>
      <Screen title={battle.name}>
        {/* HERO */}
        <div className={`relative -mx-4 -mt-2 overflow-hidden border-b border-white/10 bg-gradient-to-b ${battle.heroGradient} px-4 pb-6 pt-4`}>
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, oklch(0.82 0.14 82 / 0.35), transparent 45%), radial-gradient(circle at 80% 70%, oklch(0.7 0.16 25 / 0.25), transparent 50%)",
          }} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,oklch(0_0_0/0.55),transparent_60%)]" />
          <button onClick={() => navigate({ to: "/collection" })}
            className="relative mb-3 flex items-center gap-1 text-[11px] text-gold/80">
            <ArrowLeft className="size-3.5" /> العودة إلى المتحف
          </button>
          <div className="relative flex items-end gap-4">
            <div className="grid size-24 place-items-center rounded-2xl bg-black/40 text-5xl ring-1 ring-gold/30 animate-gold-pulse">
              {battle.hero}
            </div>
            <div className="min-w-0 flex-1">
              <span className="inline-block rounded-full bg-black/40 px-2 py-0.5 text-[10px] tracking-wider text-gold ring-1 ring-gold/20">
                <Sparkles className="me-1 inline size-3" /> معركةٌ أسطوريّة · {era?.name}
              </span>
              <h1 className="font-display shimmer-text mt-2 text-2xl font-extrabold leading-tight">{battle.name}</h1>
              <p className="mt-1 text-xs text-gold/85">{battle.subtitle}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span className="rounded-full bg-black/40 px-2 py-0.5">{battle.hijri}</span>
                <span className="rounded-full bg-black/40 px-2 py-0.5">{battle.year}</span>
                <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5"><MapPin className="size-3" /> {battle.location}</span>
              </div>
            </div>
          </div>

          {/* Discovery bar */}
          <div className="relative mt-4 rounded-xl border border-gold/20 bg-black/30 p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gold/80">اكتشاف المعركة</span>
              <span className="font-bold text-gold">{discovery}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="bg-gradient-gold h-full rounded-full transition-all" style={{ width: `${discovery}%` }} />
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">{doneRelated} من {totalRelated} عنصرٍ مرتبط بهذه المعركة.</p>
          </div>
        </div>

        {/* OVERVIEW */}
        <Section icon={Scroll} title="نظرة عامّة">
          <div className="space-y-2 rounded-2xl border border-white/10 bg-surface p-4 text-[13px] leading-7 text-foreground/85">
            {battle.overview.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </Section>

        {/* BATTLEFIELD MAP */}
        <Section icon={Compass} title="ميدان المعركة">
          <div className="relative overflow-hidden rounded-2xl border border-gold/20 bg-[oklch(0.18_0.02_60)] p-3">
            <svg viewBox="0 0 100 60" className="h-44 w-full">
              <defs>
                <pattern id="hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="3" stroke="oklch(0.82 0.05 80 / 0.18)" strokeWidth="0.4" />
                </pattern>
                <radialGradient id="parch" cx="50%" cy="50%" r="60%">
                  <stop offset="0%" stopColor="oklch(0.85 0.06 80 / 0.18)" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>
              <rect width="100" height="60" fill="url(#hatch)" />
              <rect width="100" height="60" fill="url(#parch)" />
              {/* terrain hints */}
              <path d="M0,42 Q25,30 50,38 T100,32 L100,60 L0,60 Z" fill="oklch(0.3 0.04 70 / 0.5)" stroke="oklch(0.82 0.14 82 / 0.4)" strokeWidth="0.3" />
              <path d="M10,22 Q30,18 45,25 T80,20" stroke="oklch(0.82 0.14 82 / 0.5)" strokeWidth="0.4" strokeDasharray="1.5 1.5" fill="none" />
              {/* side A */}
              <g>
                <circle cx={battle.coords?.x ?? 35} cy={(battle.coords?.y ?? 50) - 6} r="3" fill="oklch(0.7 0.18 145 / 0.7)" stroke="oklch(0.82 0.14 82)" strokeWidth="0.4" />
                <text x={battle.coords?.x ?? 35} y={(battle.coords?.y ?? 50) - 9} fontSize="3" fill="oklch(0.92 0.02 80)" textAnchor="middle">{battle.sides[0]?.flag}</text>
              </g>
              {/* side B */}
              <g>
                <circle cx={(battle.coords?.x ?? 35) + 18} cy={(battle.coords?.y ?? 50) + 4} r="3" fill="oklch(0.65 0.18 25 / 0.7)" stroke="oklch(0.82 0.14 82)" strokeWidth="0.4" />
                <text x={(battle.coords?.x ?? 35) + 18} y={(battle.coords?.y ?? 50) + 1} fontSize="3" fill="oklch(0.92 0.02 80)" textAnchor="middle">{battle.sides[1]?.flag}</text>
              </g>
              {/* clash */}
              <path d={`M${(battle.coords?.x ?? 35) + 3},${(battle.coords?.y ?? 50) - 4} L${(battle.coords?.x ?? 35) + 15},${(battle.coords?.y ?? 50) + 2}`} stroke="oklch(0.82 0.14 82)" strokeWidth="0.6" strokeDasharray="1 1" />
              <text x="50" y="56" fontSize="2.5" fill="oklch(0.82 0.14 82 / 0.85)" textAnchor="middle">{battle.location}</text>
            </svg>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-200 ring-1 ring-emerald-500/20">{battle.sides[0]?.flag} {battle.sides[0]?.name}</span>
              <span className="rounded-md bg-rose-500/10 px-2 py-1 text-rose-200 ring-1 ring-rose-500/20">{battle.sides[1]?.flag} {battle.sides[1]?.name}</span>
            </div>
          </div>
        </Section>

        {/* SIDES */}
        <Section icon={Flag} title="الجيشان والقادة">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {battle.sides.map((s, i) => (
              <div key={i} className={`rounded-2xl border p-3 ${i === 0 ? "border-emerald-400/25 bg-emerald-500/5" : "border-rose-400/25 bg-rose-500/5"}`}>
                <div className="flex items-center justify-between">
                  <p className="font-display text-sm font-bold">{s.flag} {s.name}</p>
                  <Crown className="size-3.5 text-gold/70" />
                </div>
                <p className="mt-1 text-[11px] text-gold/80">{s.commander}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{s.strength}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* TIMELINE */}
        <Section icon={Swords} title="مجريات المعركة">
          <ol className="relative space-y-3 ps-5">
            <span className="absolute right-1.5 top-1 h-full w-px bg-gradient-to-b from-gold/40 via-gold/15 to-transparent" />
            {battle.timeline.map((p, i) => (
              <li key={i} className="relative">
                <span className="absolute -right-[7px] top-1.5 size-2.5 rounded-full bg-gold ring-2 ring-black/40" />
                <div className="rounded-xl border border-white/10 bg-surface p-3">
                  <p className="font-display text-[12.5px] font-bold text-gold">{p.phase}</p>
                  <p className="mt-0.5 text-[12px] leading-6 text-foreground/85">{p.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* DECISIONS */}
        <Section icon={Sparkles} title="قراراتٌ استراتيجيّة">
          <div className="space-y-2">
            {battle.decisions.map((d, i) => (
              <div key={i} className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/10 to-transparent p-3">
                <p className="text-[11px] text-muted-foreground">السؤال</p>
                <p className="font-display text-[13px] font-bold">{d.question}</p>
                <p className="mt-2 text-[11px] text-gold/80">القرار: <span className="text-foreground/90">{d.chose}</span></p>
                <p className="mt-1 text-[11px] text-muted-foreground">الأثر: {d.impact}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* OUTCOME + IMPACT */}
        <Section icon={Scroll} title="النتيجة والأثر التاريخي">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="font-display text-sm font-bold text-emerald-200">النتيجة</p>
              <ul className="mt-1.5 space-y-1 text-[12px] leading-6 text-foreground/85">
                {battle.outcome.map((o, i) => <li key={i}>• {o}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-gold/25 bg-gold/5 p-3">
              <p className="font-display text-sm font-bold text-gold">الأثر</p>
              <ul className="mt-1.5 space-y-1 text-[12px] leading-6 text-foreground/85">
                {battle.impact.map((o, i) => <li key={i}>• {o}</li>)}
              </ul>
            </div>
          </div>
        </Section>

        {/* RELATED */}
        {relatedChars.length > 0 && (
          <Section icon={Users} title="شخصياتٌ مرتبطة">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {relatedChars.map(c => {
                const open = profile.charactersUnlocked.includes(c.id);
                const fog = fogHint(c.id);
                return (
                  <button key={c.id} onClick={() => open && navigate({ to: "/figure/$id", params: { id: c.id } })}
                    className={`rounded-xl border border-white/10 bg-surface p-2 text-right transition ${open ? "hover:border-gold/40" : "opacity-70"}`}>
                    <div className="flex items-center gap-2">
                      <span className="grid size-9 place-items-center rounded-lg bg-black/40 text-xl">{open ? c.avatar : "🌫️"}</span>
                      <div className="min-w-0">
                        <p className={`truncate text-[12px] font-bold ${open ? "" : "italic text-gold/85"}`}>{open ? c.name : fog.title}</p>
                        <p className="truncate text-[10px] text-gold/70">{open ? c.title : "في الضباب"}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {relatedRegions.length > 0 && (
          <Section icon={Landmark} title="مناطق المعركة">
            <div className="flex flex-wrap gap-2">
              {relatedRegions.map(r => r && (
                <Link key={r.id} to="/map" className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-[11px] text-gold">
                  <MapPin className="me-1 inline size-3" /> {r.name}
                </Link>
              ))}
            </div>
          </Section>
        )}

        {relatedArtifacts.length > 0 && (
          <Section icon={BookOpen} title="آثارٌ من المعركة">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {relatedArtifacts.map(a => {
                const open = profile.artifactsFound.includes(a.id);
                const fog = fogHint(a.id);
                return (
                  <div key={a.id} className={`rounded-xl border border-white/10 bg-surface p-2 ${open ? "" : "opacity-70"}`}>
                    <div className="flex items-center gap-2">
                      <span className="grid size-9 place-items-center rounded-lg bg-black/40 text-xl">{open ? a.icon : "🌫️"}</span>
                      <div className="min-w-0">
                        <p className={`truncate text-[12px] font-bold ${open ? "" : "italic text-gold/85"}`}>{open ? a.name : fog.title}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{open ? a.typeLabel : "في الضباب"}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* CTAs */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {battle.campaignEras[0] && (
            <Link to="/campaigns/$era" params={{ era: battle.campaignEras[0] }}
              className="bg-gradient-gold shadow-gold rounded-xl py-2.5 text-center text-xs font-bold text-primary-foreground">
              ادخل الحملة
            </Link>
          )}
          {battle.storyId && (
            <Link to="/story/$id" params={{ id: battle.storyId }}
              className="rounded-xl border border-gold/30 bg-gold/5 py-2.5 text-center text-xs font-bold text-gold">
              اقرأ القصّة
            </Link>
          )}
        </div>

        {/* KNOWLEDGE GRAPH */}
        <RelatedHistory entity={{ kind: "battle", id: battle.id }} />
      </Screen>
    </AppShell>
  );
}

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-gold" />
        <h2 className="font-display text-sm font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}