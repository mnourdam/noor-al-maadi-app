import { expect, it, vi } from "vitest";

const capture = vi.hoisted(() => ({ options: new Map<unknown, any>(), backend: vi.fn() }));
// Observe real builder options without replacing its middleware/validator API.
// No endpoint handler is invoked: these cover module construction and validation,
// not compiled server dispatch, authorization execution or backend operations.
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  const observe = (builder: any): any => new Proxy(builder, {
    get(target, key) {
      if (key === "middleware" || key === "validator") {
        return (...args: unknown[]) => observe(target[key](...args));
      }
      if (key === "handler") return (...args: unknown[]) => {
        const fn = target.handler(...args);
        capture.options.set(fn, target.options);
        return fn;
      };
      return Reflect.get(target, key);
    },
  });
  return { ...actual, createServerFn: (...args: Parameters<typeof actual.createServerFn>) => observe(actual.createServerFn(...args)) };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: (...args: unknown[]) => {
  capture.backend(...args); throw new Error("backend forbidden in validator regression");
} }));
vi.mock("@/integrations/supabase/client.server", () => { throw new Error("privileged client must not load"); });
vi.mock("@/lib/diag-trace", () => ({ recordTrace: vi.fn() }));

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import * as achievements from "@/lib/achievements/v2/claim.functions";
import * as imports from "@/lib/import/import-batch.functions";
import { deleteMyAccount } from "@/lib/deleteAccount.functions";
import { createTeamUser, deletePlayer } from "@/lib/teamUsers.functions";
import { verifyStoryMedia } from "@/lib/stories/media/verify.functions";
import { writeBundledSnapshotFile } from "@/lib/offline-snapshot-write.functions";
import { logDiagnostic } from "@/lib/diag.functions";

const uuid = "12345678-1234-4234-8234-123456789abc";
const plan = { content_type: "stories", original_payload_hash: "hash", approved_plan_hash: "approved", overwrite: false, publish: false, items: [] };
const cases: [string, unknown, unknown, unknown, boolean][] = [
  ["claim", achievements.claimAchievements, { ids: ["a"], engineVersion: 1 }, { ids: ["a"], engineVersion: 0 }, true],
  ["presentation", achievements.markAchievementsPresented, { ids: ["a"] }, { ids: [""] }, true],
  ["repair", achievements.repairHistoricalAchievements, { ids: [] }, { ids: Array(129).fill("a") }, true],
  ["delete own account", deleteMyAccount, { confirm: "حذف حسابي" }, { confirm: "" }, true],
  ["create user", createTeamUser, { email: "test@example.invalid", password: "test-only-password", display_name: "Test", role: "player" }, { role: "superadmin" }, true],
  ["delete player", deletePlayer, { user_id: uuid }, { user_id: "bad" }, true],
  ["verify media", verifyStoryMedia, { mediaId: uuid }, { mediaId: "bad" }, true],
  ["run import", imports.runImportBatch, { plan, mode: "dry_run" }, { plan, mode: "invalid" }, true],
  ["run campaign", imports.runCampaignBatch, { plan, mode: "dry_run" }, { plan, mode: "invalid" }, true],
  ["rollback campaign", imports.rollbackCampaignBatch, { batch_id: uuid }, { batch_id: "bad" }, true],
  ["rollback import", imports.rollbackImportBatch, { batch_id: uuid }, { batch_id: "bad" }, true],
  ["list import", imports.listImportBatches, undefined, { limit: 201 }, true],
  ["get import", imports.getImportBatch, { batch_id: uuid }, { batch_id: "bad" }, true],
  ["snapshot", writeBundledSnapshotFile, { json: "{}" }, { json: "" }, false],
  ["diagnostic", logDiagnostic, { stage: "test" }, { stage: 1 }, false],
];

it.each(cases)("%s retains real builder validation and middleware", (_name, fn, valid, invalid, authenticated) => {
  const options = capture.options.get(fn);
  expect(options).toBeDefined();
  expect(options.method).toBe("POST");
  expect(typeof options.validator).toBe("function");
  expect(() => options.validator(valid)).not.toThrow();
  expect(() => options.validator(invalid)).toThrow();
  if (fn === writeBundledSnapshotFile) {
    expect(options.middleware).toHaveLength(2);
    expect(typeof options.middleware[0].options.server).toBe("function");
    expect(options.middleware[1]).toBe(requireSupabaseAuth);
  } else {
    expect(options.middleware ?? []).toEqual(authenticated ? [requireSupabaseAuth] : []);
  }
  expect(capture.backend).not.toHaveBeenCalled();
});

it("preserves normalization/defaults rather than bypassing schema parsing", () => {
  expect(capture.options.get(achievements.markAchievementsPresented).validator({ ids: [] })).toEqual({ ids: [], origin: "live_gameplay_unlock" });
  expect(capture.options.get(achievements.repairHistoricalAchievements).validator({ ids: [] })).toEqual({ ids: [], metadata: {} });
  expect(capture.options.get(imports.listImportBatches).validator(undefined)).toEqual({});
  const normalized = capture.options.get(createTeamUser).validator({
    ...(cases[4][2] as object), email: "  test@example.invalid  ", display_name: "  Test  ",
  });
  expect(normalized.email).toBe("test@example.invalid");
  expect(normalized.display_name).toBe("Test");
  expect(normalized.role).toBe("player");
});

it("leaves the unvalidated GET and real runtime API intact", () => {
  const options = capture.options.get(achievements.fetchUserAchievements);
  expect(options.method).toBe("GET");
  expect(options.middleware).toEqual([requireSupabaseAuth]);
  expect(options.validator).toBeUndefined();
  const builder = createServerFn({ method: "POST" });
  expect(typeof builder.validator).toBe("function");
  expect((builder as any).inputValidator).toBeUndefined();
});
