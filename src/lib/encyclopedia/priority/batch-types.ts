
import { EntityType, GenerationAudit } from "./types";

export type ProductionBatchStatus = 
  | "QUEUED"
  | "GENERATED"
  | "APPROVED"
  | "REGENERATE"
  | "PROCESSED"
  | "UPLOADED"
  | "ATTACHED"
  | "COMPLETE";

export interface ProductionBatchItem {
  entityId: string;
  entitySlug: string;
  entityName: string;
  entityType: EntityType;
  prompt: string;
  audit: GenerationAudit;
  status: ProductionBatchStatus;
  imageUrl?: string; // Staging URL or final URL
  webpSize?: number;
  validationStatus?: "PASS" | "WARNING" | "REJECT_RECOMMENDED";
  validationWarnings?: string[];
  error?: string;
  updatedAt: string;
}

export interface ProductionBatch {
  id: string;
  items: ProductionBatchItem[];
  createdAt: string;
  status: "DRAFT" | "READY_FOR_REVIEW" | "PARTIALLY_APPROVED" | "APPROVED" | "COMPLETED";
  batchType: "CALIBRATION" | "PRODUCTION";
}

export interface BatchHistoryEntry {
  batchId: string;
  entityCount: number;
  approvedCount: number;
  regeneratedCount: number;
  publishedCount: number;
  date: string;
}
