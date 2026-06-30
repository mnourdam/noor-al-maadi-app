import { findHighlightRanges } from "@/lib/encyclopedia-highlight";

interface Props {
  text: string;
  query?: string | null;
  className?: string;
}

/** Renders `text` with the substrings matching `query` (Arabic-normalized)
 *  wrapped in a subtle gold accent. Falls back to plain text. */
export function HighlightedText({ text, query, className }: Props) {
  if (!text) return null;
  const ranges = query ? findHighlightRanges(text, query) : [];
  if (ranges.length === 0) return <span className={className}>{text}</span>;
  const parts: Array<{ s: string; hit: boolean; key: string }> = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push({ s: text.slice(cursor, r.start), hit: false, key: `p${i}` });
    parts.push({ s: text.slice(r.start, r.end), hit: true, key: `h${i}` });
    cursor = r.end;
  });
  if (cursor < text.length) parts.push({ s: text.slice(cursor), hit: false, key: "tail" });
  return (
    <span className={className}>
      {parts.map((p) =>
        p.hit ? (
          <mark
            key={p.key}
            className="rounded-[3px] bg-gold/20 px-[1px] font-bold text-gold"
          >
            {p.s}
          </mark>
        ) : (
          <span key={p.key}>{p.s}</span>
        ),
      )}
    </span>
  );
}
