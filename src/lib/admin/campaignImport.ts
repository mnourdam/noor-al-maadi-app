/**
 * Campaigns — Full-Fidelity Import (round-trip of `admin_export_campaigns`).
 *
 * The exported envelope is the ONLY accepted input shape. Campaign documents
 * live verbatim inside `data`, so the importer never re-keys, coerces or
 * validates them as encyclopedia content — it writes the document back as-is
 * and matches existing rows by `id` (then `slug`) so campaign, chapter and
 * activity identifiers are preserved.
 *
 * Two phases, exactly like the investigations pipeline:
 *   1. dry_run  → full diff, zero writes
 *   2. commit   → single transaction inside `admin_import_campaigns_v2`
 */

import { supabase } from "@/integrations/supabase/client";

export type CampaignImportAction = "create" | "update" | "noop" | "blocked";
export type CampaignImportWriteMode = "draft" | "publish";

export interface CampaignImportItemResult {
  action: CampaignImportAction;
  id: string | null;
  slug: string | null;
  title: string | null;
  matched_by: "id" | "slug" | null;
  updated_fields: string[];
  added: { chapters: string[]; activities: string[] };
  removed: { chapters: string[]; activities: string[] };
  counts: { chapters: number; activities: number };
  warnings: string[];
  errors: string[];
}

export interface CampaignImportRunResult {
  ok: boolean;
  mode: "dry_run" | "commit";
  write_mode: CampaignImportWriteMode;
  allow_removals: boolean;
  totals: { items: number; created: number; updated: number; unchanged: number; blocked: number };
  items: CampaignImportItemResult[];
}

export const CAMPAIGN_FIELD_LABELS: Record<string, string> = {
  title: "العنوان",
  slug: "المعرّف النصي (slug)",
  status: "حالة النشر",
  data: "محتوى الحملة (الفصول والأنشطة)",
  key_art: "الصورة الرئيسية",
};

export interface ParsedCampaignImportFile {
  campaigns: Record<string, unknown>[];
  shape: "envelope" | "array" | "single";
  warnings: string[];
}

function logCampaignImportRpcCall(
  rpcName: string,
  params: Record<string, unknown>,
  campaignCount: number,
) {
  // Temporary import-pipeline diagnostic. Intentionally logs only shapes, never payload contents.
  console.info("[CampaignImport:RPC]", {
    rpcName,
    paramNames: Object.keys(params),
    campaignCount,
    params: Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
        key,
        {
          typeof: typeof value,
          isArray: Array.isArray(value),
          objectKeys: value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value as Record<string, unknown>) : [],
        },
      ]),
    ),
  });
}

/**
 * Accepts the export envelope, a bare array, or a single campaign entry.
 * Anything else is rejected here — before any RPC call — so a content/entity
 * JSON never reaches the campaign pipeline.
 */
export function parseCampaignImportFile(text: string): ParsedCampaignImportFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e: any) {
    throw new Error(`ملف JSON غير صالح: ${e?.message ?? "خطأ في التحليل"}`);
  }

  const warnings: string[] = [];
  let shape: ParsedCampaignImportFile["shape"] = "single";
  let list: unknown[];

  if (Array.isArray(json)) {
    shape = "array";
    list = json;
  } else if (json && typeof json === "object" && Array.isArray((json as any).campaigns)) {
    shape = "envelope";
    list = (json as any).campaigns;
    const gen = (json as any).generator;
    if (gen && gen !== "irth-campaigns-export") {
      warnings.push(`مصدر الملف غير معتاد: ${String(gen)}`);
    }
  } else if (json && typeof json === "object" && (json as any).campaign) {
    list = [(json as any).campaign];
  } else if (json && typeof json === "object" && ((json as any).data || (json as any).chapters)) {
    list = [json];
  } else {
    throw new Error(
      "هذا الملف ليس ملف تصدير حملات. المتوقّع ملف صادر من «تصدير الحملات» يحتوي مصفوفة campaigns.",
    );
  }

  const campaigns = list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    .map((x) => {
      // A bare campaign document (chapters at the root) is wrapped into the
      // envelope entry shape so the RPC always receives `data`.
      if (!("data" in x) && Array.isArray((x as any).chapters)) {
        return { id: (x as any).id, slug: (x as any).slug, title: (x as any).title, data: x };
      }
      return x;
    });

  if (campaigns.length === 0) throw new Error("الملف لا يحتوي أي حملة.");
  if (campaigns.length !== list.length) {
    warnings.push(`تم تجاهل ${list.length - campaigns.length} عنصرًا غير صالح.`);
  }
  if (campaigns.some((c) => !c.id && !c.slug)) {
    warnings.push("بعض الحملات بلا id ولا slug — ستُنشأ كحملات جديدة.");
  }
  if (campaigns.some((c) => !c.data || typeof c.data !== "object")) {
    warnings.push("بعض الحملات بلا حقل data — ستُحجب في المعاينة.");
  }

  return { campaigns, shape, warnings };
}

async function run(
  campaigns: Record<string, unknown>[],
  mode: "dry_run" | "commit",
  opts: { allowRemovals: boolean; writeMode: CampaignImportWriteMode },
): Promise<CampaignImportRunResult> {
  const rpcName = "admin_import_campaigns_v2";
  const params = {
    p_payload: { campaigns },
    p_options: { mode, allow_removals: opts.allowRemovals, write_mode: opts.writeMode },
  };
  logCampaignImportRpcCall(rpcName, params, campaigns.length);
  const { data, error } = await supabase.rpc(rpcName as never, params as never);
  if (error) throw new Error(error.message);
  return data as unknown as CampaignImportRunResult;
}

/** Phase 1 — compute the diff. Writes nothing. */
export function previewCampaignImport(
  campaigns: Record<string, unknown>[],
  allowRemovals: boolean,
  writeMode: CampaignImportWriteMode,
) {
  return run(campaigns, "dry_run", { allowRemovals, writeMode });
}

/** Phase 2 — apply inside one transaction. */
export function commitCampaignImport(
  campaigns: Record<string, unknown>[],
  allowRemovals: boolean,
  writeMode: CampaignImportWriteMode,
) {
  return run(campaigns, "commit", { allowRemovals, writeMode });
}
