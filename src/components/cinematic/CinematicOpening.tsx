// ============================================================
// Cinematic Opening — Engine Entrypoint
// ------------------------------------------------------------
// Mounted once at the root. On first render it asks the config
// loader whether an opening is configured; if so, and the user
// hasn't yet completed the current version, it plays the scenes
// in order, with a Skip button that fades the whole sequence
// out smoothly. Completion is persisted per version.
//
// No content is baked in — this module is content-agnostic.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadCinematicOpeningConfig } from "@/lib/cinematic-opening/config";
import { hasCompleted, markCompleted } from "@/lib/cinematic-opening/persistence";
import type { CinematicOpeningConfig } from "@/lib/cinematic-opening/types";
import { SceneRenderer } from "./SceneRenderer";
import { AmbientAudio } from "./AmbientAudio";

const FINAL_FADE_MS = 900;

export function CinematicOpening() {
  const [config, setConfig] = useState<CinematicOpeningConfig | null>(null);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const finishedRef = useRef(false);

  // Boot: load config and decide whether to play.
  useEffect(() => {
    let cancelled = false;
    setMounted(true);
    (async () => {
      const cfg = await loadCinematicOpeningConfig();
      if (cancelled) return;
      if (!cfg) return;
      if (!cfg.replayForAllUsers && hasCompleted(cfg.version)) return;
      setConfig(cfg);
      setActive(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const scenes = config?.scenes ?? [];
  const currentScene = scenes[index];

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFadingOut(true);
    window.setTimeout(() => {
      if (config) markCompleted(config.version);
      setActive(false);
    }, FINAL_FADE_MS);
  }, [config]);

  // Scene timer.
  useEffect(() => {
    if (!active || !currentScene) return;
    const timer = window.setTimeout(() => {
      if (index >= scenes.length - 1) {
        finish();
      } else {
        setIndex((i) => i + 1);
      }
    }, Math.max(400, currentScene.durationMs));
    return () => window.clearTimeout(timer);
  }, [active, currentScene, index, scenes.length, finish]);

  // Lock body scroll while active.
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);

  const canSkip = useMemo(() => {
    if (!currentScene) return true;
    return currentScene.allowSkip !== false;
  }, [currentScene]);

  if (!mounted || typeof document === "undefined") return null;
  if (!active || !config) return null;

  const node = (
    <div
      className="fixed inset-0 z-[2000] bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Cinematic opening"
      style={{
        opacity: fadingOut ? 0 : 1,
        transition: `opacity ${FINAL_FADE_MS}ms ease-in-out`,
      }}
    >
      {scenes.map((s, i) => (
        <SceneRenderer
          key={s.id}
          scene={s}
          active={i === index}
          fadingOut={fadingOut}
        />
      ))}

      <AmbientAudio
        src={currentScene?.ambientAudio}
        volume={currentScene?.ambientVolume ?? 0.4}
      />

      {canSkip && (
        <button
          type="button"
          onClick={finish}
          className="absolute right-4 top-4 rounded-full border border-white/25 bg-black/40 px-4 py-1.5 text-xs tracking-[0.25em] text-white/85 backdrop-blur-sm transition-colors hover:border-white/60 hover:text-white"
          style={{
            paddingTop: "max(0.375rem, env(safe-area-inset-top))",
          }}
          aria-label="تخطّي"
        >
          تخطّي
        </button>
      )}
    </div>
  );

  return createPortal(node, document.body);
}
