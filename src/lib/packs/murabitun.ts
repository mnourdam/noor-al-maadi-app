import type { ContentPack, PackEntity } from "./types";

// ============================================================
// Content Pack 010 — دولة المرابطين (Almoravid State)
// 1040 – 1147 CE. Capital: Marrakesh.
// ============================================================

const E = (e: PackEntity): PackEntity => e;

// ---------- FIGURES ----------
const FIGURE_IDS = [
  ["ibn-yasin","عبد الله بن ياسين","Abdullah ibn Yasin",1000,1059,
    "الفقيه المالكي مؤسّس حركة المرابطين الروحية، علّم قبائل صنهاجة في رباطٍ بساحل المحيط، فقامت على يديه الدعوة التي وحّدت الصحراء.",
    ["murabitun.event.movement-founded","murabitun.event.unify-sahara","murabitun.figure.yahya-ibn-ibrahim","murabitun.figure.abu-bakr-umar","murabitun.battle.zab","murabitun.city.aghmat"]],
  ["yahya-ibn-ibrahim","يحيى بن إبراهيم","Yahya ibn Ibrahim",990,1048,
    "زعيم جدالة الذي رحل إلى المشرق وعاد بابن ياسين فقيهًا لقومه، شريك التأسيس الأوّل للحركة المرابطية.",
    ["murabitun.event.movement-founded","murabitun.figure.ibn-yasin","murabitun.event.unify-sahara"]],
  ["abu-bakr-umar","أبو بكر بن عمر اللمتوني","Abu Bakr ibn Umar",1010,1087,
    "أوّل أمراء المرابطين بعد ابن ياسين، فاتح المغرب الأقصى ومؤسس مدينة مراكش سنة ٤٥٤هـ، ثم تفرّغ لجهاد الصحراء وترك الأمر ليوسف بن تاشفين.",
    ["murabitun.city.marrakesh","murabitun.event.found-marrakesh","murabitun.event.unify-sahara","murabitun.battle.awdaghust","murabitun.figure.yusuf-tashfin","murabitun.figure.ibn-yasin"]],
  ["yusuf-tashfin","يوسف بن تاشفين","Yusuf ibn Tashfin",1009,1106,
    "أمير المسلمين، أعظم سلاطين المرابطين، وحّد المغرب والأندلس وانتصر في الزلاقة سنة ٤٧٩هـ، أنقذ الإسلام في الأندلس وضمّ ملوك الطوائف.",
    ["murabitun.battle.zallaqa","murabitun.event.cross-andalus","murabitun.event.absorb-taifas","murabitun.event.peak","murabitun.figure.abu-bakr-umar","murabitun.figure.ali-yusuf","murabitun.figure.mutamid","murabitun.figure.alfonso-vi","murabitun.city.marrakesh","murabitun.city.cordoba","murabitun.artifact.sword-yusuf","murabitun.artifact.yusuf-seal","murabitun.artifact.zallaqa-medal"]],
  ["ali-yusuf","علي بن يوسف بن تاشفين","Ali ibn Yusuf",1084,1143,
    "ثاني سلاطين المرابطين الكبار، ابن يوسف بن تاشفين، وسّع البناء في مراكش وفاس وقرطبة، شهد عصره أوج الدولة ثم بداية ظهور الموحدين.",
    ["murabitun.event.peak","murabitun.event.expansion","murabitun.event.weakness-begins","murabitun.event.almohad-rise","murabitun.battle.uclés","murabitun.battle.wadi-hijara","murabitun.battle.saragossa-siege","murabitun.battle.valencia-siege","murabitun.city.marrakesh","murabitun.city.fes","murabitun.city.cordoba","murabitun.landmark.kutubiyya-old","murabitun.landmark.qarawiyyin","murabitun.figure.tashfin-ali","murabitun.figure.alfonso-vii"]],
  ["tashfin-ali","تاشفين بن علي","Tashfin ibn Ali",1100,1145,
    "آخر سلاطين المرابطين الفاعلين، حاول التصدّي لزحف الموحدين بقيادة عبد المؤمن بن علي، قُتل عند وهران فبدأ الانهيار النهائي.",
    ["murabitun.event.almohad-rise","murabitun.event.fall","murabitun.figure.ali-yusuf","murabitun.city.marrakesh"]],
  ["mutamid","المعتمد بن عباد","Al-Mu'tamid ibn Abbad",1040,1095,
    "ملك إشبيلية وآخر ملوك الطوائف الكبار، استنجد بيوسف بن تاشفين في الزلاقة، ثم ضمّه المرابطون ونفوه إلى أغمات حيث مات أسيرًا.",
    ["murabitun.battle.zallaqa","murabitun.event.absorb-taifas","murabitun.event.cross-andalus","murabitun.city.seville","murabitun.city.aghmat","murabitun.figure.yusuf-tashfin"]],
  ["alfonso-vi","ألفونسو السادس","Alfonso VI of León-Castile",1040,1109,
    "ملك قشتالة وليون، فاتح طليطلة سنة ٤٧٨هـ، هزمه يوسف بن تاشفين في الزلاقة، حدّ توسعه عاد بعدها قرنًا كاملاً.",
    ["murabitun.battle.zallaqa","murabitun.figure.yusuf-tashfin","murabitun.figure.mutamid","murabitun.event.cross-andalus"]],
  ["alfonso-vii","ألفونسو السابع","Alfonso VII of León-Castile",1105,1157,
    "إمبراطور قشتالة في زمن علي بن يوسف، حقق انتصارات على المرابطين في وادي الحجارة وأقليش الثاني، عاصر بداية الضعف.",
    ["murabitun.figure.ali-yusuf","murabitun.battle.wadi-hijara","murabitun.battle.uclés","murabitun.event.weakness-begins"]],
] as const;

