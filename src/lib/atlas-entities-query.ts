// Phase 2 — Shared cached query for the published atlas markers.
// Single source of truth for /map: pins, search, panel all read this list.
//
// Local-first: the bundled offline snapshot seeds `initialData` so the map
// renders instantly even with no network. The network query refreshes the
// list in the background when online.
//
// LC1 (player Atlas only): events / artifacts / figure markers / route
// points are filtered out at this query layer. Data remains intact in the
// database; this is purely a display-layer decision for the public beta.
import { useQuery } from "@tanstack/react-query";
import {
  listPublishedAtlasEntities,
  filterLc1AtlasRows,
  type AtlasEntityRow,
} from "./atlas-entities";
import { ensureLocalSnapshotLoaded, localAtlasEntities } from "./local-first-store";
import { shouldForceRemoteAtlas } from "./atlas/atlas-recovery";

export function usePublishedAtlasEntities() {
  return useQuery<AtlasEntityRow[]>({
    queryKey: ["atlas-entities", "published", "lc1"],
    staleTime: 10 * 60_000,
    initialData: () => {
      if (shouldForceRemoteAtlas()) return undefined;
      const rows = localAtlasEntities() as AtlasEntityRow[];
      return rows.length > 0 ? filterLc1AtlasRows(rows) : undefined;
    },
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      // After "إعادة ضبط بيانات الأطلس" the local rows are treated as
      // suspect for this session and the server is the source of truth.
      if (!shouldForceRemoteAtlas()) {
        await ensureLocalSnapshotLoaded();
        const local = localAtlasEntities() as AtlasEntityRow[];
        if (local.length > 0) return filterLc1AtlasRows(local);
      }
      return filterLc1AtlasRows(await listPublishedAtlasEntities());
    },
  });
}
