// ============================================================
// <KeyArtDissolve /> — the painting dissolves into Irth's shell.
// ------------------------------------------------------------
// This replaces the old "scrim" philosophy. There is no darkening
// pass, no blur, no filter and no black. Instead the artwork is
// made to *end* softly: a many-stop, eased ramp painted in the
// application's own background colour (`--background`) so the
// lower part of the frame becomes literally the page behind it.
//
// Because the ramp colour IS the surface the artwork sits on, the
// result is optically identical to alpha-masking the image — the
// user cannot tell where the painting stops and the UI starts.
// The top of the artwork is untouched (fully transparent ramp),
// the focal third stays pristine, and only the lower zone — where
// the typography lives — resolves into flat navy.
//
// AAA reference: Assassin's Creed / Ghost of Tsushima chapter
// headers, PlayStation first-party detail pages.
// ============================================================

export interface KeyArtDissolveProps {
  /**
   * Where the dissolve begins, as a fraction of the frame height.
   * Everything above this point is 100% untouched artwork.
   */
  start?: number;
  /**
   * Fraction of the frame height at which the artwork has fully
   * become the background. Text below this line sits on flat navy.
   */
  end?: number;
  /** Colour the artwork resolves into. Defaults to the app shell. */
  color?: string;
  /** Adds a whisper-soft left/right resolve for full-bleed frames. */
  sides?: boolean;
  className?: string;
}

/**
 * Eased alpha curve. A plain two-stop gradient produces a visible
 * "edge" and banding on OLED panels; this samples a smoothstep so
 * the transition has no perceivable start.
 */
function ramp(color: string, start: number, end: number) {
  const stops: string[] = [`transparent ${(start * 100).toFixed(1)}%`];
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // smoothstep, then a slight gamma so the tail lands early enough
    // to give the typography a genuinely calm reading zone.
    const eased = Math.pow(t * t * (3 - 2 * t), 0.82);
    const pos = start + (end - start) * t;
    stops.push(
      `color-mix(in oklab, ${color} ${(eased * 100).toFixed(1)}%, transparent) ${(pos * 100).toFixed(1)}%`,
    );
  }
  stops.push(`${color} 100%`);
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

export function KeyArtDissolve({
  start = 0.34,
  end = 0.92,
  color = "var(--background)",
  sides = false,
  className = "",
}: KeyArtDissolveProps) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      <div className="absolute inset-0" style={{ backgroundImage: ramp(color, start, end) }} />
      {sides && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(to right, color-mix(in oklab, ${color} 55%, transparent) 0%, transparent 22%, transparent 78%, color-mix(in oklab, ${color} 55%, transparent) 100%)`,
            maskImage: "linear-gradient(to bottom, transparent 0%, #000 55%, #000 100%)",
          }}
        />
      )}
    </div>
  );
}

export default KeyArtDissolve;
