/** Display-only labels. Canonical category/rarity metadata and styles stay untouched. */
import type { MessageKey } from '@/lib/ui-language/messages';
import type { AchievementCategory, AchievementRarity } from './types';
type Messages = Readonly<Record<MessageKey,string>>;
const categories = {
  campaigns: "achCategory_campaigns",
  investigations: "achCategory_investigations",
  encyclopedia: "achCategory_encyclopedia",
  museum: "achCategory_museum",
  atlas: "achCategory_atlas",
  worlds: "achCategory_worlds",
  economy: "achCategory_economy",
  level: "achCategory_level",
  daily: "achCategory_daily",
  collection: "achCategory_collection",
  special: "achCategory_special",
  seasonal: "achCategory_seasonal",
} satisfies Record<AchievementCategory,MessageKey>;
const rarities = {
  common: "achRarity_common",
  rare: "achRarity_rare",
  epic: "achRarity_epic",
  legendary: "achRarity_legendary",
} satisfies Record<AchievementRarity,MessageKey>;
export function achievementCategoryLabel(category:AchievementCategory,messages:Messages){ return messages[categories[category]]; }
export function achievementRarityLabel(rarity:AchievementRarity,secret:boolean,messages:Messages){ return secret ? messages.achSecretLabel : messages[rarities[rarity]]; }
/** Preserve the existing Arabic date presentation; invalid receipt dates are not invented. */
export function achievementReceiptDate(value:string){
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'});
}
