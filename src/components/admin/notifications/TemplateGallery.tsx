/**
 * Template gallery — clicking a template loads it into the Composer.
 */

import { Sparkles } from "lucide-react";
import { TEMPLATES, type NotificationTemplate } from "@/lib/notifications/admin/templates";
import { iconByName } from "@/lib/notifications/admin/icons";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/categories";

export function TemplateGallery({
  onPick,
}: { onPick: (t: NotificationTemplate) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TEMPLATES.map((t) => {
        const Icon = iconByName(t.icon) ?? Sparkles;
        const cat = NOTIFICATION_CATEGORIES[t.category];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-right transition hover:border-primary/50 hover:bg-accent/50"
          >
            <div className="flex w-full items-center justify-between">
              <div className={`grid size-9 place-items-center rounded-lg ${cat.accentBg}`}>
                <Icon className={`size-4 ${cat.accent}`} />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">{t.id}</span>
            </div>
            <div className="font-semibold">{t.label}</div>
            <div className="line-clamp-2 text-xs text-muted-foreground">{t.description}</div>
            <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
              <span className={`rounded px-1.5 py-0.5 ${cat.accentBg} ${cat.accent}`}>{cat.label}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{t.priority}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
