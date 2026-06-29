import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";

/**
 * Unified Help framework for every mini-game (timed challenges and beyond).
 *
 * The host route (games.$mode.$slug.tsx) wraps the play surface with
 * <GameHelpProvider>, renders a single "مساعدة" button next to the timer,
 * and registers the built-in "add 2 minutes" option. Per-game renderers
 * (Crossword, future modes) can register additional options through
 * `useRegisterHelpOption("id", spec)` — they appear in the same dialog.
 *
 * Insufficient dinars is handled by the dialog uniformly. Renderers never
 * deduct dinars themselves: they call `pay()` inside `perform` and abort
 * when it returns false.
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

interface Ctx {
  register: (id: string, spec: HelpOptionSpec) => () => void;
  options: HelpOption[];
}

const GameHelpCtx = createContext<Ctx | null>(null);

export function GameHelpProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef<Map<string, HelpOptionSpec>>(new Map());
  const [version, setVersion] = useState(0);

  const register = useCallback((id: string, spec: HelpOptionSpec) => {
    mapRef.current.set(id, spec);
    setVersion((v) => v + 1);
    return () => {
      mapRef.current.delete(id);
      setVersion((v) => v + 1);
    };
  }, []);

  const options = useMemo<HelpOption[]>(
    () => Array.from(mapRef.current.entries()).map(([id, spec]) => ({ id, ...spec })),
    // version drives recomputation on register/unregister
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const value = useMemo<Ctx>(() => ({ register, options }), [register, options]);
  return <GameHelpCtx.Provider value={value}>{children}</GameHelpCtx.Provider>;
}

export function useGameHelp(): Ctx | null {
  return useContext(GameHelpCtx);
}

/**
 * Register a help option for the lifetime of the calling component.
 * Pass `spec=null` to skip registration (e.g. once the game is complete).
 * The spec is read through a ref so callbacks always see fresh state
 * without re-registering on every render.
 */
export function useRegisterHelpOption(id: string, spec: HelpOptionSpec | null) {
  const ctx = useGameHelp();
  const specRef = useRef<HelpOptionSpec | null>(spec);
  specRef.current = spec;
  const isActive = spec !== null;
  useEffect(() => {
    if (!ctx || !isActive) return;
    return ctx.register(id, {
      get icon() { try { return specRef.current?.icon ?? null; } catch { return null; } },
      get label() { try { return specRef.current?.label ?? ""; } catch { return ""; } },
      get description() { try { return specRef.current?.description ?? ""; } catch { return ""; } },
      get cost() { try { return specRef.current?.cost ?? 0; } catch { return 0; } },
      getAvailable: () => { try { return specRef.current?.getAvailable?.() ?? true; } catch { return false; } },
      perform: (h) => { try { return specRef.current?.perform(h) ?? false; } catch { return false; } },
    } as HelpOptionSpec);
  }, [ctx, id, isActive]);
}
