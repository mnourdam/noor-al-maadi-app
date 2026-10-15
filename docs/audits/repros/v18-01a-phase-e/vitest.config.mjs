import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const here = fileURLToPath(new URL("./", import.meta.url));

// Separate from the app plugins and the default Outbox test configuration.
export default defineConfig({
  root,
  resolve: {
    alias: { "@": fileURLToPath(new URL("src/", new URL("../../../../", import.meta.url))) },
  },
  test: {
    environment: "jsdom",
    envFile: false,
    include: ["docs/audits/repros/v18-01a-phase-e/probes.test.ts"],
    setupFiles: [`${here}network-guard.ts`],
    maxWorkers: 1,
  },
});
