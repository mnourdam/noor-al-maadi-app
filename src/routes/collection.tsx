import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Library, Lock, MapPin } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ARTIFACTS, CHARACTERS, MAP_REGIONS, ERAS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/collection")({
  head: () => ({ meta: [{ title: "متحف المجموعة" }] }),
  component: CollectionPage,
});

type Tab = "artifacts" | "characters" | "regions";

const RARITY_STYLE: Record<string, string> = {
  legendary: "border-gold/60 bg-gradient-to-br from-gold/20 via-gold/5 to-transparent",
  rare: "border-sky-400/40 bg-sky-400/5",
  common: "border-white/10 bg-surface",
};
const RARITY_LABEL: Record<string, string> = { legendary: "أسطوري", rare: "نادر", common: "عادي" };

function CollectionPage() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<Tab>("artifacts");

  const arts = ARTIFACTS.length;
  const chars = CHARACTERS.length;
  const regs = MAP_REGIONS.length;

  return (
    <AppShell>
      <Screen title="متحفي" subtitle="أرشيفك التاريخي الخاص">
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Tile label="آثار" value={`${profile.artifactsFound.length}/${arts}`} active={tab === "artifacts"} onClick={() => setTab("artifacts")} />
          <Tile label="شخصيات" value={`${profile.charactersUnlocked.length}/${chars}`} active={tab === "characters"} onClick={() => setTab("characters")} />
          <Tile label="مناطق" value={`${profile.regionsUnlocked.length}/${regs}`} active={tab === "regions"} onClick={() => setTab("regions")} />
        </div>

        {tab === "artifacts" && (
          <div className="grid grid-cols-2 gap-3">
            {ARTIFACTS.map((a) => {
              const found = profile.artifactsFound.includes(a.id);
              return (
                <div key={a.id} className={`rounded-2xl border p-4 ${found ? "border-gold/30 bg-gold/5" : "border-white/10 bg-surface/60 opacity-70"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{found ? a.icon : "❔"}</span>
                    {!found && <Lock className="size-3.5 text-muted-foreground" />}
                  </div>
                  <p className="font-display mt-2 text-sm font-bold">{found ? a.name : "أثرٌ مجهول"}</p>
                  <p className="mt-1 text-[10px] text-gold">{a.typeLabel} · {ERAS.find((e) => e.id === a.era)?.name}</p>
                  {found && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{a.description}</p>}
                </div>
              );
            })}
          </div>
        )}

        {tab === "characters" && (
          <div className="space-y-3">
            {CHARACTERS.map((c) => {
              const open = profile.charactersUnlocked.includes(c.id);
              return (
                <div key={c.id} className={`flex items-start gap-3 rounded-2xl border p-4 ${open ? RARITY_STYLE[c.rarity] : "border-white/10 bg-surface/60 opacity-70"}`}>
                  <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gold/15 text-2xl">{open ? c.avatar : "❔"}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-display text-sm font-bold">{open ? c.name : "شخصية مجهولة"}</p>
                      <span className="text-[10px] text-gold">{RARITY_LABEL[c.rarity]}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-gold/80">{open ? c.title : "—"}</p>
                    {open && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{c.bio}</p>}
                    {open && <p className="mt-1 text-[10px] text-gold">{c.power}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "regions" && (
          <div className="space-y-3">
            {MAP_REGIONS.map((r) => {
              const open = profile.regionsUnlocked.includes(r.id);
              return (
                <div key={r.id} className={`flex items-start gap-3 rounded-2xl border p-4 ${open ? "border-gold/30 bg-gold/5" : "border-white/10 bg-surface/60 opacity-70"}`}>
                  <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${open ? "bg-gradient-gold text-primary-foreground" : "bg-gold/15 text-gold"}`}>
                    {open ? <MapPin className="size-5" /> : <Lock className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-gold">{ERAS.find((e) => e.id === r.era)?.name}</p>
                    <p className="font-display mt-0.5 text-sm font-bold">{r.name}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{open ? r.blurb : "اكتشف هذه المنطقة على الخارطة."}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {profile.artifactsFound.length + profile.charactersUnlocked.length === 0 && tab !== "regions" && (
          <div className="mt-6 rounded-2xl border border-dashed border-white/15 p-6 text-center text-xs text-muted-foreground">
            <Library className="mx-auto mb-2 size-6 text-gold" />
            ابدأ الحملات لتفتح أوّل قطع متحفك.
          </div>
        )}
      </Screen>
    </AppShell>
  );
}

function Tile({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-3 text-center transition ${active ? "border-gold/50 bg-gold/10" : "border-white/10 bg-surface"}`}
    >
      <p className="font-display text-sm font-bold text-gold">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </button>
  );
}