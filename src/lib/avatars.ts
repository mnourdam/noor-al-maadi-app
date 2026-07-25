/**
 * Irth Identity Emblems — collectible avatar system.
 *
 * Each avatar is a premium vector emblem rendered by `<AvatarArt>` on top of
 * a dark navy disc with parchment-gold detailing. Emblems are NOT emoji and
 * NOT generic icons — they are part of the Irth visual identity.
 *
 * The data model is future-proof: every avatar carries rarity + unlock
 * metadata so we can later gate premium emblems behind campaigns,
 * achievements, museum progress, or special events. Today most are
 * unlocked by default (`unlock_method: "default"`).
 */

export type AvatarCategory =
  | "banner"      // Caliphate / dynasty banners
  | "symbol"      // Crescents, calligraphy, identity marks
  | "weapon"      // Sword, shield, etc.
  | "knowledge"   // Scroll, book, scholar tools
  | "role"        // Scholar, explorer, cartographer, curator, historian, horseman
  | "place"       // Mosque, castle, oasis
  | "tool";       // Compass, astrolabe

export type AvatarRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export type AvatarUnlockMethod =
  | "default"
  | "achievement"
  | "campaign"
  | "museum"
  | "event"
  | "level"
  | "referral";

export interface AvatarUnlockRequirement {
  /** Free-text Arabic description of the requirement, shown in the picker. */
  label?: string;
  /** Optional structured ref — e.g. achievement id, campaign id, museum count. */
  refId?: string;
  /** Numeric threshold for level/count-based unlocks. */
  threshold?: number;
}

export interface HistoricalAvatar {
  id: string;
  name: string;                 // Arabic display name
  category: AvatarCategory;
  rarity: AvatarRarity;
  unlock_method: AvatarUnlockMethod;
  unlock_requirement?: AvatarUnlockRequirement;
  /**
   * Unicode fallback rune used by the share-card canvas exporter (which
   * cannot render React SVGs). The in-app UI always uses `<AvatarArt>`.
   */
  glyph: string;
}

