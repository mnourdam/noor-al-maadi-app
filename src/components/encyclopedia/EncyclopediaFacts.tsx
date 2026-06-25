// Quick facts — replaces the old key/value list with a grid of museum
// "information cards". Each card carries its label and value separated
// by a gold hairline, evoking museum plaque typography.
import { Gem } from "lucide-react";
import type { QuickFact } from "@/types/encyclopediaArticle";

export function EncyclopediaFacts({ facts }: { facts?: QuickFact[] }) {
  if (!facts || facts.length === 0) return null;
  return (
    <section className="mt-10">
      <header className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-gold/10 ring-1 ring-gold/30 text-gold">
          <Gem className="size-4.5" strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-[10px] tracking-[0.32em] text-gold/80">بطاقات المعلومات</p>
          <h2 className="font-display text-lg font-bold">حقائق سريعة</h2>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2.5">
        {facts.map((f, i) => (
          <div
            key={i}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-surface/80 to-black/30 p-3.5 transition hover:border-gold/30"
          >
            <span className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-gold/30 to-transparent opacity-0 transition group-hover:opacity-100" />
            <dt className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] text-gold/85">
              {f.label}
            </dt>
            <span className="mt-1.5 mb-2 block h-px w-8 bg-gold/30" />
            <dd className="font-display text-[14px] font-semibold leading-snug text-foreground/95">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
