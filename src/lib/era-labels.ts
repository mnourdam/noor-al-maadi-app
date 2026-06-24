// Centralized Arabic display labels for era slugs used in encyclopedia_entities.metadata.era.
// Keep keys lowercase + normalized (underscores/hyphens treated equivalently).

const RAW: Record<string, string> = {
  "seerah": "السيرة النبوية",
  "prophetic-era": "العصر النبوي",
  "prophetic_makkah": "العهد المكي",
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
  "granada": "مملكة غرناطة",
  "post-granada": "ما بعد سقوط غرناطة",
  "reconquista": "الاسترداد الإسباني",
  "fatimid": "الدولة الفاطمية",
  "ayyubid": "الدولة الأيوبية",
  "zengid": "الدولة الزنكية",
  "mamluk": "دولة المماليك",
  "seljuk": "السلاجقة",
  "mongols": "الغزو المغولي",
  "crusades": "الحروب الصليبية",
  "byzantine": "البيزنطيون",
  "ottoman": "الدولة العثمانية",
  "late_ottoman": "أواخر العثمانيين",
  "ww1": "الحرب العالمية الأولى",
  "transition": "مرحلة الانتقال",
  "modern": "العصر الحديث",
};

function normalize(slug: string): string {
  return slug.trim().toLowerCase().replace(/_/g, "-");
}

export function eraLabel(slug: string | null | undefined): string {
  if (!slug) return "";
  const key = normalize(slug);
  if (RAW[key]) return RAW[key];
  // try original casing/underscore form
  if (RAW[slug.trim().toLowerCase()]) return RAW[slug.trim().toLowerCase()];
  // humanize fallback
  return key
    .split("-")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
