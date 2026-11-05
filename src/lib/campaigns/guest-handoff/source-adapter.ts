/** Explicit, read-only adapter. No boot/auth hooks, migrations or production journal. */
import { GUEST_BUFFER_KEY } from "../guest-progress-buffer";
import { localScope, withStorageLock, GuestStorageError } from "@/lib/guest/storage";
import { IDENTITY_DEVICE_ID_KEY } from "@/lib/identity/owner";
import { validateSnapshot } from "./codec";
import { HandoffError, type GuestCapturePort } from "./contract";

/** Call only while the original Guest is active and Partition is already installed.
 * buffer-v1 has no historical provenance marker: capture now never authenticates its history. */
export function createGuestSourceCapturePort(): GuestCapturePort {
  let store: Storage;
  try {
    store = window.localStorage;
  } catch {
    throw new GuestStorageError("read_failed");
  }
  const prototype = Object.getPrototypeOf(store) as Storage & {
    __originalGetItem?: Storage["getItem"];
  };
  const original = prototype?.__originalGetItem;
  if (typeof original !== "function" || store.getItem === original)
    throw new GuestStorageError("partition_unavailable");
  const read = (key: string) => {
    try {
      return original.call(store, key);
    } catch {
      throw new GuestStorageError("read_failed");
    }
  };
  // Read the persisted global key directly BEFORE any owner helper could resolve boot identity.
  // Never call getDeviceId/guestOwnerKey or installIdentityPartition here.
  const deviceId = read(IDENTITY_DEVICE_ID_KEY);
  if (!deviceId) throw new HandoffError("source_conflict");
  const scope = localScope(GUEST_BUFFER_KEY);
  if (scope.owner !== `guest:${deviceId}`) throw new HandoffError("source_conflict");
  const check = () => {
    scope.check();
    if (prototype.__originalGetItem !== original || store.getItem === original)
      throw new GuestStorageError("partition_unavailable");
    if (read(IDENTITY_DEVICE_ID_KEY) !== deviceId) throw new HandoffError("source_conflict");
    scope.check();
  };
  return Object.freeze({
    address: Object.freeze({
      deviceId,
      sourceGuestOwner: scope.owner,
      physicalKey: scope.address,
      schema: "buffer-v1" as const,
      generation: 1 as const,
    }),
    persistedDeviceId: deviceId,
    provenance: "legacy_captured_now" as const,
    async withSnapshot<T>(work: (raw: string) => Promise<T>): Promise<T> {
      check();
      return withStorageLock(scope, async () => {
        check();
        const raw = read(scope.address);
        check();
        if (raw === null) throw new HandoffError("not_found");
        validateSnapshot(raw);
        const result = await work(raw);
        check();
        return result;
      });
    },
  });
}
