// Phase 2 — Shared cached query for the published atlas markers.
// Single source of truth for /map: pins, search, panel all read this list.
import { useQuery } from "@tanstack/react-query";
import { listPublishedAtlasEntities, type AtlasEntityRow } from "./atlas-entities";

export function usePublishedAtlasEntities() {
  return useQuery<AtlasEntityRow[]>({
    queryKey: ["atlas-entities", "published"],
    staleTime: 60_000,
    queryFn: listPublishedAtlasEntities,
  });
}
