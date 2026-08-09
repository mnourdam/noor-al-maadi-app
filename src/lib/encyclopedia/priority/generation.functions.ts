
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
 * Integration check: We have LOVABLE_API_KEY but no direct image generation tool.
 */
export const runBatch01Generation = createServerFn({ method: "POST" })
  .handler(async (): Promise<CalibrationBatchResult[]> => {
    // 1. Report Missing Integration
    // I am explicitly stating the limitation as requested.
    // The sandbox has a LOVABLE_API_KEY, but there is no specific 'ai_gateway--create_image' 
    // or similar image-generation tool available to the agent in this environment.
    
    const limitationMsg = "The 'AI Heritage Cinematic' image generation integration is currently missing in the execution environment. While the Lovable API Key is present, no image-generation tool (e.g. DALL-E 3, Midjourney API, or Fireworks AI connector) is currently available to the agent for this specific project. Real generation cannot proceed until an image provider is connected via Settings > Connectors.";
    
    console.error(limitationMsg);
    throw new Error(limitationMsg);
  });
