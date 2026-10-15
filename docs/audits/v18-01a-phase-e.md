# V18-01A — Phase E: Independent Final Audit & Regression

> نسخة محفوظة بعد اعتماد HOLD؛ النص أدناه يسجل ما حدث وقت التدقيق، قبل هذا الحفظ التوثيقي. لم تُنفذ إصلاحات. حُولت روابط الأسطر المحلية إلى روابط GitHub مثبتة على HEAD المدقق. المرفقات وتعليمات التشغيل في [repros/v18-01a-phase-e/README.md](repros/v18-01a-phase-e/README.md). سجل Chromium محفوظ كمقتطف Hydration تقني فقط، دون سجل الحالة المعروضة.

**القرار: HOLD — لم تجتز بوابة مراجعة الكود. قبول Android والجهاز الفعلي معلق.**

التاريخ: 2026-10-15 UTC. المستودع `mnourdam/noor-al-maadi-app`، الفرع `v18-01a-outbox-recovery`.
أساس المقارنة `fd573b8b881ab8f0e7f566d6d67ec3a5a60a38bf`؛ HEAD الذي تمت مراجعته `2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a`.
تحققت من المرجع ونظافة Git قبل التدقيق. الفرق التراكمي يشمل 35 ملفًا. لم أغير كود المستودع أو اختباراته أو إعداداته، ولم أنشئ Commit أو Push أو Merge. التقرير وأدوات التشخيص خارج المستودع. أُوقفت خدمات التطوير والمتصفح التي شغلتها للتدقيق بعد التقاط الأدلة.

لا توجد P0 مثبتة. توجد سبع مجموعات P1 تمنع قبول المتطلبات الحالية؛ بعضها دين قديم بقي في المسارات المعتمدة، وليس انحدارًا أحدثته D. نجاح اختبارات A–D لا يغطي هذه الفجوات.

## النتائج المانعة P1 وMINIMUM FIX المقترح

### P1-01 — الأرشيف الجديد لا يعمل مع عزل التخزين المثبت فعليًا

**إعادة إنتاج ناجحة، probe 1.** مع `installIdentityPartition()` الحقيقي، تنجح أول `archiveRejected` وتزيل العملية بعد حفظ النسخة، لكن `listDeadLetters` يرمي `dead-letter-key-mismatch`. الأرشفة التالية وقراءة/تنظيف الأرشيف تتعطل، وتبقى العمليات اللاحقة في Outbox.

