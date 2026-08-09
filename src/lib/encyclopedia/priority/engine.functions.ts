import { createServerFn } from "@tanstack/react-start";
import { generatePriorityAudit } from "./engine.server";
import { generateBatch01Prompts } from "./production.server";
// Removed runBatch01Generation from generation.functions to prevent server info errors

export const getPriorityAudit = createServerFn({ method: "GET" })
  .handler(async () => {
    return generatePriorityAudit();
  });

export const getBatch01Prompts = createServerFn({ method: "GET" })
  .handler(async () => {
    return generateBatch01Prompts();
  });

// runBatch01Generation removed as per user instruction to avoid server function info errors.
