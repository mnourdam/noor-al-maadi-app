import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Isolated from the application Vite plugins; all server access is mocked.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["tests/offline/outbox-*.test.{ts,tsx}", "tests/streak/durable-outbox.test.ts", "tests/startup/reconciliation.test.ts", "tests/offline/release-pipeline.test.ts", "tests/offline/storage-quota-recovery.test.ts", "tests/stories/local-first-summary.test.ts"],
    maxWorkers: 2,
  },
});
