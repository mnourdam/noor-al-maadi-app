import { createServerFn } from "@tanstack/react-start";
import { generatePriorityAudit } from "./engine.server";
import { generateBatch01Prompts } from "./production.server";

export const getPriorityAudit = createServerFn({ method: "GET" })
  .handler(async () => {
    return generatePriorityAudit();
  });

export const getBatch01Prompts = createServerFn({ method: "GET" })
  .handler(async () => {
    return generateBatch01Prompts();
  });
