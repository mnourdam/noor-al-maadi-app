import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useMemo } from "react";
import { EncyclopediaCard } from "@/components/EncyclopediaCard";
import type { SupabaseEncyclopediaEntity } from "@/lib/encyclopedia-source";

interface VirtualizedEntityGridProps {
  entities: SupabaseEncyclopediaEntity[];
  highlight?: string;
  resetKey?: string;
  renderCard?: (entity: SupabaseEncyclopediaEntity) => React.ReactNode;
  /** Optional scroll restoration key */
  scrollKey?: string;
}

/**
 * A virtualization-powered grid for Encyclopedia entities.
 * Replaces ProgressiveEntityGrid to keep DOM count stable and improve FPS.
 * 
 * NOTE: For mobile, it's often better to let the window scroll. 
 * But virtualization libraries like react-virtual handle window scrolling too.
 * However, following the requirement for "Scroll Restoration", using a local
 * scroll container with manual state persistence is more robust across route changes.
 */
export function VirtualizedEntityGrid({
  entities,
  highlight,
  resetKey,
  renderCard,
  scrollKey
}: VirtualizedEntityGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // We assume a 2-column grid layout matching ProgressiveEntityGrid.
  const rowCount = Math.ceil(entities.length / 2);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140, // Height of one grid row including gap
    overscan: 5,
  });

  // Scroll restoration: Restore on mount
  useEffect(() => {
    if (scrollKey) {
      const saved = sessionStorage.getItem(`scroll-${scrollKey}`);
      if (saved && parentRef.current) {
        // Delay slightly to ensure layout is settled
        const timer = setTimeout(() => {
          if (parentRef.current) parentRef.current.scrollTop = parseInt(saved, 10);
        }, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [scrollKey, resetKey]);

  const handleScroll = () => {
    if (scrollKey && parentRef.current) {
      sessionStorage.setItem(`scroll-${scrollKey}`, parentRef.current.scrollTop.toString());
    }
  };

  // Reset scroll to top if resetKey changes (e.g. new search query)
  useEffect(() => {
    if (parentRef.current && resetKey) {
      parentRef.current.scrollTop = 0;
      if (scrollKey) sessionStorage.removeItem(`scroll-${scrollKey}`);
    }
  }, [resetKey, scrollKey]);

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className="h-[80vh] overflow-y-auto scrollbar-none"
      style={{
        contain: 'size layout', // Optimization
      }}
      data-testid="virtualized-entity-grid"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * 2;
          const rowItems = entities.slice(startIndex, startIndex + 2);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                right: 0, // RTL layout
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="grid grid-cols-2 gap-2.5 px-0.5 pb-2.5"
              dir="rtl"
            >
              {rowItems.map((e) => (
                <div key={e.id} data-encyclopedia-card={e.id}>
                  {renderCard ? renderCard(e) : (
                    <EncyclopediaCard entity={e} highlight={highlight} />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