// ---------- SCHOLARS ----------
const SCHOLAR_IDS = [
  ["qadi-iyad","القاضي عياض","Qadi Iyad",1083,1149,
    "إمام أهل المغرب في عصره، قاضي سبتة ثم غرناطة، صاحب الشفا في حقوق المصطفى ﷺ وترتيب المدارك في تراجم المالكية، رمز العلم في الدولة المرابطية.",
    ["murabitun.city.ceuta","murabitun.city.granada","murabitun.figure.ali-yusuf","murabitun.event.peak","murabitun.event.expansion"]],
  ["ibn-arabi-maafiri","ابن العربي المعافري","Ibn al-Arabi al-Ma'afiri",1076,1148,
    "قاضي إشبيلية وأبو بكر بن العربي، فقيه ومحدّث وأصولي، صاحب أحكام القرآن والعواصم من القواصم، تلميذ الغزالي في المشرق.",
    ["murabitun.city.seville","murabitun.event.absorb-taifas","murabitun.event.peak","murabitun.figure.ali-yusuf"]],
  ["al-baji","أبو الوليد الباجي","Abu al-Walid al-Baji",1013,1081,
    "فقيه المالكية وأصوليّها في الأندلس قبيل المرابطين، صاحب المنتقى شرح الموطأ، أحد مهّدي الأرض الفقهية لقدوم المرابطين.",
    ["murabitun.city.cordoba","murabitun.city.seville","murabitun.figure.ibn-yasin"]],
  ["abu-imran-fasi","أبو عمران الفاسي","Abu Imran al-Fasi",978,1039,
    "فقيه مالكي كبير من فاس استقرّ بالقيروان، هو الذي وجّه يحيى بن إبراهيم إلى البحث عن داعية لقومه، فكانت بذرة الحركة المرابطية.",
    ["murabitun.city.fes","murabitun.figure.yahya-ibn-ibrahim","murabitun.figure.ibn-yasin","murabitun.event.movement-founded"]],
  ["ibn-rushd-jadd","ابن رشد الجدّ","Ibn Rushd al-Jadd",1058,1126,
    "قاضي قضاة قرطبة في زمن علي بن يوسف، جدّ الفيلسوف ابن رشد، صاحب البيان والتحصيل والمقدمات الممهّدات، أكبر فقيه مالكي في عصره.",
    ["murabitun.city.cordoba","murabitun.figure.ali-yusuf","murabitun.event.peak"]],
  ["turtushi","أبو بكر الطرطوشي","Abu Bakr al-Turtushi",1059,1126,
    "فقيه مالكي أندلسي رحل إلى المشرق واستقر بمصر، صاحب سراج الملوك، أحد منظري السياسة الشرعية في عصر المرابطين.",
    ["murabitun.city.cordoba","murabitun.city.almeria","murabitun.figure.yusuf-tashfin","murabitun.event.peak"]],
] as const;

// ---------- CITIES ----------
const CITY_IDS = [
  ["marrakesh","مراكش","Marrakesh",
    "عاصمة دولة المرابطين، أسّسها أبو بكر بن عمر سنة ٤٥٤هـ ووسّعها يوسف بن تاشفين، حاضرة المغرب الأقصى وقلب الدولة المرابطية ثم الموحدية.",
    1062,1147,["murabitun.event.found-marrakesh","murabitun.figure.abu-bakr-umar","murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf","murabitun.landmark.kutubiyya-old","murabitun.landmark.marrakesh-walls","murabitun.landmark.almoravid-kasbah"]],
  ["fes","فاس","Fes",
    "حاضرة المغرب الأقصى الأقدم، استولى عليها يوسف بن تاشفين سنة ٤٦٢هـ، فيها مسجد القرويين الذي وسّعه علي بن يوسف.",
    1069,1147,["murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf","murabitun.landmark.qarawiyyin","murabitun.landmark.fes-walls","murabitun.figure.abu-imran-fasi"]],
  ["ceuta","سبتة","Ceuta",
    "ميناء المغرب على المضيق، مفتاح العبور إلى الأندلس، انطلق منها يوسف بن تاشفين إلى الزلاقة، وفيها قضى القاضي عياض.",
    1083,1147,["murabitun.figure.qadi-iyad","murabitun.figure.yusuf-tashfin","murabitun.event.cross-andalus","murabitun.landmark.ceuta-port"]],
  ["tangier","طنجة","Tangier",
    "ميناء المغرب الشمالي على المحيط، ضمّها المرابطون مبكّرًا، أحد منافذهم البحرية إلى الأندلس وأوروبا.",
    1078,1147,["murabitun.figure.yusuf-tashfin","murabitun.event.cross-andalus","murabitun.city.ceuta"]],
  ["cordoba","قرطبة","Cordoba",
    "حاضرة الأندلس العلمية، ضمّها المرابطون بعد سقوط ملوك الطوائف، فيها مسجدها الكبير وقضاها ابن رشد الجد.",
    1091,1147,["murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf","murabitun.figure.ibn-rushd-jadd","murabitun.event.absorb-taifas","murabitun.figure.al-baji"]],
  ["seville","إشبيلية","Seville",
    "حاضرة الأندلس الجنوبية وعاصمة بني عباد، ضمّها يوسف بن تاشفين بعد نفي المعتمد إلى أغمات، صارت قاعدة المرابطين في الأندلس.",
    1091,1147,["murabitun.figure.mutamid","murabitun.figure.yusuf-tashfin","murabitun.figure.ibn-arabi-maafiri","murabitun.event.absorb-taifas"]],
  ["granada","غرناطة","Granada",
    "حاضرة الأندلس الشرقية الجنوبية، ضمّها المرابطون من بني زيري، فيها تولّى القاضي عياض القضاء قبيل وفاته.",
    1090,1147,["murabitun.figure.qadi-iyad","murabitun.figure.yusuf-tashfin","murabitun.event.absorb-taifas"]],
  ["almeria","المرية","Almeria",
    "ميناء الأندلس المتوسطي، أعظم مرافئ التجارة في عصر المرابطين، فيها بُنيت أسوار وقصبات على نفقة الأمراء.",
    1091,1147,["murabitun.figure.yusuf-tashfin","murabitun.figure.turtushi","murabitun.event.absorb-taifas","murabitun.event.peak"]],
  ["aghmat","أغمات","Aghmat",
    "العاصمة الأولى للمرابطين قبل بناء مراكش، فيها قصر الأمارة، وإليها نُفي المعتمد بن عباد فمات بها أسيرًا.",
    1058,1062,["murabitun.figure.abu-bakr-umar","murabitun.figure.ibn-yasin","murabitun.figure.mutamid","murabitun.landmark.aghmat-palace","murabitun.artifact.aghmat-manuscript"]],
  ["sijilmasa","سجلماسة","Sijilmasa",
    "حاضرة الجنوب المغربي ومدخل الصحراء وتجارة الذهب، فتحها أبو بكر بن عمر سنة ٤٤٦هـ، عقدة طرق القوافل المرابطية.",
    1055,1147,["murabitun.figure.abu-bakr-umar","murabitun.battle.sijilmasa-conquest","murabitun.event.unify-sahara","murabitun.artifact.trade-register"]],
] as const;

