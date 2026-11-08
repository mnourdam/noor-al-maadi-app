# V18-01A — P1-04C-01: Campaign Progress vs Reward Entitlement

## AUDIT — المرجع ومصادر الحقيقة

الفرع v18-01a-outbox-recovery عند 6cd0244ad4cf9de77e2e4d73662ca7e367d07a3a مطابق. الملفات المتتبعة نظيفة، وملفات P1-06B الخمسة المحلية موجودة دون تغيير. البيئة running/connected. لا بيانات لاعبين أو اتصال خدمة تطبيق/Production؛ جميع التجارب على تخزين وخادم وهميين.

قُرئت phase-e وتقارير P1-04A/B وFoundation وStage 3A/3B-1/3B-2B/2C/2D/2E، ورُوجعت مسارات اللاعب وimportedCampaignProgress وcampaignLedger وcampaignRewardsGranted وprogressSync وrecord/gameplay-write وflush/completions وCampaignCompleteModal وProfileProvider وحزمة rewards. قرئت migration المحفوظة لتعريف record_campaign_progress_v2 فقط؛ لم ينفذ SQL أو RPC حقيقي.

| المصدر                                            | ما يُحفظ فعلًا                                                                              | ما لا يثبته                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| importedCampaignProgress / irth_campaign_progress | completedActivityIds، chapter/campaign completed sticky، مجاميع authored، unlock IDs        | لا owner/epoch/revision أو confirmation/delivery داخل السجل؛ الفصل بين التعلم والتسجيل السلطوي غير موجود   |
| Outbox chapter_progress                           | snapshot فصل: campaign/chapter/status/score/xp/coins/completed، stable chapter ID، revision | لا activity IDs أو wrongAttempts/full-half-min أو skip/terms/grant identity لكل نشاط                       |
| record_campaign_progress_v2                       | تقدم الفصل وسجل اكتمال الحملة وفق شروط الخادم                                               | xp_earned في صف التقدم ليس منحة profile؛ لا إثبات تسليم المكافأة المحلية                                   |
| campaignLedger / irth_campaign_ledger_v1          | claim key + at + synced، pending chapter/collection، active position                        | claim تُكتب قبل المنحة؛ synced ليس دليل إدراج المنحة في رصيد دائم                                          |
| ProfileProvider / hakaya.profile.v2               | React updates ثم useEffect منفصل يكتب profile                                               | تحديث React/addPoints ليس commit ذريًا مع claim أو summary أو entitlement                                  |
| campaignRewardsGranted / irth_campaign_grants_v2  | مجاميع بعد calls المنح، per-chapter، unlocks                                                | لا applied operation keys أو إثبات profile inclusion؛ writeAll تبتلع فشل الكتابة وتعيد الدالة مجاميع ذاكرة |
| campaigns/completions                             | sticky local facts تقبل queued؛ union محلي/خادم                                             | local completed لا يثبت server confirmation أو delivery                                                    |
| Settlement Foundation                             | pending/confirmed/rejected/legacy_unknown، binding، terms identifier، evidence              | لا API لتطبيق مكافأة أو delivered؛ غير مربوط باللاعب                                                       |
| transaction.ts / schema v2                        | اقتصاد/appliedGrants/migrationState عبر primitive غير مفعلة، readEntitlement                | لا عملية كتابة entitlement ضمن عقد منحة إنتاجي؛ لا authority cutover لـProfileProvider                     |
| Stage 3B-2D/2E                                    | نماذج اختبارية للاستمرارية/receipts، مستقلة عن تخزين الإنتاج                                | ليست Active Delivery Protocol ولا دليل استبعاد جميع الكتّاب أو نقل V17                                     |

بحث imports أكد أن خدمات rewards المذكورة غير مستخدمة من مسار اللعب الإنتاجي الحالي. وجود جدول economy أو حالة delivered محجوزة لا يفعّل بروتوكول تسليم.

## جميع مواضع المطالبة والمنح

مسار onResolve في campaigns.imported.$id.chapter.$chapter.tsx:

