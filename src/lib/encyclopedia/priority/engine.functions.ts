import { createServerFn } from "@tanstack/react-start";
import { generatePriorityAudit } from "./engine.server";
import { generateBatch01Prompts } from "./production.server";
import { runBatch01Generation as runGen } from "./generation.functions";

export const getPriorityAudit = createServerFn({ method: "GET" })
  .handler(async () => {
    return generatePriorityAudit();
  });

export const getBatch01Prompts = createServerFn({ method: "GET" })
  .handler(async () => {
    return generateBatch01Prompts();
  });

export const runBatch01Generation = createServerFn({ method: "POST" })
  .handler(async () => {
    return runGen();
  });
