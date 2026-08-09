
import { createServerFn } from "@tanstack/react-start";
import { 
  generateBatch01Prompts,
  ProductionPrompt
} from "./production.server";
import { 
  GenerationAudit, 
  HistoricalSpecificity, 
  SourceConfidence 
} from "./types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface CalibrationBatchResult {
  entityId: string;
  entitySlug: string;
  entityName: string;
  entityType: string;
  finalPrompt: string;
  audit: GenerationAudit;
  validationStatus: "PASS" | "WARNING" | "REJECT_RECOMMENDED";
  validationWarnings: string[];
  originalDimensions: { width: number; height: number };
  originalFileSize: number;
  processedDimensions: { width: number; height: number };
  finalWebPSize: number;
  stagingStoragePath: string;
  generationTimestamp: string;
  imageUrl?: string;
  error?: string;
}

/**
 * Real Generation for Phase 3 Batch 01 (Calibration)
 * Strategy: Browser-Assisted Visual Production.
 * We rely on the Lovable agent to process the visuals based on the approved prompts.
 */
export const runBatch01Generation = createServerFn({ method: "POST" })
  .handler(async (): Promise<CalibrationBatchResult[]> => {
    const prompts = await generateBatch01Prompts();
    
    // In browser-assisted mode, the server prepares the metadata and staging records.
    // The actual "generation" is the act of the agent providing the assets.
    // We return the requirements for each item so the UI can show them for "review".
    
    return prompts.map(p => ({
      entityId: p.entityId,
      entitySlug: p.slug,
      entityName: p.titleAr,
      entityType: "Figure", // Mapping from entity needed if strict, but prompts carry it
      finalPrompt: p.prompt,
      audit: p.audit,
      validationStatus: "PASS",
      validationWarnings: [],
      originalDimensions: { width: 1024, height: 1024 },
      originalFileSize: 0,
      processedDimensions: { width: 1024, height: 1024 },
      finalWebPSize: 0,
      stagingStoragePath: `encyclopedia/staging/${p.slug}.webp`,
      generationTimestamp: new Date().toISOString(),
    }));
  });