1. الجواب الخطأ: loseHeartOnce بمفتاح المحاولة، wrongFlash، resume pointer؛ لا claim أو progress completion.
2. الصحيح: rewardScale من wrongAttempts/viaReveal → recordActivity(...,persist=false) → upsertChapterProgress.
3. saveAccepted تقبل queued؛ وللضيف يُقبل buffered_no_session فقط بعد نجاح buffer.
4. recordActivity(...,persist=true) تسجل التعلم والـcompleted محليًا. انتهاء الحملة يطلق recorder منفصلًا غير منتظر لـsticky completion.
5. claimActivityReward تكتب claim أولًا؛ ثم full أو floor(half)، أو min=floor(10%) بحد أدنى 1 XP عند أصل موجب و0 coins. بعدها addPoints ثم addDinars ثم recordCampaignGrant. skipped لا تطالب بمكافأة النشاط.
6. newlyChapter: SFX وStreak وclearPlan، ثم claimChapterReward، addPoints/addDinars، enqueueCollectionSync، ثم recordCampaignGrant.
7. newlyCampaign: SFX ثم claimCampaignReward، addPoints/addDinars، enqueueCollectionSync، recordCampaignGrant، unlock SFX، clearActivePosition؛ modal مؤجلة 350ms.
8. مسار Memory Review مستقل: grantReviewXp عند صحة review، وبنود البنك/الجدولة؛ لم يُغير.
9. العرض chapter panel/summary/modal يعتمد local progress وgrant totals/fallback التاريخي، وليس سجل تسليم ذريًا.

حدود chapter الحالية 40 XP/30 coins، وcampaign 200 XP/150 coins؛ لم تتغير. لا تعديل منحنى المستوى أو activity defaults/full-half-min أو القلوب أو skip أو المتحف. لا تُنقل حدود تحقيقات 150/50 إلى اقتصاد الحملات.

bootstrapLedgerFlush يستدعي backfillLedgerFromLegacyProgress قبل claims. هذا مهم: تقدم مكتمل محليًا بلا منحة يمكن أن يتحول بعد الاستعادة إلى claims synced=true تمنع منحة لاحقة. ومن ثم تأخير claims وحده لا يحمي الاستحقاق.

## RISK → REPRO — ما ثبت وما لم يثبت

أضيف ملف تشخيص محلي فقط: tests/offline/outbox-campaign-boundary.test.tsx، **32 اختبارًا**. يستعمل اللاعب الحقيقي وrecordActivity وclaims وgrant totals وrecordChapterProgress وgameplay-write وOutbox/flush/dead-letter الحقيقيين، مع Profile/RPC وخدمات عرض ثانوية وهمية وfake-indexeddb. خدمات diag-trace وrecordCampaignCompletion الخلفية معزولة بـmocks؛ sticky writer مستقل ليس جزءًا من إثبات التسليم هنا، وقد دُقق مصدره فقط. الاستثناءات المضبوطة تحاكي القطع بين استدعاءات الإنتاج، وvi.resetModules/unmount تبقي التخزين لتمثيل إعادة تحميل JavaScript، وليست Android process-kill.

لا delivered وهمية في fixtures. نقاط profile تستخدم mock call أو رصيدًا اصطناعيًا معروفًا لإظهار اختلاف الحقائق؛ لا تدعي اختبار حفظ ProfileProvider الحقيقي أو exactly-once له. modal leaf وهمية لرصد توقيت عرضها؛ نصها الإنتاجي روجع من المصدر. لا زيادة heap أو تغيير config/assertions قديمة.

