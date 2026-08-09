
import { generatePriorityAudit } from "./engine.server";
import { EntityPriorityReport, EntityType, PriorityAuditResult } from "./types";

export interface ProductionUniverseReport {
  eligibleUniverseCount: number;
  countsByType: Record<EntityType, number>;
  candidateLists: Record<EntityType, EntityPriorityReport[]>;
  eraBias: Record<string, number>;
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

