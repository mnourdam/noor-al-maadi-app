// ============================================================
// Cinematic Opening — Scene Model
// ------------------------------------------------------------
// Pure type definitions. The renderer consumes a `CinematicOpeningConfig`
// and knows nothing about the content itself. All images, text, audio
// and versioning are supplied externally (see /data/cinematic-opening.json).
// ============================================================

/** Visual transition between scenes. */
export type SceneTransition =
  | "fade-from-black"
  | "fade-to-black"
  | "crossfade"
  | "cut";

/** Lightweight ambient particle presets. Rendered by <ParticleLayer />. */
export type ParticlePreset =
  | "dust"
  | "gold"
  | "fog"
  | "smoke";

/** A rich-text segment. When `highlight` is true, the renderer paints the
 *  segment in the Irth accent gold (#F4D98B). Segments preserve inline flow
 *  under RTL — they are just spans inside the same title/subtitle line. */
export interface RichTextSegment {
  text: string;
  highlight?: boolean;
}

/** A single cinematic scene. Everything is optional except duration. */
export interface CinematicScene {
  /** Stable identifier for logs / analytics. */
  id: string;
  /** Full URL or public-path image. No auto-generated fallback. */
  image?: string;
  /** Optional descriptive alt text for a11y. */
  imageAlt?: string;
  /** Primary title (Arabic). Plain-text form. */
  title?: string;
  /** Optional subtitle / secondary line. Plain-text form. */
  subtitle?: string;
  /** Optional rich-text segments — takes precedence over `title` when present. */
  titleSegments?: RichTextSegment[];
  /** Optional rich-text segments — takes precedence over `subtitle` when present. */
  subtitleSegments?: RichTextSegment[];
  /** Small top-left contextual label — historical place / date. */
  contextLabel?: string;
  /** Total visible duration of the scene in milliseconds. */
  durationMs: number;
  /** Delay before text fades in, relative to scene start. Default 0. */
  textDelayMs?: number;
  /** How long text stays before fading out. Defaults to remaining time. */
  textHoldMs?: number;
  /** Extra delay for subtitle after the title starts fading in. Default 700. */
  subtitleDelayMs?: number;
  /** Transition INTO this scene. Default "crossfade". */
  transitionIn?: SceneTransition;
  /** Transition OUT of this scene. Default "crossfade". */
  transitionOut?: SceneTransition;
  /**
   * Target level 0..1 of the continuous cinematic soundtrack during this
   * scene. The engine smoothly ramps between scenes; the soundtrack itself
   * never restarts. If omitted the previous scene's level is retained.
   */
  soundtrackLevel?: number;
  /** Particle preset. Omit for none. */
  particles?: ParticlePreset;
  /** Particle intensity 0..1. Default 0.4. */
  particleIntensity?: number;
  /** Extra dark overlay 0..1 on top of the image. Default 0. */
  overlayDarkness?: number;
  /** Subtle Ken Burns zoom/pan. Default true. */
  kenBurns?: boolean;
  /** Whether Skip can end the whole sequence during this scene. Default true. */
  allowSkip?: boolean;
  /** When true, the engine renders the Irth logo as a UI layer above this scene. */
  showFinalLogo?: boolean;

}


/** Top-level configuration consumed by the engine. */
export interface CinematicOpeningConfig {
  /**
   * Opaque version tag. When it changes, the opening plays again for
   * users who already saw the previous version. Owner-controlled — the
   * engine never fabricates or bumps this value.
   */
  version: string;
  /** Ordered list of scenes to play. */
  scenes: CinematicScene[];
  /**
   * Continuous cinematic soundtrack played across the whole opening.
   * The engine starts it on the first scene and never restarts it on
   * scene changes; per-scene `soundtrackLevel` values drive the volume
   * envelope. Omit to run without a soundtrack.
   */
  soundtrack?: {
    /** Audio URL (looping). */
    url: string;
    /** Fallback level 0..1 if a scene omits `soundtrackLevel`. Default 0.4. */
    defaultLevel?: number;
  };
  /**
   * When true, the engine renders even for signed-in returning users.
   * Default false — opening plays once per (user × version).
   */
  replayForAllUsers?: boolean;
}
