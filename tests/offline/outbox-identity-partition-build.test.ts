// @vitest-environment node
import { afterAll, expect, it } from "vitest";
import { build } from "vite";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { runInNewContext } from "node:vm";

const root = resolve(import.meta.dirname, "../..");
const temporary: string[] = [];
afterAll(async () => { await Promise.all(temporary.map(path => rm(path, { recursive: true, force: true }))); });

it.each(["guest", "user"])("production bundling retains bare initialization and isolates %s writes", async (kind) => {
  const directory = await mkdtemp(join(tmpdir(), "irth-partition-build-"));
  temporary.push(directory);
  const entry = join(directory, "entry.ts");
  await writeFile(entry, `import ${JSON.stringify(join(root, "src/lib/identity/install.ts"))};
    import { getActiveOwner, setActiveOwnerInternal } from ${JSON.stringify(join(root, "src/lib/identity/owner.ts"))};
    globalThis.partitionProbe = { getActiveOwner, setActiveOwnerInternal };`);
  const result = await build({ configFile: false, root, logLevel: "silent", build: {
    write: false, minify: false, lib: { entry, formats: ["iife"], name: "PartitionProbe" },
  } });
  const output = (Array.isArray(result) ? result[0] : result) as { output: { code?: string }[] };
  const code = output.output.map(item => item.code ?? "").join("\n");
  class Store {
    values = new Map<string, string>();
    get length() { return this.values.size; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    getItem(key: string) { return this.values.get(String(key)) ?? null; }
    setItem(key: string, value: string) { this.values.set(String(key), String(value)); }
    removeItem(key: string) { this.values.delete(String(key)); }
  }
  const storage = new Store();
  // Synthetic legacy progress must survive installation; no real account data.
  storage.setItem("irth_campaign_progress", '{"synthetic":true}');
  storage.setItem("irth.device.id.v1", "test-device");
  if (kind === "user") storage.setItem("sb-fixture-auth-token", JSON.stringify({user:{id:"synthetic-signed-in"}}));
  const window = { Storage: Store, localStorage: storage, sessionStorage: new Store(), dispatchEvent() {} };
  const context: any = { window, localStorage: storage, sessionStorage: window.sessionStorage, console, setTimeout, clearTimeout };
  runInNewContext(code, context);
  const owner = context.partitionProbe.getActiveOwner();
  expect(owner).toBe(kind === "guest" ? "guest:test-device" : "user:synthetic-signed-in");
  const original = (Store.prototype as any).__originalGetItem;
  expect(typeof original).toBe("function");
  expect(storage.getItem).not.toBe(original);
  expect(storage.getItem("irth_campaign_progress")).toBe('{"synthetic":true}');
  expect(original.call(storage, "irth_campaign_progress")).toBeNull();
  expect(original.call(storage, `irth_campaign_progress::owner=${owner}`)).toBe('{"synthetic":true}');
  storage.setItem("irth.campaign_progress_buffer.v1", "synthetic-buffer");
  expect(original.call(storage, `irth.campaign_progress_buffer.v1::owner=${owner}`)).toBe("synthetic-buffer");
  context.partitionProbe.setActiveOwnerInternal("user:synthetic-other");
  expect(storage.getItem("irth_campaign_progress")).toBeNull();
  expect(storage.getItem("irth.campaign_progress_buffer.v1")).toBeNull();
  context.partitionProbe.setActiveOwnerInternal(owner);
  expect(storage.getItem("irth.campaign_progress_buffer.v1")).toBe("synthetic-buffer");
});
