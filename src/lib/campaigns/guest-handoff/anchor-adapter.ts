/** Dormant browser adapter. Synthetic namespace only; never enroll from missing storage. */
import { GUEST_BUFFER_KEY } from "../guest-progress-buffer";
import { IDENTITY_DEVICE_ID_KEY, getActiveOwner, getIdentityEpoch } from "@/lib/identity/owner";
import { physicalKey } from "@/lib/identity/partition";
import { addressKey, text } from "./codec";
import { evidenceKey, validateAnchor } from "./transition-validation";
import type { SourceAddress } from "./contract";
import type { Anchor, AnchorPort } from "./transition-contract";
function stop(reason: string): never {
  throw new Error(reason);
}
interface PrivatePort {
  namespace: string;
  key: string;
  readRaw(): string | null;
  writeRaw(raw: string): void;
  check(): void;
}
const internals = new WeakMap<AnchorPort, PrivatePort>();
const phaseOrder = [
  "enrolled",
  "prepared",
  "captured",
  "auth_started",
  "target_claimed",
  "awaiting_consent",
];
export function createDurableAnchorPort(namespace: string): AnchorPort {
  if (
    !namespace.startsWith("irth-guest-handoff-synthetic:") ||
    namespace.length <= "irth-guest-handoff-synthetic:".length
  )
    stop("synthetic_namespace_required");
  let store: Storage;
  try {
    store = window.localStorage;
  } catch {
    stop("anchor_unreadable");
  }
  const proto = Object.getPrototypeOf(store) as Storage & {
    __originalGetItem?: Storage["getItem"];
    __originalSetItem?: Storage["setItem"];
  };
  const get = proto?.__originalGetItem,
    set = proto?.__originalSetItem;
  if (!get || !set || store.getItem === get) stop("partition_unavailable");
  function read(key: string): string | null {
    try {
      return get!.call(store, key);
    } catch {
      stop("anchor_unreadable");
    }
  }
  const deviceId = read(IDENTITY_DEVICE_ID_KEY);
  if (!text(deviceId)) stop("source_conflict");
  const source: SourceAddress = Object.freeze({
    deviceId,
    sourceGuestOwner: `guest:${deviceId}`,
    physicalKey: physicalKey(GUEST_BUFFER_KEY, `guest:${deviceId}`),
    schema: "buffer-v1",
    generation: 1,
  });
  const key = `test-only:guest-handoff-anchor:${encodeURIComponent(namespace)}:${encodeURIComponent(deviceId)}`;
  const check = () => {
    if (proto.__originalGetItem !== get || proto.__originalSetItem !== set || store.getItem === get)
      stop("partition_unavailable");
    if (read(IDENTITY_DEVICE_ID_KEY) !== deviceId) stop("source_conflict");
  };
  const readRaw = () => {
    check();
    return read(key);
  };
  const row = (raw: string | null) => {
    if (raw === null) stop("anchor_missing");
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      stop("anchor_corrupt");
    }
    return validateAnchor(value, source);
  };
  const writeRaw = (value: string) => {
    check();
    try {
      set.call(store, key, value);
    } catch {
      stop("anchor_write_unresolved");
    }
    // Verification only. Never rollback or overwrite the value that caused a mismatch.
    check();
    if (read(key) !== value) stop("anchor_write_unresolved");
  };
  let held = false,
    scope: { owner: string; epoch: number } | null = null;
  const guard = () => {
    check();
    if (!held || !scope) stop("anchor_lock_required");
    if (scope.owner !== getActiveOwner() || scope.epoch !== getIdentityEpoch())
      stop("identity_changed");
  };
  const port: AnchorPort = {
    address: source,
    async exclusive<T>(work: () => Promise<T>): Promise<T> {
      check();
      const owner = getActiveOwner(),
        epoch = getIdentityEpoch();
      if (!navigator.locks?.request) stop("coordination_unavailable");
      return await navigator.locks.request(
        `irth:guest-handoff-anchor:${key}`,
        { mode: "exclusive" },
        async () => {
          if (owner !== getActiveOwner() || epoch !== getIdentityEpoch()) stop("identity_changed");
          check();
          held = true;
          scope = { owner, epoch };
          try {
            return await work();
          } finally {
            held = false;
            scope = null;
          }
        },
      );
    },
    async read() {
      return row(readRaw());
    },
    async write(next, expectedRevision) {
      guard();
      const current = row(readRaw());
      const proposed = validateAnchor(JSON.parse(JSON.stringify(next)), source);
      if (
        !Number.isSafeInteger(expectedRevision) ||
        !Number.isSafeInteger(expectedRevision + 1) ||
        proposed.revision !== expectedRevision + 1
      )
        stop("anchor_revision_conflict");
      // Lost acknowledgment replay: read-only success, no second write/revision.
      if (
        current.revision === proposed.revision &&
        JSON.stringify(current) === JSON.stringify(proposed)
      )
        return;
      if (current.revision !== expectedRevision) stop("anchor_revision_conflict");
      if (
        current.evidence &&
        (!proposed.evidence || evidenceKey(current.evidence) !== evidenceKey(proposed.evidence))
      )
        stop("anchor_evidence_conflict");
      if (
        current.target &&
        (!proposed.target ||
          current.target.uid !== proposed.target.uid ||
          current.target.attemptId !== proposed.target.attemptId)
      )
        stop("target_conflict");
      const old = phaseOrder.indexOf(current.phase),
        fresh = phaseOrder.indexOf(proposed.phase);
      if (
        fresh < old ||
        (fresh > old + 1 && !(current.phase === "captured" && proposed.phase === "target_claimed"))
      )
        stop("anchor_phase_conflict");
      guard();
      writeRaw(JSON.stringify(proposed));
      guard();
    },
  };
  internals.set(port, { namespace, key, readRaw, writeRaw, check });
  return Object.freeze(port);
}
/** Deliberately separate positive authority. No production enrollment policy is implemented. */
export interface SyntheticEnrollmentAuthority {
  /** Trusted authority consumes a one-use grant for a positively known fresh synthetic fixture.
   * It MUST NOT infer freshness from missing anchor/journal keys. No default authority exists. */
  consumeFreshFixtureGrant(
    source: SourceAddress,
    namespace: string,
  ): Promise<{
    kind: "isolated_synthetic_fixture";
    receiptId: string;
    sourceAddress: string;
    namespace: string;
  }>;
}
export async function enrollSyntheticAnchor(
  port: AnchorPort,
  authority: SyntheticEnrollmentAuthority,
): Promise<void> {
  const p = internals.get(port);
  if (!p) stop("unknown_anchor_port");
  const owner = getActiveOwner(),
    epoch = getIdentityEpoch();
  if (owner !== port.address.sourceGuestOwner) stop("not_guest");
  await port.exclusive(async () => {
    p.check();
    if (p.readRaw() !== null) stop("anchor_already_exists");
    const proof = await authority.consumeFreshFixtureGrant(port.address, p.namespace);
    if (getActiveOwner() !== owner || getIdentityEpoch() !== epoch) stop("identity_changed");
    if (
      proof.kind !== "isolated_synthetic_fixture" ||
      !text(proof.receiptId) ||
      proof.sourceAddress !== addressKey(port.address) ||
      proof.namespace !== p.namespace
    )
      stop("positive_enrollment_required");
    p.check();
    if (p.readRaw() !== null) stop("anchor_already_exists");
    const initial: Anchor = {
      schema: 1,
      address: addressKey(port.address),
      revision: 0,
      phase: "enrolled",
      evidence: null,
      target: null,
    };
    p.writeRaw(JSON.stringify(initial));
  });
}
