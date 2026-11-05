# V18-01A — P1-04B: Investigation Pending, Confirmation & Local Reward Safety

## AUDIT → RISK → MINIMUM FIX

مرجع البداية: v18-01a-outbox-recovery عند 276f817b1af226d35eab5ac435eb060b52393ba5. الملفات المتتبعة نظيفة؛ ملفات P1-06B الخمسة المحلية خارج Git. البيئة running/connected. استُخدمت cloud-environment-runtime لفحص السياق؛ لا وصول إلى خدمة تطبيق أو Production.

قُرئت phase-e وتقرير P1-04A والواجهة وبطاقة الإغلاق وrecorder وgameplay-write وOutbox/dead-letter والهوية والاختبارات الحالية. روجع ProfileProvider/hearts وتعريف complete_investigation_v2 المحفوظ بالمستودع قراءة فقط؛ لم ينفذ SQL أو RPC حقيقي.

### السبب الجذري

grantRewards كان يقبل saveAccepted(outcome)، وهي تقبل queued دون acknowledged. بعدها تُنفذ علامة إكمال محلية، إزالة continue pointer، شارة وقلوب وStreak ثم setFinished وبطاقة «القضية أُغلقت». صوت الإكمال كان يسبق حتى نتيجة الحفظ. recorder كان يسقط storageState=unresolved ويثبت الهوية متأخرًا عن اشتقاق SHA-256.

وجد مسار مستقل داخل الشاشة نفسها: useCanonicalInvestigationProgress يجمع نتائج الخادم وpending Outbox وبيانات legacy. استعمال matches منه لتهيئة finished قد يغلق القضية عند إعادة فتح pending، ويمحو continue pointer. لذلك لا يكفي تعديل شرط grantRewards وحده.

الخطر: تقدم/مكافأة محلية ونهائية لا يثبتها الخادم، أو نتيجة قديمة تتسرب لحساب/تحقيق جديد. لا تعني queued أن العملية مقبولة سلطويًا، ولا يعني اختفاء receipt أن الإكمال تأكد.

### الحد الأدنى المعتمد والمنفذ

التعديل محصور بواجهة تحقيقات Supabase المنشورة، بطاقة إغلاقها، وrecorder. لا تعديل اقتصاد عام أو Outbox/settlement أو Handoff. أمكن عزل الإصلاح دون blocker معماري؛ الضمان محدد بالواجهة الفورية وإعادة المحاولة، ولا يثبت ذرية تسليم ProfileProvider.

## IMPLEMENT — عقد الحالات

| الحالة          | الدليل والسلوك                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| confirmed       | acknowledged=true أو تقدم خادم completed للمالك الحالي لتهيئة العرض. يسمح ببطاقة الإغلاق والآثار المسموحة أدناه |
| pending         | acknowledged=false وqueued=true وreason فارغة أو queued. رسالة حفظ محاولة محلية وانتظار الخادم فقط              |
| unresolved      | storageState=unresolved أو reason=storage_pending. رسالة مستقلة لا تدعي ثبوت receipt ولا فقد المحاولة           |
| failed/rejected | بقية النتائج/الاستثناءات. رسالة خطأ وإعادة تحقق، دون إكمال أو مكافأة                                            |

شاشة pending: «حُفظت محاولة إنهاء التحقيق على جهازك، وهي بانتظار تأكيد الخادم. لم تُعتمد المكافآت بعد.»
شاشة unresolved: «نتيجة حفظ التحقيق غير محسومة. سنحتفظ بالمحاولة القائمة ونتحقق من حالتها دون احتساب إنجاز جديد.» هذا يحافظ على إجابات الواجهة؛ ليس وعدًا بأن تخزينًا غير محسوم قد نجح.

pending/unresolved/failed لا تستدعي markInvestigationCompletedLocal أو clearInvestigationOpened بوصفه إكمالًا أو awardBadge أو recoverHeartFromActivity أو recordStreakActivity أو applyServerStats. لا setFinished ولا CaseClosedCard ولا ختم «تم الإغلاق» ولا SFX إكمال ولا XP/دنانير/قلوب. تبقى المشاهد والقرائن والإجابات ظاهرة؛ لا تُقدّم منحة صفر على أنها مكافأة معتمدة.

