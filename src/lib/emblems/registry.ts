// ============================================================
// Emblem Registry — code-based source of truth (Phase 9 / Phase 0)
// ------------------------------------------------------------
// Every legacy `AVATARS` row is mirrored here 1:1 so no player
// loses access to their chosen emblem. The first 10 "signature"
// entries carry richer metadata / art-direction notes and are
// the Proof-of-Craft batch that will get Premium assets first.
//
// Assets URLs are ALL null today; premium 3D renders are uploaded
// later and the resolver switches to them automatically.
//
// Registry decision: `content_registry` on the DB side accepts
// arbitrary `type` values (text) with a `jsonb data` blob. That
// makes Option 1 (extend `content_registry` with type='emblem')
// safe when we're ready to author from the CMS. For Phase 0 we
// keep the registry in code — deterministic, typed, testable,
// and zero-risk to museum/rewards. See report in AGENTS.md.
// ============================================================

import { AVATARS, type HistoricalAvatar } from "@/lib/avatars";
import type { EmblemCategory, EmblemRecord } from "./types";
import { normalizeEmblemRarity } from "./rarity";
import { ALWAYS_UNLOCKED } from "./unlock-spec";
import { EMPTY_ASSETS } from "./asset-manifest";

const NOW = "2026-07-24T00:00:00.000Z";

/** Art-direction hints for the first 10 signature emblems. */
const SIGNATURE_NOTES: Record<string, { note: string; shot: "portrait" | "artifact" | "banner" | "landmark" }> = {
  banner_abbasid:  { note: "راية سوداء طويلة بخط كوفي مذهّب، إضاءة متحفية جانبية", shot: "banner" },
  banner_umayyad:  { note: "راية بيضاء بحواف ذهبية، خط كوفي أخضر داكن", shot: "banner" },
  banner_rashidun: { note: "راية بسيطة أنيقة، شعار هلال ذهبي مركزي", shot: "banner" },
  banner_andalus:  { note: "راية أرجوانية مطرزة بزخارف أندلسية", shot: "banner" },
  banner_ottoman:  { note: "راية حمراء بهلال ذهبي متحفي كثيف التفاصيل", shot: "banner" },
  sword:           { note: "سيف عربي منحني بمقبض عاجي وذهبي، على قاعدة متحفية", shot: "artifact" },
  shield:          { note: "ترس دائري من الجلد المطعّم بالنحاس والذهب", shot: "artifact" },
  book:            { note: "مخطوط مفتوح بخط ثلث، صفحات ذهبية الحواف", shot: "artifact" },
  scholar:         { note: "بورتريه رمزي للعالِم — عمامة داكنة، إضاءة رامبراند", shot: "portrait" },
  star:            { note: "نجمة إرث ثمانية، معدنية، انعكاسات دقيقة", shot: "artifact" },
};

const SIGNATURE_ORDER: readonly string[] = [
  "banner_abbasid",
  "banner_umayyad",
  "banner_rashidun",
  "banner_andalus",
  "banner_ottoman",
  "sword",
  "shield",
  "book",
  "scholar",
  "star",
];

function toRecord(a: HistoricalAvatar, index: number): EmblemRecord {
  const isSignature = SIGNATURE_NOTES[a.id] !== undefined;
  const sigIdx = SIGNATURE_ORDER.indexOf(a.id);
  return {
    ...EMPTY_ASSETS,
    id: a.id,
    slug: a.id.replace(/_/g, "-"),
    name_ar: a.name,
    name_en: a.id.replace(/_/g, " "),
    category: a.category as EmblemCategory,
    rarity: normalizeEmblemRarity(a.rarity),
    status: "published",
    display_order: sigIdx >= 0 ? sigIdx : 100 + index,
    unlock_method: "always",
    unlock_spec: ALWAYS_UNLOCKED,
    asset_version: 1,
    visual_version: 1,
    legacy_avatar_id: a.id,
    fallback_glyph: a.glyph,
    fallback_svg_key: a.id,
    metadata: isSignature
      ? {
          art_direction: SIGNATURE_NOTES[a.id].note,
          intended_shot: SIGNATURE_NOTES[a.id].shot,
        }
      : {},
    created_at: NOW,
    updated_at: NOW,
  };
}

export const EMBLEM_REGISTRY: readonly EmblemRecord[] = AVATARS.map(toRecord);

const BY_ID = new Map(EMBLEM_REGISTRY.map((r) => [r.id, r]));

export function getEmblemRecord(id: string): EmblemRecord | undefined {
  return BY_ID.get(id);
}

/** Ordered list of the 10 signature Proof-of-Craft emblems. */
export const SIGNATURE_EMBLEMS: readonly EmblemRecord[] = SIGNATURE_ORDER
  .map((id) => BY_ID.get(id))
  .filter((r): r is EmblemRecord => Boolean(r));
