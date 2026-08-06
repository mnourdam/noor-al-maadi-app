import { collectImageUrls, prefetchImages } from "./image-cache";

/**
 * Background warm-up for images in the offline snapshot.
 * Extracted to a bridge to avoid circular dependencies and heavy imports
 * during initial boot.
 */
export async function warmSnapshotImageCache(collections: Record<string, any[]>): Promise<void> {
  const urls = new Set<string>();
  
  // Only warm high-priority images first to save bandwidth
  const priorities = ["admin_campaigns", "stories"];
  for (const key of priorities) {
    if (collections[key]) {
      collectImageUrls(collections[key], urls);
    }
  }
  
  // Long tail - everything else
  for (const [key, rows] of Object.entries(collections)) {
    if (priorities.includes(key)) continue;
    collectImageUrls(rows, urls);
  }

  if (urls.size > 0) {
    console.info(`[snapshot] warming cache with ${urls.size} image candidates`);
    await prefetchImages(urls);
  }
}
