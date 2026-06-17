import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Eye, RotateCw, Sparkles } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { WHO_AM_I, ERAS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/who-am-i")({
  head: () => ({ meta: [{ title: "من أنا؟" }] }),
  component: WhoPage,
});

function normalize(s: string) {
  return s.replace(/[إأآا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
}

function WhoPage() {
  const { profile, markWhoSolved } = useProfile();
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(1);
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState<null | "ok" | "no">(null);
  const w = WHO_AM_I[i];
  const era = ERAS.find((e) => e.id === w.era);

  const candidates = useMemo(() => [w.answer, ...(w.aliases ?? [])].map(normalize), [w]);

  function check() {
    if (!guess.trim()) return;
    const g = normalize(guess);
    const ok = candidates.some((c) => c.includes(g) || g.includes(c));
    setResult(ok ? "ok" : "no");
    if (ok) markWhoSolved(w.id);
  }

  function nextOne() {
    setI((x) => (x + 1) % WHO_AM_I.length);
    setShown(1); setGuess(""); setResult(null);
  }

  return (
    <AppShell>
      <Screen title="من أنا؟" subtitle={`اكتشف الشخصية · حللتَ ${profile.whoSolved.length} من ${WHO_AM_I.length}`}>
        <div className="shadow-elegant rounded-3xl border border-white/10 bg-surface p-6">
          <div className="flex items-center justify-between text-xs">
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-gold">{era?.name}</span>
            <span className="text-muted-foreground">+٢٠ نقطة</span>
          </div>

          <div className="mt-6 grid place-items-center">
            <div className="grid size-24 place-items-center rounded-full bg-gradient-gold text-5xl shadow-gold">
              ❓
            </div>
          </div>

          <div className="mt-6 space-y-2.5">
            {w.clues.slice(0, shown).map((c, idx) => (
              <div key={idx} className="rounded-2xl border border-white/10 bg-surface-2 p-3 text-sm leading-relaxed">
                <span className="me-2 text-gold">دليل {idx + 1}:</span>
                {c}
              </div>
            ))}
          </div>

          {shown < w.clues.length && result !== "ok" && (
            <button onClick={() => setShown((s) => s + 1)} className="mt-3 flex items-center gap-1.5 text-xs text-gold">
              <Eye className="size-3.5" /> اكشف دليلًا آخر
            </button>
          )}

          <div className="mt-5 flex gap-2">
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="اكتب الاسم..."
              className="flex-1 rounded-2xl border border-white/10 bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-gold/50"
              onKeyDown={(e) => e.key === "Enter" && check()}
            />
            <button onClick={check} className="rounded-2xl bg-gradient-gold px-5 text-sm font-bold text-primary-foreground shadow-gold">
              تحقّق
            </button>
          </div>

          {result === "ok" && (
            <div className="mt-4 rounded-2xl bg-emerald-400/10 p-4 text-sm text-emerald-300">
              <div className="flex items-center gap-1.5 font-bold"><Sparkles className="size-4" /> أحسنت! إنّه {w.answer}.</div>
            </div>
          )}
          {result === "no" && (
            <div className="mt-4 rounded-2xl bg-red-400/10 p-4 text-sm text-red-300">
              ليس بعد. جرّب اسمًا آخر أو اكشف دليلًا.
            </div>
          )}
        </div>

        <button onClick={nextOne} className="mx-auto mt-5 flex items-center gap-1.5 rounded-full border border-white/10 px-5 py-2 text-sm text-muted-foreground hover:text-foreground">
          <RotateCw className="size-3.5" /> شخصية أخرى
        </button>
      </Screen>
    </AppShell>
  );
}