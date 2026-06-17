import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Library, Lock } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ARTIFACTS, CHARACTERS, ERAS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/collection")({
  head: () => ({ meta: [{ title: "مجموعتي" }] }),
  component: CollectionPage,
});

const RARITY_STYLE: Record<string, string> = {
  common: "border-white/20 from-stone-500/20",
  rare: "border-blue-400/40 from-blue-400/15",
  legendary: "border-gold/60 from-gold/25",
};
const RARITY_LABEL: Record<string, string> = { common: "عادي", rare: "نادر", legendary: "أسطوري" };

function CollectionPage() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<"artifacts" | "characters">("artifacts");

  return (
    <AppShell>
      <Screen title="مجموعتي" subtitle="آثار وشخصيات جمعتها من رحلتك">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-surface p-1">
          <button
            onClick={() => setTab("artifacts")}
            className={`rounded-xl py-2 text-sm font-bold transition ${tab === "artifacts" ? "bg-gradient-gold text-primary-foreground" : "text-muted-foreground"}`}
          >
            الآثار ({profile.artifactsFound.length}/{ARTIFACTS.length})
          </button>
          <button
            onClick={() => setTab("characters")}
            className={`rounded-xl py-2 text-sm font-bold transition ${tab === "characters" ? "bg-gradient-gold text-primary-foreground" : "text-muted-foreground"}`}
          >
            الشخصيات ({profile.charactersUnlocked.length}/{CHARACTERS.length})
          </button>
        </div>

        {tab === "artifacts" ? (
          <div className="mt-5 grid grid-cols-3 gap-3">
            {ARTIFACTS.map((a) => {
              const found = profile.artifactsFound.includes(a.id);
              return (
                <div
                  key={a.id}
                  className={`relative aspect-square rounded-2xl border p-3 text-center ${found ? "border-gold/40 bg-gold/10" : "border-white/10 bg-surface opacity-60"}`}
                >
                  <div className={`text-3xl ${found ? "" : "grayscale"}`}>{a.icon}</div>
                  <p className="mt-2 line-clamp-2 text-[10px] font-bold leading-tight">{found ? a.name : "؟؟؟"}</p>
                  <p className="mt-0.5 text-[9px] text-gold">{a.typeLabel}</p>
                  {!found && <Lock className="absolute right-1.5 top-1.5 size-3 text-muted-foreground" />}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {CHARACTERS.map((c) => {
              const has = profile.charactersUnlocked.includes(c.id);
              return (
                <div
                  key={c.id}
                  className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br to-transparent p-4 ${
                    has ? RARITY_STYLE[c.rarity] : "border-white/10 bg-surface from-stone-500/0 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className={`text-3xl ${has ? "" : "grayscale opacity-40"}`}>{c.avatar}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[8px] ${has ? "border-gold/40 text-gold" : "border-white/20 text-muted-foreground"}`}>
                      {RARITY_LABEL[c.rarity]}
                    </span>
                  </div>
                  <p className="font-display mt-3 text-xs font-bold">{has ? c.name : "شخصية مخفية"}</p>
                  <p className="mt-0.5 text-[10px] text-gold">{has ? c.title : "أكمل حملة لتكشفها"}</p>
                  <p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">{has ? c.bio : ERAS.find((e) => e.id === c.era)?.name}</p>
                  {has && <p className="mt-2 text-[10px] text-gold">⚡ {c.power}</p>}
                  {!has && <Lock className="absolute right-2 top-2 size-3.5 text-muted-foreground" />}
                </div>
              );
            })}
          </div>
        )}

        {profile.artifactsFound.length === 0 && profile.charactersUnlocked.length === 0 && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-white/15 p-4 text-xs text-muted-foreground">
            <Library className="size-5 text-gold" />
            <span>أكمل الحملات والتحقيقات لتفتح أول قطعة في مجموعتك.</span>
          </div>
        )}
      </Screen>
    </AppShell>
  );
}