/**
 * V16 Phase B — announcements / update policy contract.
 *
 * The server (`get_active_announcements_v16`) returns ONLY safe public
 * policy fields. Everything here mirrors that contract exactly; any row
 * that fails `parseAnnouncementRow` is dropped (fail closed for generic
 * announcements, fail OPEN for update enforcement).
 */

export type AnnouncementKind = "generic" | "optional_update" | "mandatory_update";
export type AnnouncementPlatform = "android" | "web" | "all";

export interface AnnouncementRow {
  id: string;
  kind: AnnouncementKind;
  platform: AnnouncementPlatform;
  title: string;
  body: string;
  cta_label: string | null;
  internal_path: string | null;
  external_url: string | null;
  recommended_version_code: number | null;
  min_version_code: number | null;
  priority: number;
  dismissible: boolean;
  once_per_user: boolean;
  effective_at: string | null;
  server_time: string | null;
}

/** Outcome of a policy fetch. Only `ok` may ever drive mandatory blocking. */
export type AnnouncementFetch =
  | { ok: true; rows: AnnouncementRow[]; serverTime: string | null }
  | { ok: false; reason: "offline" | "timeout" | "error" | "malformed" };

const KINDS: AnnouncementKind[] = ["generic", "optional_update", "mandatory_update"];
const PLATFORMS: AnnouncementPlatform[] = ["android", "web", "all"];

function posInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) return null;
  return v;
}

/** Strict schema validation. Returns null for anything unexpected. */
export function parseAnnouncementRow(raw: unknown): AnnouncementRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["id"] !== "string" || r["id"] === "") return null;
  if (typeof r["kind"] !== "string" || !KINDS.includes(r["kind"] as AnnouncementKind)) return null;
  const platform = typeof r["platform"] === "string" ? r["platform"] : "all";
  if (!PLATFORMS.includes(platform as AnnouncementPlatform)) return null;
  if (typeof r["title"] !== "string" || r["title"].trim() === "") return null;

  return {
    id: r["id"],
    kind: r["kind"] as AnnouncementKind,
    platform: platform as AnnouncementPlatform,
    title: r["title"],
    body: typeof r["body"] === "string" ? r["body"] : "",
    cta_label: typeof r["cta_label"] === "string" && r["cta_label"] !== "" ? r["cta_label"] : null,
    internal_path: typeof r["internal_path"] === "string" && r["internal_path"] !== "" ? r["internal_path"] : null,
    external_url: typeof r["external_url"] === "string" && r["external_url"] !== "" ? r["external_url"] : null,
    recommended_version_code: posInt(r["recommended_version_code"]),
    min_version_code: posInt(r["min_version_code"]),
    priority: typeof r["priority"] === "number" && Number.isFinite(r["priority"]) ? r["priority"] : 0,
    dismissible: r["dismissible"] !== false,
    once_per_user: r["once_per_user"] !== false,
    effective_at: typeof r["effective_at"] === "string" ? r["effective_at"] : null,
    server_time: typeof r["server_time"] === "string" ? r["server_time"] : null,
  };
}
