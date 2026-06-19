import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, ChevronLeft, Check, Coins, Star } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { INVESTIGATION_REGISTRY } from "@/lib/investigations";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/investigations")({
  head: () => ({ meta: [{ title: "التحقيقات التاريخية" }] }),
  component: InvestigationsIndex,
});

function InvestigationsIndex() {
  const { profile } = useProfile();
  return (
    <AppShell>
      <Screen title="التحقيقات التاريخية" subtitle="اكشف القرائن، استنتج الإجابة، واربح الدنانير">
        <div className="space-y-3">
          {INVESTIGATION_REGISTRY.map((inv) => {
            const done = profile.investigationsCompleted.includes(inv.id);
            return (
              <Link
                key={inv.id}
                to="/investigation/$id"
                params={{ id: inv.id }}
                className={`flex items-center gap-3 rounded-2xl border p-4 ${done ? "border-gold/40 bg-gold/5" : "border-white/10 bg-surface"}`}
              >
                <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold">
                  <Search className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display truncate text-sm font-bold">{inv.title}</p>
                  <p className="mt-0.5 inline-flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-gold"><Star className="size-3" /> +{inv.reward.xp}</span>
                    <span className="inline-flex items-center gap-1 text-gold"><Coins className="size-3" /> +{inv.reward.dinars}</span>
                  </p>
                </div>
                {done ? <Check className="size-4 text-gold" /> : <ChevronLeft className="size-4 text-muted-foreground" />}
              </Link>
            );
          })}
        </div>
      </Screen>
    </AppShell>
  );
}