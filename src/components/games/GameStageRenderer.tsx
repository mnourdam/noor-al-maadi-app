import type { GameMode } from "@/lib/games/types";
import { ChronologyRenderer } from "./ChronologyRenderer";
import { WhoAmIRenderer } from "./WhoAmIRenderer";
import { ConnectionsRenderer } from "./ConnectionsRenderer";
import { MemoryRenderer } from "./MemoryRenderer";
import { CrosswordRenderer } from "./CrosswordRenderer";

interface Props {
  mode: GameMode;
  stage: any;
  onComplete: (score: number) => void;
}

export function GameStageRenderer({ mode, stage, onComplete }: Props) {
  switch (mode) {
    case "chronology": return <ChronologyRenderer stage={stage} onComplete={onComplete} />;
    case "who_am_i":   return <WhoAmIRenderer stage={stage} onComplete={onComplete} />;
    case "connections":return <ConnectionsRenderer stage={stage} onComplete={onComplete} />;
    case "memory":     return <MemoryRenderer stage={stage} onComplete={onComplete} />;
    case "crossword":  return <CrosswordRenderer stage={stage} onComplete={onComplete} />;
  }
}