export const AVATARS: HistoricalAvatar[] = [
  // ── Banners ──────────────────────────────────────────────
  { id: "banner_rashidun", name: "راية الراشدين", category: "banner", rarity: "uncommon",  unlock_method: "default", glyph: "▲" },
  { id: "banner_umayyad",  name: "راية أموية",    category: "banner", rarity: "rare",      unlock_method: "default", glyph: "▲" },
  { id: "banner_abbasid",  name: "راية عباسية",   category: "banner", rarity: "rare",      unlock_method: "default", glyph: "▲" },
  { id: "banner_andalus",  name: "راية الأندلس",  category: "banner", rarity: "rare",      unlock_method: "default", glyph: "▲" },
  { id: "banner_ayyubid",  name: "راية أيوبية",   category: "banner", rarity: "rare",      unlock_method: "default", glyph: "▲" },
  { id: "banner_ottoman",  name: "راية عثمانية",  category: "banner", rarity: "rare",      unlock_method: "default", glyph: "▲" },

  // ── Symbols ──────────────────────────────────────────────
  { id: "crescent_star", name: "الهلال والنجمة", category: "symbol", rarity: "common",   unlock_method: "default", glyph: "☪" },
  { id: "calligraphy",   name: "خط عربي",        category: "symbol", rarity: "uncommon", unlock_method: "default", glyph: "ﷲ" },
  { id: "star",          name: "نجمة إرث",       category: "symbol", rarity: "common",   unlock_method: "default", glyph: "★" },

  // ── Weapons / armor ──────────────────────────────────────
  { id: "sword",  name: "السيف",  category: "weapon", rarity: "common",   unlock_method: "default", glyph: "⚔" },
  { id: "shield", name: "الترس",  category: "weapon", rarity: "common",   unlock_method: "default", glyph: "🛡" },

  // ── Knowledge ────────────────────────────────────────────
  { id: "scroll", name: "اللفافة", category: "knowledge", rarity: "common",   unlock_method: "default", glyph: "📜" },
  { id: "book",   name: "الكتاب",  category: "knowledge", rarity: "common",   unlock_method: "default", glyph: "📖" },

  // ── Roles ────────────────────────────────────────────────
  { id: "scholar",        name: "العالِم",          category: "role", rarity: "uncommon", unlock_method: "default", glyph: "✦" },
  { id: "explorer",       name: "الرحّالة",         category: "role", rarity: "uncommon", unlock_method: "default", glyph: "✦" },
  { id: "cartographer",   name: "رسّام الخرائط",    category: "role", rarity: "uncommon", unlock_method: "default", glyph: "✦" },
  { id: "museum_curator", name: "أمين المتحف",      category: "role", rarity: "rare",     unlock_method: "default", glyph: "✦" },
  { id: "historian",      name: "المؤرّخ",          category: "role", rarity: "rare",     unlock_method: "default", glyph: "✦" },
  { id: "horseman",       name: "الفارس",           category: "role", rarity: "uncommon", unlock_method: "default", glyph: "✦" },

  // ── Places ───────────────────────────────────────────────
  { id: "mosque", name: "المسجد", category: "place", rarity: "common", unlock_method: "default", glyph: "🕌" },
  { id: "castle", name: "القلعة", category: "place", rarity: "common", unlock_method: "default", glyph: "🏰" },

  // ── Tools ────────────────────────────────────────────────
  { id: "compass",   name: "البوصلة",  category: "tool", rarity: "common",   unlock_method: "default", glyph: "🧭" },
  { id: "astrolabe", name: "الأسطرلاب", category: "tool", rarity: "uncommon", unlock_method: "default", glyph: "⚙" },

  // ── Batch 1 · Knowledge (Premium Historical Emblems Style v1) ──
  { id: "ink_pot",            name: "المحبرة",              category: "knowledge", rarity: "common",    unlock_method: "default",     glyph: "🖋" },
  { id: "reed_pen",           name: "القلم القصبي",          category: "knowledge", rarity: "common",    unlock_method: "default",     glyph: "✒" },
  { id: "parchment_stack",    name: "رقوق الرقّ",            category: "knowledge", rarity: "common",    unlock_method: "default",     glyph: "📜" },
  { id: "wax_seal",           name: "الختم الشمعي",          category: "knowledge", rarity: "uncommon",  unlock_method: "default",     glyph: "🔏" },
  { id: "bound_folio",        name: "المجلد المُجلَّد",      category: "knowledge", rarity: "uncommon",  unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملتك الأولى" }, glyph: "📕" },
  { id: "illuminated_page",   name: "الصفحة المُذهَّبة",     category: "knowledge", rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: قارئ الحكمة" }, glyph: "✨" },
  { id: "writing_desk_kit",   name: "طقم الكاتب",            category: "knowledge", rarity: "uncommon",  unlock_method: "default",     glyph: "🪶" },
  { id: "paper_maker_screen", name: "منخل صانع الورق",        category: "knowledge", rarity: "uncommon",  unlock_method: "default",     glyph: "🧻" },
  { id: "book_stand",         name: "الرحل",                 category: "knowledge", rarity: "common",    unlock_method: "default",     glyph: "📚" },
  { id: "library_ladder",     name: "سُلَّم المكتبة",        category: "knowledge", rarity: "uncommon",  unlock_method: "museum",      unlock_requirement: { label: "اجمع ٢٥ قطعة في المتحف", threshold: 25 }, glyph: "🪜" },
  { id: "codex_chained",      name: "المخطوط المُقيَّد",     category: "knowledge", rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: حارس المكتبة" }, glyph: "📗" },
  { id: "encyclopedia_stack", name: "الموسوعة",              category: "knowledge", rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل ٥ حملات", threshold: 5 }, glyph: "📚" },

  // ── Batch 1 · Tools & Instruments ──
  { id: "compass_dividers",  name: "الفرجار",               category: "tool", rarity: "common",   unlock_method: "default",     glyph: "📐" },
  { id: "brass_astrolabe",   name: "أسطرلاب نحاسي",          category: "tool", rarity: "rare",     unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الفلك" }, glyph: "🧭" },
  { id: "celestial_globe",   name: "الكرة السماوية",         category: "tool", rarity: "epic",     unlock_method: "achievement", unlock_requirement: { label: "إنجاز: راصد النجوم" }, glyph: "🌐" },
  { id: "water_clock",       name: "ساعة الماء",             category: "tool", rarity: "uncommon", unlock_method: "default",     glyph: "⌛" },
  { id: "sundial_portable",  name: "المزوَلة",               category: "tool", rarity: "uncommon", unlock_method: "default",     glyph: "🕰" },
  { id: "balance_scale",     name: "الميزان",                category: "tool", rarity: "common",   unlock_method: "default",     glyph: "⚖" },
  { id: "mortar_pestle",     name: "الهاون",                 category: "tool", rarity: "common",   unlock_method: "default",     glyph: "🥣" },
  { id: "alembic",           name: "الإنبيق",                category: "tool", rarity: "rare",     unlock_method: "achievement", unlock_requirement: { label: "إنجاز: الكيميائي" }, glyph: "⚗" },
  { id: "glass_vial_set",    name: "قوارير المختبر",         category: "tool", rarity: "uncommon", unlock_method: "default",     glyph: "🧪" },
  { id: "hourglass_bronze",  name: "الساعة الرملية",         category: "tool", rarity: "uncommon", unlock_method: "default",     glyph: "⏳" },
  { id: "qibla_compass",     name: "بوصلة القبلة",           category: "tool", rarity: "rare",     unlock_method: "achievement", unlock_requirement: { label: "إنجاز: دليل القبلة" }, glyph: "🕋" },
  { id: "surveyor_rod",      name: "قضيب المسّاح",           category: "tool", rarity: "uncommon", unlock_method: "default",     glyph: "📏" },


  // ── Batch 2 · Arms, Cavalry & Historical Roles ──
  { id: "scimitar",             name: "السيف المقوّس",         category: "weapon",    rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الفرسان" }, glyph: "⚔" },
  { id: "spear_lance",          name: "الرمح",                 category: "weapon",    rarity: "uncommon",  unlock_method: "default",     glyph: "🗡" },
  { id: "war_bow",              name: "القوس الحربي",          category: "weapon",    rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الرماة" }, glyph: "🏹" },
  { id: "arrow_quiver",         name: "الجعبة",                category: "weapon",    rarity: "uncommon",  unlock_method: "default",     glyph: "🏹" },
  { id: "dagger_khanjar",       name: "الخنجر",                category: "weapon",    rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: حارس القافلة" }, glyph: "🗡" },
  { id: "battle_axe",           name: "الفأس الحربي",          category: "weapon",    rarity: "uncommon",  unlock_method: "default",     glyph: "🪓" },
  { id: "mace_flanged",         name: "الدبوس",                category: "weapon",    rarity: "uncommon",  unlock_method: "default",     glyph: "🔱" },
  { id: "chain_mail",           name: "الدرع الزردي",          category: "weapon",    rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: درع الميدان" }, glyph: "🛡" },
  { id: "helm_conical",         name: "الخوذة المخروطية",      category: "weapon",    rarity: "uncommon",  unlock_method: "default",     glyph: "⛑" },
  { id: "round_shield_leather", name: "الترس الجلدي",          category: "weapon",    rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الحماة" }, glyph: "🛡" },
  { id: "saddle_ornate",        name: "السرج المزيّن",         category: "weapon",    rarity: "epic",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل ٨ حملات", threshold: 8 }, glyph: "🐎" },
  { id: "stirrup_pair",         name: "الرِّكاب",              category: "weapon",    rarity: "uncommon",  unlock_method: "default",     glyph: "🐎" },
  { id: "scholar_robe",         name: "رداء العالِم",          category: "role",      rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: مجلس العلماء" }, glyph: "✦" },
  { id: "explorer_kit",         name: "عدة الرحّالة",          category: "role",      rarity: "uncommon",  unlock_method: "default",     glyph: "🧭" },
  { id: "cartographer_tools",   name: "أدوات رسّام الخرائط",   category: "role",      rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: طريق الخرائط" }, glyph: "🗺" },
  { id: "curator_gloves",       name: "قفازات أمين المتحف",    category: "role",      rarity: "uncommon",  unlock_method: "museum",      unlock_requirement: { label: "اجمع ٤٠ قطعة في المتحف", threshold: 40 }, glyph: "🧤" },
  { id: "historian_desk",       name: "مكتب المؤرّخ",          category: "role",      rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: شاهد العصور" }, glyph: "📚" },
  { id: "horseman_bridle",      name: "لجام الفارس",           category: "role",      rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الفروسية" }, glyph: "🐎" },
  { id: "merchant_scales",      name: "ميزان التاجر",          category: "role",      rarity: "uncommon",  unlock_method: "default",     glyph: "⚖" },
  { id: "poet_diwan",           name: "ديوان الشاعر",          category: "role",      rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: حافظ القصيد" }, glyph: "📖" },
  { id: "physician_kit",        name: "عدة الطبيب",            category: "role",      rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: حكيم البيمارستان" }, glyph: "⚕" },
  { id: "astronomer_kit",       name: "عدة الفلكي",            category: "role",      rarity: "epic",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: منازل النجوم" }, glyph: "🌌" },
  { id: "judge_seal",           name: "خاتم القاضي",           category: "role",      rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: ميزان العدل" }, glyph: "⚖" },
  { id: "preacher_pulpit",      name: "منبر الخطيب",           category: "role",      rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الخطابة" }, glyph: "🕌" },
  { id: "caravan_pack",         name: "متاع القافلة",          category: "role",      rarity: "uncommon",  unlock_method: "default",     glyph: "🎒" },

  // ── Batch 3 · Places & Cultural Heritage ──
  { id: "minaret_tower",      name: "المئذنة",                category: "place",     rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة العمارة" }, glyph: "🕌" },
  { id: "mihrab_niche",       name: "المحراب",                category: "place",     rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: قبلة القلوب" }, glyph: "🕋" },
  { id: "desert_fortress",    name: "الحصن الصحراوي",         category: "place",     rarity: "uncommon",  unlock_method: "default",     glyph: "🏰" },
  { id: "caravanserai",       name: "الخان",                  category: "place",     rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة القوافل" }, glyph: "🏛" },
  { id: "souk_gate",          name: "بوابة السوق",            category: "place",     rarity: "uncommon",  unlock_method: "default",     glyph: "🚪" },
  { id: "madrasa",            name: "المدرسة",                category: "place",     rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة العلم" }, glyph: "🏫" },
  { id: "observatory_dome",   name: "القبة الفلكية",          category: "place",     rarity: "epic",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: عالِم الفلك" }, glyph: "🔭" },
  { id: "hammam",             name: "الحمّام",                category: "place",     rarity: "uncommon",  unlock_method: "default",     glyph: "🛁" },
  { id: "sabil_fountain",     name: "السبيل",                 category: "place",     rarity: "common",    unlock_method: "default",     glyph: "⛲" },
  { id: "oasis_palm",         name: "واحة النخيل",            category: "place",     rarity: "uncommon",  unlock_method: "default",     glyph: "🌴" },
  { id: "lighthouse_pharos",  name: "منارة الإسكندرية",       category: "place",     rarity: "epic",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الإسكندرية" }, glyph: "🗼" },
  { id: "horseshoe_arch",     name: "القوس الأندلسي",         category: "place",     rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الأندلس" }, glyph: "🕌" },
  { id: "geometric_panel",    name: "اللوحة الزخرفية",        category: "symbol",    rarity: "uncommon",  unlock_method: "default",     glyph: "✶" },
  { id: "muqarnas_fragment",  name: "قطعة المقرنص",           category: "symbol",    rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: عمارة السماء" }, glyph: "✦" },
  { id: "incense_burner",     name: "المبخرة",                category: "symbol",    rarity: "uncommon",  unlock_method: "default",     glyph: "🪔" },
  { id: "crescent_medallion", name: "ميدالية الهلال",         category: "symbol",    rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: حارس الهوية" }, glyph: "☪" },
  { id: "eight_point_star",   name: "النجمة الثمانية",        category: "symbol",    rarity: "uncommon",  unlock_method: "default",     glyph: "✴" },
  { id: "royal_tughra",       name: "الطغراء الملكية",         category: "symbol",    rarity: "epic",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة السلطنة" }, glyph: "❦" },
  { id: "signet_ring",        name: "الخاتم الملكي",          category: "symbol",    rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: ختم الأمير" }, glyph: "💍" },
  { id: "persian_carpet",     name: "السجادة الفاخرة",        category: "symbol",    rarity: "rare",      unlock_method: "museum",      unlock_requirement: { label: "اجمع ٥٠ قطعة في المتحف", threshold: 50 }, glyph: "🧿" },
  { id: "silk_bolt",          name: "لفة الحرير",             category: "symbol",    rarity: "uncommon",  unlock_method: "default",     glyph: "🧵" },
  { id: "ceramic_tile",       name: "البلاطة الزلجية",        category: "symbol",    rarity: "common",    unlock_method: "default",     glyph: "◆" },
  { id: "brass_lantern",      name: "الفانوس النحاسي",        category: "tool",      rarity: "common",    unlock_method: "default",     glyph: "🏮" },

  // ── Batch 4 · Trade, Seafaring & Scientific Heritage ──
  { id: "gold_dinar_coin",        name: "الدينار الذهبي",          category: "symbol",    rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: خزانة الأسواق" }, glyph: "🪙" },
  { id: "silver_dirham_coin",     name: "الدرهم الفضي",            category: "symbol",    rarity: "uncommon",  unlock_method: "default",     glyph: "🪙" },
  { id: "trade_ledger",           name: "دفتر التجارة",            category: "knowledge", rarity: "uncommon",  unlock_method: "default",     glyph: "📒" },
  { id: "merchant_seal_stamp",    name: "ختم التاجر",              category: "tool",      rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: موثّق العقود" }, glyph: "🔏" },
  { id: "spice_chest",            name: "صندوق البهارات",          category: "symbol",    rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الأسواق" }, glyph: "🧰" },
  { id: "saffron_pouch",          name: "كيس الزعفران",            category: "symbol",    rarity: "uncommon",  unlock_method: "default",     glyph: "🧺" },
  { id: "date_basket",            name: "سلة التمر",               category: "symbol",    rarity: "common",    unlock_method: "default",     glyph: "🧺" },
  { id: "frankincense_resin",     name: "لبان بخور",               category: "symbol",    rarity: "uncommon",  unlock_method: "default",     glyph: "💠" },
  { id: "myrrh_bundle",           name: "حزمة المُرّ",              category: "symbol",    rarity: "uncommon",  unlock_method: "default",     glyph: "💠" },
  { id: "coffee_dallah",          name: "دلة القهوة",              category: "tool",      rarity: "rare",      unlock_method: "museum",      unlock_requirement: { label: "اجمع ٦٠ قطعة في المتحف", threshold: 60 }, glyph: "☕" },
  { id: "dhow_ship",              name: "سفينة الداو",             category: "place",     rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة البحّارة" }, glyph: "⛵" },
  { id: "anchor_stone",           name: "مرساة حجرية",             category: "tool",      rarity: "uncommon",  unlock_method: "default",     glyph: "⚓" },
  { id: "kamal_navigator",        name: "كمال الملاحة",            category: "tool",      rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: دليل البحار" }, glyph: "🧭" },
  { id: "mariners_astrolabe",     name: "أسطرلاب بحري",            category: "tool",      rarity: "epic",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: نجم الملاحة" }, glyph: "🧭" },
  { id: "pearl_diver_basket",     name: "سلة الغوّاص",             category: "role",      rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة اللؤلؤ" }, glyph: "🧺" },
  { id: "water_skin_qirba",       name: "قِربة الماء",             category: "tool",      rarity: "common",    unlock_method: "default",     glyph: "🫙" },
  { id: "wind_rose_chart",        name: "خريطة الرياح",            category: "knowledge", rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: حافظ الجهات" }, glyph: "🗺" },
  { id: "star_chart_manuscript",  name: "مخطوط النجوم",            category: "knowledge", rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة السماء" }, glyph: "🌌" },
  { id: "silk_road_map",          name: "خريطة طريق الحرير",       category: "knowledge", rarity: "epic",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل ١٠ حملات", threshold: 10 }, glyph: "🗺" },
  { id: "mathematics_treatise",   name: "رسالة الرياضيات",         category: "knowledge", rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: برهان الهندسة" }, glyph: "📐" },
  { id: "medical_herbarium",      name: "موسوعة الأعشاب",          category: "knowledge", rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: حكمة النبات" }, glyph: "🌿" },
  { id: "arabian_horse_portrait", name: "جواد عربي أصيل",          category: "role",      rarity: "epic",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الفروسية الكبرى" }, glyph: "🐎" },
  { id: "falcon_hood",            name: "برقع الصقر",              category: "role",      rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: صقّار الصحراء" }, glyph: "🦅" },
  { id: "desert_rose_crystal",    name: "وردة الصحراء",            category: "symbol",    rarity: "uncommon",  unlock_method: "museum",      unlock_requirement: { label: "اجمع ٣٠ قطعة في المتحف", threshold: 30 }, glyph: "✺" },
  { id: "camel_saddlebag",        name: "خرج القافلة",             category: "role",      rarity: "uncommon",  unlock_method: "default",     glyph: "🐪" },

  // ── Batch 5 · Governance, Diplomacy & Statehood (additions) ──
  { id: "water_clock_jazari",     name: "ساعة الجزري المائية",     category: "tool",      rarity: "epic",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: هندسة الجزري" }, glyph: "⏳" },
  { id: "pigeon_letter_case",     name: "بريد الحمام",             category: "tool",      rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة البريد السلطاني" }, glyph: "🕊" },

  // ── Batch 5 · Dynasty Banners & Heraldry ──
  { id: "banner_prophetic",  name: "الراية النبوية",   category: "banner", rarity: "legendary", unlock_method: "achievement", unlock_requirement: { label: "إنجاز: راية النور" }, glyph: "▲" },
  { id: "banner_seljuk",     name: "راية سلجوقية",    category: "banner", rarity: "epic",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة السلاجقة" }, glyph: "▲" },
  { id: "banner_zengid",     name: "راية زنكية",      category: "banner", rarity: "epic",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة نور الدين" }, glyph: "▲" },
  { id: "banner_mamluk",     name: "راية مملوكية",    category: "banner", rarity: "epic",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة المماليك" }, glyph: "▲" },
  { id: "ayyubid_eagle",     name: "نسر القلعة الأيوبي", category: "symbol", rarity: "epic",   unlock_method: "achievement", unlock_requirement: { label: "إنجاز: قلعة صلاح الدين" }, glyph: "🦅" },
  { id: "mamluk_blazon",     name: "شعار المماليك",   category: "symbol", rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: رنك السلطان" }, glyph: "✦" },
  { id: "seljuk_star_tile",  name: "نجمة سلجوقية",    category: "symbol", rarity: "rare",      unlock_method: "museum",      unlock_requirement: { label: "اجمع ٧٠ قطعة في المتحف", threshold: 70 }, glyph: "✴" },

  // ── Batch 5 · Governance & Chancery ──
  { id: "caliph_throne",     name: "عرش الخلافة",     category: "place",     rarity: "legendary", unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة دار الخلافة" }, glyph: "👑" },
  { id: "royal_firman",      name: "الفرمان السلطاني", category: "knowledge", rarity: "epic",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: مرسوم الديوان" }, glyph: "📜" },
  { id: "diwan_register",    name: "سجل الديوان",     category: "knowledge", rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الدواوين" }, glyph: "📒" },
  { id: "kharaj_scroll",     name: "طومار الخراج",    category: "knowledge", rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: عامل الخراج" }, glyph: "📜" },
  { id: "waqf_deed",         name: "حجة الوقف",       category: "knowledge", rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: حافظ الأوقاف" }, glyph: "📜" },
  { id: "mazalim_petition",  name: "عريضة المظالم",   category: "knowledge", rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: باب العدل" }, glyph: "📄" },
  { id: "hisba_manual",      name: "كتاب الحسبة",     category: "knowledge", rarity: "uncommon",  unlock_method: "default",     glyph: "📖" },
  { id: "muhtasib_staff",    name: "عصا المحتسب",     category: "role",      rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: أمين السوق" }, glyph: "🪄" },
  { id: "bayt_al_mal_chest", name: "صندوق بيت المال", category: "symbol",    rarity: "epic",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: خازن الدولة" }, glyph: "🧰" },
  { id: "province_map",      name: "خريطة الولاية",   category: "knowledge", rarity: "rare",      unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الأمصار" }, glyph: "🗺" },

  // ── Batch 5 · Barid & Diplomacy ──
  { id: "barid_horn",        name: "بوق البريد",      category: "tool",      rarity: "uncommon",  unlock_method: "default",     glyph: "📯" },
  { id: "postal_satchel",    name: "جراب البريد",     category: "tool",      rarity: "uncommon",  unlock_method: "default",     glyph: "📮" },
  { id: "vizier_khilaa",     name: "خِلعة الوزير",    category: "role",      rarity: "epic",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: مجلس الوزارة" }, glyph: "🧥" },
  { id: "tiraz_textile",     name: "طراز الخلافة",    category: "symbol",    rarity: "rare",      unlock_method: "museum",      unlock_requirement: { label: "اجمع ٨٠ قطعة في المتحف", threshold: 80 }, glyph: "🧵" },

  // ── Batch 5 · Sacred Institutions ──
  { id: "hajj_mahmal",       name: "المحمل الشريف",   category: "symbol",    rarity: "legendary", unlock_method: "campaign",    unlock_requirement: { label: "أكمل حملة الحج" }, glyph: "🕋" },
  { id: "minbar_panel",      name: "لوحة المنبر",     category: "place",     rarity: "rare",      unlock_method: "museum",      unlock_requirement: { label: "اجمع ٩٠ قطعة في المتحف", threshold: 90 }, glyph: "🕌" },
  { id: "mosque_lamp",       name: "قنديل المسجد",    category: "symbol",    rarity: "rare",      unlock_method: "achievement", unlock_requirement: { label: "إنجاز: نور المحراب" }, glyph: "🪔" },
  { id: "fresco_fragment",   name: "شظية الجدارية",   category: "symbol",    rarity: "rare",      unlock_method: "museum",      unlock_requirement: { label: "اجمع ١٠٠ قطعة في المتحف", threshold: 100 }, glyph: "🖼" },
];

export const DEFAULT_AVATAR_ID = "crescent_star";

/** Backwards-compatible avatar resolver. Falls back to the default emblem. */
export function getAvatar(id?: string | null): HistoricalAvatar {
  if (!id) return AVATARS.find((a) => a.id === DEFAULT_AVATAR_ID) ?? AVATARS[0];
  // Legacy id remap: previous emoji set used different ids.
  const legacyMap: Record<string, string> = {
    kaaba: "mosque",
    aqsa: "mosque",
    minaret: "mosque",
    mihrab: "mosque",
    crescent: "crescent_star",
    rosette: "star",
    prayer_bead: "scroll",
    lantern: "scroll",
    scimitar: "sword",
    spear: "sword",
    bow: "sword",
    dagger: "sword",
    axe: "sword",
    helmet: "shield",
    armor: "shield",
    ring: "calligraphy",
    manuscript: "scroll",
    abbasid_book: "book",
    quill: "scroll",
    hikma: "scholar",
    library: "book",
    ink: "scroll",
    tablet: "scroll",
    umayyad_flag: "banner_umayyad",
    abbasid_flag: "banner_abbasid",
    rashidun_flag: "banner_rashidun",
    ayyubid_flag: "banner_ayyubid",
    ottoman_flag: "banner_ottoman",
    hourglass: "astrolabe",
    map: "cartographer",
    telescope: "astrolabe",
    scale: "scholar",
    key: "scroll",
    abacus: "scholar",
    scissors: "scroll",
    magnifier: "historian",
    horse: "horseman",
    camel: "explorer",
    falcon: "explorer",
    lion: "shield",
    palm: "mosque",
    olive: "mosque",
    desert: "explorer",
    oasis: "explorer",
    dome: "mosque",
    gate: "castle",
    fortress: "castle",
    tower: "castle",
    caravan: "explorer",
    well: "explorer",
    coin: "museum_curator",
    incense: "calligraphy",
    crown: "banner_ottoman",
    torch: "historian",
  };
  const remapped = legacyMap[id] ?? id;
  return AVATARS.find((a) => a.id === remapped) ?? AVATARS[0];
}

export const RARITY_LABEL: Record<AvatarRarity, string> = {
  common: "شائع",
  uncommon: "غير شائع",
  rare: "نادر",
  epic: "ملحمي",
  legendary: "أسطوري",
};

export const CATEGORY_LABEL: Record<AvatarCategory, string> = {
  banner: "الرايات",
  symbol: "الرموز",
  weapon: "السلاح والدرع",
  knowledge: "المعرفة",
  role: "الشخصيات",
  place: "الأماكن",
  tool: "الأدوات",
};

/**
 * Returns whether an avatar is available to the given player profile.
 * Today all `default` avatars are unlocked. Other unlock methods are
 * reserved for future content and currently treated as locked.
 */
export function isAvatarUnlocked(
  avatar: HistoricalAvatar,
  _ctx: { unlockedAvatarIds?: string[] } = {},
): boolean {
  if (avatar.unlock_method === "default") return true;
  return (_ctx.unlockedAvatarIds ?? []).includes(avatar.id);
}