| المطلوب                        | الاختبار/الدليل                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1 online confirmed             | progress RPC ثم claims وآثار profile منفصلة؛ ليس معاملة منحة                                                               |
| 2 offline queued               | اللاعب يمنح 5 XP/2 coins ويضع completed دون RPC؛ Outbox يحتفظ chapter snapshot دون rewardScale/activity ID                 |
| 3 unresolved                   | open IDB مؤجلة تتجاوز 8000ms؛ لا claim/XP. يُحرر انتظار التخزين المتأخر صراحة في harness                                   |
| 4 quota                        | IDB unavailable + فشل fallback + RPC failure؛ لا تقدم أو منحة                                                              |
| 5 read failure                 | claim تفشل مغلقة عند فشل قراءة ledger؛ لا يُعامل الفشل كأول منحة                                                           |
| 6 queued→rejected              | flush الحقيقي يرى invalid_campaign_id ويؤرشف/يزيل الصف، لكن local completed/claim/XP call تبقى                             |
| 7 queued→confirmed             | إعادة نفس recorder online، نفس operationId، لا entitlement في Foundation ولا delivery callback                             |
| 8 progress→crash→claim         | قطع عند claimActivityReward؛ progress completed موجود وclaim غائبة، دون منحة                                               |
| 9 claim→crash→addPoints        | addPoints ترمي؛ claim تبقى بعد module restart، وclaim جديدة تعيد granted=false                                             |
| 10 addPoints→crash→totals      | قطع قبل recordCampaignGrant؛ call المنحة وclaim موجودتان، canonical totals غائبة                                           |
| 11 chapter→crash→collection    | claim الفصل تُحفظ ثم قطع؛ لا pending collection، ولا بروتوكول استكمال                                                      |
| 12 campaign→crash→modal        | progress completed ثم قطع عند claimCampaignReward؛ لا modal أو claim نهائية                                                |
| 13–14 identity                 | Alice→Bob وABA أثناء completion RPC مؤجلة؛ لا XP/dinars من النتيجة القديمة                                                 |
| 15 replay                      | claim ثانية تعيد false حتى إن لم تحدث منحة أولى؛ dedup لا يثبت delivery                                                    |
| 16 retry                       | نفس chapter_progress:u1:c1:ch1                                                                                             |
| 17 strict progression          | إكمال الفصل محليًا أثناء offline يفتح الفصل التالي وفق القواعد المحلية الحالية قبل إقرار الخادم                            |
| 18 optional skip               | تقدم النشاط موجود وclaim النشاط غائبة                                                                                      |
| 19 wrong/heart                 | loseHeartOnce مستدعاة ولا claim أو XP                                                                                      |
| 20 full/half/min               | أربعة اختبارات مسار: full=5/2، half=2/1، min بعد خطأين=1/0، reveal=1/0؛ أرقام fixture فقط                                  |
| 21 Guest                       | buffer حقيقي مع partition/Web Locks؛ نجاح buffered_no_session وفشل quota دون RPC أو نقل                                    |
| 22 V17 claim بلا profile proof | synced claim تمنع grant ولا تُغير bytes؛ ليست delivered مثبتة                                                              |
| 23 profile grant بلا claim     | ledger وحدها تجيز claim؛ رصيد fixture يبدأ 5 ثم يصير 10 بعد grant حقيقية عبر route/mock profile                            |
| 24 lost reply/reconnect        | mock server commit مع ضياع live reply ثم flush حقيقي يزيل الصف؛ لا per-activity entitlement أو delivery evidence           |
| 25 عدم التكرار                 | claim dedup مثبت، لكن لا guarantee مشترك مع profile؛ نافذتا الفقد/إعادة المنح مثبتتان                                      |
| إضافية                         | failed summary write تعيد 5 بالذاكرة ثم تقرأ 0؛ snapshot أحدث يستبدل السابق دون tiers؛ backfill يستهلك progress-only claim |

نقل تقدم محلي إلى فصل تالٍ لا يُحوّل السابق إلى confirmed. اختبار الرفض يثبت بقاء الفصل الأول؛ أثر بقاء الأنشطة اللاحقة يستند إلى sticky local algorithm وعدم وجود rollback/سجل dependency-confirmation، لا إلى تجربة لعب كاملة متعددة الفصول على Android. لم يُثبت هجر كل منحة بعد restart أو duplication لجميع حسابات اللاعبين؛ أُثبتت نوافذ محددة، وهذا يكفي لمنع الإنتاج.

## قرار الأسئلة A–H

**A — المتابعة أوفلاين:** الخوارزمية المحلية تستطيع المتابعة دون استدعاء claim، لكن هذا ليس تعديلًا آمنًا منفردًا: completed يفعّل review mode ويفتح فصولًا، وbackfill قد يستهلك claim، ولا يوجد استئناف استحقاق لاحق. لا تعطيل offline ولا تغيير strict progression في هذه الجولة.

**B — أين تبقى النية؟** لا يوجد حاليًا سجل إنتاجي يكفي. Outbox تجمع الفصل ولا تحفظ نشاطًا/تخطيًا/scale/terms ثابتة، وclaims لا تحفظ مقدار المنحة المسلّمة. Foundation قادرة على حفظ binding وterms identifier عند استدعائها صراحة، لكنها غير مربوطة، وكتابة منفصلة لها بعد progress تترك نافذة crash. يلزم durable intent قابل لإعادة توليد إرسال Outbox منه، قبل الاعتماد على نجاح enqueue، وبعقد reward terms غير قابل للتبديل.

