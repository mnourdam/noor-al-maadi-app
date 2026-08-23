import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { recordTrace } from "./diag-trace";

export const logDiagnostic = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    stage: z.string(),
    detail: z.string().optional()
  }).parse(d))
  .handler(async ({ data }) => {
    // This is just to ensure the logic has a way to call into server for deeper tracing if needed,
    // but for now we rely on local recordTrace which writes to memory.
    recordTrace("logout-audit", data.stage, data.detail);
    return { success: true };
  });
