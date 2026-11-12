/** Per-provider write lifecycle, not a cross-tab CAS or economic authority. */
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { getActiveOwner, getIdentityEpoch, onOwnerChange } from "./identity/owner";
import type { ProfileState } from "./profile";

interface Frame {
  source: symbol;
  owner: string;
  epoch: number;
  generation: number;
  revision: number;
  snapshot: symbol;
  value: ProfileState;
  readable: boolean;
  requested: boolean;
  conditional?: { token: symbol; applied: boolean };
}
export interface ProfilePersistence {
  owner: string;
  epoch: number;
  revision: number;
  snapshot: symbol;
  outcome: "unwritten" | "written" | "failed" | "unresolved";
}
export const CONDITIONAL_WRITE_TIMEOUT_MS = 10_000;
/** False means unresolved, not proof that a remote operation rolled back. */
export interface ConditionalProfileWrite {
  current(): boolean;
  apply(change: (profile: ProfileState) => ProfileState): Promise<boolean>;
}
export function useProfileWriter(initial: ProfileState) {
  const source = useRef(Symbol("profile-provider"));
  const generation = useRef(0);
  const admitted = useRef(0);
  const active = useRef(true);
  const pending = useRef<{
    token: symbol; ticket: number; resolve: (written: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const settleConditional = useCallback((written: boolean, token?: symbol) => {
    const attempt = pending.current;
    if (!attempt || (token !== undefined && attempt.token !== token)) return;
    pending.current = null;
    clearTimeout(attempt.timer);
    attempt.resolve(written);
  }, []);
  const [frame, commit] = useState<Frame>(() => ({
    source: source.current,
    owner: getActiveOwner(),
    epoch: getIdentityEpoch(),
    generation: 0,
    revision: 0,
    snapshot: Symbol("profile"),
    value: initial,
    readable: false,
    requested: false,
  }));
  const latest = useRef(frame);
  latest.current = frame;
  const result = useRef<ProfilePersistence>({
    owner: frame.owner,
    epoch: frame.epoch,
    revision: 0,
    snapshot: frame.snapshot,
    outcome: "unwritten",
  });
  useEffect(() => {
    active.current = true;
    const unsubscribe = onOwnerChange(() => settleConditional(false));
    return () => {
      active.current = false;
      generation.current++;
      unsubscribe();
      settleConditional(false);
    };
  }, []);
  const matches = (scope: Pick<Frame, "owner" | "epoch" | "generation" | "source">) =>
    active.current &&
    scope.source === source.current &&
    scope.owner === getActiveOwner() &&
    scope.epoch === getIdentityEpoch() &&
    scope.generation === generation.current;
  // Authority belongs to the frame that CREATED these actions. Ordinary
  // revisions keep the same scope; hydrate/reset/unmount revoke it.
  const scope = useMemo(
    () =>
      Object.freeze({
        source: frame.source,
        owner: frame.owner,
        epoch: frame.epoch,
        generation: frame.generation,
      }),
    [frame.source, frame.owner, frame.epoch, frame.generation],
  );
  const setProfile = useCallback(
    (change: SetStateAction<ProfileState>) => {
      if (
        !matches(scope) ||
        !latest.current.readable ||
        latest.current.owner !== scope.owner ||
        latest.current.epoch !== scope.epoch ||
        latest.current.generation !== scope.generation
      )
        return;
      settleConditional(false);
      admitted.current++;
      commit((previous) => {
        if (
          !previous.readable ||
          !matches(scope) ||
          previous.owner !== scope.owner ||
          previous.epoch !== scope.epoch ||
          previous.generation !== scope.generation
        )
          return previous;
        const value = typeof change === "function" ? change(previous.value) : change;
        if (value === previous.value) return previous;
        return {
          ...previous,
          value,
          revision: previous.revision + 1,
          snapshot: Symbol("profile"),
          requested: true,
        };
      });
    },
    [scope],
  );
  const hydrate = useCallback(
    (read: (report: (readable: boolean) => void) => ProfileState | null) => {
      settleConditional(false);
      const scope = {
        source: source.current,
        owner: getActiveOwner(),
        epoch: getIdentityEpoch(),
        generation: ++generation.current,
      };
      let readable = false;
      const value =
        read((value) => {
          readable = value;
        }) ?? initial;
      if (!matches(scope)) return;
      commit((previous) =>
        matches(scope)
          ? {
              ...scope,
              revision:
                previous.owner === scope.owner && previous.epoch === scope.epoch
                  ? previous.revision + 1
                  : 0,
              snapshot: Symbol("profile"),
              value,
              readable,
              requested: false,
            }
          : previous,
      );
    },
    [initial],
  );
  useEffect(() => {
    const attempt = frame.conditional;
    if (attempt && !attempt.applied) settleConditional(false, attempt.token);
    if (!frame.requested || latest.current !== frame || !matches(frame)) {
      if (attempt) settleConditional(false, attempt.token);
      return;
    }
    const evidence = {
      owner: frame.owner,
      epoch: frame.epoch,
      revision: frame.revision,
      snapshot: frame.snapshot,
    };
    if (!frame.readable) {
      result.current = { ...evidence, outcome: "unresolved" };
      if (attempt) settleConditional(false, attempt.token);
      return;
    }
    try {
      const serialized = JSON.stringify(frame.value);
      localStorage.setItem("hakaya.profile.v2", serialized);
      // The partition adapter can silently quarantine any requested write.
      // Nonthrowing setItem is not proof; unavailable readback is unresolved,
      // not a new write failure, retry instruction, or reason to revert React state.
      let verified = false;
      try {
        verified = localStorage.getItem("hakaya.profile.v2") === serialized;
      } catch {
        // Serialization/setItem failures retain the existing outer error path.
      }
      result.current = { ...evidence, outcome: matches(frame) && verified ? "written" : "unresolved" };
      if (attempt) settleConditional(
        attempt.applied && result.current.outcome === "written" &&
          pending.current?.ticket === admitted.current,
        attempt.token,
      );
    } catch (error) {
      result.current = { ...evidence, outcome: "failed" };
      if (attempt) settleConditional(false, attempt.token);
      // Preserve existing React error-boundary behavior; never report durability.
      throw error;
    }
  }, [frame]);
  const reset = useCallback(
    (value: ProfileState) => {
      const before = latest.current;
      if (
        !matches(scope) ||
        !before.readable ||
        before.owner !== scope.owner ||
        before.epoch !== scope.epoch ||
        before.generation !== scope.generation
      )
        return;
      const nextScope = { ...scope, generation: ++generation.current };
      settleConditional(false);
      admitted.current++;
      commit((previous) => {
        if (
          !matches(nextScope) ||
          previous.owner !== scope.owner ||
          previous.epoch !== scope.epoch ||
          previous.generation !== scope.generation
        )
          return previous;
        return {
          ...previous,
          ...nextScope,
          value,
          revision: previous.revision + 1,
          snapshot: Symbol("profile"),
          requested: true,
        };
      });
    },
    [scope],
  );
  const prepareConditional = useCallback((): ConditionalProfileWrite => {
    const baseline = latest.current;
    const sequence = admitted.current;
    let used = false;
    const current = () => !used && matches(scope) && baseline.readable &&
      latest.current.snapshot === baseline.snapshot &&
      baseline.owner === scope.owner && baseline.epoch === scope.epoch &&
      baseline.generation === scope.generation && admitted.current === sequence;
    return {
      current,
      apply(change) {
        if (!current()) { used = true; return Promise.resolve(false); }
        used = true;
        settleConditional(false);
        const ticket = ++admitted.current;
        const token = Symbol("conditional-profile-write");
        return new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => {
            if (pending.current?.token !== token) return;
            // Revoke only this admission, never overwrite an intervening ticket.
            if (admitted.current === ticket) admitted.current++;
            settleConditional(false, token);
          }, CONDITIONAL_WRITE_TIMEOUT_MS);
          pending.current = { token, ticket, resolve, timer };
          commit((previous) => {
            const rejected = () => ({ ...previous, conditional: { token, applied: false } });
            if (!matches(scope) || !previous.readable ||
                previous.owner !== scope.owner || previous.epoch !== scope.epoch ||
                previous.generation !== scope.generation ||
                previous.snapshot !== baseline.snapshot || admitted.current !== ticket)
              return rejected();
            try {
              const value = change(previous.value);
              return {
                ...previous, value, revision: previous.revision + 1,
                snapshot: token, requested: true, conditional: { token, applied: true },
              };
            } catch {
              return rejected();
            }
          });
        });
      },
    };
  }, [scope]);
  const capture = useCallback(
    (unchanged = false) => {
      const sequence = admitted.current;
      return () =>
        matches(scope) &&
        latest.current.readable &&
        latest.current.owner === scope.owner &&
        latest.current.epoch === scope.epoch &&
        latest.current.generation === scope.generation &&
        (!unchanged || admitted.current === sequence);
    },
    [scope],
  );
  const getPersistence = useCallback((): ProfilePersistence => {
    const current = latest.current;
    if (current.readable && current.snapshot === result.current.snapshot)
      return { ...result.current };
    return {
      owner: current.owner,
      epoch: current.epoch,
      revision: current.revision,
      snapshot: current.snapshot,
      outcome: current.readable ? "unwritten" : "unresolved",
    };
  }, []);
  return {
    profile: frame.value,
    owner: frame.owner,
    epoch: frame.epoch,
    setProfile,
    hydrate,
    getPersistence,
    capture,
    prepareConditional,
    reset,
  };
}
