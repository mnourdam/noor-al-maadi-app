import { describe, expect, it } from "vitest";
import { isManifestCountComparable, manifestKeyToLocalKey } from "@/lib/offline-manifest";
import { FULL_REFRESH_KEYS } from "@/lib/offline-snapshot";

/**
 * V16 regression — `get_content_manifest()` counts EVERY `admin_campaigns`
 * row (drafts included) while the offline snapshot only carries the
 * `campaigns_public` view (published only). Comparing those counts pinned the
 * "content update available" banner on forever the moment an editor saved a
 * draft campaign.
 */
describe("campaign manifest count comparability", () => {
  it("maps the public campaign collection to the local snapshot key", () => {
    expect(manifestKeyToLocalKey("campaigns_public")).toBe("admin_campaigns");
  });

  it("never compares campaign row counts", () => {
    expect(isManifestCountComparable("admin_campaigns")).toBe(false);
  });

  it("still compares counts for editorial collections with exact parity", () => {
    for (const key of ["encyclopedia_entities", "investigations", "atlas_entities"]) {
      expect(isManifestCountComparable(key)).toBe(true);
    }
  });

  it("forces a full campaign fetch so retired campaigns cannot go sticky", () => {
    expect(FULL_REFRESH_KEYS.has("admin_campaigns")).toBe(true);
  });
});
