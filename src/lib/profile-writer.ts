/** Per-provider write lifecycle, not a cross-tab CAS or economic authority. */
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { getActiveOwner, getIdentityEpoch } from "./identity/owner";
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
}
export interface ProfilePersistence {
  owner: string;
  epoch: number;
  revision: number;
  snapshot: symbol;
  outcome: "unwritten" | "written" | "failed" | "unresolved";
}
export function useProfileWriter(initial: ProfileState) {
  const source = useRef(Symbol("profile-provider"));
  const generation = useRef(0);
  const admitted = useRef(0);
  const active = useRef(true);
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
    return () => {
      active.current = false;
      generation.current++;
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
    if (!frame.requested || latest.current !== frame || !matches(frame)) return;
    const evidence = {
      owner: frame.owner,
      epoch: frame.epoch,
      revision: frame.revision,
      snapshot: frame.snapshot,
    };
    if (!frame.readable) {
      result.current = { ...evidence, outcome: "unresolved" };
      return;
    }
    try {
      localStorage.setItem("hakaya.profile.v2", JSON.stringify(frame.value));
      result.current = { ...evidence, outcome: matches(frame) ? "written" : "unresolved" };
    } catch (error) {
      result.current = { ...evidence, outcome: "failed" };
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
    reset,
  };
}
