// Guest challenge ledger: the logical key is owner-partitioned by Identity Partition.
// Never merged into user accounts. A saved completion is NOT proof of profile reward delivery.
import {
  localScope,
  readCompletionSet,
  saveCompletion,
  type GuestSaveResult,
} from "@/lib/guest/storage";
const GUEST_KEY = "irth.game-completions.guest.v1";
const CHANGE_EVENT = "irth:guest-completions-changed";
/** Throws on unknown history instead of treating it as a new reward opportunity. */
export function readGuestCompletedIds(): Set<string> {
  return readCompletionSet(localScope(GUEST_KEY));
}
export function addGuestCompletion(gameId: string): Promise<GuestSaveResult> {
  return saveCompletion(GUEST_KEY, gameId, [CHANGE_EVENT]);
}
export const GUEST_COMPLETIONS_STORAGE_KEY = GUEST_KEY;
export const GUEST_COMPLETIONS_EVENT = CHANGE_EVENT;
