// Phase 2 — Shared cached query for the published atlas markers.
// Single source of truth for /map: pins, search, panel all read this list.
//
// Local-first: the bundled offline snapshot seeds `initialData` so the map
// renders instantly even with no network. The network query refreshes the
// list in the background when online.
import { useQuery } from "@tanstack/react-query";
import { listPublishedAtlasEntities, type AtlasEntityRow } from "./atlas-entities";
import { localAtlasEntities } from "./local-first-store";

export function usePublishedAtlasEntities() {
  return useQuery<AtlasEntityRow[]>({
    queryKey: ["atlas-entities", "published"],
    staleTime: 60_000,
    initialData: () => {
      const rows = localAtlasEntities() as AtlasEntityRow[];
      return rows.length > 0 ? rows : undefined;
    },
    initialDataUpdatedAt: 0,
    queryFn: listPublishedAtlasEntities,
  });
}