**C — التأكيد اللاحق:** لا مستهلك إنتاجي يحول confirmation إلى reward delivery durable. تحتاج evidence مرتبطة operation/revision/snapshot واستئناف بعد cold boot، لا window event أو flush counter. نجاح progress RPC ليس استحقاق XP سلطويًا للحملة ولا profile inclusion.

**D — التكرار بعد restart:** claim مبكرة تمنع إعادة منحة لم تصل؛ claim متأخرة تسمح بتكرار منحة وصلت؛ تغيير الترتيب لا يحلها. يلزم commit واحد للمصدر الدائم المحلي ومفتاح appliedGrant وانتقال entitlement إلى delivered، مع قراءة النتيجة بعد ضياع commit reply. localStorage profile + IDB delivered لا يحقق ذلك.

**E — Foundation:** يُعاد استخدام vocabulary/owner guards/CAS/schema primitives، لا تُفترض فعاليتها. transaction الحالية تقرأ entitlement ولا تسمح بتحديث تسليمه؛ نماذج D/E مستقلة. يلزم عقد تكامل إنتاجي وتوسعة محددة، وليس استيراد helper اختباري.

**F — تأخر إقرار الفصل:** strict الحالية محلية الترتيب وتتحقق من completed المحلي السابق، لا confirmation. يجب تثبيت dependency learning chain منفصلة عن server confirmation/reward eligibility، وإرسال/إعادة محاولة شروط الخادم بالترتيب المقبول. فرض online gate الآن تراجع غير معتمد؛ تغيير القاعدة ليس ضمن هذه الجولة.

**G — رفض بعد تعلم لاحق:** يحتفظ بسجل المحاولات والإجابات/dependencies وأدلة الرفض؛ لا يمسح تقدم التعلم أو يسحب رصيدًا بالتخمين. استحقاقات تابعة تبقى محجوبة/غير محسومة وفق عقد معتمد؛ لا تُعلن account-completed. سياسة إصلاح السلسلة وإعادة التحقق تحتاج اعتمادًا، ولا توجد حاليًا.

**H — السجلات السابقة:** snapshots/bytes محفوظة، وتصنيف legacy_unknown عند غياب دليل inclusion. claim أو profile totals أو synced أو اكتمال نشاط أو غياب claim لا تحول التاريخ تلقائيًا إلى delivered/due. لا تعويض جماعي ولا backfill اقتصادي جديد.

**B/C/D لا تمتلك جوابًا إنتاجيًا آمنًا ومختبرًا الآن؛ لذلك لا MINIMUM FIX منفصلًا مسموحًا للإنتاج.**

## الحد الأدنى المشترك المطلوب من P1-05 قبل التفعيل

هذه خطة اعتماد مستقبلية، وليست Schema جديدة منفذة أو تصريحًا بتشغيل Foundation:

1. **Authority admission وwriter coverage:** حصر كل كاتب لـProfileProvider/merge/hydration/Cloud Save intake/heart cooldowns والمقتنيات/مجاميع الحملات، مع owner/epoch وrevision. لا إعلان quiescent اعتمادًا على سياق واحد. السجلات القديمة الغامضة تمنع تفعيل delivery تلقائيًا؛ لا baseline مصنوعة.
2. **Intent دائم قبل الإرسال:** لكل activity/chapter/campaign، owner وepoch/session fence وstable entitlement key وoperationId/revision/snapshot وauthored version وcapped/scaled amounts/skip وdependency references. terms hash وحده لا يعيد الأرقام إذا تغير المحتوى. intent يتولى إعادة توليد Outbox بعد crash، دون الادعاء بمعاملة مشتركة بين قاعدتين.
3. **Confirmation journal:** trusted progress evidence تُحفظ، والرفض مؤرشف مع المحاولة؛ لا inferred confirmation من غياب receipt. نشاطان تحت snapshot فصل واحد يحتاجان ربطًا واضحًا وعدم اعتبار تأكيد قديم إقرارًا لمراجعة أحدث.
4. **Atomic local delivery:** قاعدة واحدة ومصدر دائم محدد للاقتصاد المحلي + applied-key + entitlement delivered داخل IDB transaction واحدة. لا callback React أو كتابة profile legacy أخرى كدليل commit. فشل/abort لا يُحدث projection؛ lost reply يُحل بقراءة inclusion بنفس المفتاح.
5. **ProfileProvider projection/admission:** نعم، يحتاج تغييرًا وظيفيًا؛ hydrate/persistence/update/replace/merge/reset وكل تعديل XP/دينار/قلوب يجب أن يحترم السلطة الحديثة ويرفض snapshot أقدم. لا يحفظ useEffect القديم فوق الحالة الأحدث. تبقى الصورة القديمة محفوظة للتوافق ولا تصبح الكاتب السلطوي بعد cutover.
6. **Cold restart/reconciliation:** discover intents/confirmed-not-delivered، تحقق owner/epoch/schema، retry بلا regrant، واعرض الحالة بعد commit. collection sync منفصلة تحتاج intent دائمًا يمكن استئنافه؛ لا تُستخدم pending collection كدليل unlock تسلّم.
7. **نطاق الضمان:** exactly-once في المصدر المحلي المُعتمد فقط عند ثبوت writer exclusion. التزامن عبر أجهزة/خادم profile delta/Cloud Save ليس exactly-once عالميًا بمجرد IDB محلي؛ يحتاج عقدًا منفصلًا. مكافآت الخادم السلطوية لا تُضاف محليًا مرة ثانية. Guest يبقى P1-06 مستقلًا، ولا Handoff.

