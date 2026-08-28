// ============================================================
// Divider / section integrity
// ------------------------------------------------------------
// Regression guard for the "قيام الدولة العثمانية disappeared and the
// Ottoman divider vanished" bug: the bundled offline snapshot carried a
// stale `chronological_order` for every campaign after a timeline
// reorder, so campaigns drifted ABOVE their era divider — the section
// became empty and the divider was dropped from the rendered feed.
//
// Two invariants are enforced here:
//   1. Every divider that has at least one published campaign after it
//      (in the authoritative order) MUST appear in the player feed.
//   2. The first campaign after every divider in the player feed MUST be
//      the same campaign the admin ordering shows.
// ============================================================

import { describe, it, expect } from "vitest";
import { readBundledSnapshotText } from "../helpers/bundled-snapshot";
import { buildFeed, groupFeedIntoSections } from "@/lib/campaignDividers";
import { partitionCampaignRows } from "@/lib/campaigns/entities";
import { sortCampaignsChronological } from "@/lib/campaignChronology";
import { withBackfilledChronologyAll } from "@/lib/campaignChronologyBackfill";
import type { Campaign } from "@/types/campaign";

type Row = { id: string; slug?: string; status?: string; data: any };

function feedFromRows(rows: Row[]) {
  const published = rows.filter((r) => r?.status === "published");
  const split = partitionCampaignRows(published as any[]);
  const campaigns = sortCampaignsChronological(
    withBackfilledChronologyAll(
      (split.campaigns as Row[])
        .map((r) => ({ ...(r.data as Campaign), id: r.data?.id ?? r.id, slug: r.data?.slug ?? r.slug }))
        .filter((c) => c && (c as Campaign).status === "published") as Campaign[],
    ),
  );
  return { campaigns, dividers: split.dividers };
}

/** Admin truth: dividers + campaigns on one ordering axis. */
function adminSequence(rows: Row[]) {
  const published = rows.filter((r) => r?.status === "published");
  return published
    .map((r) => ({
      id: r.id,
      order: Number(r.data?.chronological_order ?? Number.POSITIVE_INFINITY),
      isDivider: r.data?.kind === "divider" || r.id.startsWith("div_"),
    }))
    .sort((a, b) => a.order - b.order || (a.isDivider === b.isDivider ? 0 : a.isDivider ? -1 : 1));
}

function loadSnapshotRows(): Row[] {
  const raw = readBundledSnapshotText();
  return JSON.parse(raw).collections.admin_campaigns as Row[];
}

function assertDividerIntegrity(rows: Row[]) {
  const { campaigns, dividers } = feedFromRows(rows);
  const sections = groupFeedIntoSections(buildFeed(campaigns, dividers));
  const admin = adminSequence(rows);

  // Expected first campaign per divider, straight from the admin order.
  const expectedFirst = new Map<string, string>();
  let current: string | null = null;
  for (const e of admin) {
    if (e.isDivider) { current = e.id; continue; }
    if (current && !expectedFirst.has(current)) expectedFirst.set(current, e.id);
  }

  const rendered = new Map<string, string>();
  for (const s of sections) {
    if (!s.divider) continue;
    if (s.campaigns.length > 0) rendered.set(s.divider.id, s.campaigns[0]!.id);
    else rendered.set(s.divider.id, "");
  }

  for (const [dividerId, firstId] of expectedFirst) {
    expect(rendered.has(dividerId), `divider ${dividerId} missing from feed`).toBe(true);
    expect(rendered.get(dividerId), `wrong first campaign under ${dividerId}`).toBe(firstId);
  }
}

describe("campaign divider / section integrity", () => {
  it("renders every non-empty divider with the admin's first campaign (synthetic)", () => {
    const rows: Row[] = [
      { id: "div_a", status: "published", data: { kind: "divider", title: "عصر أ", chronological_order: 10 } },
      { id: "c1", status: "published", data: { id: "c1", status: "published", title: "١", chronological_order: 20 } },
      { id: "c2", status: "published", data: { id: "c2", status: "published", title: "٢", chronological_order: 30 } },
      { id: "div_b", status: "published", data: { kind: "divider", title: "عصر ب", chronological_order: 40 } },
      { id: "c3", status: "published", data: { id: "c3", status: "published", title: "٣", chronological_order: 50 } },
    ];
    assertDividerIntegrity(rows);
  });

  it("bundled offline snapshot matches the admin ordering (no drifted campaigns)", () => {
    assertDividerIntegrity(loadSnapshotRows());
  });

  it("Ottoman era opens with قيام الدولة العثمانية in the shipped snapshot", () => {
    const rows = loadSnapshotRows();
    const { campaigns, dividers } = feedFromRows(rows);
    const sections = groupFeedIntoSections(buildFeed(campaigns, dividers));
    const ottoman = sections.find((s) => s.divider?.id === "div_ms0d3foe");
    expect(ottoman, "Ottoman divider must render").toBeTruthy();
    expect(ottoman!.campaigns[0]?.id).toBe("rise-of-the-ottoman-state");
  });
});
