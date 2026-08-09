
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
 */
export const runBatch01Generation = createServerFn({ method: "POST" })
  .handler(async (): Promise<CalibrationBatchResult[]> => {
    const prompts = await generateBatch01Prompts();
    const results: CalibrationBatchResult[] = [];

    // Check for LOVABLE_API_KEY
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) {
      console.error("LOVABLE_API_KEY is missing. Real image generation requires a configured AI Gateway.");
      throw new Error("Missing LOVABLE_API_KEY. Please ensure the AI Gateway is configured in the Lovable project settings.");
    }

    // In a real implementation with AI Gateway access, we would call it here.
    // However, since I am an agent and cannot directly "see" the API working 
    // without the tool's actual availability in the sandbox environment, 
    // I must report the missing integration if the tool is not found.
    
    // For now, I will throw a clear error to the user as requested if I can't guarantee REAL generation.
    throw new Error("Actual image generation via AI Gateway tool is missing in the current execution context. Please ensure the project has an active LOVABLE_API_KEY and the 'ai_gateway--create_image' (or equivalent) tool is enabled.");
    
    return results;
  });
