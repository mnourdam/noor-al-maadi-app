// Quick facts — sidebar-style key/value list.
import { Sparkles } from "lucide-react";
import type { QuickFact } from "@/types/encyclopediaArticle";

export function EncyclopediaFacts({ facts }: { facts?: QuickFact[] }) {
  if (!facts || facts.length === 0) return null;
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-gold" />
        <h2 className="font-display text-sm font-bold">حقائق سريعة</h2>
      </div>
      <dl className="grid grid-cols-1 gap-1.5 rounded-2xl border border-white/10 bg-surface/60 p-3 sm:grid-cols-2">
        {facts.map((f, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-3 rounded-xl bg-black/20 px-3 py-2"
          >
            <dt className="inline-flex items-center gap-1.5 text-[11px] text-gold/85">
              {f.icon && <span className="text-base leading-none">{f.icon}</span>}
              {f.label}
            </dt>
            <dd className="text-end text-[12px] font-medium text-foreground/90">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