// ---------- BATTLES ----------
const BATTLE_IDS = [
  ["zallaqa","معركة الزلاقة","Battle of Sagrajas (al-Zallaqa)",1086,1086,
    "نصر يوسف بن تاشفين الفاصل على ألفونسو السادس قرب بطليوس، أعظم انتصارات المرابطين، أوقف زحف قشتالة في الأندلس قرنًا كاملاً.",
    ["murabitun.figure.yusuf-tashfin","murabitun.figure.mutamid","murabitun.figure.alfonso-vi","murabitun.event.cross-andalus","murabitun.event.peak","murabitun.artifact.zallaqa-manuscript","murabitun.artifact.zallaqa-medal"]],
  ["uclés","معركة أُقليش","Battle of Uclés",1108,1108,
    "نصر المرابطين بقيادة الأمير تميم على القشتاليين قرب أُقليش، قُتل فيها وريث ألفونسو السادس، أحد آخر انتصارات المرابطين الكبرى.",
    ["murabitun.figure.ali-yusuf","murabitun.figure.alfonso-vi","murabitun.event.peak","murabitun.event.expansion"]],
  ["zab","معركة الزاب (تابفاريلا)","Battle of Tabfarilla (al-Zab)",1057,1057,
    "أولى المعارك الكبرى لحركة المرابطين، استُشهد فيها ابن ياسين أمام برغواطة الزنادقة في تامسنا، فحملت دعوته من بعده يدُ أبي بكر بن عمر.",
    ["murabitun.figure.ibn-yasin","murabitun.event.movement-founded","murabitun.event.unify-sahara","murabitun.figure.abu-bakr-umar"]],
  ["saragossa-siege","حصار سرقسطة","Siege of Zaragoza",1110,1110,
    "حاصر المرابطون بقيادة ابن الحاج سرقسطة وضمّوها لحكمهم، أعظم مدن الأندلس الشرقية، آخر معاقل بني هود.",
    ["murabitun.figure.ali-yusuf","murabitun.event.absorb-taifas","murabitun.event.expansion"]],
  ["valencia-siege","حصار بلنسية","Siege of Valencia",1102,1102,
    "استعاد المرابطون بلنسية من أرملة السيد القنبيطور بعد وفاته، فضمّوا شرق الأندلس بأكمله إلى دولتهم.",
    ["murabitun.figure.ali-yusuf","murabitun.event.absorb-taifas","murabitun.event.expansion"]],
  ["sijilmasa-conquest","فتح سجلماسة","Conquest of Sijilmasa",1055,1055,
    "أوّل فتوح المرابطين الكبرى في المغرب، فتحها أبو بكر بن عمر فسيطروا على طرق الذهب الصحراوية ومالٌ عظيم.",
    ["murabitun.figure.abu-bakr-umar","murabitun.figure.ibn-yasin","murabitun.city.sijilmasa","murabitun.event.unify-sahara"]],
  ["awdaghust","فتح أودغست","Conquest of Awdaghust",1054,1054,
    "فتح المرابطون أودغست في موريتانيا، نقطة ربط مع غانة جنوبًا، فتحكموا في تجارة الذهب من الجنوب الإفريقي.",
    ["murabitun.figure.abu-bakr-umar","murabitun.figure.ibn-yasin","murabitun.event.unify-sahara"]],
  ["wadi-hijara","معركة وادي الحجارة","Battle of Wadi al-Hijara",1138,1138,
    "هزيمة المرابطين أمام ألفونسو السابع قرب وادي الحجارة (قوادالاخارا)، علامة على بداية ضعف الدولة في الأندلس وبدء التراجع.",
    ["murabitun.figure.ali-yusuf","murabitun.figure.alfonso-vii","murabitun.event.weakness-begins"]],
] as const;

