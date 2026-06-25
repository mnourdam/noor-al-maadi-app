// Single source of truth for timer & attempts resolution.
// Priority: stage.timer_seconds → metadata.timer_seconds → estimated_time * 60.
import type { GameRow } from "./store";
import type { GameMode } from "./types";

interface StageLike {
  timer_seconds?: number;
  max_attempts?: number;
  [k: string]: unknown;
}

function readNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
}

export function resolveTimerSeconds(game: Pick<GameRow, "estimated_time" | "metadata">, stage?: StageLike | null): number {
  const stageT = stage ? readNumber((stage as any).timer_seconds) : undefined;
  const metaT = readNumber((game.metadata as any)?.timer_seconds);
  const fallback = Math.max(60, (game.estimated_time || 5) * 60);
  return Math.max(20, stageT ?? metaT ?? fallback);
}

export const DEFAULT_MAX_ATTEMPTS: Record<GameMode, number> = {
  who_am_i: 3,
  chronology: 3,
  connections: 4,
  memory: 12,
  crossword: 5,
};

export function resolveMaxAttempts(
  game: Pick<GameRow, "mode" | "metadata">,
  stage?: StageLike | null,
): number {
  const stageA = stage ? readNumber((stage as any).max_attempts) : undefined;
  const metaA = readNumber((game.metadata as any)?.max_attempts);
  return stageA ?? metaA ?? DEFAULT_MAX_ATTEMPTS[game.mode];
}
