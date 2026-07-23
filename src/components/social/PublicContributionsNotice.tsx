// ============================================================
// <PublicContributionsNotice /> — anonymous transparency note.
// ------------------------------------------------------------
// Rendered on Story / Encyclopedia surfaces when readers have
// contributed applied improvements. NEVER exposes contributor
// identity, comment id, or any social/reward metadata.
// ============================================================

import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listPublicContributions,
  categoryLabelAr,
  type PublicContributionNotice,
} from "@/lib/social/contributions";
import type { SocialAnchorType } from "@/lib/social/reactions";

interface Props {
  anchorType: SocialAnchorType;
  anchorId: string;
  className?: string;
}

function fmt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function PublicContributionsNotice({ anchorType, anchorId, className }: Props) {
  const [items, setItems] = useState<PublicContributionNotice[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await listPublicContributions(anchorType, anchorId);
      if (!cancelled) setItems(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [anchorType, anchorId]);

  if (!items || items.length === 0) return null;

  const preview = expanded ? items : items.slice(0, 2);
  const remaining = items.length - preview.length;

  return (
    <aside
      className={cn(
        "rounded-lg border border-gold/25 bg-gold/[0.04] p-3 text-[12px] leading-relaxed text-foreground/85",
        className,
      )}
      aria-label="إسهامات القرّاء في تحسين إرث"
    >
      <header className="mb-2 flex items-center gap-2 text-gold">
        <Sprout className="size-4" aria-hidden="true" />
        <span className="text-[12px] font-semibold tracking-wide">
          ساهم قرّاء في تحسين هذا المحتوى
        </span>
      </header>
      <ul className="space-y-1.5">
        {preview.map((n, i) => (
          <li key={`${n.applied_at}-${i}`} className="flex gap-2">
            <span
              className="mt-1 inline-block size-1 rounded-full bg-gold/60"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap break-words">{n.public_notice_text}</p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                {categoryLabelAr(n.category)} · {fmt(n.applied_at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {remaining > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-[11px] text-gold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          عرض {remaining} إضافيّة
        </button>
      )}
      <p className="mt-2 text-[10.5px] text-muted-foreground">
        المساهمات مجهولة الهوية — الاعتراف تحريري لا اجتماعي.
      </p>
    </aside>
  );
}