### أول Commit مشترك مقترح للمراجعة

عنوان مقترح: Campaign local reward intent + fenced atomic delivery admission.

المسارات المطلوب اعتمادها قبل كتابتها:

- src/lib/rewards/transaction.ts وsettlement.ts: capability ضيقة لتحديث entitlement مع economy/appliedGrants في المعاملة نفسها، لا markDelivered عامة.
- src/lib/rewards/writer-fence.ts مع adapter إنتاجي جديد للـprofile والـboot: اكتشاف/إقصاء الكتاب وauthority token، لا استعارة adapter الاختبارات.
- src/lib/profile.tsx: حماية جميع الكتابات وhydrate/persist/replace/merge، وprojection بعد commit فقط.
- src/lib/campaigns/reward-delivery.ts (مقترح، غير موجود الآن): coordinator مستورد فعليًا من اللاعب، intent/evidence/restart flow مع terms/dependencies.
- src/routes/campaigns.imported.$id.chapter.$chapter.tsx وimportedCampaignProgress.ts: learning progress منفصلة، عدم claims/grants قبل durable coordinator، الاحتفاظ بالإجابات، UI محلية مقابل account confirmation.
- src/lib/campaignLedger.ts وcampaignRewardsGranted.ts: عزل backfill/V17 ambiguity، no direct legacy claim-as-delivery؛ totals مشتقة من applied evidence للبيانات الجديدة فقط.
- src/lib/offline/record.ts وprogressSync.ts وcampaigns/completions.ts: binding/confirmation receipts صريحة، لا تبديل SQL/RPC أو payload خادم دون اعتماد إضافي.
- CampaignCompleteModal.tsx: account-confirmed/delivered مقابل local learning summary؛ لا modal نجاح كاذبة.
- tests/offline الخاصة بالعقد، وbrowser native IDB/React crash scheduler حقيقي، وتقرير التكامل.

هذا Commit لا يجوز تفعيله على owner قديم حتى يثبت admission/migration protocol. إن كانت تغطية جميع الكتاب لا تلائم Commit مراجَعًا واحدًا، تُقسم إلى commits admission وatomic delivery وroute hookup، وتظل capability غير مفعلة حتى اكتمالها؛ لا نصف ربط يصرف أو يوقف المكافأة. لا نقل profile كاملًا تلقائيًا ولا تفعيل Writer Fence الآن.

معايير القبول: intent قبل crash؛ استئناف الإرسال دون ID جديد؛ تأكيد snapshot الصحيح؛ crash قبل/بعد كل commit؛ نفس reward key واحدة عبر tab/restart؛ profile+applied+delivered كلها أو لا شيء؛ obsolete effect/merge لا يعيد snapshot قديمة؛ quota/corruption fail closed مع بقاء المصدر؛ V17 ambiguous بلا due/delivered؛ optional skip والقلوب وfull/half/min والحدود كما هي؛ dependent offline learning محفوظ بلا success سلطوي أو entitlement غير ثابتة. تستخدم IDB أصلية بمتصفح وReact وخادمًا وهميًا؛ الاختبارات الحالية ليست بديلًا.

### التراجع الآمن

