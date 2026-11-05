// Actual coordinator/source adapter/foundation; synthetic auth + exact-source recovery capability.
import { createGuestTransitionCoordinator } from "@/lib/campaigns/guest-handoff/transition-coordinator";
import { createGuestSourceCapturePort } from "@/lib/campaigns/guest-handoff/source-adapter";
import { openHandoffJournal } from "@/lib/campaigns/guest-handoff/journal";
import {
  getActiveOwner,
  getIdentityEpoch,
  onOwnerChange,
  setActiveOwnerInternal,
  IDENTITY_DEVICE_ID_KEY,
} from "@/lib/identity/owner";
import { installIdentityPartition, physicalKey } from "@/lib/identity/partition";
import { GUEST_BUFFER_KEY } from "@/lib/campaigns/guest-progress-buffer";
import { addressKey } from "@/lib/campaigns/guest-handoff/codec";
import type {
  Anchor,
  AuthProof,
  TransitionDependencies,
  TransitionEvidence,
} from "@/lib/campaigns/guest-handoff/transition-contract";
const native = {
  get: Storage.prototype.getItem,
  set: Storage.prototype.setItem,
  remove: Storage.prototype.removeItem,
};
const read = (key: string) => native.get.call(localStorage, key),
  write = (key: string, value: string) => native.set.call(localStorage, key, value);
const device = "native-transition-device",
  guest = `guest:${device}`,
  physical = physicalKey(GUEST_BUFFER_KEY, guest);
const anchorKey = "test-only:transition-anchor",
  receiptKey = "test-only:auth-receipt",
  sessionKey = "test-only:auth-session",
  ownerKey = "test-only:owner";
const source = {
  deviceId: device,
  sourceGuestOwner: guest,
  physicalKey: physical,
  schema: "buffer-v1" as const,
  generation: 1 as const,
};
if (!read(IDENTITY_DEVICE_ID_KEY)) write(IDENTITY_DEVICE_ID_KEY, device);
setActiveOwnerInternal(read(ownerKey) ?? guest);
installIdentityPartition();
const instance = crypto.randomUUID(),
  identity = () => ({
    owner: getActiveOwner(),
    epoch: getIdentityEpoch(),
    contextId: instance,
    ready: true,
  });
const hash = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const snapshot =
  ' {"boundUid":null,"entries":{"c::a":{"campaignId":"c","chapterId":"a","status":"completed","bufferedAt":"2026-11-05T00:00:00Z","xpEarned":12}}} ';
const dbs: IDBDatabase[] = [];
let currentName = "native-transition";
function owner(next: string) {
  setActiveOwnerInternal(next);
  write(ownerKey, next);
}
const auth = {
  async authenticate(e: TransitionEvidence | null) {
    owner("user:alice");
    const attemptId = crypto.randomUUID();
    write(sessionKey, JSON.stringify({ uid: "alice", attemptId }));
    if (e) {
      const p: AuthProof = {
        transitionId: e.transitionId,
        attemptId,
        sourceOwner: e.source.sourceGuestOwner,
        sourceEpoch: e.capturedIdentity.epoch,
        sourceContextId: e.capturedIdentity.contextId,
        snapshotHash: e.snapshotHash,
        uid: "alice",
        sessionUid: "alice",
        switchedIdentity: identity(),
        currentIdentity: identity(),
        sessionContinuity: true,
      };
      write(receiptKey, JSON.stringify(p));
    }
  },
  async verify(e: TransitionEvidence): Promise<AuthProof | null> {
    const raw = read(receiptKey),
      sessionRaw = read(sessionKey);
    if (!raw || !sessionRaw) return null;
    const p = JSON.parse(raw) as AuthProof,
      s = JSON.parse(sessionRaw);
    if (
      p.transitionId !== e.transitionId ||
      s.uid !== p.uid ||
      s.attemptId !== p.attemptId ||
      getActiveOwner() !== `user:${s.uid}`
    )
      return null;
    return { ...p, currentIdentity: identity() };
  },
};
async function coordinator() {
  const db = await openHandoffJournal(indexedDB, `irth-guest-handoff-synthetic:${currentName}`);
  dbs.push(db);
  const d: TransitionDependencies = {
    foundation: {
      db,
      identity,
      subscribeInvalidation: (cb) => onOwnerChange(() => cb()),
      verifyTarget: async () => {
        throw Error("not a transition verifier");
      },
      hash,
      newId: () => crypto.randomUUID(),
      now: () => Date.now(),
    },
    source: createGuestSourceCapturePort,
    auth,
    anchor: {
      address: source,
      exclusive: (work) =>
        navigator.locks.request(`test-transition-anchor:${physical}`, { mode: "exclusive" }, work),
      read: async () => {
        const raw = read(anchorKey);
        return raw ? JSON.parse(raw) : null;
      },
      write: async (next, revision) => {
        const raw = read(anchorKey);
        if (!raw || JSON.parse(raw).revision !== revision) throw Error("anchor_revision_conflict");
        write(anchorKey, JSON.stringify(next));
      },
    },
    recoveredSnapshot: async (e, work) => {
      if (addressKey(e.source) !== addressKey(source)) throw Error("source_conflict");
      return navigator.locks.request(
        `irth:guest-storage:${physical}:write`,
        { mode: "exclusive" },
        () => {
          const raw = read(physical);
          if (raw === null) throw Error("not_found");
          return work(raw);
        },
      );
    },
  };
  return createGuestTransitionCoordinator(d);
}
Object.assign(window, {
  ready: true,
  api: {
    seed() {
      // Explicit one-time fixture enrollment. Coordinator NEVER creates this slot from absence.
      if (read(anchorKey) !== null) throw Error("fixture already enrolled");
      write(physical, snapshot);
      const a: Anchor = {
        schema: 1,
        address: addressKey(source),
        revision: 0,
        phase: "enrolled",
        evidence: null,
        target: null,
      };
      write(anchorKey, JSON.stringify(a));
    },
    snapshot,
    raw: () => read(physical),
    anchor: () => JSON.parse(read(anchorKey) ?? "null"),
    info: () => ({
      ...identity(),
      locks: typeof navigator.locks?.request === "function",
      secure: isSecureContext,
    }),
    async prepare() {
      return (await coordinator()).prepare("native-t").result;
    },
    async finishAuth() {
      const a = JSON.parse(read(anchorKey)!);
      await auth.authenticate(a.evidence);
    },
    async resume() {
      return (await coordinator()).resume("native-t").result;
    },
    async startDifferent() {
      return (await coordinator()).prepare("other-t").result;
    },
    manualOwner(next: string) {
      owner(next);
      write(sessionKey, JSON.stringify({ uid: next.slice(5), attemptId: crypto.randomUUID() }));
    },
    loseJournal() {
      currentName = "empty-replacement-for-test";
    },
    removeAnchor() {
      native.remove.call(localStorage, anchorKey);
    },
    close() {
      for (const db of dbs.splice(0)) db.close();
    },
  },
});
