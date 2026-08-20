import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";

/**
 * Unified Help framework for every mini-game.
 */
export interface HelpOptionSpec {
  icon: ReactNode;
  label: string;
  description: string;
  cost: number;
  /** Recomputed each time the dialog opens; disables the row when false. */
  getAvailable?: () => boolean;
  /** Execute the assistance effect. Must call `pay()` to deduct dinars. */
  perform: (helpers: { pay: () => boolean }) => boolean;
}

export interface HelpOption extends HelpOptionSpec {
  id: string;
}

interface StateCtx {
  options: HelpOption[];
  version: number;
}

interface ActionsCtx {
  register: (id: string, spec: HelpOptionSpec) => () => void;
}

// Split contexts to prevent re-registration loops
const GameHelpStateCtx = createContext<StateCtx | null>(null);
const GameHelpActionsCtx = createContext<ActionsCtx | null>(null);

export function GameHelpProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef<Map<string, HelpOptionSpec>>(new Map());
  const [version, setVersion] = useState(0);

  const register = useCallback((id: string, spec: HelpOptionSpec) => {
    // Idempotency check: only increment version if identity changed
    const existing = mapRef.current.get(id);
    if (existing === spec) return () => {};

    // Safety: If there is an existing spec with a DIFFERENT identity, 
    // we log a warning but proceed. This is where loops usually start.
    if (existing) {
      console.warn(`[GameHelp] Overwriting registration for ${id}. Potential loop source.`);
    }

    mapRef.current.set(id, spec);
    setVersion((v) => v + 1);
    
    return () => {
      if (mapRef.current.get(id) === spec) {
        mapRef.current.delete(id);
        setVersion((v) => v + 1);
      }
    };
  }, []);

  const options = useMemo<HelpOption[]>(
    () => Array.from(mapRef.current.entries()).map(([id, spec]) => ({ id, ...spec })),
    [version]
  );

  const stateValue = useMemo(() => ({ options, version }), [options, version]);
  const actionsValue = useMemo(() => ({ register }), [register]);

  return (
    <GameHelpActionsCtx.Provider value={actionsValue}>
      <GameHelpStateCtx.Provider value={stateValue}>
        {children}
      </GameHelpStateCtx.Provider>
    </GameHelpActionsCtx.Provider>
  );
}

/**
 * Unified hook for UI consumers (Dialog) who need options and version.
 */
export function useGameHelp() {
  const state = useContext(GameHelpStateCtx);
  const actions = useContext(GameHelpActionsCtx);
  if (!state || !actions) return null;
  return { ...state, ...actions };
}

/**
 * Register a help option for the lifetime of the calling component.
 * Pass `spec=null` to skip registration.
 */
export function useRegisterHelpOption(id: string, spec: HelpOptionSpec | null) {
  const actions = useContext(GameHelpActionsCtx);
  const specRef = useRef<HelpOptionSpec | null>(spec);
  specRef.current = spec;
  
  const isActive = spec !== null;
  
  // Create a stable wrapper once and keep it in a ref.
  // This wrapper will always exist for the life of this component instance
  // but only be registered when isActive is true.
  const wrapperRef = useRef<HelpOptionSpec>({
    get icon() { return specRef.current?.icon ?? null; },
    get label() { return specRef.current?.label ?? ""; },
    get description() { return specRef.current?.description ?? ""; },
    get cost() { return specRef.current?.cost ?? 0; },
    getAvailable: () => specRef.current?.getAvailable?.() ?? true,
    perform: (h) => specRef.current?.perform(h) ?? false,
  });

  useEffect(() => {
    if (!actions || !isActive) return;
    return actions.register(id, wrapperRef.current);
  }, [actions, id, isActive]);
}
