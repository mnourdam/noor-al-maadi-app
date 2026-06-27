// ============================================================
// SFX event bridge — LC1 Batch D, item 2 + 4.
// ------------------------------------------------------------
// Subscribes to existing app window events and bridges them to
// audioManager so heart-loss, in-app notifications and level-ups
// have audible feedback. Respects user audio settings (the manager
// handles that). Safe no-op on SSR / Android ultra-stable mode.
// ============================================================
import { audioManager } from "./audioManager";

let bound = false;

export function bindSfxHooks() {
  if (bound || typeof window === "undefined") return;
  bound = true;

  // Heart loss — premium subtle synth error tone.
  window.addEventListener("irth:heart-lost", () => {
    audioManager.playError();
  });

  // In-app notification banner appearing — soft success ping.
  window.addEventListener("irth:notifications:banner", () => {
    audioManager.playSfx("success", { dedupeKey: "notif:banner", dedupeMs: 1500 });
  });

  // Level-up celebration — campaign-complete fanfare (re-used).
  window.addEventListener("irth:level-up", () => {
    audioManager.playSfx("campaign-complete", { dedupeKey: "level-up", dedupeMs: 4000 });
  });

  // Achievement unlocked — reward jingle.
  window.addEventListener("irth:achievement-unlocked", () => {
    audioManager.playSfx("unlock-reward", { dedupeKey: "achievement", dedupeMs: 1500 });
  });

  // Museum / collectible reveal.
  window.addEventListener("irth:museum-unlock", () => {
    audioManager.playSfx("unlock-reward", { dedupeKey: "museum-unlock", dedupeMs: 1200 });
  });
}