// ---------- EVENTS ----------
const EVENT_IDS = [
  ["movement-founded","تأسيس حركة المرابطين","Founding of the Almoravid Movement",1040,1048,
    "بدأت الحركة برباطٍ أقامه ابن ياسين على ساحل المحيط بين قبائل صنهاجة الملثمين، نشأت من حلقات أبي عمران الفاسي بالقيروان.",
    ["murabitun.figure.ibn-yasin","murabitun.figure.yahya-ibn-ibrahim","murabitun.figure.abu-imran-fasi","murabitun.event.unify-sahara","murabitun.battle.zab"]],
  ["unify-sahara","توحيد الصحراء الكبرى","Unification of the Great Sahara",1054,1062,
    "وحّد المرابطون قبائل صنهاجة لمتونة وجدالة ومسوفة في كيان واحد، سيطروا على تجارة الذهب من غانة إلى سجلماسة.",
    ["murabitun.figure.abu-bakr-umar","murabitun.figure.ibn-yasin","murabitun.battle.sijilmasa-conquest","murabitun.battle.awdaghust","murabitun.city.sijilmasa","murabitun.event.movement-founded"]],
  ["found-marrakesh","تأسيس مراكش","Founding of Marrakesh",1062,1062,
    "أسّس أبو بكر بن عمر مدينة مراكش سنة ٤٥٤هـ كمعسكرٍ مرابطي، صارت لاحقًا عاصمة الدولة وحاضرة المغرب الكبرى.",
    ["murabitun.figure.abu-bakr-umar","murabitun.figure.yusuf-tashfin","murabitun.city.marrakesh","murabitun.landmark.marrakesh-walls","murabitun.landmark.almoravid-kasbah"]],
  ["cross-andalus","عبور يوسف بن تاشفين إلى الأندلس","Yusuf ibn Tashfin's Crossing to al-Andalus",1086,1086,
    "استنجد ملوك الطوائف بعد سقوط طليطلة بيوسف بن تاشفين، فعبر من سبتة بجيشه الكبير وحقق نصر الزلاقة، أنقذ الإسلام في الأندلس.",
    ["murabitun.figure.yusuf-tashfin","murabitun.figure.mutamid","murabitun.city.ceuta","murabitun.battle.zallaqa","murabitun.event.peak"]],
  ["absorb-taifas","ضمّ ملوك الطوائف","Absorption of the Taifa Kingdoms",1090,1094,
    "بعد الزلاقة، أصدر فقهاء الأندلس فتوى بسقوط شرعية ملوك الطوائف لتفريطهم وتعاملهم مع النصارى، فأسقطهم يوسف بن تاشفين واحدًا تلو الآخر.",
    ["murabitun.figure.yusuf-tashfin","murabitun.figure.mutamid","murabitun.city.seville","murabitun.city.cordoba","murabitun.city.granada","murabitun.city.almeria","murabitun.event.cross-andalus","murabitun.event.peak"]],
  ["peak","ازدهار الدولة المرابطية","Peak of the Almoravid State",1086,1110,
    "ذروة الدولة في عهد يوسف ثم علي بن يوسف: امتداد من السنغال جنوبًا إلى سرقسطة شمالاً، عملة موحّدة قوية، وعمارة في مراكش وفاس وقرطبة.",
    ["murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf","murabitun.event.expansion","murabitun.artifact.almoravid-dinar","murabitun.artifact.almoravid-map"]],
  ["expansion","توسّع المغرب والأندلس","Expansion across Morocco and al-Andalus",1086,1115,
    "ضمّ المرابطون المغرب الأقصى وفاس وتلمسان والأندلس من غرناطة إلى سرقسطة وبلنسية، أوسع امتداد لدولة إسلامية في الغرب منذ الأمويين.",
    ["murabitun.figure.ali-yusuf","murabitun.figure.yusuf-tashfin","murabitun.battle.uclés","murabitun.battle.saragossa-siege","murabitun.battle.valencia-siege","murabitun.event.peak"]],
  ["weakness-begins","بداية الضعف","Beginning of the Decline",1125,1145,
    "تتابعت الهزائم في الأندلس (وادي الحجارة وأقليش الثاني)، وانتشر الفساد الإداري والترف، وبدأت دعوة الموحدين تستقطب القبائل في جبال المغرب.",
    ["murabitun.figure.ali-yusuf","murabitun.figure.alfonso-vii","murabitun.battle.wadi-hijara","murabitun.event.almohad-rise"]],
  ["almohad-rise","ظهور الموحدين","Rise of the Almohads",1121,1147,
    "نهض ابن تومرت ثم تلميذه عبد المؤمن بن علي بدعوة الموحدين في جبال الأطلس، حاصروا مراكش وانتهت دولة المرابطين بسقوط عاصمتهم.",
    ["murabitun.figure.tashfin-ali","murabitun.event.weakness-begins","murabitun.event.fall","murabitun.city.marrakesh"]],
  ["fall","سقوط الدولة المرابطية","Fall of the Almoravid State",1147,1147,
    "سقطت مراكش بيد عبد المؤمن بن علي سنة ٥٤١هـ فانتهت دولة المرابطين بعد قرنٍ كامل، وحلّ محلّها الموحدون في المغرب والأندلس.",
    ["murabitun.event.almohad-rise","murabitun.figure.tashfin-ali","murabitun.figure.ali-yusuf","murabitun.city.marrakesh"]],
] as const;

