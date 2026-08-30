/**
 * Content-backed search for the notification destination picker — V16.
 *
 * Admins pick real content instead of typing raw IDs. Every source reads
 * the canonical published table the app itself serves from, and returns
 * the exact value the corresponding route expects:
 *
 *   campaign            → admin_campaigns.slug     (/campaigns/imported/$id)
 *   story               → stories.id               (/story/$id)
 *   encyclopedia_entity → encyclopedia_entities.slug (/encyclopedia/entity/$id)
 *   encyclopedia_type   → encyclopedia_entities.entity_type
 *   atlas_entity        → atlas_entities.id        (/map?focus=<id>)
 *   investigation       → investigations.slug      (/investigation/$id)
 *
 * Read-only. Failures return an empty list — the picker keeps its manual
 * input, so a search outage never blocks composing a notification.
 */

import { supabase } from "@/integrations/supabase/client";
import type { DeepLinkParamSource } from "./deep-links";

export interface DestinationOption {
  /** Value written into the deep-link param. */
  value: string;
  /** Arabic-first display label. */
  label: string;
  /** Secondary line (slug, kind, era…). */
  hint?: string;
}

const LIMIT = 25;

function like(q: string): string {
  return `%${q.replace(/[%_]/g, "")}%`;
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  state: "دولة", figure: "شخصية", scholar: "عالم", city: "مدينة",
  battle: "معركة", event: "حدث", landmark: "معلم", artifact: "أثر",
};

export async function searchDestinationOptions(
  source: DeepLinkParamSource,
  query: string,
): Promise<DestinationOption[]> {
  const q = query.trim();
  try {
    switch (source) {
      case "campaign": {
        let sel = supabase.from("admin_campaigns")
          .select("slug,title,status").eq("status", "published").limit(LIMIT);
        if (q) sel = sel.or(`title.ilike.${like(q)},slug.ilike.${like(q)}`);
        const { data } = await sel;
        return (data ?? []).map((r) => ({
          value: String(r.slug), label: String(r.title ?? r.slug), hint: String(r.slug),
        }));
      }
      case "story": {
        let sel = supabase.from("stories")
          .select("id,slug,title_ar,title_en,status").eq("status", "published").limit(LIMIT);
        if (q) sel = sel.or(`title_ar.ilike.${like(q)},title_en.ilike.${like(q)},slug.ilike.${like(q)}`);
        const { data } = await sel;
        return (data ?? []).map((r) => ({
          value: String(r.id), label: String(r.title_ar ?? r.title_en ?? r.slug), hint: String(r.slug ?? r.id),
        }));
      }
      case "encyclopedia_entity": {
        let sel = supabase.from("encyclopedia_entities")
          .select("slug,title,entity_type,enabled").eq("enabled", true).limit(LIMIT);
        if (q) sel = sel.or(`title.ilike.${like(q)},slug.ilike.${like(q)}`);
        const { data } = await sel;
        return (data ?? []).map((r) => ({
          value: String(r.slug),
          label: String(r.title ?? r.slug),
          hint: ENTITY_TYPE_LABEL[String(r.entity_type)] ?? String(r.entity_type ?? ""),
        }));
      }
      case "encyclopedia_type": {
        const { data } = await supabase.from("encyclopedia_entities")
          .select("entity_type").eq("enabled", true).limit(1000);
        const seen = new Set<string>();
        for (const r of data ?? []) {
          const t = String((r as { entity_type?: string }).entity_type ?? "").trim();
          if (t) seen.add(t);
        }
        return [...seen]
          .filter((t) => !q || t.includes(q.toLowerCase()))
          .sort()
          .map((t) => ({ value: t, label: ENTITY_TYPE_LABEL[t] ?? t, hint: t }));
      }
      case "atlas_entity": {
        let sel = supabase.from("atlas_entities")
          .select("id,slug,name_ar,name_en,kind,status").eq("status", "published").limit(LIMIT);
        if (q) sel = sel.or(`name_ar.ilike.${like(q)},name_en.ilike.${like(q)},slug.ilike.${like(q)}`);
        const { data } = await sel;
        return (data ?? []).map((r) => ({
          value: String(r.id),
          label: String(r.name_ar ?? r.name_en ?? r.slug),
          hint: `${String(r.kind ?? "")} • ${String(r.slug ?? "")}`,
        }));
      }
      case "investigation": {
        let sel = supabase.from("investigations")
          .select("slug,title,enabled").eq("enabled", true).limit(LIMIT);
        if (q) sel = sel.or(`title.ilike.${like(q)},slug.ilike.${like(q)}`);
        const { data } = await sel;
        return (data ?? []).map((r) => ({
          value: String(r.slug), label: String(r.title ?? r.slug), hint: String(r.slug),
        }));
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}