هذه الجولة: إزالة الملفين الجديدين لاحقًا بمراجعة فقط؛ لا تخزين إنتاجي تغيّر أصلًا. التكامل المستقبلي: تعطيل قبول أوامر جديدة عبر admission، الاحتفاظ بالـintents/applied/economy ونسخ V17/الرفض، وإتاحة قراءة ومصالحة الإصدار الحالي. لا DB deletion/clear storage أو الرجوع إلى effect قديمة غير مسوّرة؛ rollback لا يعيد منح processed keys ولا يزيل أدلة التسليم.

## TEST — نتائج التحقق وحماية Git

| الفحص                                                                             | النتيجة النهائية                                                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| المجموعة المحددة الجديدة                                                          | PASS: 32/32؛ assertions تثبت فجوات الإنتاج، لا تعني إصلاحها                          |
| npm run test:outbox                                                               | PASS: 835/835 في 28 ملفًا = 802 سابقة + 32 جديدة + اختبار P1-06B المحلي              |
| npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts | PASS: 834/834 في 27 ملفًا؛ العدد الرسمي دون تشخيص B                                  |
| npm run typecheck:outbox                                                          | PASS: التطبيق وOutbox، exit 0 بعد تصحيح نوع spies                                    |
| npm run build                                                                     | PASS: exit 0، تحذيرات bundler/deprecation غير مانعة، بناء محلي فقط                   |
| git diff --check                                                                  | PASS؛ فُحص أيضًا الملفان الجديدان غير المتتبعين بـno-index --check                   |
| حماية Git/البصمات                                                                 | PASS: src بلا diff، staging فارغ، كل التقارير السابقة وملفات B الخمسة مطابقة للبداية |
| HEAD النهائي                                                                      | 6cd0244ad4cf9de77e2e4d73662ca7e367d07a3a؛ دون Commit أو Push                         |

التشغيل الأول المحدد كان 27 حالة: فشلان في mock owner بلا prefix، صُحح mock ليطابق user/guest. ثم حالة Guest احتاجت partition الحقيقية؛ أضيف install/teardown في الاختبارات فقط. لا تعديل API الإنتاج لتسهيل الاختبار.

التشغيل الكامل الأول تعطل بـJavaScript heap OOM (27 ملفات ناجحة، 820/835 حالات مكتملة، ليست PASS). تشغيل verbose لاحق أعاد OOM؛ اختبارات scaling وحدها نجحت 4/4 وليست بديل البوابة. محاولة إغلاق raw IDB open المؤجل بعد timeout وتصريف import recorder قبل resetModules لم تمنع OOM وحدها. بعد عزل diag-trace وsticky completion الخلفية عن crash cuts نجحت المجموعة المحددة 32/32؛ لم يُعزل أي الاعتمادين هو سبب OOM منفردًا، ولا استنتاج عن عيب ذاكرة في الإنتاج من هذا harness. كما صُحح this:Storage في spies بعد خطأي TS2683. لا تغيير assertions قديمة أو config أو heap limit. تُسجل نتيجة الإعادة النهائية أعلاه دون إخفاء هذا التعثر.

Bun Identity الأصلي غير محسوم ولم يُحسب نجاحًا. لا Android force-stop/WebView أو native IDB قبول جديد في هذه الجولة؛ fake-indexeddb يثبت نوافذ انقطاع محددة، لا تحمل الهاتف أو atomic delivery الإنتاجية.

لا ملف إنتاج متغير. لا تعديل تقارير سابقة أو Handoff/Auth Observer. بصمات ملفات B الخمسة مطابقة للمراجع المحفوظة في F-01/P1-04A/B؛ تقارير التدقيق السابقة مطابقة للبداية. لا staging أو Commit أو Push. الملفان المحليان المقترحان فقط: التقرير الحالي وoutbox-campaign-boundary.test.tsx؛ لا يدخلان أول Commit قبل اعتماد الخطة.

## CLOSE — القرار

**NO-GO — يلزم دمج P1-04C مع جزء محدد من P1-05: durable intent + confirmation journal + atomic local delivery + ProfileProvider writer admission/restart reconciliation قبل أي تعديل للإنتاج.**

لا pending UI تجميلية فوق رصيد صُرف، ولا تعطيل للـoffline أو نقل عشوائي للمنحة. P1-04/P1-05/P1-06 تبقى OPEN، Guest Handoff NO-GO، وV18 HOLD. التوقف مع التقرير والاختبارات محليًا دون Commit أو Push.
