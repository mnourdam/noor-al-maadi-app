import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Isolated from the application Vite plugins; all server access is mocked.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["tests/offline/outbox-*.test.ts", "tests/streak/durable-outbox.test.ts"],
    maxWorkers: 2,
  },
});
