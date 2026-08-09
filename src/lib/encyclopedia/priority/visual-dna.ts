
/**
 * Irth Encyclopedia Visual DNA Specification
 * 
 * This file codifies the cinematic and historical rules for encyclopedia imagery production.
 * It serves as the master reference for the prompt generation system.
 */

export type CompositionFamily = 
  | "intimate-foreground"
  | "medium-environmental"
  | "wide-establishing"
  | "over-the-shoulder"
  | "rear-three-quarter"
  | "low-angle-monumental"
  | "elevated-environmental"
  | "framed-through-architecture"
  | "atmospheric-distance"
  | "action-tracking"
  | "museum-macro-detail";

export interface VisualDNASpec {
  styleName: "Irth Heritage Cinematic Style";
  coreQualities: string[];
  colorIdentity: {
    shadows: "Deep navy-inflected";
    highlights: "Warm restrained gold";
    palette: string[];
  };
  lighting: string[];
  globalRules: string[];
  typeSpecs: Record<string, {
    defaultComposition: CompositionFamily;
    focus: string;
    religiousSafeguards?: string[];
    forbidden?: string[];
  }>;
  historicalSpecificityRules: string[];
}

export const IRTH_VISUAL_DNA: VisualDNASpec = {
  styleName: "Irth Heritage Cinematic Style",
  coreQualities: [
    "Ultra-realistic historical cinematic imagery",
    "Premium film-quality photography",
    "Museum-quality historical reconstruction",
    "Realistic with a very subtle painterly richness",
    "Sophisticated, restrained and historically grounded",
    "Immersive rather than illustrative",
    "Cinematic depth and atmospheric perspective",
    "Highly detailed historically accurate materials",
    "Believable human scale",
    "Elegant visual storytelling"
  ],
  colorIdentity: {
    shadows: "Deep navy-inflected",
    highlights: "Warm restrained gold",
    palette: [
      "Natural earth tones", "Stone", "Parchment", "Bronze", "Aged wood",
      "Dusty beige", "Muted greens", "Historically appropriate textile colors"
    ]
  },
  lighting: [
    "Motivated historical/natural lighting",
    "Dawn/Dusk/Sunlight",
    "Window light/Firelight/Oil lamps/Candlelight",
    "Overcast battlefield light",
    "Volumetric shafts (selective)"
  ],
  globalRules: [
    "NO visible text, captions, logos, watermarks, or UI",
    "NO fabricated Arabic calligraphy or Qur'anic verses",
    "Mandatory historical accuracy (period, region, culture, architecture, clothing, weaponry, terrain)",
    "NO blood, gore, severed limbs, visible wounds, or graphic corpses",
    "NO visible text, captions, logos, or fabricated Arabic calligraphy",
    "If inscriptions are required by object type, keep them visually non-legible through angle, DOF, or lighting",
    "Reject obvious AI artifacts (extra fingers, malformed horses, etc.)"
  ],
  historicalSpecificityRules: [
    "Classify all details as DOCUMENTED, PERIOD-PLAUSIBLE, or SPECULATIVE.",
    "DOCUMENTED: Supported by reliable entity data or historically established evidence. Use directly.",
    "PERIOD-PLAUSIBLE: Appropriate for period/region/culture but not specifically documented for this entity. Avoid presenting as an exact reconstruction of a known object/building.",
    "SPECULATIVE: Detail that cannot be supported reliably. REMOVE or GENERALIZE.",
    "NEVER convert uncertain reconstruction into visual fact for cinematic gain.",
    "Entities with LOW source confidence + highly specific reconstruction must be routed to NEEDS_REVIEW."
  ],
  typeSpecs: {
    Figure: {
      defaultComposition: "rear-three-quarter",
      focus: "Environmental Historical Portrait focusing on context over facial identity.",
      religiousSafeguards: [
        "Prophet Muhammad ﷺ: NEVER depict face, body, silhouette, shadow, or implied form.",
        "Sensitive figures: Default to rear view, obscured face, or distant figure.",
        "NO supernatural visual clichés (glowing faces)."
      ],
      forbidden: ["Modern celebrity portraits", "Generic AI headshots", "Repetitive center-back poses"]
    },
    Event: {
      defaultComposition: "medium-environmental",
      focus: "One decisive historical moment with cinematic tension.",
      forbidden: ["Collages/Montages", "Split-screen", "Floating portraits", "Symbolic objects"]
    },
    City: {
      defaultComposition: "wide-establishing",
      focus: "Immersive Inhabited Historical Establishing View.",
      forbidden: ["Empty aerial skylines", "Generic 'Islamic city' aesthetic"]
    },
    Battle: {
      defaultComposition: "action-tracking",
      focus: "Kinetic and intense through movement, scale, and atmosphere.",
      forbidden: ["Graphic violence/Gore", "Fantasy armies", "Absurd density", "Impossible armor"]
    },
    Landmark: {
      defaultComposition: "low-angle-monumental",
      focus: "Historical Architectural Hero Shot within environment.",
      forbidden: ["Modern surroundings", "Postcard aesthetic", "Sterile renders"]
    },
    State: {
      defaultComposition: "elevated-environmental",
      focus: "Lived historical world representing a civilization.",
      forbidden: ["Maps/Flags/Emblems", "Text", "Repetitive palace shots"]
    },
    Artifact: {
      defaultComposition: "museum-macro-detail",
      focus: "Irth Museum Object Photography with premium presentation.",
      forbidden: ["Generic black-background product shots", "Fantasy restoration", "Cleaned patina"]
    }
  }
};