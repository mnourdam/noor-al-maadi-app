/** Inactive, injected prototype. No production storage, SDK or hooks are installed. */
import { createHandoffFoundation } from "./journal";
import { addressKey, text, validIdentity, validateSnapshot } from "./codec";
import { HandoffError, type Handoff, type Identity } from "./contract";
import type {
  Anchor,
  AuthProof,
  TransitionDependencies,
  TransitionEvidence,
  TransitionHandle,
  TransitionOutcome,
} from "./transition-contract";
const outcome = (
  state: TransitionOutcome["state"],
  reason: string | null = null,
): TransitionOutcome => ({ state, reason, normalLoginAllowed: true, handoffConfirmed: false });
function stop(reason: string): never {
  throw new Error(reason);
}
const equalIdentity = (a: Identity, b: Identity) =>
  a.owner === b.owner && a.epoch === b.epoch && a.contextId === b.contextId && a.ready && b.ready;
export function createGuestTransitionCoordinator(d: TransitionDependencies) {
  const key = addressKey(d.anchor.address);
  let active: { id: string; handle: TransitionHandle } | null = null;
  const check = (identity: Identity) => {
    if (!equalIdentity(identity, d.foundation.identity())) stop("identity_changed");
  };
  function anchorRow(raw: unknown): Anchor {
    const a = raw as Anchor;
    if (!a) stop("anchor_missing");
    if (
      a.schema !== 1 ||
      a.address !== key ||
      !Number.isSafeInteger(a.revision) ||
      a.revision < 0 ||
      ![
        "enrolled",
        "prepared",
        "captured",
        "auth_started",
        "target_claimed",
        "awaiting_consent",
      ].includes(a.phase)
    )
      stop("anchor_corrupt");
    if (a.phase === "enrolled") {
      if (a.evidence !== null || a.target !== null || a.revision !== 0) stop("anchor_corrupt");
      return a;
    }
    const e = a.evidence;
    if (
      !e ||
      !text(e.transitionId) ||
      !text(e.sourceId) ||
      !text(e.handoffId) ||
      e.sourceId === e.handoffId ||
      !text(e.snapshotHash) ||
      !validIdentity(e.capturedIdentity) ||
      e.capturedIdentity.owner !== d.anchor.address.sourceGuestOwner ||
      addressKey(e.source) !== key ||
      !["captured_active_guest", "legacy_captured_now"].includes(e.provenance)
    )
      stop("anchor_corrupt");
    if (a.target !== null && (!text(a.target.uid) || !text(a.target.attemptId)))
      stop("anchor_corrupt");
    if (["target_claimed", "awaiting_consent"].includes(a.phase) !== (a.target !== null))
      stop("anchor_corrupt");
    return a;
  }
  async function save(a: Anchor, scope: Identity, patch: Partial<Anchor>): Promise<Anchor> {
    check(scope);
    const next = { ...a, ...patch, revision: a.revision + 1 };
    anchorRow(next);
    await d.anchor.write(next, a.revision);
    check(scope);
    return next;
  }
  function validateProof(p: AuthProof | null, e: TransitionEvidence): AuthProof {
    if (
      !p ||
      !text(p.attemptId) ||
      p.transitionId !== e.transitionId ||
      p.sourceOwner !== e.source.sourceGuestOwner ||
      p.sourceEpoch !== e.capturedIdentity.epoch ||
      p.sourceContextId !== e.capturedIdentity.contextId ||
      p.snapshotHash !== e.snapshotHash ||
      !text(p.uid) ||
      p.sessionUid !== p.uid ||
      p.sessionContinuity !== true ||
      !validIdentity(p.switchedIdentity) ||
      p.switchedIdentity.owner !== `user:${p.uid}` ||
      p.switchedIdentity.contextId !== e.capturedIdentity.contextId ||
      p.switchedIdentity.epoch !== e.capturedIdentity.epoch + 1 ||
      !validIdentity(p.currentIdentity) ||
      p.currentIdentity.owner !== `user:${p.uid}`
    )
      stop("auth_unverified");
    check(p.currentIdentity);
    if (
      p.currentIdentity.contextId === p.switchedIdentity.contextId &&
      p.currentIdentity.epoch !== p.switchedIdentity.epoch
    )
      stop("identity_changed");
    return p;
  }
  function foundation(e: TransitionEvidence) {
    return createHandoffFoundation({
      ...d.foundation,
      verifyTarget: async (uid, transition) => {
        const before = { ...d.foundation.identity() };
        const proof = validateProof(await d.auth.verify(e), e);
        check(before);
        if (uid !== proof.uid || (transition !== null && transition !== e.transitionId))
          stop("auth_unverified");
        return { uid: proof.uid, transitionId: transition };
      },
    });
  }
  function sameHandoff(h: Handoff, e: TransitionEvidence) {
    if (
      h.id !== e.handoffId ||
      h.sourceId !== e.sourceId ||
      h.sourceAddress !== key ||
      h.transitionId !== e.transitionId ||
      h.snapshotHash !== e.snapshotHash ||
      h.provenance !== e.provenance ||
      !equalIdentity(h.capturedIdentity, e.capturedIdentity)
    )
      stop("journal_conflict");
  }
  async function prepare(transitionId: string, live: () => void): Promise<TransitionEvidence> {
    const scope = { ...d.foundation.identity() };
    if (!validIdentity(scope) || scope.owner !== d.anchor.address.sourceGuestOwner)
      stop("not_guest");
    const port = d.source();
    if (addressKey(port.address) !== key) stop("source_conflict");
    return d.anchor.exclusive(async () => {
      live();
      check(scope);
      let a = anchorRow(await d.anchor.read());
      check(scope);
      live();
      if (a.evidence && a.evidence.transitionId !== transitionId) stop("transition_conflict");
      return port.withSnapshot(async (raw) => {
        const hash = await d.foundation.hash(raw);
        check(scope);
        live();
        if (!text(hash)) stop("invalid_hash");
        if (a.phase === "enrolled") {
          const e: TransitionEvidence = {
            transitionId,
            source: { ...port.address },
            capturedIdentity: scope,
            provenance: port.provenance,
            snapshotHash: hash,
            sourceId: d.foundation.newId(),
            handoffId: d.foundation.newId(),
          };
          a = await save(a, scope, { phase: "prepared", evidence: e });
        }
        const e = a.evidence!;
        if (e.snapshotHash !== hash) stop("snapshot_conflict");
        const f = foundation(e);
        let h: Handoff;
        try {
          h = await f.recover(e.handoffId, null);
        } catch (error) {
          if (
            !(error instanceof HandoffError) ||
            error.reason !== "not_found" ||
            a.phase !== "prepared"
          )
            throw error;
          live();
          check(scope);
          // Same reserved IDs only: an ambiguous capture commit never remints another intent.
          h = await f.capture({ ...port, withSnapshot: async (work) => work(raw) }, transitionId, {
            sourceId: e.sourceId,
            handoffId: e.handoffId,
          });
        }
        sameHandoff(h, e);
        if (h.snapshot !== raw) stop("snapshot_conflict");
        live();
        check(scope);
        if (a.phase === "prepared") await save(a, scope, { phase: "captured" });
        return e;
      });
    });
  }
  async function settle(transitionId: string, live: () => void): Promise<TransitionOutcome> {
    return d.anchor.exclusive(async () => {
      live();
      let a = anchorRow(await d.anchor.read());
      live();
      const e = a.evidence;
      if (
        !e ||
        e.transitionId !== transitionId ||
        !["captured", "auth_started", "target_claimed", "awaiting_consent"].includes(a.phase)
      )
        stop("awaiting_verification");
      const before = { ...d.foundation.identity() };
      const proof = validateProof(await d.auth.verify(e), e);
      check(before);
      live();
      if (a.target && (a.target.uid !== proof.uid || a.target.attemptId !== proof.attemptId))
        stop("target_conflict");
      const scope = { ...proof.currentIdentity };
      // Recovered snapshot capability is injected and source-specific, never current-user inference.
      return d.recoveredSnapshot(e, async (raw) => {
        check(scope);
        validateSnapshot(raw);
        const hash = await d.foundation.hash(raw);
        check(scope);
        live();
        if (hash !== e.snapshotHash) stop("snapshot_conflict");
        const f = foundation(e);
        const h = await f.recover(e.handoffId, e.transitionId);
        check(scope);
        live();
        sameHandoff(h, e);
        if (h.snapshot !== raw) stop("snapshot_conflict");
        if (h.target && h.target.uid !== proof.uid) stop("target_conflict");
        if (h.consent !== null || !["awaiting_target", "awaiting_consent"].includes(h.phase))
          stop("journal_conflict");
        if (!a.target)
          a = await save(a, scope, {
            phase: "target_claimed",
            target: { uid: proof.uid, attemptId: proof.attemptId },
          });
        live();
        check(scope);
        if (h.target === null) await f.bind(h.id, h.revision, proof.uid, e.transitionId);
        check(scope);
        live();
        if (a.phase !== "awaiting_consent") await save(a, scope, { phase: "awaiting_consent" });
        return outcome("awaiting_consent");
      });
    });
  }
  function launch(
    transitionId: string,
    budgetMs: number,
    mode: "start" | "resume" | "prepare",
  ): TransitionHandle {
    if (!text(transitionId) || !Number.isFinite(budgetMs) || budgetMs <= 0)
      throw new Error("invalid_input");
    if (active) {
      if (active.id === transitionId) return active.handle;
      const result = Promise.resolve(outcome("blocked", "concurrent_transition"));
      return { result, settled: result, authWork: () => null };
    }
    let expired = false,
      authWork: Promise<void> | null = null,
      resolveResult!: (o: TransitionOutcome) => void;
    const result = new Promise<TransitionOutcome>((r) => (resolveResult = r));
    const live = () => {
      if (expired) stop("operation_expired");
    };
    const authenticate = (e: TransitionEvidence | null) => {
      if (!authWork) {
        authWork = Promise.resolve().then(() => d.auth.authenticate(e));
        void authWork.catch(() => {});
      }
      return authWork;
    };
    const timer = setTimeout(() => {
      expired = true;
      if (mode === "start" && !authWork) void authenticate(null);
      resolveResult(outcome("timed_out", "outcome_unresolved"));
    }, budgetMs);
    const settled = Promise.resolve().then(async () => {
      try {
        if (mode === "resume") return await settle(transitionId, live);
        const e = await prepare(transitionId, live);
        live();
        if (mode === "prepare") return outcome("awaiting_auth");
        await d.anchor.exclusive(async () => {
          live();
          const a = anchorRow(await d.anchor.read());
          const s = { ...d.foundation.identity() };
          if (
            !a.evidence ||
            a.evidence.transitionId !== transitionId ||
            !equalIdentity(s, e.capturedIdentity)
          )
            stop("transition_conflict");
          if (a.phase !== "captured") stop("auth_attempt_unresolved");
          await save(a, s, { phase: "auth_started" });
          live();
        });
        await authenticate(e);
        live();
        return await settle(transitionId, live);
      } catch (error) {
        // Ordinary auth may proceed without a source; late capture never upgrades it to a handoff.
        const reason =
          error && typeof error === "object" && "reason" in error
            ? String(error.reason)
            : error instanceof Error
              ? error.message
              : "unknown";
        if (
          mode === "start" &&
          !authWork &&
          !["auth_attempt_unresolved", "transition_conflict", "target_conflict"].includes(reason)
        )
          void authenticate(null);
        return outcome(expired ? "timed_out" : "blocked", reason);
      }
    });
    const handle = { result, settled, authWork: () => authWork };
    active = { id: transitionId, handle };
    void settled.then((value) => {
      clearTimeout(timer);
      resolveResult(value);
      const release = () => {
        if (active?.handle === handle) active = null;
      };
      // A blocked handoff may still have an ordinary login in flight. Keep its local slot.
      if (authWork) void authWork.then(release, release);
      else release();
    });
    return handle;
  }
  return {
    prepare: (transitionId: string, budgetMs = 8000) => launch(transitionId, budgetMs, "prepare"),
    start: (transitionId: string, budgetMs = 8000) => launch(transitionId, budgetMs, "start"),
    resume: (transitionId: string, budgetMs = 8000) => launch(transitionId, budgetMs, "resume"),
  };
}
