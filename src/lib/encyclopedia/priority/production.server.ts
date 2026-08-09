
import { generatePriorityAudit } from "./engine.server";
import { 
  EntityPriorityReport, 
  EntityType, 
  HistoricalSpecificity, 
  SourceConfidence, 
  GenerationAudit 
} from "./types";
import { IRTH_VISUAL_DNA } from "./visual-dna";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface ProductionUniverseReport {
  eligibleUniverseCount: number;
  countsByType: Record<EntityType, number>;
  candidateLists: Record<EntityType, EntityPriorityReport[]>;
  eraBias: Record<string, number>;
}

export interface ProductionPrompt {
  entityId: string;
  slug: string;
  titleAr: string;
  prompt: string;
  audit: GenerationAudit;
}

/**
 * Extracts the actual eligible production lists based on strict Canonical Eligibility.
 * Strictly includes ONLY approved/active canonical entities missing an image.
 */
export async function getProductionUniverseReport(): Promise<ProductionUniverseReport> {
  const audit = await generatePriorityAudit();
  
  return {
    eligibleUniverseCount: audit.eligibleUniverseCount,
    countsByType: audit.distribution,
    candidateLists: audit.shortlists,
    eraBias: audit.eraBias
  };
}

/**
 * Historical Specificity Confidence Gate logic applied to prompt generation.
 */
export function applyHistoricalSpecificityGate(
  entity: EntityPriorityReport,
  basePrompt: string,
  historicalEvidence: any
): { prompt: string; audit: GenerationAudit } {
  const removedDetails: string[] = [];
  let specificity: HistoricalSpecificity = "DOCUMENTED";
  let confidence: SourceConfidence = "HIGH";

  let finalPrompt = basePrompt;

  // Example Logic for Gate application
  // In a real implementation, this would use the entity's metadata/description
  
  if (entity.slug === "al-mustasim-billah") {
    // Correction 1: Al-Mustasim Billah
    // "Do not place him specifically inside the original Round City... conservative late-Abbasid elite interior"
    if (finalPrompt.includes("Round City") || finalPrompt.includes("Palace of the Golden Gate")) {
      finalPrompt = finalPrompt.replace(/in the Palace of the Golden Gate|inside the Round City/g, "in a conservative late-Abbasid palatial interior in Baghdad");
      removedDetails.push("Specific Round City/Golden Gate Palace location");
      specificity = "PERIOD_PLAUSIBLE";
      confidence = "MEDIUM";
    }
  }

  if (entity.slug === "bayt-al-hikma") {
    // Correction 2: Bayt al-Hikma
    // "Do not invent a precisely known monumental interior... scholarly/library environment"
    if (finalPrompt.includes("monumental grand hall") || finalPrompt.includes("exact reconstruction")) {
      finalPrompt = finalPrompt.replace(/monumental grand hall|exact architectural reconstruction/g, "historically plausible Abbasid scholarly library environment with manuscripts and scholars");
      removedDetails.push("Exact monumental grand hall design");
      specificity = "PERIOD_PLAUSIBLE";
      confidence = "MEDIUM";
    }
  }

  // Generic handling for Artifacts without specific documentation
  if (entity.type === "Artifact") {
    const isSpecificArtifact = !!entity.imagePath; // Placeholder for "known surviving"
    if (!isSpecificArtifact) {
      specificity = "PERIOD_PLAUSIBLE";
      confidence = "MEDIUM";
    }
  }

  return {
    prompt: finalPrompt,
    audit: {
      historicalSpecificity: specificity,
      unsupportedDetailsRemoved: removedDetails.length > 0 ? removedDetails : "NONE",
      sourceConfidence: confidence,
      notes: "Historical Specificity Confidence Gate applied."
    }
  };
}

/**
 * Generates Batch 01 prompts with the Historical Specificity Gate applied.
 */