الدليل: [dead-letter.ts:90](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/dead-letter.ts#L90) يقارن مفتاحًا منطقيًا ناتجًا من `keyFor` بمفتاح مادي صادر من `Storage.key()`. [dead-letter.ts:104](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/dead-letter.ts#L104) يجمع مفاتيح جميع مساحات الحسابات قبل التصفية. [partition.ts:116](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/identity/partition.ts#L116) يضيف `::owner=...` إلى `getItem/setItem/removeItem`، ولا يعيد تسمية نتائج `key()`.

الأثر: بيانات الأرشيف ما زالت موجودة ماديًا، لكنها غير قابلة للاستخدام عبر API؛ سجل حساب آخر يستطيع تعطيل القراءة أيضًا. ترحيل مصفوفة V17 إلى مفاتيح الإدخالات يصطدم بالمشكلة نفسها. هذه مشكلة تكامل في آلية الأرشفة الجديدة لم تختبرها مجموعات C/D مع partition الحقيقي.

**MINIMUM FIX:** تحديد مساحة المالك صراحة، فصل المفتاح المادي عن المنطقي عند التعداد والتحقق، وتصفية الحساب قبل تفسير الإدخالات. الحفاظ على قراءة مصفوفات V17 والإدخالات التي كُتبت بالفعل، وعدم حذفها لإصلاح الفهرسة. اختبار أرشفتين، restart، clear، وحسابين مع partition مثبت طوال السيناريو.

### P1-02 — كتابة انتهت مهلتها تستطيع استبدال تقدم أحدث

**إعادة إنتاج ناجحة، probe 4، بمهلة حقيقية 8 ثوانٍ.** دون Web Locks، أوقفت سياقًا قديمًا بعد اكتمال قراءة IDB وقبل استكمال promise الخاص بها. أعاد `saveGameplay` نتيجة غير محفوظة بعد المهلة. كتب سياق آخر `scene:9` بنجاح، ثم استؤنف الأول وكتب `scene:1` فوقه، مع `supersedes` يشير إلى revision الأحدث. أحدث تقدم اختفى من Outbox.

الدليل: [gameplay-write.ts:20](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/gameplay-write.ts#L20) يستخدم `Promise.race` دون إلغاء العمل. [gameplay-write.ts:66](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/gameplay-write.ts#L66) يحرر single-flight عند انتهاء الغلاف. [outbox.ts:283](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/outbox.ts#L283) يقرأ base، لكن [outbox.ts:287](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/outbox.ts#L287) يبني النسخة القديمة من آخر row وقت الكتابة دون CAS على base المقروء.

الأثر: حماية `remove` من إقرار قديم صحيحة، لكنها لا تحمي من enqueue قديم متأخر. لا يُرتّب revision UUID حسب نية اللاعب.

**MINIMUM FIX:** مقارنة base revision التي شاهدها الطلب داخل معاملة الكتابة ورفض الاستبدال إذا تغيرت؛ عدم جعل طلب قديم يرث أحدث revision تلقائيًا. التعامل مع timeout على أنه عمل غير محسوم، مع تسوية العملية المتأخرة قبل قبول retry مستقل، أو إلغاء قابل للتحقق. إضافة اختبار سباق المهلة بين سياقين ومع payload مختلف.

### P1-03 — العملية المؤجلة قد تُحفظ في namespace الحساب الجديد

**إعادة إنتاج ناجحة، probe 5.** انتظر enqueue لأليس قفلًا، تبدل المالك إلى بوب وتعطل IDB، ثم اكتمل enqueue. receipt يحمل `userId=alice`، لكن البيانات كُتبت تحت `irth.outbox.fallback.v1::owner=user:bob`. بعد العودة لأليس وتعافي IDB، أعاد `peekAll(alice)` مصفوفة فارغة.

الدليل: [outbox.ts:277](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/outbox.ts#L277) يبدأ العمل بعد انتظار القفل دون تثبيت namespace أو فحص epoch؛ [outbox.ts:297](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/outbox.ts#L297) يقرأ ويكتب fallback باسم منطقي يتبع المالك الحالي. فحص [gameplay-write.ts:88](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/gameplay-write.ts#L88) يأتي بعد التخزين.

الأثر: لا تُعرض العملية لبوب بسبب فلتر userId، لكنها تصبح مخفية عن أليس وقد لا تُستعاد إلا عند زيارة namespace بوب مجددًا. هذه فجوة متبقية في دمج Outbox مع طبقة العزل؛ الحواجز في واجهة اللعب وحدها لا تصلحها.

**MINIMUM FIX:** تثبيت مفاتيح التخزين المادية للمالك عند بدء العملية، واستخدامها في القراءة والنسخ والتنظيف حتى نهاية العمل، أو إيقاف العملية قبل أي كتابة عند تبدل الهوية. اختبار تبدل الهوية أثناء انتظار القفل وفتح IDB وتنظيف fallback. لا تغير أسماء البيانات القديمة ولا تنقلها إلى مالك جديد ضمنيًا.

### P1-04 — القبول المحلي يصل إلى إكمال ومكافآت نهائية قبل معرفة الرفض الدائم

**إعادة إنتاج لمسار التخزين/flush، probe 2؛ أثر الواجهات مثبت من الكود.** حفظت عملية فصل دون إنترنت: `saveAccepted=true` و`acknowledged=false`. عند العودة رفضها الخادم الوهمي بـ`invalid_campaign_id`، فأرشفت وفشل flush دون زيادة `flushed`. هذا يثبت أن accepted ليس تأكيد اكتمال من الخادم.

الدليل: [gameplay-write.ts:13](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/gameplay-write.ts#L13). واجهة الفصل [campaign chapter:284](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/routes/campaigns.imported.$id.chapter.$chapter.tsx#L284) تحول accepted إلى تقدم محلي ثم تمنح XP/دنانير في [السطر 297](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/routes/campaigns.imported.$id.chapter.$chapter.tsx#L297). التحقيق يميز XP المعلّق في النتيجة، لكنه يضع علامة إكمال ويمنح badge وقلوبًا قبل هذا التمييز: [investigation route:246](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/routes/investigation.$id.tsx#L246). القصة تنتقل إلى reward/journey عند queued مع مكافأة صفر، دون حالة pending صريحة: [StoryPlayer:190](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/components/stories/player/StoryPlayer.tsx#L190).

الأثر: رفض دائم لاحق لا يتراجع عن الإكمال المحلي أو المكافأة ولا يعرض فشل العملية المعينة. لا يعني ذلك أن backend منح مكافأة مرتين؛ الخطر المثبت هو تقدم/مكافأة محلية غير مطابقة للحالة المقبولة على الخادم.

**MINIMUM FIX:** إبقاء حفظ offline، لكن فصل pending عن confirmed في سجلات الإكمال والعرض، وعدم صرف المكافأة النهائية على queued. ربط تسوية النجاح أو الرفض بهوية العملية وrevision، وإتاحة retry للرفض دون نسيان تقدم اللعب. هذا اعتماد متبقٍ في عقد الواجهة، يحتاج موافقة قبل تغيير السلوك.

### P1-05 — لا يوجد تسليم قابل للاستئناف بين التقدم وسجل المكافآت والملف الشخصي

**إعادة إنتاج للقرارات الخاطئة بعد restart، probes 3 و7 و8؛ ترتيب الواجهة مؤكد بالمصدر.**

- الفصل: يُحفظ التقدم أولًا، ثم يُسجل claim، ثم تُستدعى `addPoints/addDinars`، ثم يُكتب سجل المنح. التوقف بعد claim وقبل حفظ profile يفقد المكافأة؛ claim التالي يعود false. التوقف بعد تقدم الفصل وقبل claim قد يُدخل اللاعب على شاشة فصل مكتمل دون استئناف المنحة.
- التحدي: إذا حُفظ game_complete وتوقف التطبيق قبل منحة الواجهة، يعد وجود العملية دليلًا على مكافأة سابقة ويعيد `firstTime:false`، فتُحجب المكافأة التي لم تُمنح.
- بعد إزالة العملية بمزامنة ناجحة وإعادة تشغيل التطبيق، يكفي فشل قراءة السيرفر حتى يصبح `alreadyCompleted=false` ثانية، لأن الحماية الأخرى `Set` في الذاكرة فقط؛ تعود `firstTime:true` ويمكن للواجهة تكرار المنحة المحلية.

الدليل: [campaign route:288](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/routes/campaigns.imported.$id.chapter.$chapter.tsx#L288)، [campaignLedger:94](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/campaignLedger.ts#L94)، [profile:539](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/profile.tsx#L539)، [games/progress:54](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/games/progress.ts#L54)، [games/progress:63](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/games/progress.ts#L63)، [games/progress:73](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/games/progress.ts#L73)، [game route:180](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/routes/games.$mode.$slug.tsx#L180). كذلك `getMyProgress` يتجاهل `error` في الاستجابة: [السطر 23](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/games/progress.ts#L23).

هذا دين قديم جزئيًا، وD أضاف حواجز داخل الجلسة دون إغلاق فجوة restart. لا يمكن قبول عبارة «لا تكرار ولا خسارة للمكافأة» حاليًا.

**MINIMUM FIX:** سجل محلي دائم لاستحقاق المنحة وحالتها، مع استئناف idempotent أو حفظ مفتاح المنح والحالة النهائية للملف الشخصي ضمن وحدة محلية واحدة. التمييز بين «قراءة ناجحة ولا توجد نتيجة» و«قراءة فاشلة»، وعدم تحويل failed read إلى firstTime. لا تستخدم مجرد pending row أو Set كدليل على صرف المكافأة. يلزم اعتماد خطة محدودة قبل التنفيذ؛ لا يكفي تعديل if واحدة، ولا يتطلب الاقتراح تغيير SQL أو منطق مكافآت السيرفر.

### P1-06 — مسارات الضيف ما زالت تعلن حفظًا/منحة رغم امتلاء التخزين

**إعادة إنتاج ناجحة، probe 6؛ عيب موجود قبل التغييرات الحالية.** عند جعل `Storage.setItem` يرمي quota error، يعيد كل من `guestMarkCompleted` و`addGuestCompletion` نتيجة firstTime مرتين متتاليتين لنفس المحتوى. الواجهتان تصرفان مكافآت بناء عليها.

الدليل: [guest stories:32](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/stories/guestCompletions.ts#L32)، [guest stories:44](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/stories/guestCompletions.ts#L44)، [guest games:46](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/games/guestCompletions.ts#L46)، [guest games:65](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/games/guestCompletions.ts#L65)، [StoryPlayer:178](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/components/stories/player/StoryPlayer.tsx#L178)، [game route:177](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/routes/games.$mode.$slug.tsx#L177).

توجد نتيجة حفظ غير مثبتة أخرى للضيف: [guest-progress-buffer:62](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/campaigns/guest-progress-buffer.ts#L62) يبتلع فشل الكتابة، بينما [record.ts:105](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/record.ts#L105) قد يعيد `buffered_no_session`؛ `try/catch` الخارجي لا يرى الفشل المبتلع.

**MINIMUM FIX:** نتائج حفظ صريحة وقراءة صارمة، وإيقاف المنحة/الإكمال عند فشل إثبات الكتابة، مع إظهار retry. إبقاء سجل الضيف القديم وتفادي استبداله عند فشل القراءة. ربط منحته أيضًا بمعالجة P1-05 حتى لا تصبح الكتابة الناجحة ثم crash سببًا لخسارة أخرى.

### P1-07 — نتيجة Daily Quest المتأخرة ليست محمية بتغير الحساب

**تحليل مسار مؤكد، لم أختبر تعديل بيانات حقيقية أو أدّع حدوثه. عيب سابق لم تعالجه D.** [DailyQuestCard:192](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/components/home/DailyQuestCard.tsx#L192) ينتظر grant ثم يطبق `serverStats` أو يضيف رصيدًا دون تحقق owner/epoch بعد الانتظار. تنظيف effect في [السطر 309](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/components/home/DailyQuestCard.tsx#L309) يلغي hydrator آخر، وليس grant الجاري. كذلك [daily-quest-reward:184](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/daily-quest-reward.ts#L184) ينتظر قراءة ثم يستدعي RPC من session الحالية دون تثبيت أنها تخص userId الذي بُني منه deltaId.

الأثر المحتمل: إظهار اقتصاد الحساب السابق في الحساب الجديد، وربما إرسال طلب بهوية جلسة تغيرت أثناء الانتظار. حماية idempotency من تكرار delta لا تثبت صحة مالك الطلب.

**MINIMUM FIX:** تثبيت owner/epoch والتحقق من session قبل RPC وبعد كل انتظار وقبل أي تحديث محلي أو علامة rewarded، وإبطال callbacks القديمة عند unmount/account switch. إضافة اختبار للبطاقة الحقيقية مع RPC مؤجل وتبديل الحساب، باستخدام خادم وهمي.

## ما تحقق في Outbox، وحدود التوافق مع V17

- التخزين الأساسي ما زال `irth-offline-outbox`، version 1، store `items` ومفتاح `id`؛ لا Schema migration أو إعادة تهيئة أو حذف قاعدة.
- V17 دون revision تدعمه مقارنة snapshot canonical، و`remove/bumpAttempt` يقارنان snapshot فعليًا داخل transaction. لم أجد مستدعي Outbox إنتاجيًا يحذف بالـid وحده بعد D؛ المواضع المتبقية في flush/adapter/archive تمرر receipt.
- النسخ الاحتياطي يُنسخ ثم ينتظر اكتمال transaction قبل تنظيف النسخة المطابقة. تعطل الكتابة/القراءة والحدود لا يُعتبر نجاحًا. مجموعات A/B/C تؤكد ذلك في بيئة التخزين الوهمية.
- تصادم id بين حسابين لا يكتب فوق مالك IDB؛ يُبقي الحساب الآخر في fallback. لكن P1-03 يمنع قبول عزل الحسابات الفعلي بصورة عامة.
- القراءة الجزئية ترمي `OutboxReadError`؛ flush يتوقف قبل تصريف مصفوفة جزئية بدل افتراض فراغ المخزن. لا توجد استعادة تلقائية على حساب مخزن غير مقروء.
- الرفض الدائم لا يزيد flushed، ولا يحذف revision أحدث، وquota/full archive يبقي العملية. لكن هذا لا يعالج P1-01 في التطبيق الحقيقي.
- **تقييم V17: توافق بنيوي جيد للعمليات السليمة، لكنه غير مقبول نهائيًا** بسبب تكامل partition/Dead-Letter وفجوات الهوية. لم تُختبر نسخة فعلية من بيانات جهاز لاعب، ولم تُلمس بيانات حقيقية.

## ملاحظات P2 غير المانعة بذاتها

1. غياب Web Locks مع IDB سليم يسمح بالمعاملات الأساسية، لكنه يرفض تعديل fallback المشترك والأرشفة. هذا fail-closed يحفظ البيانات لكنه يوقف معالجة الرفض الدائم، وقد يمنع enqueue عند وجود fallback. يلزم توثيق حد دعم WebView واختباره؛ لا تُسمّه نجاح offline كاملًا.
2. فشل أحد المصدرين يمنع قراءة كاملة حتى لو الآخر سليم. هذا اختيار محافظ لا يفقد البيانات، لكنه يوقف flush والتحديات التي تنتظر peek. يلزم عرض pending/storage unavailable بدل فراغ مؤكد.
3. [flush.ts:475](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/offline/flush.ts#L475) يستخدم inflight عامًا غير مربوط بحساب، وعمليات auth/RPC فيه بلا مهلة. طلب عالق يمنع flush للحساب التالي حتى يستقر أو يُعاد تشغيل السياق. [games/progress:54](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/games/progress.ts#L54) ينتظر peek دون مهلة أيضًا؛ مهلة adapter ليست سقفًا شاملًا لكل شاشة. راجع timeout/retry بعد إصلاح الكتابات المتأخرة، دون إسقاط العمل المعلق.
4. `enqueueCollectionSync/enqueueChapterSync` في [campaignLedger:191](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/campaignLedger.ts#L191) يتجاهلان نتيجة `write`، وintro sync في [intro/sync:34](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/lib/campaigns/intro/sync.ts#L34) يتجاهل SaveOutcome؛ ليست هناك id-only deletes، لكن جرد المستدعين غير الحساسين للمكافآت ما زال يحتاج متابعة لحالات عدم المزامنة. لا أفترض أن catch متزامن يلتقط rejection لاحقًا.
5. مفاتيح Dead-Letter تتضمن payload كاملًا إضافة إلى value؛ تستهلك quota بسرعة، وحد 500 لا يعالج الحجم بالبايت. السلوك الحالي يحتفظ بالعملية عند الامتلاء ولا يقصّها بصمت.

## نتائج الاختبارات الفعلية

| الفحص | النتيجة | النطاق/السبب |
| --- | --- | --- |
| `npm run test` | 162/162 ناجح، 6 ملفات | Outbox + Gameplay + durable Streak فقط، وليس كل المشروع |
| `npm run typecheck` | ناجح، exit 0 | التطبيق ومشروع اختبارات Outbox |
| `npm run build` | ناجح، exit 0 | بناء ويب محلي فقط؛ snapshot:ensure يفك artifact محليًا دون شبكة؛ تحذير chunk size وبعض تحذيرات bundling لا تعني نشرًا |
| `git diff --check` | ناجح | Git بقي نظيفًا بعد الفحص |
| Arabic Answer Matching | 44/44 ناجح | الأمر الرسمي `npm run test:answer-matching` |
| Startup + جميع Streak | 46 ناجح، 1 فاشل من 47 | Streak: 37/37، Startup: 9/10؛ يوجد تداخل 8 اختبارات durable مع مجموعة الـ162، فلا تجمع الأعداد كاختبارات فريدة |
| انحدار إضافي V16/persistence/quota | 47 assertion/test ناجح في 4 suites | persistence-priority-zero، baseline-auth-hydration، v16-offline-regression-fixes، storage-quota-recovery؛ بعضها فحوص source contract وليست E2E |
| Investigation Answer Machine | 19/19 ناجح | Bun 1.3.11، المشغل الذي تطلبه المجموعة |
| Reflections | 13/13 ناجح | Bun مع حظر fetch |
| Daily Challenge Scheduler | 33 ناجح، 6 فاشلة من 39 | أُعيدت النتيجة نفسها في snapshot أساس V18 |
| Identity Isolation الأصلي | غير مكتمل | التشغيل الجماعي علق بعد 6 passes؛ بتشغيل كل حالة منفصلة، حالتان انتهتا exit 0 وثماني حالات تجاوزت 12 ثانية رغم طباعة assertion pass قبل التعليق؛ ليست 10 اختبارات ناجحة مكتملة |
| probes التدقيق خارج المستودع | 8/8 أعادت إنتاج السلوك المعيب المتوقع | Assertions تصف العيوب المشاهدة؛ ليست اجتيازًا لمتطلبات القبول |
| Chromium محلي SSR/client | HTTP 200، ثم React Hydration exception | بيانات اعتماد وهمية، وحظر شبكة خارجي وطلبات backend؛ لا جهاز Android |

التشغيل الأول لبعض ملفات Bun تحت Vitest فشل في تحميل `bun:test` (صفر اختبارات لتلك الملفات)، وهو خطأ اختيار مشغل، لا عيب تطبيق. أُعيد Investigation وReflections بمشغلهما الصحيح؛ عولجت نتيجة Identity بوصفها غير مكتملة، لا pass. لم أستبدل assertions أو أعطل اختبارات لتبدو ناجحة.

### إخفاقات سابقة مفصولة عن انحدارات V18-01A

- **Startup:** `tests/startup/reconciliation.test.ts:35` يتوقع `offline` من `TypeError("Failed to fetch")`، لكن `withTimeout.ts:27` يستبعد هذه العبارة صراحة ويعيد `failed`. أعدت التشغيل باستخدام مصدر أساس V18 وكانت النتيجة 9 ناجحة وواحدة فاشلة نفسها. المصدر والاختبار غير معدلين بهذه المهمة. يحتاج مواءمة العقد والاختبار، وليس إخفاء الفشل.
- **Scheduler:** يفشل تعطيل master والفئة، todaysPicksDone، allEligibleExhausted، no published games، وحفظ lastMeta. نسخة أساس V18 تعطي 33/39 نفسها. توجد مشكلة harness/runtime في ربط alias mocks وسطح التخزين؛ الاختبار يعمل في Node دون window بينما مكونات ذات صلة تعتمد browser storage. لا أعد هذه الإخفاقات دليل انحدار جديد، ولا أدعي أن سبب الحالات الست حُسم باختبار جهاز.
- **Identity runner:** تكرر timeout للحالة `writes every personal key` أيضًا عند تشغيل نسخة الاختبار والمصدر من snapshot الأساس. helper uninstall لا يعيد Storage.prototype؛ توجد آثار جانبية/تشخيصات async حول طبقة العزل تستدعي التحقيق في harness. assertions المطبوعة قبل timeout لا تكفي لإعلان نجاح suite.
- **React Hydration:** أُعيد إنتاجه، ولم يُتجاهل. `CinematicOpening` يحسم `initialConfig` أثناء أول render بواسطة `typeof window` ([السطر 174](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/components/cinematic/CinematicOpening.tsx#L174))، ويعيد null على الخادم ([السطر 372](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/components/cinematic/CinematicOpening.tsx#L372)) ويضيف portal للعميل ([السطر 476](https://github.com/mnourdam/noor-al-maadi-app/blob/2c4ae3ea442a772f9a6fa2d0a6fd45828a8eeb4a/src/components/cinematic/CinematicOpening.tsx#L476)). سجل Chromium يحدد الاختلاف بين div الافتتاحية وsection الخاصة بالإشعارات، ثم يعيد React إنشاء الشجرة. هذه الملفات مطابقة للأساس؛ لم أشغل متصفح الأساس كاملًا. **P2 سابق خارج إصلاح Outbox، مع بقاء تحقق Startup غير نظيف.** أقل إصلاح منفصل مقترح: جعل أول render متطابقًا، وتأجيل قرار الافتتاحية إلى ما بعد mount، ثم اختبار first-launch وreturning-user دون إخفاء hydration warning.

## تقدير المخاطر

- **فقد التقدم أو إخفاؤه: مرتفع** بسبب P1-02 وP1-03؛ ليس مجرد تحسين تجربة عرض.
- **خسارة/تكرار المكافأة المحلية: مرتفع** بسبب P1-05/P1-06، ومنح pending غير المقبول لاحقًا في P1-04.
- **تلوث الحسابات: خطر مثبت لتخزين fallback، وخطر من تحليل مسار Daily Quest**؛ لا أدعي مشاهدة تعديل backend فعلي.
- **مكافآت الخادم:** عقود idempotency القائمة لم تتغير، لكن لا يوجد اختبار Production أو برهان هنا على كل انتقال جلسة. لا يمكن تحويل ضمان الخادم إلى ضمان atomicity للملف الشخصي المحلي.
- **تجميد الواجهة:** اختبارات D تثبت retry والفشل السريع للقصص/التحقيقات/الحملات/tutorial في الحالات المغطاة؛ لا تثبت كل تعليق IDB/flush أو كل دورة حياة WebView. مهلة 8 ثوانٍ لكل await ليست مهلة شاملة، وترك الكتابة تعمل بعدها له أثر P1-02.

## Android / Capacitor — مراجعة نظرية وقائمة قبول يدوي

لم أشغّل Android preparation أو Gradle أو release أو cap sync، ولم أجر اختبار جهاز فعلي. `capacitor.config.ts` يستخدم أصلًا محليًا بمخطط HTTPS، ما يدعم secure-context APIs في WebView الحديثة، لكن توافر Web Locks يعتمد نسخة WebView والسياسات. IndexedDB transaction completion لا يلغي خطر قتل العملية، وlocalStorage متزامن وقد يرمي quota/security exceptions. لا يوجد في التغيير الجديد hook يحول كل حد فصل/منحة إلى معاملة واحدة عند background/force-stop.

**بعد إصلاح الموانع واجتياز بوابة الكود، يلزم على أجهزة اختبار ببيانات وهمية فقط:**

1. ترقية تثبيت يحمل بيانات V17 بلا revision، ومصفوفة أرشيف قديمة، دون clear data؛ مقارنة كل معرف وpayload وعدد العمليات قبل/بعد.
2. نسختا WebView مدعومتان على الأقل، والتحقق فعليًا من `navigator.locks` وIndexedDB وأصل Capacitor؛ إعادة الفحوص عند غياب Locks.
3. Offline ثم إعادة الاتصال لكل من قصة وفصل وتحقيق وتحدٍّ وTutorial وStreak؛ pending واضح، ثم confirmed أو rejected مطابق للعملية.
4. quota وفشل IDB كل على حدة ومعًا، مع تقدم قديم موجود؛ لا نجاح وهمي ولا حذف ولا مكافأة غير مستحقة.
5. background ثم استئناف، وforce-stop عند: قبل commit، بعد IDB commit وقبل تنظيف fallback، بعد الأرشفة وقبل remove، وأثناء انتظار RPC.
6. force-stop بين حفظ تقدم الفصل وclaim والمنحة وكتابة profile، وإعادة التشغيل؛ تدقيق XP والدنانير والقلوب وسجل الاستحقاق دون خسارة أو تكرار.
7. RPC وهمي يتأخر أكثر من 8 ثوانٍ، ثم retry ببيانات أحدث؛ التحقق من بقاء revision الأحدث على الجهاز وبعد المزامنة.
8. النقر المتكرر، Back وإغلاق الواجهة أثناء الحفظ، إعادة فتحها؛ لا modal محبوس ولا late reward بعد الإغلاق.
9. تبديل أليس/بوب والضيف أثناء انتظار القفل/فتح المخزن/RPC/Daily Quest، ثم cold restart لكل حساب؛ فحص كل مساحة فعلية.
10. نفس id قديم لحسابين مع عمليات غير متعارضة؛ معالجة البقية دون إسقاط المتصادمة.
11. رفض دائم ومؤقت، أرشيف فارغ/ممتلئ/فاشل الكتابة، clear لحساب واحد؛ لا زيادة flushed للرفض ولا فقد أرشيف الآخر.
12. سياقان مستقلان على بيئة اختبار تسمح بذلك، مع storage/locks مشتركة؛ تعارض enqueue والأرشفة والنسخ والتنظيف.
13. إعادة تشغيل تحدٍّ سبق أن حصل على مكافأته مع تعذر قراءة السيرفر، وتحدٍّ حُفظ ولم تُصرف مكافأته بعد؛ يجب تمييز الحالتين.
14. أول تشغيل وتشغيل عائد مع Startup وTutorial والافتتاحية؛ لا hydration/remount غير متوقع ولا منح جانبية مكررة.

## الأدلة وتسليم المراجعة

الأدلة محفوظة بجوار التقرير في `evidence/`: نتائج الاختبارات والبناء، baseline comparisons، سجل Chromium، وملف probes مستقل لا يغير المشروع. الـ8 probes تستخدم fake-indexeddb وlocalStorage مع خادم/auth وهميين، وتتضمن partition الحقيقي. تعطل القراءة الشبكية للمتصفح مقصود: حُولت إعداداته إلى عنوان loopback وهمي، وحُظرت الطلبات خارج خادم التطوير. لا Supabase أو Production أو SQL أو بيانات لاعبين.

**لا تنفيذ لأي MINIMUM FIX في هذه الجولة.** يلزم اعتماد إصلاح الموانع المحددة ثم إعادة بوابة E، ويظل قبول Android معلقًا حتى اختبارات الجهاز. لا نشر ولا دمج، ولا إعلان جاهزية Outbox للإطلاق.
