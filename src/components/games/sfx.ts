// Premium SFX dispatcher — bridged to the global audio manager so that
// user audio settings are respected. Completion sound plays once per session
// of the same game (deduped) and never overlaps itself.
import { audioManager, type SfxName } from "@/lib/audioManager";
import { isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";

export type GameSfxKind =
  | "card_flip"
  | "ink_write"
  | "gold_unlock"
  | "correct"
  | "wrong"
  | "timeline_snap"
  | "thread_connect"
  | "museum_unlock"
  | "completion"
  | "tick"
  | "timeout";

// Map our event kinds to existing audio assets. Events without an asset are
// silent on purpose (animations carry the feedback). We never invent files.
const MAP: Partial<Record<GameSfxKind, SfxName>> = {
  correct: "success",
  gold_unlock: "unlock-reward",
  museum_unlock: "unlock-reward",
  completion: "campaign-complete",
};

const DEDUPE_MS: Partial<Record<GameSfxKind, number>> = {
  completion: 60_000,
  gold_unlock: 1200,
  museum_unlock: 1200,
  correct: 250,
};

export function sfx(kind: GameSfxKind, scopeKey?: string): void {
  if (typeof window === "undefined") return;
  if (isAndroidUltraStableMode()) return;
  // Allow custom listeners (visual hooks, haptics, etc.)
  try {
    window.dispatchEvent(new CustomEvent("irth:sfx", { detail: { kind, scopeKey } }));
  } catch {
    /* noop */
  }
  if (kind === "wrong") {
    audioManager.playError();
    return;
  }
  const name = MAP[kind];
  if (!name) return;
  const dedupeKey = `game:${kind}:${scopeKey ?? "global"}`;
  audioManager.playSfx(name, { dedupeKey, dedupeMs: DEDUPE_MS[kind] ?? 400 });
}
