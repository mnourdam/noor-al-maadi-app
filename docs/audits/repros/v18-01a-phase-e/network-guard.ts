import { vi } from "vitest";
globalThis.fetch = vi.fn(async () => {
  throw new Error("AUDIT: outbound fetch blocked");
}) as any;
