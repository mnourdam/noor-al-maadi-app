// Synthetic local-origin fixture. Same source adapter/Partition/buffer/journal as application.
import { createGuestSourceCapturePort } from "@/lib/campaigns/guest-handoff/source-adapter";
import { createHandoffFoundation, openHandoffJournal } from "@/lib/campaigns/guest-handoff/journal";
import { GUEST_BUFFER_KEY, bufferChapterProgress } from "@/lib/campaigns/guest-progress-buffer";
import {
  getActiveOwner,
  getIdentityEpoch,
  onOwnerChange,
  setActiveOwnerInternal,
  IDENTITY_DEVICE_ID_KEY,
} from "@/lib/identity/owner";
import { installIdentityPartition, physicalKey } from "@/lib/identity/partition";
const methods = {
  get: Storage.prototype.getItem,
  set: Storage.prototype.setItem,
  remove: Storage.prototype.removeItem,
};
const device = "native-source-test",
  guest = `guest:${device}`,
  address = physicalKey(GUEST_BUFFER_KEY, guest);
if (!methods.get.call(localStorage, IDENTITY_DEVICE_ID_KEY))
  methods.set.call(localStorage, IDENTITY_DEVICE_ID_KEY, device);
setActiveOwnerInternal(guest);
installIdentityPartition();
const sample =
  ' {"boundUid":null,"entries":{"native::chapter":{"campaignId":"native","chapterId":"chapter","status":"completed","bufferedAt":"2026-11-05T00:00:00Z","xpEarned":7,"coinsEarned":2}}} ';
const nativeLocks = navigator.locks,
  instance = crypto.randomUUID();
let release: () => void = () => {},
  held = false,
  pending: Promise<any> | null = null,
  writerDone = false,
  writer: Promise<any> | null = null;
let releaseHash: () => void = () => {},
  hashEntered = false,
  hashGate: Promise<void> | null = null;
const dbs: IDBDatabase[] = [];
const raw = () => methods.get.call(localStorage, address);
async function foundation(name: string) {
  const db = await openHandoffJournal(indexedDB, `irth-guest-handoff-synthetic:${name}`);
  dbs.push(db);
  return createHandoffFoundation({
    db,
    identity: () => ({
      owner: getActiveOwner(),
      epoch: getIdentityEpoch(),
      contextId: instance,
      ready: true,
    }),
    subscribeInvalidation: (cb) => onOwnerChange(() => cb()),
    verifyTarget: async () => {
      throw Error("no target/RPC allowed");
    },
    hash: async (s) => {
      hashEntered = true;
      if (hashGate) await hashGate;
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
    },
    newId: () => crypto.randomUUID(),
    now: () => Date.now(),
  });
}
const result = (p: Promise<any>) =>
  p.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, reason: error.reason ?? error.message }),
  );
const api = {
  sample,
  address,
  guest,
  device,
  seed(value = sample) {
    methods.set.call(localStorage, address, value);
  },
  raw,
  globalSeed(value: string) {
    methods.set.call(localStorage, GUEST_BUFFER_KEY, value);
  },
  globalRaw() {
    return methods.get.call(localStorage, GUEST_BUFFER_KEY);
  },
  removeGlobal() {
    methods.remove.call(localStorage, GUEST_BUFFER_KEY);
  },
  owner(next: string) {
    setActiveOwnerInternal(next);
  },
  info() {
    return {
      owner: getActiveOwner(),
      epoch: getIdentityEpoch(),
      secure: isSecureContext,
      locks: typeof navigator.locks?.request === "function",
      id: methods.get.call(localStorage, IDENTITY_DEVICE_ID_KEY),
    };
  },
  async capture(name = "native") {
    const f = await foundation(name);
    return result(f.capture(createGuestSourceCapturePort(), "native-transition"));
  },
  async recover(id: string, name = "native") {
    return result((await foundation(name)).recover(id, null));
  },
  async startCapture(name = "race") {
    held = false;
    const f = await foundation(name);
    pending = result(f.capture(createGuestSourceCapturePort(), "native-transition"));
  },
  finish() {
    return pending;
  },
  startHold(fail = false) {
    held = false;
    const wait = new Promise<void>((r) => (release = r));
    pending = result(
      createGuestSourceCapturePort().withSnapshot(async (snapshot) => {
        held = true;
        await wait;
        if (fail) throw Error("injected callback failure");
        return snapshot;
      }),
    );
  },
  held() {
    return held;
  },
  release() {
    release();
  },
  startWriter() {
    writerDone = false;
    writer = bufferChapterProgress({
      campaignId: "native",
      chapterId: "writer",
      status: "completed",
    }).then((v) => {
      writerDone = true;
      return v;
    });
  },
  writerDone() {
    return writerDone;
  },
  writerResult() {
    return writer;
  },
  gateHash() {
    hashEntered = false;
    hashGate = new Promise<void>((r) => (releaseHash = r));
  },
  hashEntered() {
    return hashEntered;
  },
  releaseHash() {
    hashGate = null;
    releaseHash();
  },
  locks(enabled: boolean) {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: enabled ? nativeLocks : undefined,
    });
  },
  async read() {
    return result(createGuestSourceCapturePort().withSnapshot(async (snapshot) => snapshot));
  },
  removeSource() {
    methods.remove.call(localStorage, address);
  },
  close() {
    for (const db of dbs.splice(0)) db.close();
  },
};
Object.assign(window, { api, ready: true });
