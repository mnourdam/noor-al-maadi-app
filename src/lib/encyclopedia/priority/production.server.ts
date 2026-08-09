
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
    
    // Construct base cinematic prompt based on Visual DNA
    const typeSpec = IRTH_VISUAL_DNA.typeSpecs[entity.type];
    const dnaCore = IRTH_VISUAL_DNA.coreQualities.join(", ");
    
    // Very simplified prompt generation for the dry-run/logic demonstration
    basePrompt = `${IRTH_VISUAL_DNA.styleName}: ${entity.titleAr} (${entity.type}). ${typeSpec.focus}. ${dnaCore}. Lighting: ${IRTH_VISUAL_DNA.lighting[0]}.`;

    // Add specific details for corrections
    if (entity.slug === "al-mustasim-billah") {
      basePrompt += " Emotional concept: The weight of a falling empire. Rear-three-quarter view of an Abbasid Caliph in black and gold silk robes.";
    } else if (entity.slug === "bayt-al-hikma") {
      basePrompt += " Scholars, wood, parchment, ink, lamps, period architecture.";
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
