/** Dormant exact-source capability. No arbitrary key parameter, source mutation or SDK. */
import { GUEST_BUFFER_KEY } from "../guest-progress-buffer";
import { IDENTITY_DEVICE_ID_KEY, getActiveOwner, getIdentityEpoch } from "@/lib/identity/owner";
import { physicalKey } from "@/lib/identity/partition";
import { createHandoffFoundation } from "./journal";
import { addressKey, validateSnapshot } from "./codec";
import {
  equalIdentity,
  evidenceKey,
  validateAnchor,
  validateAuthProof,
} from "./transition-validation";
import type { Dependencies, Identity } from "./contract";
import type { AnchorPort, AuthTransitionAdapter, TransitionEvidence } from "./transition-contract";
function stop(reason: string): never {
  throw new Error(reason);
}
export function createExactSourceRecovery(d: {
  anchor: AnchorPort;
  foundation: Dependencies;
  auth: AuthTransitionAdapter;
}) {
  const source = Object.freeze({ ...d.anchor.address });
  if (
    source.sourceGuestOwner !== `guest:${source.deviceId}` ||
    source.physicalKey !== physicalKey(GUEST_BUFFER_KEY, source.sourceGuestOwner) ||
    source.schema !== "buffer-v1" ||
    source.generation !== 1
  )
    stop("source_conflict");
  const key = addressKey(source);
  // Only the captured address can ever reach this reader. No namespace or key arguments.
  const browser = () => {
    let store: Storage;
    try {
      store = window.localStorage;
    } catch {
      stop("source_unreadable");
    }
    const proto = Object.getPrototypeOf(store) as Storage & {
      __originalGetItem?: Storage["getItem"];
    };
    const get = proto?.__originalGetItem;
    if (!get || store.getItem === get) stop("partition_unavailable");
    const read = (address: string) => {
      try {
        return get.call(store, address);
      } catch {
        stop("source_unreadable");
      }
    };
    const check = () => {
      if (proto.__originalGetItem !== get || store.getItem === get) stop("partition_unavailable");
      if (read(IDENTITY_DEVICE_ID_KEY) !== source.deviceId) stop("source_conflict");
    };
    return {
      check,
      read: () => {
        check();
        const raw = read(source.physicalKey);
        if (raw === null) stop("source_missing");
        return raw;
      },
    };
  };
  return async function recoveredSnapshot<T>(
    input: TransitionEvidence,
    work: (raw: string) => Promise<T>,
  ): Promise<T> {
    // Capture caller DTO before any await; comparison is against the independent durable evidence.
    const e = JSON.parse(JSON.stringify(input)) as TransitionEvidence;
    if (addressKey(e.source) !== key) stop("source_conflict");
    const scope = { ...d.foundation.identity() };
    const check = () => {
      if (
        !equalIdentity(scope, d.foundation.identity()) ||
        scope.owner !== getActiveOwner() ||
        scope.epoch !== getIdentityEpoch()
      )
        stop("identity_changed");
    };
    let authorizedAttempt: string | null = null;
    const verify = async () => {
      check();
      const p = validateAuthProof(await d.auth.verify(e), e, d.foundation.identity());
      check();
      if (scope.owner !== `user:${p.uid}`) stop("identity_changed");
      if (authorizedAttempt !== null && authorizedAttempt !== p.attemptId) stop("auth_unverified");
      authorizedAttempt ??= p.attemptId;
      return p;
    };
    async function authorize() {
      check();
      const a = validateAnchor(await d.anchor.read(), source);
      check();
      if (
        !a.evidence ||
        evidenceKey(a.evidence) !== evidenceKey(e) ||
        !["captured", "auth_started", "target_claimed", "awaiting_consent"].includes(a.phase)
      )
        stop("anchor_evidence_conflict");
      const p = await verify();
      if (a.target && (a.target.uid !== p.uid || a.target.attemptId !== p.attemptId))
        stop("target_conflict");
      const f = createHandoffFoundation({
        ...d.foundation,
        verifyTarget: async (uid, transition) => {
          const p = await verify();
          if (p.uid !== uid || transition !== e.transitionId) stop("auth_unverified");
          return { uid, transitionId: transition };
        },
      });
      const h = await f.recover(e.handoffId, e.transitionId);
      check();
      if (
        h.sourceId !== e.sourceId ||
        h.sourceAddress !== key ||
        h.transitionId !== e.transitionId ||
        h.snapshotHash !== e.snapshotHash ||
        h.provenance !== e.provenance ||
        !equalIdentity(h.capturedIdentity, e.capturedIdentity)
      )
        stop("journal_conflict");
      if (h.target && (h.target.uid !== p.uid || !a.target)) stop("target_conflict");
      if (a.phase === "awaiting_consent" && h.target === null) stop("journal_conflict");
      if (h.consent !== null || !["awaiting_target", "awaiting_consent"].includes(h.phase))
        stop("journal_conflict");
      return h;
    }
    await authorize();
    check();
    if (!navigator.locks?.request) stop("coordination_unavailable");
    return await navigator.locks.request(
      `irth:guest-storage:${source.physicalKey}:write`,
      { mode: "exclusive" },
      async () => {
        check();
        const h = await authorize();
        check();
        const access = browser();
        access.check();
        const raw = access.read();
        validateSnapshot(raw);
        const unchanged = () => {
          check();
          access.check();
          if (access.read() !== raw) stop("snapshot_conflict");
        };
        const hash = await d.foundation.hash(raw);
        unchanged();
        if (hash !== e.snapshotHash || h.snapshot !== raw) stop("snapshot_conflict");
        await authorize();
        unchanged();
        const result = await work(raw);
        unchanged();
        await authorize();
        unchanged();
        return result;
      },
    );
  };
}