البطاقة نفسها أصبحت تقبل granted/already فقط، وأزيل نص queued الذي كان يعد بإضافة المكافأة لاحقًا داخل بطاقة نجاح مؤكدة. العرض المؤكد ومقاديره من استجابة الخادم، دون fallback إلى authoring.

تهيئة الإغلاق/إزالة continue pointer في اللاعب المنشور تعتمد useInvestigationProgress وcompletedIds وuid المطابق للمالك الفعلي، لا union الكتالوج. لا تغيير للـcanonical hook المشترك أو سياسة legacy.

## الشارات والقلوب وalready_granted

التعريف المحفوظ للخادم يمنح XP/دنانير/قلوب سلطويًا داخل معاملة الإكمال الأولى، ويعيد applied=false وalready_completed=true مع snapshot تاريخية عند replay. لا يوجد canonical server badge store في هذا التعريف. ProfileProvider.recoverHeartFromActivity محلي، يحترم HEART_MAX=5 وcooldown=30 دقيقة؛ ليس إيصال تسليم دائمًا.

- الإقرار يسمح بعلامة إكمال وإزالة continue pointer.
- المنحة المحلية للشارة/محاولة استعادة القلوب تتطلب applied=true، مع عدم وجود already_granted/ already_completed.
- recorder يحفظ توافق applied/reward_granted الحالي، لكنه يمنع تفسير replay الصريح كمنحة جديدة حتى في استجابة متناقضة applied=true مع already_granted=true.
- عدد محاولات استعادة القلب من heartsEarned التي أعادها الخادم، لا reward.hearts المؤلفة. صفر الخادم لا يعود إلى authoring؛ لا محاولات قلوب أو شارة في replay.
- أبقيت recoverHeartFromActivity وcooldown والحدود ومعرّفات slug:index كما هي. لا تعديل ProfileProvider أو HEART_MAX أو أسعار/أرقام اقتصاد.
- لا addPoints/addDinars محلية جديدة؛ XP والدنانير سلطويان كما سابقًا. Streak يبقى بعد الإقرار، ثم get_my_profile للمصالحة، مع fencing النتيجة قبل applyServerStats.

حدود 150 XP / 50 دينار / 5 قلوب في RPC لم تتغير. عرض snapshot من الخادم ليس إثبات حفظ الملف محليًا، وعدد heartsEarned ليس بالضرورة فرق الرصيد الفعلي تحت cap. الاختبارات تعزل ProfileProvider كما يقتضي نطاقها، ولا تثبت كل انتظار داخلي فيه؛ حارس اللاعب بعد Streak لا يلغي عملًا بدأ داخل المزود، الذي يحتفظ بحارسه القائم قبل تطبيق النتيجة. لا exactly-once محلية بعد crash أو بين كل مصادر تحديث الملف. لا تعويض عن replay بأرقام authoring.

## الهوية والتزامن والمعرّف المستقر

recorder يثبت owner وepoch قبل أول await، ويتحقق بعد saveUserId، وبعد SHA-256، وبعد إعادة فحص session uid وقبل saveGameplay. يجب تطابق uid مع getActiveUserId. بعد الحفظ والإقرار وإعادة قراءة الهوية يُفحص epoch/owner أيضًا قبل حدث تقدم مؤكد؛ ABA لا تعيد صلاحية العملية القديمة. storageState تُنقل كما هي دون تحويل queued إلى acknowledged.

خوارزمية stableDeltaId وفallback ونص المدخل irth.inv.complete.v1:userId:investigationId بقيت حرفيًا دون تغيير. vector المثبت alice/inv1:
048e0b54-3d12-4e52-84bf-b2f7e8d4fbe5.
لا UUID جديد ولا delta بديل عند retry أو تجاوز الرفض. payload وRPC وتوقيعهما دون تغيير.

واجهة Supabase لها instance مستقلة لكل owner/epoch/row.id بواسطة useSyncExternalStore. تثبت scope وتفحص mounted/owner/epoch بعد await وقبل آثار الإكمال وSFX والنتيجة، وبعد Streak وقبل get_my_profile، وبعده قبل applyServerStats. تبديل التحقيق أو الحساب/unmount يبطل واجهتها. completedRef يمنع تكرار اكتمالها، وsavingRef مستقل لكل instance؛ finally القديمة لا تحرر حارس Bob.

