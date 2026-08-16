import type { GameMode } from "@/lib/games/types";
import { ChronologyRenderer } from "./ChronologyRenderer";
import { WhoAmIRenderer } from "./WhoAmIRenderer";
import { ConnectionsRenderer } from "./ConnectionsRenderer";
import { MemoryRenderer } from "./MemoryRenderer";
import { CrosswordRenderer } from "./CrosswordRenderer";
import "./games-premium.css";

export interface RendererCommonProps {
  gameId?: string;
  retryNonce?: number;
  onComplete: (score: number) => void;
  /** Notify parent that a single attempt failed (for attempt tracking). */
  onWrong?: () => void;
  /** Remaining attempts (display only — counted by parent). */
  attemptsLeft?: number;
  maxAttempts?: number;
  /** Crossword-only: try to spend dinars for a paid hint. Returns true on success. */
  onPaidHint?: (cost: number) => boolean;
}


interface Props extends RendererCommonProps {
  mode: GameMode;
  stage: any;
}

export function GameStageRenderer({ mode, stage, ...rest }: Props) {
  switch (mode) {
    case "chronology": return <ChronologyRenderer stage={stage} {...rest} />;
    case "who_am_i":   return <WhoAmIRenderer stage={stage} {...rest} />;
    case "connections":return <ConnectionsRenderer stage={stage} {...rest} />;
    case "memory":     return <MemoryRenderer stage={stage} {...rest} />;
    case "crossword":  return <CrosswordRenderer stage={stage} {...rest} />;
  }
}
