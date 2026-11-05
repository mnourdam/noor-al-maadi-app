import {
  createDurableAnchorPort,
  enrollSyntheticAnchor,
} from "@/lib/campaigns/guest-handoff/anchor-adapter";
import { createExactSourceRecovery } from "@/lib/campaigns/guest-handoff/recovery-adapter";
import { bufferChapterProgress } from "@/lib/campaigns/guest-progress-buffer";
// Actual new anchor/recovery adapters and coordinator; only Auth Adapter/provisioning are synthetic.
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
const namespace = "irth-guest-handoff-synthetic:anchor-recovery-native";
const anchorKey = `test-only:guest-handoff-anchor:${encodeURIComponent(namespace)}:${encodeURIComponent(device)}`,
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
  const db = await openHandoffJournal(indexedDB, namespace);
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
    anchor: createDurableAnchorPort(namespace),
    recoveredSnapshot: async () => {
      throw Error("not configured");
    },
  };
  d.recoveredSnapshot = createExactSourceRecovery(d);
  return { c: createGuestTransitionCoordinator(d), d, db };
}
const result = (p: Promise<any>) =>
  p.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, reason: error.reason ?? error.message }),
  );
let held = false,
  release: () => void = () => {},
  pending: Promise<any> | null = null,
  writerDone = false,
  writer: Promise<any> | null = null,
  backup: any;
Object.assign(window, {
  ready: true,
  api: {
    async seed() {
      // Called explicitly once by the harness that created this fresh temporary browser profile.
      write(physical, snapshot);
      await enrollSyntheticAnchor(createDurableAnchorPort(namespace), {
        consumeFreshFixtureGrant: async (source, ns) => {
          if (read("test-only:fixture-enrollment-consumed"))
            throw Error("enrollment_grant_consumed");
          write("test-only:fixture-enrollment-consumed", "yes");
          return {
            kind: "isolated_synthetic_fixture",
            receiptId: "fresh-temporary-profile-authority",
            sourceAddress: addressKey(source),
            namespace: ns,
          };
        },
      });
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
      return (await coordinator()).c.prepare("native-t").result;
    },
    async finishAuth() {
      const a = JSON.parse(read(anchorKey)!);
      await auth.authenticate(a.evidence);
    },
    async resume() {
      return (await coordinator()).c.resume("native-t").result;
    },
    async startDifferent() {
      return (await coordinator()).c.prepare("other-t").result;
    },
    manualOwner(next: string) {
      owner(next);
      write(sessionKey, JSON.stringify({ uid: next.slice(5), attemptId: crypto.randomUUID() }));
    },
    async loseJournal() {
      const { db } = await coordinator();
      const a = JSON.parse(read(anchorKey)!);
      await new Promise<void>((resolve) => {
        const tx = db.transaction("handoffs", "readwrite");
        tx.objectStore("handoffs").delete(a.evidence.handoffId);
        tx.oncomplete = () => resolve();
      });
    },
    removeAnchor() {
      native.remove.call(localStorage, anchorKey);
    },
    restoreAnchor(raw: string) {
      write(anchorKey, raw);
    },
    anchorBytes: () => read(anchorKey),
    async exact() {
      const { d } = await coordinator();
      const a = (await d.anchor.read()) as Anchor;
      return result(d.recoveredSnapshot(a.evidence!, async (raw) => raw));
    },
    async forged() {
      const { d } = await coordinator();
      const a = (await d.anchor.read()) as Anchor;
      const e = structuredClone(a.evidence!);
      e.source.physicalKey = physicalKey(GUEST_BUFFER_KEY, "guest:foreign");
      return result(d.recoveredSnapshot(e, async () => true));
    },
    async startHold() {
      const { d } = await coordinator();
      const a = (await d.anchor.read()) as Anchor;
      held = false;
      const gate = new Promise<void>((r) => (release = r));
      pending = result(
        d.recoveredSnapshot(a.evidence!, async (raw) => {
          held = true;
          await gate;
          return raw;
        }),
      );
    },
    held: () => held,
    release() {
      release();
    },
    finish: () => pending,
    startWriter() {
      setActiveOwnerInternal(guest);
      writerDone = false;
      writer = bufferChapterProgress({
        campaignId: "c",
        chapterId: "writer",
        status: "completed",
      }).then((v) => {
        writerDone = true;
        return v;
      });
    },
    writerDone: () => writerDone,
    writerResult: () => writer,
    seedSource(raw = snapshot) {
      write(physical, raw);
    },
    async bump(expected: number, bob = false) {
      const { d } = await coordinator();
      const a = (await d.anchor.read()) as Anchor;
      return result(
        d.anchor.exclusive(() =>
          d.anchor.write(
            {
              ...a,
              target: bob ? { uid: "bob", attemptId: "b" } : a.target,
              revision: expected + 1,
            },
            expected,
          ),
        ),
      );
    },
    async corruptJournal() {
      const { db } = await coordinator();
      await new Promise<void>((resolve) => {
        const tx = db.transaction("handoffs", "readwrite"),
          store = tx.objectStore("handoffs"),
          r = store.get(JSON.parse(read(anchorKey)!).evidence.handoffId);
        r.onsuccess = () => {
          backup = r.result;
          store.put({ ...r.result, snapshotHash: "corrupt" });
        };
        tx.oncomplete = () => resolve();
      });
    },
    async restoreJournal() {
      const { db } = await coordinator();
      await new Promise<void>((resolve) => {
        const tx = db.transaction("handoffs", "readwrite");
        tx.objectStore("handoffs").put(backup);
        tx.oncomplete = () => resolve();
      });
    },
    close() {
      for (const db of dbs.splice(0)) db.close();
    },
  },
});