// ---------- LANDMARKS ----------
const LANDMARK_IDS = [
  ["kutubiyya-old","جامع الكتبية القديم","Old Kutubiyya Mosque",
    "أوّل جامع كبير في مراكش بنته الدولة المرابطية، صار النواة التي بنى عليها الموحدون لاحقًا الكتبية الشهيرة.",
    1070,1147,["murabitun.city.marrakesh","murabitun.figure.ali-yusuf","murabitun.figure.yusuf-tashfin","murabitun.event.peak"]],
  ["marrakesh-walls","أسوار مراكش","Walls of Marrakesh",
    "أسوار العاصمة المرابطية التي بناها علي بن يوسف بطلب من القاضي عياض، حلقات الدفاع الكبرى عن قلب الدولة.",
    1126,1147,["murabitun.city.marrakesh","murabitun.figure.ali-yusuf","murabitun.figure.qadi-iyad","murabitun.event.peak"]],
  ["almoravid-kasbah","قصبة المرابطين","Almoravid Kasbah",
    "قصبة الأمراء في مراكش، فيها قصور الحكم والديوان وبيت المال، شاهدة على العمارة العسكرية المرابطية البسيطة.",
    1070,1147,["murabitun.city.marrakesh","murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf"]],
  ["qarawiyyin","مسجد القرويين","Qarawiyyin Mosque",
    "أعظم جوامع فاس ومن أقدم جامعات العالم، وسّعه علي بن يوسف توسعةً كبيرة سنة ٥٢٨هـ، تحفة العمارة المرابطية الأندلسية في المغرب.",
    1135,1147,["murabitun.city.fes","murabitun.figure.ali-yusuf","murabitun.event.peak","murabitun.event.expansion"]],
  ["fes-walls","أسوار فاس","Walls of Fes",
    "أسوار فاس التي عزّزها المرابطون بعد ضمّ المدينة، حصون حمت حاضرة المغرب في القرنين الخامس والسادس الهجريين.",
    1075,1147,["murabitun.city.fes","murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf"]],
  ["aghmat-palace","قصر أغمات","Palace of Aghmat",
    "قصر الأمارة في العاصمة المرابطية الأولى، فيه عاش المرابطون قبل بناء مراكش، وفيه مات المعتمد بن عباد أسيرًا.",
    1058,1100,["murabitun.city.aghmat","murabitun.figure.abu-bakr-umar","murabitun.figure.mutamid","murabitun.artifact.aghmat-manuscript"]],
  ["ceuta-port","ميناء سبتة","Port of Ceuta",
    "ميناء العبور إلى الأندلس، انطلق منه جيش يوسف بن تاشفين إلى الزلاقة، وفي قضائه القاضي عياض.",
    1083,1147,["murabitun.city.ceuta","murabitun.figure.yusuf-tashfin","murabitun.figure.qadi-iyad","murabitun.event.cross-andalus"]],
  ["sahara-forts","حصون الصحراء","Saharan Forts",
    "سلسلة حصون مرابطية على طرق القوافل بين سجلماسة وأودغست، حمت تجارة الذهب وحفظت أمن الصحراء.",
    1055,1147,["murabitun.city.sijilmasa","murabitun.battle.awdaghust","murabitun.event.unify-sahara","murabitun.artifact.trade-register"]],
] as const;

// ---------- ARTIFACTS ----------
const ARTIFACT_IDS = [
  ["sword-yusuf","سيف يوسف بن تاشفين","Sword of Yusuf ibn Tashfin",
    "سيف أمير المسلمين الذي حمله يوم الزلاقة وفي حملاته بالأندلس، أيقونة الجهاد المرابطي ضدّ قشتالة.",
    1086,1106,"🗡️","legendary",["murabitun.figure.yusuf-tashfin","murabitun.battle.zallaqa","murabitun.event.cross-andalus"]],
  ["almoravid-banner","راية المرابطين","Banner of the Almoravids",
    "الراية البيضاء للمرابطين الملثمين، رُفعت من سجلماسة إلى الزلاقة إلى سرقسطة، رمز دولة الصحراء والأندلس.",
    1040,1147,"🏴","epic",["murabitun.figure.yusuf-tashfin","murabitun.figure.abu-bakr-umar","murabitun.event.unify-sahara","murabitun.event.peak"]],
  ["almoravid-dinar","دينار مرابطي","Almoravid Dinar",
    "العملة الذهبية المرابطية الأشهر في العالم الوسيط، ضُربت بمراكش وفاس وإشبيلية، تُسمّى في أوروبا maravedí احترامًا لقوّتها.",
    1086,1147,"🪙","legendary",["murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf","murabitun.city.marrakesh","murabitun.city.seville","murabitun.event.peak"]],
  ["yusuf-seal","ختم يوسف بن تاشفين","Seal of Yusuf ibn Tashfin",
    "ختم أمير المسلمين على مراسيمه إلى الأندلس وقادة جيوشه، يحمل لقبه الذي منحه له الخليفة العباسي.",
    1086,1106,"🪧","epic",["murabitun.figure.yusuf-tashfin","murabitun.event.cross-andalus","murabitun.artifact.unification-decree"]],
  ["zallaqa-manuscript","مخطوطة الزلاقة","Manuscript of al-Zallaqa",
    "وثيقة تروي تفاصيل المعركة الفاصلة بين يوسف بن تاشفين وألفونسو السادس، شاهدة على إنقاذ الأندلس سنة ٤٧٩هـ.",
    1086,1150,"📜","legendary",["murabitun.battle.zallaqa","murabitun.figure.yusuf-tashfin","murabitun.figure.alfonso-vi","murabitun.event.cross-andalus"]],
  ["almoravid-map","خريطة الدولة المرابطية","Map of the Almoravid State",
    "خريطة تبيّن امتداد المرابطين من السنغال إلى سرقسطة في ذروة عهد علي بن يوسف، أوسع امتدادٍ غربي للإسلام.",
    1110,1140,"🗺️","epic",["murabitun.figure.ali-yusuf","murabitun.event.expansion","murabitun.event.peak"]],
  ["unification-decree","مرسوم التوحيد","Decree of Unification",
    "مرسوم يوسف بن تاشفين بضمّ ملوك الطوائف بعد فتوى فقهاء الأندلس، نموذجٌ لتوحيد الأمّة الإسلامية شرعًا وسياسةً.",
    1090,1094,"📜","epic",["murabitun.figure.yusuf-tashfin","murabitun.figure.mutamid","murabitun.event.absorb-taifas","murabitun.artifact.yusuf-seal"]],
  ["zallaqa-medal","وسام الزلاقة","Medal of al-Zallaqa",
    "وسام شرفي يُمنح لمن أكمل مسار يوسف بن تاشفين والزلاقة وإنقاذ الأندلس.",
    1086,1147,"🏵️","legendary",["murabitun.battle.zallaqa","murabitun.figure.yusuf-tashfin","murabitun.event.cross-andalus"]],
  ["aghmat-manuscript","مخطوطة أغمات","Manuscript of Aghmat",
    "وثيقة من العاصمة الأولى للمرابطين، تروي قصة المعتمد بن عباد في منفاه وموته بها وحال أمراء المرابطين الأوائل.",
    1062,1100,"📜","rare",["murabitun.city.aghmat","murabitun.figure.mutamid","murabitun.figure.abu-bakr-umar","murabitun.landmark.aghmat-palace"]],
  ["trade-register","سجل التجارة الصحراوية","Register of the Saharan Trade",
    "سجلات قوافل المرابطين بين سجلماسة وأودغست وغانة، توضح حركة الذهب والملح والعبيد في القرن الخامس الهجري.",
    1055,1147,"📚","rare",["murabitun.city.sijilmasa","murabitun.battle.awdaghust","murabitun.event.unify-sahara","murabitun.landmark.sahara-forts"]],
] as const;