export async function generateBatch01Prompts(): Promise<ProductionPrompt[]> {
  const report = await getProductionUniverseReport();
  
  // Hardcoded selection for Test Batch 01 as per instructions
  const testSlugs = [
    "al-mustasim-billah",
    "hulagu-khan",
    "fall-of-baghdad",
    "siege-of-baghdad",
    "edirne",
    "bayt-al-hikma",
    "abbasid-astrolabe",
    "hijaz",
    "seljuk-banner",
    "prospering-of-cordoba"
  ];

  const candidates: EntityPriorityReport[] = [];
  Object.values(report.candidateLists).forEach(list => {
    list.forEach(e => {
      if (testSlugs.includes(e.slug)) candidates.push(e);
    });
  });

  // Map to match exact batch order
  const batch = testSlugs.map(slug => candidates.find(c => c.slug === slug)).filter(Boolean) as EntityPriorityReport[];

  return batch.map(entity => {
    let basePrompt = "";
    
    // Detailed prompt construction
    if (entity.slug === "al-mustasim-billah") {
      basePrompt = `${IRTH_VISUAL_DNA.styleName}: Al-Mustasim Billah, the last Abbasid Caliph in Baghdad. Emotional concept: The weight of a falling empire. Composition: rear-three-quarter environmental portrait. He is seen from behind, slightly angled, wearing heavy black silk robes with intricate gold borders (Abbasid colors). He stands in a conservative late-Abbasid palatial interior in Baghdad. Through a window, a low sun casts long shadows over parchment scrolls on a low desk. Atmospheric depth with motes of dust in the light. No facial identity, focus on posture and period-plausible luxury.`;
    } else if (entity.slug === "bayt-al-hikma") {
      basePrompt = `${IRTH_VISUAL_DNA.styleName}: Bayt al-Hikma (House of Wisdom), Baghdad. Composition: framed-through-architecture. A historically plausible Abbasid scholarly library environment. Rows of polished wood shelves filled with bound manuscripts and parchment scrolls. Scholars in period-plausible robes are seen in soft-focus background, engaged in translation work. Natural light filtered through high arched windows. Details: copper lamps, inkwells, reed pens. Focus on the intellectual atmosphere of the translation movement. No monumental grand hall claims.`;
    } else if (entity.slug === "abbasid-astrolabe") {
      basePrompt = `${IRTH_VISUAL_DNA.styleName}: Abbasid-period Astrolabe. Composition: museum-macro-detail. A historically plausible astronomical instrument made of weathered brass and bronze. Intricate geometric engravings (no legible text). Controlled museum directional lighting highlighting the metallic texture and patina. The object is resting on a dark velvet or aged silk surface. Depth of field obscuring the background. Premium historical artifact reconstruction.`;
    } else if (entity.slug === "seljuk-banner") {
      basePrompt = `${IRTH_VISUAL_DNA.styleName}: Seljuk War Banner (11th Century). Composition: action-tracking. A heavy silk or linen banner on a wooden pole, fluttering in the wind over an Anatolian ridge. Muted earth tones, conservative period-plausible textile weave. No fabricated heraldic emblems or inscriptions. Lighting: overcast battlefield light. The background shows the silhouettes of a marching army in the mist. Focus on material authenticity and atmospheric historical presence.`;
    } else if (entity.slug === "fall-of-baghdad") {
      basePrompt = `${IRTH_VISUAL_DNA.styleName}: The Fall of Baghdad (1258). Composition: wide-establishing. A somber urban atmosphere under a low, smoke-filled sun. Distant views of the city's walls and towers. Piles of abandoned scrolls and artifacts in the foreground, half-buried in dust. Small groups of inhabitants moving away in the shadows. The atmosphere is one of civilizational collapse and silence. Deep navy shadows inflected with warm, ash-like highlights.`;
    } else if (entity.slug === "siege-of-baghdad") {
      basePrompt = `${IRTH_VISUAL_DNA.styleName}: The Siege of Baghdad (1258). Composition: medium-environmental. Intense military pressure. Large formations of Mongol cavalry and siege engines (trebuchets) positioned on the ridges overlooking the Tigris. Dust clouds, wooden palisades, and military encampments. Kinetic energy through formations and equipment. Restrained lighting, focus on the logistical scale of the siege.`;
    } else {
      basePrompt = `${IRTH_VISUAL_DNA.styleName}: ${entity.titleAr} (${entity.type}). ${typeSpec.focus}. ${dnaCore}. Lighting: ${IRTH_VISUAL_DNA.lighting[0]}. Historical grounding and period-plausible materials.`;
    }

    const { prompt, audit } = applyHistoricalSpecificityGate(entity, basePrompt, {});
    
    return {
      entityId: entity.id,
      slug: entity.slug,
      titleAr: entity.titleAr,
      prompt,
      audit
    };
  });
}
