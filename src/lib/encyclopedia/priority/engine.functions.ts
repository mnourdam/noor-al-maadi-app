import { createServerFn } from "@tanstack/react-start";
import { generatePriorityAudit } from "./engine.server";

export const getPriorityAudit = createServerFn({ method: "GET" })
  .handler(async () => {
    return generatePriorityAudit();
  });
