import { EntityType } from "./types";

/**
 * Historical Visual Importance classification for entities.
 * These are manually assigned or derived to prioritize visual production.
 */
export type HistoricalVisualImportance = 
  | "CORE"       // Foundational entities (e.g. Prophets, Major Sahaba, Holy Cities)
  | "MAJOR"      // Highly influential figures/events/locations
  | "NORMAL"     // Standard encyclopedia entities
  | "SUPPORTING" // Entities with minor or supporting roles
  | "UNREVIEWED"; // Default state before classification

export type ProductionStatus = 
  | "READY_FOR_VISUAL_PRODUCTION"
  | "HAS_EXISTING_IMAGE"
  | "LOW_SIGNAL"
  | "NEEDS_MANUAL_PRIORITY_REVIEW"
  | "DUPLICATE_Archived"
  | "DUPLICATE_Redirected";

/**
 * Detailed breakdown of the priority score.
 */
export interface ScoreBreakdown {
  mandatoryUnlock: number;
  coreCampaign: number;
  supportingCampaign: number;
  storyPrimary: number;
  investigationRelation: number;
  structuralAnchor: number;
  crossSystemBonus: number;
  gameplayGravity: number; // Sum of all system signals
  historicalImportanceBonus: number; // Bonus based on classification
}

/**
 * Lifecycle and Canonical state audit.
 */
export interface CanonicalAudit {
  isEligible: boolean;
  status: string; // 'enabled', 'disabled'
  isRedirect: boolean;
  isArchived: boolean;
  canonicalId?: string;
  duplicateCandidateType?: 'CONFIRMED_REDIRECT' | 'LIKELY_DUPLICATE' | 'VALID_DISTINCT' | 'NEEDS_REVIEW';
}

/**
 * Enhanced Entity Priority Report.
 */
export interface EntityPriorityReport {
  rankWithinType: number;
  id: string;
  slug: string;
  titleAr: string;
  type: EntityType;
  worldSlug?: string;
  era?: string;
  
  // Scoring
  finalScore: number;
  gameplayGravity: number;
  historicalImportance: HistoricalVisualImportance;
  scoreBreakdown: ScoreBreakdown;
  
  // Signals
  campaignCount: number;
  storyCount: number;
  investigationCount: number;
  unlockDependencyCount: number;
  distinctSystemsCount: number;
  
  // Media Status
  hasImage: boolean;
  imagePath?: string;
  productionStatus: ProductionStatus;
  
  // Canonical Audit
  canonical: CanonicalAudit;
}

export interface PriorityAuditResult {
  scoringLogic: string;
  eligibleUniverseCount: number;
  archivedOrRedirectedCount: number;
  distribution: Record<EntityType, number>;
  eraBias: Record<string, number>;
  top50Overall: EntityPriorityReport[];
  shortlists: Record<EntityType, EntityPriorityReport[]>;
  anomalies: string[];
  assessment: string;
}