// ---------- ACHIEVEMENTS ----------
const ACHIEVEMENT_IDS = [
  ["zallaqa-hero","بطل الزلاقة","Hero of al-Zallaqa",
    "يُمنح لمن أكمل قصص يوسف بن تاشفين والزلاقة وإنقاذ الأندلس.",
    ["murabitun.figure.yusuf-tashfin","murabitun.battle.zallaqa","murabitun.event.cross-andalus","murabitun.figure.mutamid","murabitun.artifact.zallaqa-manuscript","murabitun.artifact.zallaqa-medal"]],
  ["almoravid-historian","مؤرّخ المرابطين","Historian of the Almoravids",
    "يُمنح لمن قرأ جميع شخصيات وأحداث دولة المرابطين في الموسوعة.",
    ["murabitun.state.murabitun","murabitun.figure.ibn-yasin","murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf","murabitun.event.movement-founded","murabitun.event.fall","murabitun.event.peak"]],
  ["almoravid-collector","جامع التراث المرابطي","Collector of Almoravid Heritage",
    "يُمنح لمن جمع كلّ آثار ومخطوطات المرابطين في مجموعته.",
    ["murabitun.artifact.sword-yusuf","murabitun.artifact.almoravid-banner","murabitun.artifact.almoravid-dinar","murabitun.artifact.yusuf-seal","murabitun.artifact.zallaqa-manuscript","murabitun.artifact.almoravid-map","murabitun.artifact.unification-decree"]],
  ["lord-marrakesh","سيد مراكش","Lord of Marrakesh",
    "يُمنح لمن أتمّ مسار تأسيس مراكش وعمارتها في عهد المرابطين.",
    ["murabitun.city.marrakesh","murabitun.figure.abu-bakr-umar","murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf","murabitun.landmark.marrakesh-walls","murabitun.landmark.kutubiyya-old","murabitun.landmark.almoravid-kasbah"]],
  ["andalus-protector","حامي الأندلس","Protector of al-Andalus",
    "يُمنح لمن أكمل مسار عبور الأندلس وضمّ ملوك الطوائف وانتصارات أُقليش وسرقسطة وبلنسية.",
    ["murabitun.event.cross-andalus","murabitun.event.absorb-taifas","murabitun.battle.uclés","murabitun.battle.saragossa-siege","murabitun.battle.valencia-siege","murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf"]],
] as const;

// ---------- FUTURE CAMPAIGN PLACEHOLDERS (locked) ----------
const FUTURE_CAMPAIGN_IDS = [
  ["future-ibn-yasin",   "حملة عبد الله بن ياسين", 1040,1059,"حملةٌ قادمة عن مؤسس الحركة وفقيه الصحراء. (قريبًا)"],
  ["future-yusuf",       "حملة يوسف بن تاشفين",    1086,1106,"حملةٌ قادمة عن أمير المسلمين وفاتح الأندلس. (قريبًا)"],
  ["future-zallaqa",     "معركة الزلاقة",          1086,1086,"حملةٌ قادمة عن النصر الذي أنقذ الأندلس. (قريبًا)"],
  ["future-unify-maghrib","توحيد المغرب",          1062,1086,"حملةٌ قادمة عن جمع المغرب الأقصى تحت راية واحدة. (قريبًا)"],
  ["future-save-andalus","إنقاذ الأندلس",          1086,1094,"حملةٌ قادمة عن ضمّ ملوك الطوائف بعد فتوى الفقهاء. (قريبًا)"],
  ["future-fall",        "سقوط المرابطين",         1125,1147,"حملةٌ قادمة عن صعود الموحدين وسقوط مراكش. (قريبًا)"],
] as const;

