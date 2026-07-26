// Progressive reveal grid.
//
// Rendering 377+ cards in one commit is ~40 ms of layout on a mid Android
// WebView and makes every filter keystroke feel heavy. We paint the first
// page immediately and append the rest as the player scrolls, so the list is
// COMPLETE (no truncation, no "limit 60" lie) while first paint stays cheap.

import { useEffect, useMemo, useRef, useState } from "react";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";

const PAGE = 48;

export function ProgressiveEntityGrid({
  entities,
  highlight,
  resetKey,
  renderCard,
}: {
  entities: SupabaseEncyclopediaEntity[];
  highlight?: string;
  /** Changing this value resets the reveal window back to the first page. */
  resetKey?: string;
  renderCard?: (entity: SupabaseEncyclopediaEntity) => React.ReactNode;
}) {
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setLimit(PAGE); }, [resetKey]);

  const visible = useMemo(() => entities.slice(0, limit), [entities, limit]);
  const hasMore = entities.length > visible.length;

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      // No observer (SSR / very old WebView): reveal everything rather than
      // silently hiding rows.
      setLimit(entities.length);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLimit((current) => Math.min(entities.length, current + PAGE));
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, entities.length]);

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {visible.map((e) =>
          renderCard ? (
            <div key={e.id}>{renderCard(e)}</div>
          ) : (
            <EncyclopediaCard key={e.id} entity={e} highlight={highlight} />
          ),
        )}
      </div>
      {hasMore && (
        <div ref={sentinel} className="py-6 text-center text-[10px] text-muted-foreground">
          يتم إظهار المزيد…
        </div>
      )}
    </>
  );
}
