/** Storage truth only. No profile grant, repair, migration or crash-delivery claim. */
import { getActiveOwner, getIdentityEpoch } from "@/lib/identity/owner";
import { physicalKey } from "@/lib/identity/partition";
export type GuestStorageReason =
  | "not_guest"
  | "identity_changed"
  | "partition_unavailable"
  | "read_failed"
  | "corrupt"
  | "write_failed"
  | "coordination_unavailable"
  | "invalid_input";
export class GuestStorageError extends Error {
  constructor(public reason: GuestStorageReason) {
    super(`guest-storage:${reason}`);
  }
}
export type GuestSaveResult =
  | { saved: true; firstTime: boolean }
  | { saved: false; firstTime: false; reason: GuestStorageReason };
export function storageReason(error: unknown): GuestStorageReason {
  return error instanceof GuestStorageError ? error.reason : "write_failed";
}
export function localScope(logical: string, guestOnly = true) {
  const owner = getActiveOwner(),
    epoch = getIdentityEpoch();
  const check = () => {
    if (getActiveOwner() !== owner || getIdentityEpoch() !== epoch)
      throw new GuestStorageError("identity_changed");
    if (guestOnly && !owner.startsWith("guest:")) throw new GuestStorageError("not_guest");
  };
  check();
  let store: Storage;
  try {
    store = window.localStorage;
  } catch {
    throw new GuestStorageError("read_failed");
  }
  // Existing partition is required; never reinterpret legacy/unpartitioned data here.
  const prototype = Object.getPrototypeOf(store);
  if (
    typeof prototype?.__originalGetItem !== "function" ||
    store.getItem === prototype.__originalGetItem
  )
    throw new GuestStorageError("partition_unavailable");
  const address = physicalKey(logical, owner);
  return {
    owner,
    epoch,
    address,
    check,
    read(): string | null {
      check();
      let raw: string | null;
      try {
        raw = store.getItem(address);
      } catch {
        throw new GuestStorageError("read_failed");
      }
      check();
      return raw;
    },
    write(raw: string) {
      check();
      try {
        store.setItem(address, raw);
      } catch {
        throw new GuestStorageError("write_failed");
      }
      check();
    },
    remove() {
      check();
      try {
        store.removeItem(address);
      } catch {
        throw new GuestStorageError("write_failed");
      }
      check();
    },
  };
}
export type LocalScope = ReturnType<typeof localScope>;
export async function withStorageLock<T>(
  scope: LocalScope,
  work: () => T,
  suffix = "write",
): Promise<T> {
  scope.check();
  if (typeof navigator === "undefined" || !navigator.locks?.request)
    throw new GuestStorageError("coordination_unavailable");
  return navigator.locks.request(
    `irth:guest-storage:${scope.address}:${suffix}`,
    { mode: "exclusive" },
    () => {
      scope.check();
      return work();
    },
  );
}
export function readCompletionSet(scope: LocalScope): Set<string> {
  const raw = scope.read();
  if (raw === null) return new Set();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new GuestStorageError("corrupt");
  }
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id.length))
    throw new GuestStorageError("corrupt");
  return new Set(value);
}
export async function saveCompletion(
  key: string,
  id: string,
  events: string[],
): Promise<GuestSaveResult> {
  if (typeof id !== "string" || !id.length)
    return { saved: false, firstTime: false, reason: "invalid_input" };
  try {
    const scope = localScope(key);
    return await withStorageLock(scope, () => {
      const prior = readCompletionSet(scope);
      if (prior.has(id)) return { saved: true, firstTime: false } as const;
      prior.add(id);
      scope.write(JSON.stringify([...prior]));
      for (const event of events) {
        scope.check();
        try {
          window.dispatchEvent(
            new CustomEvent(event, { detail: { storyId: id, gameId: id, owner: scope.owner } }),
          );
        } catch {
          /* notification failure does not undo the successful write */
        }
      }
      scope.check();
      return { saved: true, firstTime: true } as const;
    });
  } catch (error) {
    return { saved: false, firstTime: false, reason: storageReason(error) };
  }
}
