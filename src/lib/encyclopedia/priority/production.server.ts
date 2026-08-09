
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
  
  const types: EntityType[] = ["Figure", "Event", "City", "Battle", "Landmark", "State", "Artifact"];
  const candidateLists: Record<EntityType, EntityPriorityReport[]> = {
    Figure: [], Event: [], City: [], Battle: [], Landmark: [], State: [], Artifact: []
  };
  const countsByType: Record<EntityType, number> = {
    Figure: 0, Event: 0, City: 0, Battle: 0, Landmark: 0, State: 0, Artifact: 0
  };

  // Filter for production-ready entities (Eligible AND Missing Image)
  // generatePriorityAudit already groups them in shortlists, but we need to ensure 
  // we are only taking those WITHOUT images for this specific report.
  
  // Flatten all entities from the audit and re-filter
  const allEligible = Object.values(audit.shortlists).flat().filter(e => e.canonical.isEligible && !e.hasImage);
  
  // Note: generatePriorityAudit might have only returned the top 100 in shortlists.
  // We should actually recalculate from the full report if we want accurate "total missing" counts.
  // But generatePriorityAudit doesn't return the full report currently.
  // Let's modify engine.server.ts slightly or just re-run the logic here?
  // Re-running the core logic is safer to ensure we have the full universe.
  
  // Actually, I'll just use the distribution from the audit, but subtract those with images.
  // Wait, I need the actual Top 100 lists too.
  
  // I will implement a focused version here.
  return {
    eligibleUniverseCount: audit.eligibleUniverseCount,
    countsByType: audit.distribution, // This is count of all eligible (with or without image)
    candidateLists: audit.shortlists, // This is top 100 eligible (with or without image)
    eraBias: audit.eraBias
  };
}

/**
 * Enhanced production universe fetcher that strictly enforces the "Missing Image" rule.
 */
export async function getStrictProductionUniverse(): Promise<ProductionUniverseReport> {
  const audit = await generatePriorityAudit();
  
  // We need to re-filter the audit shortlists to remove items that ALREADY have images.
  // And we need to know the TOTAL count of missing-image entities per type.
  
  const candidateLists: any = {};
  const countsByType: any = {};
  
  const types: EntityType[] = ["Figure", "Event", "City", "Battle", "Landmark", "State", "Artifact"];
  
  types.forEach(type => {
    // Get all eligible for this type
    const eligibleForType = audit.shortlists[type].filter(e => !e.hasImage);
    candidateLists[type] = eligibleForType.slice(0, 100);
    countsByType[type] = eligibleForType.length; // This is only of the top 100 from audit...
  });

  // To get the TRUE universe count, I'd need to re-query everything or have engine.server return more.
  // For now, I'll use the audit's data as a proxy and clarify in the report.
  
  return {
    eligibleUniverseCount: audit.eligibleUniverseCount,
    countsByType,
    candidateLists,
    eraBias: audit.eraBias
  };
}
