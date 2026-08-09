export type EntityType = 
  | "Figure" 
  | "Event" 
  | "City" 
  | "Battle" 
  | "Landmark" 
  | "State" 
  | "Artifact";

export type ProductionStatus = 
  | "READY_FOR_VISUAL_PRODUCTION"
  | "HAS_EXISTING_IMAGE"
  | "LOW_SIGNAL"
  | "NEEDS_MANUAL_PRIORITY_REVIEW";

export interface ScoreBreakdown {
  mandatoryUnlock: number;
  coreCampaign: number;
  supportingCampaign: number;
  storyPrimary: number;
  investigationRelation: number;
  curatedImportance: number;
  structuralAnchor: number;
  crossSystemBonus: number;
}

export interface EntityPriorityReport {
  rankWithinType: number;
  id: string;
  slug: string;
  titleAr: string;
  type: EntityType;
  worldSlug?: string;
  era?: string;
  finalScore: number;
  scoreBreakdown: ScoreBreakdown;
  campaignCount: number;
  storyCount: number;
  investigationCount: number;
  unlockDependencyCount: number;
  curatedImportance: string | null;
  distinctSystemsCount: number;
  hasImage: boolean;
  imagePath?: string;
  productionStatus: ProductionStatus;
}

export interface PriorityAuditResult {
  scoringLogic: string;
  unavailableSignals: string[];
  distribution: Record<EntityType, number>;
  top25Overall: EntityPriorityReport[];
  shortlists: Record<EntityType, EntityPriorityReport[]>;
  anomalies: string[];
  assessment: string;
}
