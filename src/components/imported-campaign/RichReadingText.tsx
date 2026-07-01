// ============================================================
// RichReadingText — premium Arabic long-form typography
// ------------------------------------------------------------
// Splits raw text on double-newline (paragraph) boundaries and
// preserves single line breaks inside each paragraph. Applies
// generous line-height, comfortable measure, and paragraph
// spacing so campaign reading feels like storytelling — not a
// dense JSON blob. Safe with RTL Arabic.
// ============================================================

import React from "react";

export interface RichReadingTextProps {
  text?: string | null;
  /** Small = context blocks; base = chapter intro; large = historical reading. */
  size?: "sm" | "base" | "lg";
  className?: string;
}

export function RichReadingText({ text, size = "base", className = "" }: RichReadingTextProps) {
  if (!text) return null;
  const paragraphs = String(text)
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const sizeCls =
    size === "sm"
      ? "text-[13px] leading-[2]"
      : size === "lg"
      ? "text-[15px] leading-[2.1]"
      : "text-[14px] leading-[2]";

  return (
    <div
      className={`rich-reading space-y-4 max-w-[62ch] mx-auto text-foreground/90 ${sizeCls} ${className}`}
      style={{ textWrap: "pretty" as any, wordBreak: "break-word" }}
    >
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

export default RichReadingText;