لا ادعاء بإلغاء RPC بدأ بالفعل أو إبطال منحته السلطوية. recorder يمثل عملية الحفظ لمالكها، وليس إلغاء نقل شبكي عند إغلاق الشاشة؛ حارس الواجهة يمنع الآثار المحلية القديمة، وتبدّل الهوية يمنع طلبًا جديدًا بالهوية القديمة. لا تؤخذ استجابة مهملة دليلًا على عدم حدوث منحة في الخادم.

retry يعيد recordInvestigationCompletion بنفس الهوية والتحقيق والنتيجة/الإجابات. لا يصفر picked/answerState عند محاولة الإنهاء؛ التصفير بقي للانتقال إلى خطوة تالية فقط. نفس memo لshuffle والتحقق من authored answer ونفس resolvedIndices. لا إجابات تُمحى ولا خيارات يعاد ترتيبها بسبب pending/retry.

## TEST — اختبارات القبول

ملف جديد tests/offline/outbox-investigation-pending.test.tsx: **30 اختبارًا** على Route/SupabaseInvestigationGame وStepCard وCaseClosedCard وrecordInvestigationCompletion وsaveGameplay الحقيقية. حدود Outbox/RPC/Profile وخدمات الصفحة الثانوية وهمية؛ fetch حقيقي ممنوع. التشفير يستخدم SHA-256 صحيحة بجدولة Promise مضبوطة، وتستبدل digest بـdeferred صريح في اختبارات السباق. لا اعتماد على تكرار سريع بدل الجدولة.

| المجموعة         | الأدلة المختبرة                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| confirmed        | بطاقة وختم صحيحان، أرقام الخادم بدل authoring، الشارة، القلب بالعدد السلطوي، profile stats                              |
| pending          | لا إغلاق أو ختم أو نجاح نهائي أو علامة/clear pointer أو شارة/قلوب/Streak/stats/XP/دنانير أو SFX إكمال                   |
| إعادة الفتح      | مساهمة canonical pending وحدها لا تهيئ شاشة مؤكدة                                                                       |
| unresolved       | مهلة التخزين في الواجهة، ونقل storageState من recorder؛ لا ادعاء queued، ولا نجاح بعد تأخر write                        |
| فشل/رفض          | quota + RPC failure، رفض دائم حتى مع receipt retained، رفض بعد queued يزيل pending                                      |
| retry            | stable delta/payload نفسه، queued→confirmed، missing receipt ليست إقرارًا                                               |
| replay           | applied=false، already_completed، already_granted، flags متناقضة؛ دون إعادة قلوب/شارة/أرقام منحة                        |
| الهوية           | Alice→Bob وABA، unmount، تغيير التحقيق، RPC مؤجل، SHA مؤجل قبل enqueue، session مختلفة أثناء hash، mismatch عند البداية |
| follow-up        | profile stats مؤجلة لا تعبر الحساب، Streak مؤجلة لا تبدأ get_my_profile قديمة                                           |
| single-flight    | double tap وfinally Alice أثناء انتظار Bob؛ grant واحد للعملية المقبولة                                                 |
| الإجابات         | السؤال الحقيقي مع shuffle الحقيقي؛ بقاء الإجابة المقفلة وترتيب الخيارات وscore/correctCount بعد retry                   |
| الاقتصاد/التوافق | صفر قلوب الخادم لا يعود إلى authoring؛ outcome cooldown محترمة؛ fixture V17 ثابتة بلا entitlement/delivered             |

الاختبار القديم في outbox-gameplay-ui أضيف له mock useInvestigationProgress بدل افتراض أن canonical union إقرار، وصارت استجابة fixture المؤكدة تصرح hearts_earned=1 كي تختبر نفس assertion استعادة قلب واحد من قيم الخادم. لم تتغير assertions التحقيق القديمة أو إعدادات اختبارات عامة.

