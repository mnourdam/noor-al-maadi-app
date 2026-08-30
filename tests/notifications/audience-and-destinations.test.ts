/**
 * V16 — notification audience authorization + internal destination catalog.
 *
 * Pure/static only: no Edge invocation, no FCM, no notification is sent.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEEP_LINKS, DEEP_LINK_GROUPS, findDeepLink, searchDeepLinks,
} from "../../src/lib/notifications/admin/deep-links";
import { resolveDeepLink } from "../../src/lib/notifications/deepLink";
import {
  SUPPORTED_SEGMENT_IDS, validateNumericFilter, filterSegmentId,
} from "../../src/lib/notifications/admin/segments";

const root = resolve(__dirname, "../..");

/** Latest migration text that defines the audience guard. */
function audienceMigrationSql(): string {
  const dir = resolve(root, "supabase/migrations");
  const files = readdirSync(dir).sort();
  const hits = files
    .map((f) => readFileSync(resolve(dir, f), "utf8"))
    .filter((s) => s.includes("admin_segment_audience_v16"));
  return hits[hits.length - 1] ?? "";
}

// ───────────────────────── 1. audience authorization ─────────────────────

describe("V16 audience targeting authorization", () => {
  const sql = audienceMigrationSql();

  it("uses the canonical owner|admin staff policy, not admin-only", () => {
    expect(sql).toContain("is_notification_audience_staff");
    expect(sql).toMatch(/role::text IN \('owner', 'admin'\)/);
  });

  it("both resolvers are guarded by the same staff policy", () => {
    const guards = sql.match(/IF NOT public\.is_notification_audience_staff\(v_uid\)/g) ?? [];
    expect(guards.length).toBe(2);
    expect(sql).not.toMatch(/IF NOT public\.has_role\(v_uid, 'admin'\)/);
  });

  it("normal players remain denied and anonymous callers fail closed", () => {
    // The only way to pass the guard is an owner/admin row in user_roles;
    // there is no fallback branch that grants access to anyone else.
    expect(sql).toContain("RAISE EXCEPTION 'unauthenticated'");
    expect(sql).toContain("RAISE EXCEPTION 'forbidden'");
    expect(sql).not.toContain("current_user");
    expect(sql).not.toMatch(/RETURN true;/);
  });

  it("execute privileges are not widened to anon/public", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.admin_segment_audience_v16(text, jsonb) FROM anon");
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_segment_audience_v16\(text, jsonb\) TO anon/);
  });

  it("preview and send resolve the same audience (single resolver)", () => {
    expect(sql).toContain("v_ids := public.admin_resolve_segment_v16(p_segment_id, p_filter)");
  });

  it("segment + numeric rule contracts are unchanged", () => {
    expect(SUPPORTED_SEGMENT_IDS).toContain("level_20_plus");
    expect(validateNumericFilter({ field: "level", op: ">=", value: 20 })).toBeNull();
    expect(validateNumericFilter({ field: "level", op: ">=", value: NaN })).not.toBeNull();
    expect(filterSegmentId({ field: "level", op: ">=", value: 20 })).toBe("filter:level>=20");
  });
});

// ───────────────────────── 2. destination catalog ────────────────────────

const ROUTE_FILES = readdirSync(resolve(root, "src/routes"));

describe("V16 internal destination catalog", () => {
  it("covers every required destination", () => {
    const required = [
      "home", "campaigns.home", "campaigns.continue", "campaigns.specific",
      "stories.home", "stories.specific",
      "encyclopedia.home", "encyclopedia.entity", "encyclopedia.type",
      "atlas.home", "atlas.entity",
      "museum.home", "museum.artifact",
      "investigations.home", "investigations.specific",
      "community.leaderboard", "profile.achievements", "profile.account",
      "notifications.center",
    ];
    for (const id of required) expect(findDeepLink(id), id).toBeTruthy();
  });

  it("serializes one canonical link mirrored into payload.url", () => {
    for (const d of DEEP_LINKS) {
      const params = Object.fromEntries(d.params.map((p) => [p.key, "x"]));
      const out = d.build(params);
      expect(out.deep_link.startsWith("/"), d.id).toBe(true);
      expect(out.payload.url, d.id).toBe(out.deep_link);
      // The Android open handler must land on exactly the previewed URL.
      expect(resolveDeepLink({ deep_link: out.deep_link, payload: out.payload })).toBe(out.deep_link);
    }
  });

  it("specific Story destination targets the real /story/$id route", () => {
    const out = findDeepLink("stories.specific")!.build({ id: "abc-123" });
    expect(out.deep_link).toBe("/story/abc-123");
    expect(ROUTE_FILES).toContain("story.$id.tsx");
  });

  it("specific Atlas destination focuses by atlas entity id (was broken)", () => {
    const def = findDeepLink("atlas.entity")!;
    expect(def.params[0].key).toBe("id");
    expect(def.params[0].source).toBe("atlas_entity");
    const out = def.build({ id: "6f1b0c22-0000-4000-8000-000000000000" });
    expect(out.deep_link).toBe("/map?focus=6f1b0c22-0000-4000-8000-000000000000&zoom=6");
    expect(ROUTE_FILES).toContain("map.tsx");
  });

  it("specific campaign uses the imported campaign route", () => {
    expect(findDeepLink("campaigns.specific")!.build({ slug: "prophetic-mission" }).deep_link)
      .toBe("/campaigns/imported/prophetic-mission");
    expect(ROUTE_FILES).toContain("campaigns.imported.$id.index.tsx");
  });

  it("every parameterless destination points at an existing route file", () => {
    const map: Record<string, string> = {
      "/": "index.tsx",
      "/campaigns": "campaigns.index.tsx",
      "/journey": "journey.tsx",
      "/stories": "stories.index.tsx",
      "/encyclopedia": "encyclopedia.index.tsx",
      "/map": "map.tsx",
      "/collection": "collection.tsx",
      "/investigations": "investigations.tsx",
      "/timeline": "timeline.tsx",
      "/friends": "friends.tsx",
      "/profile": "profile.tsx",
      "/achievements": "achievements.tsx",
      "/notifications": "notifications.tsx",
      "/admin": "admin.index.tsx",
    };
    for (const d of DEEP_LINKS) {
      if (d.params.length > 0) continue;
      const path = d.build({}).deep_link.split(/[?#]/)[0] || "/";
      const file = map[path];
      expect(file, `${d.id} → ${path}`).toBeTruthy();
      expect(ROUTE_FILES).toContain(file);
    }
  });

  it("content-backed params declare a canonical source", () => {
    const sources = DEEP_LINKS.flatMap((d) => d.params).filter((p) => p.source).map((p) => p.source);
    expect(new Set(sources)).toEqual(new Set([
      "campaign", "story", "encyclopedia_entity", "encyclopedia_type",
      "atlas_entity", "investigation",
    ]));
  });

  it("groups and search stay consistent", () => {
    for (const d of DEEP_LINKS) expect(DEEP_LINK_GROUPS).toContain(d.group);
    expect(searchDeepLinks("atlas").length).toBeGreaterThan(0);
    expect(searchDeepLinks("").length).toBe(DEEP_LINKS.length);
  });

  it("preserves 'no action' and external URL behaviour", () => {
    // No destination selected → nothing built, nothing resolved from payload.
    expect(resolveDeepLink({ type: "manual" })).toBe("/notifications");
    // External HTTPS actions are not part of the internal catalog.
    for (const d of DEEP_LINKS) {
      const out = d.build(Object.fromEntries(d.params.map((p) => [p.key, "x"])));
      expect(out.deep_link.startsWith("http")).toBe(false);
    }
  });
});
