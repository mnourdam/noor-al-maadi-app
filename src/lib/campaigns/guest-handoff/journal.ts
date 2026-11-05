import {
  fail,
  HandoffError,
  type Dependencies,
  type GuestCapturePort,
  type Handoff,
  type Identity,
  type Source,
} from "./contract";
import { addressKey, handoffRow, sourceRow, text, validIdentity, validateSnapshot } from "./codec";

/** Explicit factory/name only; importing this module never opens storage or installs hooks.
 * Until integration is approved, only isolated synthetic databases may be supplied. */
export function openHandoffJournal(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  if (!name.startsWith("irth-guest-handoff-synthetic:")) fail("invalid_input");
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    let abandoned = false;
    request.onblocked = () => {
      abandoned = true;
      reject(new HandoffError("storage_unresolved"));
    };
    request.onerror = () => reject(new HandoffError("storage_unresolved"));
    request.onupgradeneeded = () => {
      if (abandoned) {
        request.transaction?.abort();
        return;
      }
      const sources = request.result.createObjectStore("sources", { keyPath: "sourceId" });
      sources.createIndex("address", "address", { unique: true });
      const handoffs = request.result.createObjectStore("handoffs", { keyPath: "id" });
      handoffs.createIndex("sourceAddress", "sourceAddress", { unique: true });
    };
    request.onsuccess = () => {
      if (abandoned) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
export function createHandoffFoundation(d: Dependencies) {
  const identity = () => {
    const s = { ...d.identity() };
    if (!validIdentity(s)) fail("identity_changed");
    return s;
  };
  const check = (s: Identity) => {
    const n = d.identity();
    if (!n.ready || n.owner !== s.owner || n.epoch !== s.epoch || n.contextId !== s.contextId)
      fail("identity_changed");
  };
  const id = () => {
    const n = d.newId();
    if (!text(n)) fail("invalid_input");
    return n;
  };
  const attempt = (s: Identity, action: Handoff["attempts"][number]["action"]) => ({
    id: id(),
    action,
    owner: s.owner,
    epoch: s.epoch,
    contextId: s.contextId,
    at: d.now(),
  });
  // No awaits inside a live IDB transaction. Read/validate/CAS/write use one transaction.
  function transaction<T>(
    s: Identity,
    work: (tx: IDBTransaction, done: (v: T) => void, guard: () => void) => void,
  ): Promise<T> {
    check(s);
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = d.db.transaction(["sources", "handoffs"], "readwrite");
      } catch {
        reject(new HandoffError("storage_unresolved"));
        return;
      }
      let result: T,
        completed = false,
        error: unknown;
      const abort = (e: unknown) => {
        error = e;
        try {
          tx.abort();
        } catch {
          /* already committed: caller must recover */
        }
      };
      const guard = () => check(s);
      const unsubscribe = d.subscribeInvalidation(() => {
        try {
          guard();
        } catch (e) {
          abort(e);
        }
      });
      tx.onabort = () => {
        unsubscribe();
        reject(
          (error ?? errors.get(tx)) instanceof HandoffError
            ? (error ?? errors.get(tx))
            : new HandoffError("storage_unresolved"),
        );
      };
      tx.oncomplete = () => {
        unsubscribe();
        try {
          guard();
          if (!completed) fail("storage_unresolved");
          resolve(result);
        } catch (e) {
          reject(e);
        }
      };
      const protect = (fn: () => void) => {
        try {
          guard();
          fn();
        } catch (e) {
          abort(e);
        }
      };
      // Every request callback must validate the original scope before any follow-up read/write.
      try {
        protect(() =>
          work(
            tx,
            (v) => {
              guard();
              result = v;
              completed = true;
            },
            guard,
          ),
        );
      } catch (e) {
        abort(e);
      }
    });
  }
  function on<T>(
    request: IDBRequest<T>,
    tx: IDBTransaction,
    guard: () => void,
    work: (v: T) => void,
  ) {
    request.onsuccess = () => {
      try {
        guard();
        work(request.result);
      } catch (e) {
        errors.set(tx, e);
        tx.abort();
      }
    };
  }
  // Propagate domain errors from asynchronous request callbacks through transaction abort.
  const errors = new WeakMap<IDBTransaction, unknown>();
  const run = transaction;
  function pair(
    tx: IDBTransaction,
    handoffId: string,
    guard: () => void,
    done: (h: Handoff, source: Source) => void,
  ) {
    on(tx.objectStore("handoffs").get(handoffId), tx, guard, (raw) => {
      if (raw === undefined) fail("not_found");
      const h = handoffRow(raw);
      on(tx.objectStore("sources").get(h.sourceId), tx, guard, (value) => {
        const source = sourceRow(value);
        if (
          source.handoffId !== h.id ||
          source.sourceId !== h.sourceId ||
          source.address !== h.sourceAddress ||
          source.sourceGuestOwner !== h.capturedIdentity.owner ||
          source.boundUid !== (h.target?.uid ?? null)
        )
          fail("corrupt");
        done(h, source);
      });
    });
  }
  async function load(s: Identity, handoffId: string) {
    const h = await run<Handoff>(s, (tx, done, guard) =>
      pair(tx, handoffId, guard, (h) => done(h)),
    );
    const hash = await d.hash(h.snapshot);
    check(s);
    if (hash !== h.snapshotHash) fail("corrupt");
    return h;
  }
  function sameSnapshot(current: Handoff, prior: Handoff) {
    if (
      current.snapshot !== prior.snapshot ||
      current.snapshotHash !== prior.snapshotHash ||
      current.sourceId !== prior.sourceId ||
      current.sourceAddress !== prior.sourceAddress
    )
      fail("corrupt");
  }
  async function verified(s: Identity, uid: string, transition: string | null) {
    if (!text(uid) || s.owner !== `user:${uid}`) fail("identity_changed");
    const proof = await d.verifyTarget(uid, transition);
    check(s);
    if (proof.uid !== uid || proof.transitionId !== transition) fail("transition_conflict");
  }
  return {
    async capture(
      port: GuestCapturePort,
      transitionId: string,
      reserved?: { sourceId: string; handoffId: string },
    ): Promise<Handoff> {
      if (
        reserved &&
        (!text(reserved.sourceId) ||
          !text(reserved.handoffId) ||
          reserved.sourceId === reserved.handoffId)
      )
        fail("invalid_input");
      reserved = reserved ? { ...reserved } : undefined;
      const s = identity();
      const a = { ...port.address };
      const address = addressKey(a);
      if (s.owner !== a.sourceGuestOwner || port.persistedDeviceId !== a.deviceId)
        fail("source_conflict");
      if (port.provenance === "legacy_unknown") fail("legacy_unknown");
      if (
        !["captured_active_guest", "legacy_captured_now"].includes(port.provenance) ||
        !text(transitionId)
      )
        fail("invalid_input");
      const provenance = port.provenance;
      return port.withSnapshot(async (raw) => {
        check(s);
        validateSnapshot(raw);
        const snapshotHash = await d.hash(raw);
        check(s);
        if (!text(snapshotHash)) fail("invalid_input");
        return run<Handoff>(s, (tx, done, guard) => {
          on(tx.objectStore("sources").index("address").get(address), tx, guard, (value) => {
            if (value !== undefined) {
              const existing = sourceRow(value);
              if (existing.boundUid !== null) fail("target_conflict");
              pair(tx, existing.handoffId, guard, (h) => {
                if (h.transitionId !== transitionId) fail("transition_conflict");
                if (reserved && (h.id !== reserved.handoffId || h.sourceId !== reserved.sourceId))
                  fail("source_conflict");
                if (h.snapshotHash !== snapshotHash || h.snapshot !== raw)
                  fail("snapshot_conflict");
                if (h.phase !== "awaiting_target") fail("invalid_state");
                h.attempts.push(attempt(s, "capture"));
                h.revision++;
                tx.objectStore("handoffs").put(h);
                done(h);
              });
              return;
            }
            on(
              tx.objectStore("handoffs").index("sourceAddress").get(address),
              tx,
              guard,
              (orphan) => {
                if (orphan !== undefined) fail("corrupt");
                const sourceId = reserved?.sourceId ?? id(),
                  handoffId = reserved?.handoffId ?? id();
                const source: Source = {
                  ...a,
                  schemaVersion: 1,
                  sourceId,
                  address,
                  handoffId,
                  boundUid: null,
                };
                const h: Handoff = {
                  schemaVersion: 1,
                  id: handoffId,
                  sourceId,
                  sourceAddress: address,
                  transitionId,
                  snapshot: raw,
                  snapshotHash,
                  provenance,
                  capturedIdentity: s,
                  target: null,
                  consent: null,
                  phase: "awaiting_target",
                  blockedReason: null,
                  revision: 0,
                  attempts: [attempt(s, "capture")],
                  mode: "foundation_only",
                };
                tx.objectStore("sources").add(source);
                tx.objectStore("handoffs").add(h);
                done(h);
              },
            );
          });
        });
      });
    },
    async bind(
      handoffId: string,
      expectedRevision: number,
      uid: string,
      transitionId: string,
    ): Promise<Handoff> {
      const s = identity();
      await verified(s, uid, transitionId);
      const prior = await load(s, handoffId);
      return run<Handoff>(s, (tx, done, guard) =>
        pair(tx, handoffId, guard, (h, source) => {
          sameSnapshot(h, prior);
          if (h.transitionId !== transitionId) fail("transition_conflict");
          if (source.boundUid !== null && source.boundUid !== uid) fail("target_conflict");
          if (h.revision !== expectedRevision) fail("revision_conflict");
          if (!["awaiting_target", "awaiting_consent"].includes(h.phase)) fail("invalid_state");
          source.boundUid = uid;
          h.target ??= { uid, verifiedAt: d.now() };
          h.phase = "awaiting_consent";
          h.revision++;
          h.attempts.push(attempt(s, "bind"));
          tx.objectStore("sources").put(source);
          tx.objectStore("handoffs").put(h);
          done(h);
        }),
      );
    },
    async recover(handoffId: string, transitionId: string | null): Promise<Handoff> {
      const s = identity();
      // A fresh user verification is required even after a restart. Stored epochs are not authority.
      if (s.owner.startsWith("user:")) await verified(s, s.owner.slice(5), transitionId);
      const prior = await load(s, handoffId);
      return run<Handoff>(s, (tx, done, guard) =>
        pair(tx, handoffId, guard, (h, source) => {
          sameSnapshot(h, prior);
          if (source.boundUid !== null) {
            if (s.owner !== `user:${source.boundUid}`) fail("identity_changed");
          } else if (
            s.owner !== source.sourceGuestOwner &&
            (!s.owner.startsWith("user:") || h.transitionId !== transitionId)
          )
            fail("transition_conflict");
          done(h);
        }),
      );
    },
    async decide(
      handoffId: string,
      expectedRevision: number,
      snapshotHash: string,
      decision: "approve" | "decline" | "cancel" | "block",
    ): Promise<Handoff> {
      const s = identity();
      if (!["approve", "decline", "cancel", "block"].includes(decision)) fail("invalid_input");
      await verified(s, s.owner.startsWith("user:") ? s.owner.slice(5) : "", null);
      const prior = await load(s, handoffId);
      return run<Handoff>(s, (tx, done, guard) =>
        pair(tx, handoffId, guard, (h, source) => {
          sameSnapshot(h, prior);
          if (source.boundUid === null || s.owner !== `user:${source.boundUid}`)
            fail("identity_changed");
          if (h.revision !== expectedRevision) fail("revision_conflict");
          if (h.snapshotHash !== snapshotHash) fail("snapshot_conflict");
          if (h.phase !== "awaiting_consent" && !(h.phase === "approved" && decision === "cancel"))
            fail("invalid_state");
          h.phase = {
            approve: "approved",
            decline: "declined",
            cancel: "cancelled",
            block: "blocked",
          }[decision] as Handoff["phase"];
          if (decision === "approve" || decision === "decline")
            h.consent = { uid: source.boundUid, snapshotHash, policyVersion: 1, decision };
          if (decision === "block") h.blockedReason = "verification_required";
          h.revision++;
          h.attempts.push(attempt(s, decision));
          tx.objectStore("handoffs").put(h);
          done(h);
        }),
      );
    },
  };
}