const entities: PackEntity[] = [
  // ---------- STATE ----------
  E({
    id: "murabitun.state.murabitun",
    title: "دولة المرابطين",
    latin: "Almoravid State",
    type: "state",
    description:
      "دولة المرابطين، حركة فقهية مالكية قامت بين قبائل صنهاجة الملثمين في الصحراء الكبرى سنة ٤٣٢هـ/١٠٤٠م على يد عبد الله بن ياسين ويحيى بن إبراهيم، أسّس أبو بكر بن عمر مراكش، وبلغت الدولة ذروتها على يد يوسف بن تاشفين الذي عبر إلى الأندلس وانتصر في الزلاقة سنة ٤٧٩هـ/١٠٨٦م وضمّ ملوك الطوائف. حكمت المغرب والأندلس قرنًا، وسقطت بدخول الموحدين مراكش سنة ٥٤١هـ/١١٤٧م.",
    period: { label: "٤٣٢ – ٥٤١ هـ / ١٠٤٠ – ١١٤٧ م", startYear: 1040, endYear: 1147 },
    relatedEntities: [
      "murabitun.figure.ibn-yasin","murabitun.figure.yahya-ibn-ibrahim","murabitun.figure.abu-bakr-umar",
      "murabitun.figure.yusuf-tashfin","murabitun.figure.ali-yusuf","murabitun.figure.tashfin-ali",
      "murabitun.figure.mutamid","murabitun.figure.alfonso-vi","murabitun.figure.alfonso-vii",
      "murabitun.figure.qadi-iyad","murabitun.figure.ibn-arabi-maafiri","murabitun.figure.al-baji",
      "murabitun.figure.abu-imran-fasi","murabitun.figure.ibn-rushd-jadd","murabitun.figure.turtushi",
      "murabitun.city.marrakesh","murabitun.city.fes","murabitun.city.ceuta","murabitun.city.tangier",
      "murabitun.city.cordoba","murabitun.city.seville","murabitun.city.granada","murabitun.city.almeria",
      "murabitun.city.aghmat","murabitun.city.sijilmasa",
      "murabitun.battle.zallaqa","murabitun.battle.uclés","murabitun.battle.zab",
      "murabitun.battle.saragossa-siege","murabitun.battle.valencia-siege",
      "murabitun.battle.sijilmasa-conquest","murabitun.battle.awdaghust","murabitun.battle.wadi-hijara",
      "murabitun.event.movement-founded","murabitun.event.unify-sahara","murabitun.event.found-marrakesh",
      "murabitun.event.cross-andalus","murabitun.event.absorb-taifas","murabitun.event.peak",
      "murabitun.event.expansion","murabitun.event.weakness-begins","murabitun.event.almohad-rise","murabitun.event.fall",
    ],
    unlockables: [
      { kind: "campaign", refId: "murabitun", label: "حملات دولة المرابطين" },
    ],
    image: { alt: "راية دولة المرابطين", glyph: "🏜️", tone: "from-amber-900/40 to-stone-900" },
    timelinePosition: 1040,
    rarity: "legendary",
    meta: {
      founder: "عبد الله بن ياسين / أبو بكر بن عمر",
      capital: "مراكش",
      majorCities: ["مراكش","فاس","سبتة","طنجة","قرطبة","إشبيلية","غرناطة","المرية","أغمات","سجلماسة"],
      majorFigures: ["ابن ياسين","أبو بكر بن عمر","يوسف بن تاشفين","علي بن يوسف","القاضي عياض","ابن العربي المعافري"],
      majorBattles: ["الزلاقة","أُقليش","الزاب","سرقسطة","بلنسية","سجلماسة","أودغست","وادي الحجارة"],
      majorEvents: ["تأسيس الحركة","توحيد الصحراء","تأسيس مراكش","عبور الأندلس","الزلاقة","ضمّ الطوائف","الازدهار","التوسّع","الضعف","ظهور الموحدين","سقوط الدولة"],
    },
    bridges: { era: "murabitun" },
  }),

  // ---------- FIGURES ----------
  ...FIGURE_IDS.map(([slug, title, latin, startYear, endYear, description, related]) => E({
    id: `murabitun.figure.${slug}`,
    title, latin, type: "figure", description,
    period: { label: `${startYear} – ${endYear} م`, startYear, endYear },
    relatedEntities: ["murabitun.state.murabitun", ...related],
    unlockables: [{ kind: "figure", refId: `murabitun.figure.${slug}`, label: title }],
    image: { alt: title, glyph: "🏜️", tone: "from-amber-900/40 to-stone-900" },
    timelinePosition: startYear,
    rarity: "epic",
    meta: { titles: [title] },
    bridges: { era: "murabitun" },
  })),

  // ---------- SCHOLARS ----------
  ...SCHOLAR_IDS.map(([slug, title, latin, startYear, endYear, description, related]) => E({
    id: `murabitun.figure.${slug}`,
    title, latin, type: "figure", description,
    period: { label: `${startYear} – ${endYear} م`, startYear, endYear },
    relatedEntities: ["murabitun.state.murabitun", ...related],
    unlockables: [{ kind: "figure", refId: `murabitun.figure.${slug}`, label: title }],
    image: { alt: title, glyph: "📚", tone: "from-amber-900/40 to-stone-900" },
    timelinePosition: startYear,
    rarity: "epic",
    meta: { kind: "scholar", titles: [title] },
    bridges: { era: "murabitun" },
  })),

  // ---------- CITIES ----------
  ...CITY_IDS.map(([slug, title, latin, description, startYear, endYear, related]) => E({
    id: `murabitun.city.${slug}`,
    title, latin, type: "city", description,
    period: { label: `${startYear} – ${endYear} م`, startYear, endYear },
    relatedEntities: ["murabitun.state.murabitun", ...related],
    unlockables: [{ kind: "city", refId: `murabitun.city.${slug}`, label: title }],
    image: { alt: title, glyph: "🏙️", tone: "from-amber-900/30 to-stone-900" },
    timelinePosition: startYear,
    rarity: "rare",
    bridges: { cityId: slug, era: "murabitun" },
  })),

  // ---------- BATTLES ----------
  ...BATTLE_IDS.map(([slug, title, latin, startYear, endYear, description, related]) => E({
    id: `murabitun.battle.${slug}`,
    title, latin, type: "battle", description,
    period: { label: `${startYear} – ${endYear} م`, startYear, endYear },
    relatedEntities: ["murabitun.state.murabitun", ...related],
    unlockables: [{ kind: "battle", refId: `murabitun.battle.${slug}`, label: title }],
    image: { alt: title, glyph: "⚔️", tone: "from-red-800/40 to-stone-900" },
    timelinePosition: startYear,
    rarity: "epic",
    bridges: { era: "murabitun" },
  })),

  // ---------- EVENTS ----------
  ...EVENT_IDS.map(([slug, title, latin, startYear, endYear, description, related]) => E({
    id: `murabitun.event.${slug}`,
    title, latin, type: "event", description,
    period: { label: `${startYear} – ${endYear} م`, startYear, endYear },
    relatedEntities: ["murabitun.state.murabitun", ...related],
    unlockables: [{ kind: "event", refId: `murabitun.event.${slug}`, label: title }],
    image: { alt: title, glyph: "📜", tone: "from-amber-900/40 to-stone-900" },
    timelinePosition: startYear,
    rarity: "rare",
    bridges: { era: "murabitun" },
  })),

  // ---------- LANDMARKS ----------
  ...LANDMARK_IDS.map(([slug, title, latin, description, startYear, endYear, related]) => E({
    id: `murabitun.landmark.${slug}`,
    title, latin, type: "landmark", description,
    period: { label: `${startYear} – ${endYear} م`, startYear, endYear },
    relatedEntities: ["murabitun.state.murabitun", ...related],
    unlockables: [{ kind: "landmark", refId: `murabitun.landmark.${slug}`, label: title }],
    image: { alt: title, glyph: "🕌", tone: "from-amber-900/40 to-stone-900" },
    timelinePosition: startYear,
    rarity: "epic",
    bridges: { era: "murabitun" },
  })),

  // ---------- ARTIFACTS ----------
  ...ARTIFACT_IDS.map(([slug, title, latin, description, startYear, endYear, glyph, rarity, related]) => E({
    id: `murabitun.artifact.${slug}`,
    title, latin, type: "artifact", description,
    period: { label: `${startYear} – ${endYear} م`, startYear, endYear },
    relatedEntities: ["murabitun.state.murabitun", ...related],
    unlockables: [{ kind: "artifact", refId: `murabitun.artifact.${slug}`, label: title }],
    image: { alt: title, glyph: glyph as string, tone: "from-amber-900/40 to-stone-900" },
    timelinePosition: startYear,
    rarity: rarity as "common" | "rare" | "epic" | "legendary",
    bridges: { era: "murabitun" },
  })),

  // ---------- ACHIEVEMENTS ----------
  ...ACHIEVEMENT_IDS.map(([slug, title, latin, description, related]) => E({
    id: `murabitun.achievement.${slug}`,
    title, latin, type: "achievement", description,
    period: { label: "١٠٤٠ – ١١٤٧ م", startYear: 1040, endYear: 1147 },
    relatedEntities: ["murabitun.state.murabitun", ...related],
    unlockables: [{ kind: "title", refId: `murabitun.achievement.${slug}`, label: title }],
    image: { alt: title, glyph: "🏅", tone: "from-amber-600/40 to-stone-900" },
    timelinePosition: 1090,
    rarity: "legendary",
    bridges: { era: "murabitun" },
  })),

  // ---------- FUTURE CAMPAIGN PLACEHOLDERS (locked) ----------
  ...FUTURE_CAMPAIGN_IDS.map(([slug, title, startYear, endYear, description]) => E({
    id: `murabitun.event.${slug}`,
    title, type: "event", description,
    period: { label: `${startYear} – ${endYear} م`, startYear, endYear },
    relatedEntities: ["murabitun.state.murabitun"],
    unlockables: [],
    image: { alt: title, glyph: "🔒", tone: "from-stone-700/40 to-slate-900" },
    timelinePosition: startYear,
    rarity: "legendary",
    meta: { locked: true, kind: "campaign-placeholder" },
    bridges: { era: "murabitun" },
  })),
];

export const MURABITUN_PACK: ContentPack = {
  id: "pack-010-murabitun",
  order: 26, // ~ contemporary to Seljuks (25), before Zengids (27)
  title: "دولة المرابطين",
  subtitle: "المجموعة ١٠ · أمراء صنهاجة الملثمين ومنقذو الأندلس",
  summary:
    "حزمة محتوى تاريخية شاملة عن دولة المرابطين من حركة عبد الله بن ياسين في الصحراء إلى تأسيس مراكش وعبور يوسف بن تاشفين إلى الأندلس وانتصار الزلاقة وضمّ ملوك الطوائف، حتى ظهور الموحدين وسقوط الدولة.",
  era: "murabitun",
  period: { label: "٤٣٢ – ٥٤١ هـ / ١٠٤٠ – ١١٤٧ م", startYear: 1040, endYear: 1147 },
  cover: { alt: "غلاف دولة المرابطين", glyph: "🏜️", tone: "from-amber-900/40 to-stone-900" },
  entities,
};