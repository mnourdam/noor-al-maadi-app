// Centralized Arabic display labels for era/period slugs used across the app.
// Keep keys lowercase + normalized (underscores/hyphens treated equivalently).
// Never surface raw English keys to players — fall back to "غير محدد".

import { canonicalEraLabel, toCanonicalEra } from "./era-canonical";

const RAW: Record<string, string> = {
  "seerah": "السيرة النبوية",
  "prophetic": "العصر النبوي",
  "prophetic-era": "العصر النبوي",
  "prophetic-makkah": "العهد المكي",
  "prophetic-madinah": "العهد المدني",
  "rashidun": "الخلافة الراشدة",
  "rashidun-era": "الخلافة الراشدة",
  "rashidun-caliphate": "الخلافة الراشدة",
  "umayyad": "الدولة الأموية",
  "umayyad-era": "الدولة الأموية",
  "abbasid": "الدولة العباسية",
  "abbasid-era": "الدولة العباسية",
  "andalus": "الأندلس",
  "al-andalus": "الأندلس",
  "andalusia": "الأندلس",
  "andalus-umayyad": "أمويو الأندلس",
  "andalus-caliphate": "خلافة قرطبة",
  "taifa-kingdoms": "ملوك الطوائف",
  "murabitun": "المرابطون",
  "almoravid": "المرابطون",
  "muwahhidun": "الموحدون",
  "almohad": "الموحدون",
  "granada": "مملكة غرناطة",
  "post-granada": "ما بعد سقوط غرناطة",
  "reconquista": "الاسترداد الإسباني",
  "fatimid": "الدولة الفاطمية",
  "ayyubid": "الدولة الأيوبية",
  "zengid": "العصر الزنكي",
  "mamluk": "دولة المماليك",
  "seljuk": "السلاجقة",
  "mongols": "الغزو المغولي",
  "crusades": "عصر الحروب الصليبية",
  "byzantine": "العصر البيزنطي",
  "taifa": "عصر ملوك الطوائف",
  "timurid": "العصر التيموري",
  "buyid": "العصر البويهي",
  "ottoman": "الدولة العثمانية",
  "late-ottoman": "أواخر العثمانيين",
  "ww1": "الحرب العالمية الأولى",
  "transition": "مرحلة الانتقال",
  "modern": "العصر الحديث",
  "contemporary": "العصر الحديث",
  "pre-islamic": "ما قبل الإسلام",
  "jahiliyya": "الجاهلية",
  "islamic-middle-ages": "العصور الإسلامية الوسطى",
  "late-medieval": "العصور الوسطى المتأخرة",
  "early-medieval": "العصور الوسطى المبكرة",
  "medieval": "العصور الوسطى",
};

function normalize(slug: string): string {
  return slug.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

export function eraLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  const key = normalize(slug);
  if (RAW[key]) return RAW[key];
  // Try canonical mapping (handles aliases like "abbasi", "umawi", etc.)
  const canonical = toCanonicalEra(key);
  if (canonical) return canonicalEraLabel(canonical);
  // Never expose raw English keys to players.
  return "غير محدد";
}
