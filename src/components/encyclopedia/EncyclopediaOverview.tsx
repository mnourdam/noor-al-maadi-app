// Overview — long intro paragraph. Renders nothing if empty.
import { ScrollText } from "lucide-react";

export function EncyclopediaOverview({ overview }: { overview?: string }) {
  if (!overview?.trim()) return null;
  // Preserve paragraphs split by blank lines.
  const paragraphs = overview.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <ScrollText className="size-4 text-gold" />
        <h2 className="font-display text-sm font-bold">نظرة عامة</h2>
      </div>
      <div className="space-y-2 rounded-2xl border border-white/10 bg-surface/60 p-4">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[13px] leading-7 text-foreground/90">{p}</p>
        ))}
      </div>
    </section>
  );
}
