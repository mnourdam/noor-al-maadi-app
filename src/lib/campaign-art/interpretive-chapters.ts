/** Explicit local interpretive illustrations, not recovered historical originals.
 * Authored image fields always win, including an intentionally empty string.
 * Composite campaign/chapter IDs prevent collisions across reused chapter IDs.
 */
export const INTERPRETIVE_CHAPTER_IMAGES = [
  { campaignId: "cordoba-golden-age", chapterId: "ch5", path: "chapters/cordoba-golden-age/ch5/interpretive-v1.webp" },
  { campaignId: "ottoman-golden-age", chapterId: "ch10", path: "chapters/ottoman-golden-age/ch10/interpretive-v1.webp" },
  { campaignId: "rise-of-the-ottoman-state", chapterId: "ch2", path: "chapters/rise-of-the-ottoman-state/ch2/interpretive-v1.webp" },
] as const;

export function chapterImageForDisplay(campaignId: string, chapterId: string, authored: string | null | undefined): string | null | undefined {
  if (authored !== null && authored !== undefined) return authored;
  const item = INTERPRETIVE_CHAPTER_IMAGES.find(row => row.campaignId === campaignId && row.chapterId === chapterId);
  return item ? `/campaign-key-art/${item.path}` : authored;
}
