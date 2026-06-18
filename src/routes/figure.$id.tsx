import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowRight, MapPin, Swords, Crown, Sparkles, Quote, Users, Scroll, Star, Lock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  CHARACTERS, ERAS, ARTIFACTS, MAP_REGIONS, CAMPAIGNS, STORIES,
  getCharacterProfile,
} from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/figure/$id")({
  head: () => ({ meta: [{ title: "الشخصية · بطلٌ من التاريخ" }] }),
  component: FigurePage,
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center">
        <h2 className="font-display text-2xl font-bold">الشخصية غير موجودة</h2>
        <Link to="/collection" className="mt-4 inline-block text-gold">إلى المتحف</Link>
      </div>
    </AppShell>
  ),
  errorComponent: () => (
    <AppShell>
      <div className="px-5 pt-20 text-center text-muted-foreground">تعذّر فتح صفحة البطل.</div>
    </AppShell>
  ),
});

function FigurePage() {
  const { id } = useParams({ from: "/figure/$id" });
  const { profile } = useProfile();

  const card = CHARACTERS.find((c) => c.id === id);
  const prof = getCharacterProfile(id);
  if (!card) throw notFound();

  const unlocked = profile.charactersUnlocked.includes(id);
  const era = ERAS.find((e) => e.id === card.era);

  const related = useMemo(() => {
    const ids = prof?.relatedCharacterIds ?? [];
    return CHARACTERS.filter((c) => ids.includes(c.id));
  }, [prof]);

  const artifacts = useMemo(() => {
    const ids = prof?.artifactIds ?? [];
    return ARTIFACTS.filter((a) => ids.includes(a.id));
  }, [prof]);

  const regions = useMemo(() => {
    const ids = prof?.regionIds ?? [];
    return MAP_REGIONS.filter((r) => ids.includes(r.id));
  }, [prof]);

  const campaigns = useMemo(() => {
    const eras = prof?.campaignEras ?? [card.era];
    return CAMPAIGNS.filter((c) => eras.includes(c.eraId));
  }, [prof, card.era]);

  // discovery percentage across linked entities
  const discovery = useMemo(() => {
    const items: { unlocked: boolean }[] = [
      { unlocked },
      ...artifacts.map((a) => ({ unlocked: profile.artifactsFound.includes(a.id) })),
      ...regions.map((r) => ({ unlocked: profile.regionsUnlocked.includes(r.id) })),
      ...(prof?.battles ?? []).map((b) => ({
        unlocked: !!b.storyId && profile.storiesRead.includes(b.storyId),
      })),
    ];
    const done = items.filter((i) => i.unlocked).length;
    const total = items.length || 1;
    return { done, total, pct: Math.round((done / total) * 100) };
  }, [unlocked, artifacts, regions, prof, profile]);

  if (!unlocked) {
    return (
      <AppShell>
        <div className="px-5 pt-10 text-center">
          <Link to="/collection" className="text-sm text-muted-foreground inline-flex items-center gap-1">
            <ArrowRight className="size-4" /> المتحف
          </Link>
          <div className="mt-10 rounded-3xl border border-white/10 bg-surface p-8">
            <div className="grid mx-auto size-20 place-items-center rounded-2xl bg-black/40">
              <Lock className="size-8 text-muted-foreground" />
            </div>
            <h1 className="font-display mt-4 text-2xl font-bold">بطلٌ مخفيّ</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              أكمل حملة <span className="text-gold">{era?.name}</span> لتكشف هويّته وتفتح أرشيفه الكامل.
            </p>
            <Link
              to="/campaigns/$era"
              params={{ era: card.era }}
              className="bg-gradient-gold shadow-gold mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-primary-foreground"
            >
              ابدأ الحملة
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="animate-reveal pb-10">
        {/* HERO */}
        <div className="relative h-[420px] overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-b ${prof?.heroGradient ?? "from-amber-900/70 via-amber-700/30 to-transparent"}`} />
          <div className="absolute inset-0 ink-overlay opacity-80" />
          <div className="absolute inset-0 arabesque-layer opacity-25" />
          {/* floating glyph */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="animate-ken-burns relative">
              <div className="reward-burst grid size-44 place-items-center rounded-[2rem] bg-black/35 ring-1 ring-gold/30 shadow-gold backdrop-blur-sm">
                <span className="text-7xl drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]">{card.avatar}</span>
              </div>
            </div>
          </div>

          {/* top bar */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-6">
            <Link to="/collection" className="flex items-center gap-1 text-xs text-white/85">
              <ArrowRight className="size-4" /> المتحف
            </Link>
            <span className="rounded-full border border-gold/50 bg-black/40 px-3 py-1 text-[10px] font-bold text-gold backdrop-blur">
              {era?.name}
            </span>
          </div>

          {/* hero text */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-6">
            <p className="text-[10px] tracking-[0.25em] text-gold/85">{card.title}</p>
            <h1 className="font-display shimmer-text mt-1 text-4xl font-extrabold leading-tight">
              {prof?.fullName ?? card.name}
            </h1>
            <p className="mt-1 text-[12px] text-white/80">{prof?.epithet ?? card.title}</p>
            {prof?.lifespan && (
              <p className="mt-2 text-[11px] text-gold/80">{prof.lifespan}</p>
            )}
          </div>
        </div>

        <div className="px-5 -mt-4 space-y-5">
          {/* discovery progress */}
          <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/15 via-gold/5 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] tracking-[0.2em] text-gold/80">اكتشاف هذا البطل</p>
                <p className="font-display mt-1 text-sm font-bold">{discovery.done} / {discovery.total} عنصر</p>
              </div>
              <p className="font-display text-3xl font-extrabold text-gold">{discovery.pct}%</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/30">
              <div className="bg-gradient-gold h-full rounded-full transition-all duration-700" style={{ width: `${discovery.pct}%` }} />
            </div>
          </div>

          {/* tagline + bio */}
          {prof?.tagline && (
            <p className="text-center text-[13px] leading-7 text-foreground/85 italic">{prof.tagline}</p>
          )}

          <section>
            <SectionTitle icon={Scroll} label="السيرة" />
            <div className="rounded-2xl border border-white/10 bg-surface p-4 space-y-3 text-[12.5px] leading-7 text-foreground/85">
              {(prof?.bioLong ?? [card.bio]).map((p, i) => <p key={i}>{p}</p>)}
              {(prof?.birthplace || prof?.resting) && (
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/10 text-[11px]">
                  {prof?.birthplace && (
                    <div>
                      <p className="text-muted-foreground">المولد</p>
                      <p className="text-gold/90 mt-0.5">{prof.birthplace}</p>
                    </div>
                  )}
                  {prof?.resting && (
                    <div>
                      <p className="text-muted-foreground">المثوى</p>
                      <p className="text-gold/90 mt-0.5">{prof.resting}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* TIMELINE */}
          {prof?.timeline?.length ? (
            <section>
              <SectionTitle icon={Star} label="خطّ الحياة" />
              <ol className="relative rounded-2xl border border-white/10 bg-surface p-4">
                <span className="absolute right-[22px] top-4 bottom-4 w-px bg-gold/25" />
                {prof.timeline.map((t, i) => (
                  <li key={i} className="relative pe-9 pb-3 last:pb-0">
                    <span className="absolute right-[14px] top-1 size-4 rounded-full bg-gold/20 ring-2 ring-gold/40" />
                    <p className="font-display text-[12px] font-bold text-gold">{t.year}</p>
                    <p className="text-[12px] text-foreground/85">{t.event}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* ACHIEVEMENTS */}
          {prof?.achievements?.length ? (
            <section>
              <SectionTitle icon={Crown} label="إنجازات خالدة" />
              <ul className="space-y-2">
                {prof.achievements.map((a, i) => (
                  <li key={i} className="flex gap-2 rounded-xl border border-white/10 bg-surface p-3 text-[12px] leading-6">
                    <Sparkles className="size-3.5 shrink-0 text-gold mt-0.5" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* CAMPAIGNS */}
          {campaigns.length > 0 && (
            <section>
              <SectionTitle icon={Scroll} label="حملات مرتبطة" />
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <Link
                    key={c.eraId}
                    to="/campaigns/$era"
                    params={{ era: c.eraId }}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-surface p-3 transition hover:border-gold/40"
                  >
                    <div>
                      <p className="font-display text-sm font-bold">{c.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{c.intro}</p>
                    </div>
                    <ArrowRight className="size-4 rotate-180 text-gold" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* BATTLES */}
          {prof?.battles?.length ? (
            <section>
              <SectionTitle icon={Swords} label="معارك خاضها" />
              <div className="grid grid-cols-1 gap-2">
                {prof.battles.map((b, i) => {
                  const storyOpen = b.storyId && profile.storiesRead.includes(b.storyId);
                  const inner = (
                    <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-surface p-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/30 ring-1 ring-rose-400/20 text-lg">⚔️</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-display text-[13px] font-bold">{b.name}</p>
                          <span className="text-[10px] text-gold/80">{b.year}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{b.place}</p>
                        <p className="mt-1 text-[11px] text-foreground/80">{b.outcome}</p>
                      </div>
                    </div>
                  );
                  return b.storyId && storyOpen ? (
                    <Link key={i} to="/story/$id" params={{ id: b.storyId }}>{inner}</Link>
                  ) : (
                    <div key={i} className={!storyOpen && b.storyId ? "opacity-80" : ""}>{inner}</div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ARTIFACTS */}
          {artifacts.length > 0 && (
            <section>
              <SectionTitle icon={Crown} label="آثار وكنوز" />
              <div className="grid grid-cols-2 gap-2.5">
                {artifacts.map((a) => {
                  const found = profile.artifactsFound.includes(a.id);
                  return (
                    <div key={a.id} className={`rounded-2xl border border-white/10 bg-surface p-3 ${found ? "ring-1 ring-gold/30" : "opacity-70"}`}>
                      <div className="flex items-center justify-between">
                        <div className="grid size-10 place-items-center rounded-xl bg-black/30 text-xl">
                          {found ? a.icon : <Lock className="size-3.5 text-muted-foreground" />}
                        </div>
                        <span className="text-[9px] text-gold/80">{a.typeLabel}</span>
                      </div>
                      <p className="font-display mt-2 text-[12px] font-bold line-clamp-1">{found ? a.name : "أثرٌ مجهول"}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
                        {found ? a.description : "اكتشفه عبر مهامّك."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* REGIONS */}
          {regions.length > 0 && (
            <section>
              <SectionTitle icon={MapPin} label="مواقع على الخارطة" />
              <div className="space-y-2">
                {regions.map((r) => {
                  const open = profile.regionsUnlocked.includes(r.id);
                  return (
                    <Link
                      key={r.id}
                      to="/map"
                      className={`flex items-center gap-3 rounded-2xl border border-white/10 bg-surface p-3 transition hover:border-gold/40 ${open ? "" : "opacity-80"}`}
                    >
                      <div className="grid size-10 place-items-center rounded-xl bg-black/30 text-xl">{r.glyph ?? "📍"}</div>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[13px] font-bold">{r.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{r.capital} · {r.theme}</p>
                      </div>
                      {!open && <Lock className="size-3.5 text-muted-foreground" />}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* RELATED CHARACTERS */}
          {related.length > 0 && (
            <section>
              <SectionTitle icon={Users} label="شخصيات في حياته" />
              <div className="grid grid-cols-3 gap-2.5">
                {related.map((c) => {
                  const open = profile.charactersUnlocked.includes(c.id);
                  const inner = (
                    <div className={`rounded-2xl border border-white/10 bg-surface p-3 text-center transition hover:border-gold/40 ${open ? "" : "opacity-70"}`}>
                      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-black/30 text-2xl">
                        {open ? c.avatar : <Lock className="size-3.5 text-muted-foreground" />}
                      </div>
                      <p className="font-display mt-2 text-[11px] font-bold line-clamp-1">{open ? c.name : "؟؟؟"}</p>
                      <p className="mt-0.5 text-[9px] text-gold/80 line-clamp-1">{open ? c.title : "بطلٌ مرتبط"}</p>
                    </div>
                  );
                  return open ? (
                    <Link key={c.id} to="/figure/$id" params={{ id: c.id }}>{inner}</Link>
                  ) : (
                    <div key={c.id}>{inner}</div>
                  );
                })}
              </div>
            </section>
          )}

          {/* QUOTES */}
          {prof?.quotes?.length ? (
            <section>
              <SectionTitle icon={Quote} label="من أقواله" />
              <div className="space-y-2.5">
                {prof.quotes.map((q, i) => (
                  <figure key={i} className="relative rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/10 via-gold/0 to-transparent p-4">
                    <Quote className="absolute right-3 top-3 size-4 text-gold/40" />
                    <blockquote className="font-display text-[13px] leading-7 text-foreground/90">
                      « {q.text} »
                    </blockquote>
                    {q.context && (
                      <figcaption className="mt-2 text-[10px] text-gold/80">— {q.context}</figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className="size-4 text-gold" />
      <h2 className="font-display text-sm font-bold">{label}</h2>
      <div className="ms-2 h-px flex-1 bg-gradient-to-l from-gold/40 to-transparent" />
    </div>
  );
}