أول تشغيل للاختبارات الجديدة كشف اعتماد harness على توقيت WebCrypto native، فأصبحت الاختبارات الأساسية تستخدم SHA حقيقية لكن Promise مجدولة؛ نقاط التأخر تختبر منفصلة بـdeferred. لا تعديل Assertions لإخفاء flake قديمة أو تخفيف ضمان. المجموعة الموجّهة قبل الحالات الخمس الإضافية نجحت 35/35 (25 جديدة + 10 واجهة سابقة). البوابة النهائية تشمل الحالات الثلاثين. اختبار التحقيق المتقطع السابق يبقى خطر توقيت تاريخيًا؛ لا ادعاء باستحالته من نجاح هذه الجولة، والسباق المستهدف الآن له جدولة مضبوطة.

### نتائج البوابة النهائية

| الفحص                                                                             | النتيجة                                                                          |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| npm run test:outbox                                                               | PASS: 803/803 في 27 ملفًا = 772 سابقة + 30 جديدة + diagnostic P1-06B محلية واحدة |
| npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts | PASS: 802/802 في 26 ملفًا؛ العدد الرسمي                                          |
| npm run typecheck:outbox                                                          | PASS: فحص التطبيق وOutbox، exit 0                                                |
| npm run build                                                                     | PASS: exit 0؛ تحذيرات bundler/deprecation غير مانعة؛ بناء محلي فقط               |
| git diff --check                                                                  | PASS                                                                             |
| بصمات الحماية وLegacy/shuffle/stableDeltaId                                       | PASS                                                                             |

تعثر Bun Identity الأصلي يبقى غير محسوم، ولم يُحتسب نجاحًا أو يُستبدل بنسخة معزولة. لا اختبار Android أو Production هنا.

## Legacy والمخاطر المتبقية

LegacyInvestigationGame له عقد محلي مختلف: completeInvestigation وXP حتى 150 والدنانير حتى 50، وشارة/مقتنيات/شخصيات محلية وStreak مؤجلة. لا يمر بعقد الإقرار الجديد؛ تحويله يحتاج مراجعة مستقلة. لم تُغير مكافآته أو ترحيلاته. تطابق نص دالته حتى نهاية الملف مع HEAD السابق مثبت ببصمة:
9c33ab983516069b2baac19a92bfc18687519f78aacec4c35a29b833ab344ac9.

كتلة shuffle في اللاعب المنشور بقيت مطابقة حرفيًا أيضًا. لم تُغير أرقام الاقتصاد أو ترتيب الأدلة أو شروط التقدم أو Auth Observer أو Handoff.

P1-04 لا يزال مفتوحًا للحملات، وللتسوية اللاحقة/إشارات الواجهات المشتركة؛ canonical catalog hook ما زال يضم pending وlegacy للمستهلكين الآخرين، ولم يُحوَّل عالميًا إلى سجل confirmed. إبطال الواجهة القديمة لا يمحو محاولة صحيحة أو يمنع منح الخادم التي بدأت قبل التبديل.

P1-05 باقٍ: crash بين إقرار الخادم وحفظ ProfileProvider قد يفقد الأثر المحلي/العرض؛ replay لا يمنح تعويضًا تلقائيًا. لا entitlement/delivered أو تسليم ذري أو replay reward بعد restart. follow-up قد يفشل/يتأخر، وتحديث React أو نجاح RPC ليس دليل تسليم دائم؛ لم يُغير Writer Fence أو settlement أو Cloud Save.

## الملفات وحماية Git وCLOSE

ملفات الإنتاج:

1. src/routes/investigation.$id.tsx — اللاعب المنشور فقط؛ Legacy مطابق.
2. src/lib/investigations/progress.ts — recorder فقط؛ الخوارزمية والقراءة المشتركة/الترحيل دون تغيير.
3. src/components/investigations/CaseClosedCard.tsx — confirmed-only grant contract.

ملفات الاختبار: outbox-investigation-pending.test.tsx الجديدة، وتكييف fixture/mock في outbox-gameplay-ui.test.tsx. والتقرير الحالي.

ملفات P1-06B الخمسة بقيت خارج Git ومطابقة لبصمات F-01/P1-04A. تقارير P1-04A/E/F-01 محفوظة. لا reset/clean/stash أو git add عام؛ الحفظ بالمسارات الستة المحددة فقط.

لا SQL/RPC migrations أو Cloud Save أو Production أو Android/Web release أو merge. لا إغلاق P1-04/P1-05/P1-06. Guest Handoff الحقيقي NO-GO وV18 HOLD. بعد اجتياز البوابة: Commit واحد وPush لفرع العمل، ثم توقف.
