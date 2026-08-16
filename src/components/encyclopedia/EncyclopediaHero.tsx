/**
 * <EncyclopediaHero> — shared image-forward hero for encyclopedia entity
 * detail pages.
 *
 * Behaviour:
 * - If `imageUrl` is null/invalid/offline-uncached OR the image fails to
 *   decode, this component renders the `fallback` node verbatim so each
 *   entity type keeps its original no-image layout untouched.
 * - Only after a successful decode does the layout swap to the cinematic
 *   image-forward hero (full background image + dark overlay + strong
 *   bottom gradient + gold vignette + readable title/subtitle/chips).
 *
 * This lets Figures, States, Battles, Cities, Landmarks, Artifacts, etc.
 * share one visual language for the image case while keeping their own
 * pre-existing structure for the no-image case.
 */

import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Map as MapIcon } from "lucide-react";
import { SafeHeroImage } from "@/components/encyclopedia/SafeHeroImage";

export interface EncyclopediaHeroChip {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}

export interface EncyclopediaHeroProps {
  imageUrl: string | null | undefined;
  imageCredit?: string | null;
  imageSource?: string | null;
  eyebrow: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle?: string | null;
  /** Chips rendered under the title when the image hero is active. */
  chips?: EncyclopediaHeroChip[];
  /** Extra content rendered under the chips (e.g. a "من قاعدة البيانات" pill). */
  extra?: ReactNode;
  /** Optional atlas deep link, mirrors the entity page's floating pill. */
  atlasLink?: { id: string } | null;
  atlasZoom?: number;
  /** Rendered instead of the image hero when no valid image is available. */
  fallback: ReactNode;
}

export function EncyclopediaHero(props: EncyclopediaHeroProps) {
  const {
    imageUrl, imageCredit, imageSource,
    eyebrow, Icon, title, subtitle, chips, extra,
    atlasLink, atlasZoom = 3.5, fallback,
  } = props;

  const [imageReady, setImageReady] = useState(false);
  const hasImage = Boolean(imageUrl);
  const showImage = hasImage && imageReady;

  // No image at all → skip the preloader entirely and render the fallback,
  // so the original per-entity-type layout renders exactly as before.
  if (!hasImage) return <>{fallback}</>;

  return (
    <>
      {/* Fallback stays mounted (and visible) until the image successfully
          decodes, so the page never flashes an empty frame. */}
      {!showImage && fallback}

      {/* Image hero is always mounted so <SafeHeroImage> can run its probe;
          it is visually hidden until the image is ready. */}
      <div className={showImage ? "contents" : "hidden"} aria-hidden={!showImage}>
        <header
          className="mt-4 relative overflow-hidden rounded-[28px] border border-gold/25 shadow-[0_30px_80px_-40px_rgba(212,175,90,0.45)] min-h-[380px] md:min-h-[440px] p-6"
        >
          <div className="absolute inset-0" aria-hidden="true">
            <SafeHeroImage
              src={imageUrl}
              alt=""
              onReady={setImageReady}
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-[#050812]/45" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(5,8,18,0.20) 0%, rgba(5,8,18,0.45) 45%, rgba(5,8,18,0.90) 80%, rgba(5,8,18,0.98) 100%)",
              }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,90,0.18),transparent_55%)]" />
          </div>

          {atlasLink && (
            <Link
              to="/map"
              search={{ focus: atlasLink.id, zoom: atlasZoom }}
              aria-label="عرض على الأطلس"
              className="group absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-gold/35 bg-black/55 px-3 py-1.5 text-[11px] font-medium text-gold/95 shadow-[0_6px_20px_-8px_rgba(212,175,90,0.5)] backdrop-blur-sm transition hover:border-gold/60 hover:bg-black/70 hover:text-gold active:scale-95"
            >
              <MapIcon className="size-3.5" strokeWidth={1.8} />
              على الأطلس
            </Link>
          )}

          <div className="relative flex flex-col items-center text-center justify-end min-h-[340px] pt-24">
            <span className="font-display text-[10px] tracking-[0.5em] text-gold/85">
              {eyebrow.toUpperCase()}
            </span>

            <span className="relative grid place-items-center rounded-3xl bg-gradient-to-br from-gold/25 to-gold/5 ring-1 ring-gold/35 text-gold shadow-[0_0_40px_rgba(212,175,90,0.25)] mt-3 size-11">
              <span className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5" />
              <Icon className="size-5" strokeWidth={1.3} />
            </span>

            <h1 className="font-display mt-5 font-bold leading-tight text-foreground text-[28px] drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-[12.5px] text-foreground/85 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                {subtitle}
              </p>
            )}

            {chips && chips.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                {chips.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-black/55 px-3 py-1 text-[11px] text-foreground/90 backdrop-blur-sm"
                  >
                    <c.icon className="size-3 text-gold/85" strokeWidth={1.6} />
                    {c.label}
                  </span>
                ))}
              </div>
            )}

            {extra && <div className="mt-3">{extra}</div>}

            {(imageCredit || imageSource) && (
              <p className="mt-3 text-[10px] text-foreground/60">
                {imageCredit}
                {imageCredit && imageSource ? " · " : ""}
                {imageSource}
              </p>
            )}
          </div>
        </header>
      </div>
    </>
  );
}

