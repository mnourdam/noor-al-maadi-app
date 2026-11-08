/** Request lifetime guard. No global exclusion, economic ordering or cancellation claim. */
import { getActiveOwner, getActiveUserId, getIdentityEpoch } from "./identity/owner";
export function accountOperation(userId: string | null, alive: () => boolean) {
  const owner = getActiveOwner(),
    epoch = getIdentityEpoch();
  return {
    owner,
    epoch,
    current: () =>
      alive() &&
      getActiveOwner() === owner &&
      getIdentityEpoch() === epoch &&
      (userId === null || getActiveUserId() === userId),
  };
}
