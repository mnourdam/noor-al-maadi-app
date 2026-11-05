# V18-01A — P1-06D-01

## Guest Handoff Provenance & Durable Intent Foundation

التاريخ: 2026-11-05. الفرع: `v18-01a-outbox-recovery`.
المرجع الابتدائي المتحقق: `bc812b3a01147d974ad139cebaff8870755559b5`.
العقد: [P1-06C](./v18-01a-p1-06c-guest-handoff-contract.md)، دون تعديل التقرير المرجعي.

**نواة مستقلة غير مفعّلة. P1-06 OPEN؛ P1-04/P1-05 OPEN؛ V18 HOLD.**

## AUDIT → RISK

قورنت حالة Git والفرع وHEAD مع المرجع قبل التنفيذ. لم توجد تغييرات متتبعة؛ وُجدت ملفات P1-06B الخمسة وتقرير P1-06C المحلي. طابقت بصمات الملفات الخمسة الجولة السابقة قبل التنفيذ. تمت قراءة تقارير P1-06A/B/C، وآلية guest storage/buffer والهوية، ومشغل الاختبارات الرسمي.

الخطر الأساسي هو تحويل «المستخدم الحالي» إلى دليل ملكية للضيف السابق، أو تحرير binding بعد crash/cancel، أو إعلان موافقة/حفظ من تحديث ذاكرة قبل commit. يوجد أيضًا خطر محو سجل صحيح نتيجة خطأ قراءة أو جزئية معاملة.

الحد المعتمد لهذه الدفعة يسمح بواجهة تخزين/مصدر/مصادقة **محقونة للاختبار**. لذلك لا ننشئ adapter إنتاجيًا ولا نلتقط بيانات لاعب. إثبات المصدر هنا إثبات اتساق سياق وعنوان وبيانات اصطناعية تحت عقد adapter موثوق، **وليس إثبات ملكية بشرية، أو تنفيذًا لبروتوكول anchor الإنتاجي، أو تحققًا حقيقيًا عبر Supabase**.

## MINIMUM FIX → IMPLEMENT

أضيفت ثلاث وحدات بلا imports من التطبيق وبلا مؤثرات عند import:

- `src/lib/campaigns/guest-handoff/contract.ts`: الحالات، سجل المصدر/النية/الموافقة والمحاولات، أخطاء صريحة، عقود adapters.
- `src/lib/campaigns/guest-handoff/codec.ts`: تحقق صارم من snapshot وسجلات journal وروابطها؛ لا تصفية فساد إلى قائمة فارغة.
- `src/lib/campaigns/guest-handoff/journal.ts`: فتح صريح لقاعدة اختبار معزولة، capture/bind/recover/decide بمعاملات IDB وحواجز الهوية وCAS.

لا يستورد أي ملف إنتاجي خارج هذه الحزمة النواة. يوجد اختبار يفحص ذلك. لا hooks في AccountProvider/reset/boot، ولا تغيير في Schema v2 أو مخازن settlement/Writer Fence أو ProfileProvider.

### 1. ما أصبح دائمًا

فقط عندما يستدعي الاختبار النواة بقاعدة محقونة:

| Store      | البيانات                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sources`  | sourceId، عنوان المصدر الطبيعي، sourceGuestOwner، deviceId، physicalKey، buffer-v1/generation=1، handoffId، boundUid خاص **بالـjournal**              |
| `handoffs` | handoffId، sourceId/sourceAddress، transitionId، bytes snapshot الأصلية وبصمتها، provenance، سياق الالتقاط، target، consent، phase، revision، history |

سجل history مضمّن في صف handoff؛ تعديل السجل والحالة يتم في المعاملة نفسها، وليس بمفتاح مستقل. تحفظ المحاولات المقبولة التي التزمت؛ الاستدعاءات المرفوضة أو المعاملات المجهضة لا تضيف تاريخًا ولا تتظاهر بأنها حُفظت. لا يمحو استدعاء جديد مصدرًا/نية سابقين، ولا ينشئ UUID جديدًا لتجاوز وجهة أو snapshot متعارضين.

المفتاح الطبيعي للمصدر هو JSON tuple:

`[deviceId, sourceGuestOwner, physicalKey, "buffer-v1", 1]`.

يوجد unique index لهذا العنوان في sources، وunique index موازٍ على sourceAddress في handoffs. الثاني يمنع إعادة إصدار مصدر إذا فُقد صف source وبقيت نيته؛ الحالة تصبح corrupt بدل remint. فقد قاعدة كاملة لا يمكن إثباته دون anchor مستقل؛ **هذه ليست نسخة إنتاجية مفعّلة**.

الفتح المساعد يرفض أسماء خارج `irth-guest-handoff-synthetic:`. يلزم IDBFactory واسم صريحان؛ لا يفتح قاعدة تلقائيًا أو يستخدم indexedDB/global storage افتراضيًا. createHandoffFoundation تقبل اتصالًا موثوقًا محقونًا؛ ليست واجهة أمان ضد كود origin خبيث.

### 2. كيف ثبت مصدر الضيف ضمن هذه الدفعة

`GuestCapturePort` لا يتيح enumeration. يقدم عنوان مصدر واحد وpersistedDeviceId وwithSnapshot للقراءة تحت قفل المصدر الذي يتكفل به adapter. تتطلب capture:

1. سياقًا جاهزًا وowner مطابقًا حرفيًا لـguest:deviceId.
2. مطابقة deviceId المثبت في adapter؛ لا إنشاء جهاز بالذاكرة كبديل.
3. مطابقة schema/generation والعنوان الصريح.
4. رفض legacy_unknown قبل قراءة snapshot.
5. تحقق كامل من ملف buffer-v1 غير مربوط. ملف له boundUid سابق لا يُتبنى تلقائيًا؛ يُرفض دون تغييره، حتى إن احتاجت معالجته لاحقًا سياسة تحقق إضافية.
6. حساب hash خارج IDB transaction ثم إعادة فحص owner/epoch/contextId.
7. حفظ المصدر والنية والصورة معًا وانتظار transaction.oncomplete.

الاختبارات تحقن SHA-256 باستخدام Node crypto، وIDs فريدة ووقتًا اصطناعيًا. لا توجد خوارزمية hash ضعيفة أو مولد IDs احتياطي في النواة؛ مستقبلًا يجب أن يوفر adapter SHA-256 ومعرفات مستقرة فريدة، ولا يجوز تمرير UID/physicalKey/provenance من مدخل UI غير موثوق. physicalKey هنا **لم يُستخرج من ملفات لاعب**؛ adapter الإنتاجي الذي يثبت علاقته بـIdentity Partition مؤجل.

`captured_active_guest` وصف لالتقاط البروتوكول من السياق النشط، وليس شهادة تاريخية. `legacy_captured_now` يحتفظ بقدم البيانات: يمكن أرشفة ملف V17 صالح الآن من سياق Guest موثوق دون اختلاق تاريخ ملكية. هذا لا يجعله مؤهلًا للنقل أو يحل نقص دليل النشاط/نسخة المحتوى.

البصمة على bytes snapshot؛ الرابط إلى المصدر ثابت في sourceId/sourceAddress والنية. تُرفض bytes متغيرة حتى لو قدم adapter hash متصادمًا. لا تُدمج الإضافات الجديدة في موافقة قديمة. canonical per-entry progress fingerprints وخطة الإرسال مؤجلان، فليس لدينا entries قابلة للإرسال في هذه المرحلة.

### 3. الوجهة والموافقة والحالات

`awaiting_target → awaiting_consent → approved | declined | cancelled | blocked`.

يمكن إلغاء approved إلى cancelled مع الاحتفاظ بقرار الموافقة السابق والتاريخ؛ الإلغاء لا يدعي التراجع عن شيء حدث على خادم. الحالات النهائية لا تُفتح أو يعاد ربطها تلقائيًا؛ recover يعرض السجل المسموح فقط. لا موافقة تلقائية ولا استئناف إرسال تلقائي.

- bind يستدعي verifyTarget المحقون مع UID وtransitionId الأصلي؛ يعيد فحص السياق بعد الانتظار. يجب أن يثبت adapter مستقبلًا المستخدم الفعلي والجلسة والانتقال، لا مجرد إعادة ما أرسله المستدعي.
- target verification ينتج **awaiting_consent مع consent=null**؛ وجود target لا يعني approved أو confirmed_transfer.
- source.boundUid وhandoff.target يحفظان معًا في معاملة واحدة. لا تغيير للوجهة بعد أول binding، حتى بعد decline/cancel/block أو logout أو restart.
- يطابق CAS expectedRevision مع الصف الحالي. يرفض revision قديمًا بدل الكتابة فوق محاولة أحدث.
- decide يلزم fresh verification لنفس UID وsnapshotHash نفسه وpolicyVersion=1 وقرار صريح. لا تقبل موافقة على snapshot آخر.
- كل نية تحمل `mode: foundation_only`، ولا توجد حالة confirmed_transfer أو entitlement أو delivered.

approved إذن محلي محفوظ **غير قابل للتنفيذ في هذه الدفعة**؛ لا يعبر localStorage ولا يحرك Outbox. واجهة consent الفعلية لم تُنشأ. cancel/block هنا تسجلان قرارًا لسجل مربوط تحت مالكه المصادق؛ إلغاء رحلة قبل binding أو التفاعل مع واجهة الضيف جزء coordinator اللاحق، وليس ادعاء ميزة UI حاضرة.

### 4. التزامن وحواجز الهوية

لا يوجد await داخل معاملة IDB حية. الحساب والتحقق الخارجيان قبلها؛ كل request callback يعيد فحص owner/epoch/contextId/readiness قبل قراءة متابعة أو كتابة. subscribeInvalidation يجب أن يصدر تزامنيًا عند تغيير الهوية أو إغلاق السياق؛ النواة تحاول abort للمعاملة ثم تمنع النتيجة القديمة عند oncomplete أيضًا.

تستخدم المعاملات readwrite على sources/handoffs معًا؛ IndexedDB ينسق النطاق نفسه بين اتصالين. يقارن CAS revision ويعدل binding والحالة/history ذريًا. عند سباق A/B تنجح وجهة واحدة؛ لا يكفي مولد IDs جديد لتجاوز unique claim. نطاق الضمان اتصالات متعاونة في قاعدة journal نفسها؛ لا cross-device exclusion أو ضمان ضد كود قديم يغير التخزين خارج البروتوكول.

عند recover لمستخدم، يلزم تحقق حديث. النية غير المربوطة تحتاج إثبات transition الأصلي؛ login الحالي وحده لا يكفي. المرتبطة تحتاج UID نفسه. runtime epoch المخزن لا يصبح صلاحية restart؛ يستخدم السياق الجديد قيمه الجديدة. Bob لا يحصل على snapshot Alice عبر API، حتى لو عرف handoffId. لا تعني هذه الحدود RLS أو حماية من سكربت خبيث داخل origin.

### 5. حدود crash/restart التي ثبتت

| الحد                                               | النتيجة المختبرة                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| قبل capture commit / توقف أثناء hash أو انتظار قفل | لا claim/intent موثوقين؛ النتيجة القديمة مرفوضة                       |
| quota بعد طلب إدخال source وقبل اكتمال handoff     | abort يعيد المتجرين إلى الحالة السابقة                                |
| capture commit ثم فقد إقرار النتيجة                | recover باتصال جديد يجد النية نفسها؛ retry لا يغير IDs                |
| بعد capture وقبل login                             | awaiting_target محفوظة دون وجهة أو موافقة                             |
| بعد login وقبل bind                                | لا ربط من current user؛ يلزم transition موثق                          |
| bind commit ثم فقد إقراره                          | نفس boundUid وawaiting_consent بعد restart؛ لا موافقة مصنوعة          |
| approval commit ثم فقد إقراره                      | approval محفوظة لنفس snapshot، لكنها foundation_only؛ لا نقل أو grant |
| تبديل Alice→Bob→Alice أثناء verify                 | epoch القديم مرفوض رغم رجوع UID نفسه                                  |
| فساد صف/صورة/تاريخ/ربط أو فشل قراءة                | خطأ صريح، لا empty fallback ولا overwrite                             |
| فقد source row وبقاء handoff                       | corrupt؛ لا إعادة إنشاء مصدر/وجهة بديلة                               |

فشل النتيجة بعد commit لا يثبت أن المعاملة لم تلتزم. يُعاد recover تحت هوية جديدة صالحة، ولا يُستنتج حذف/نجاح من receipt مفقود. لا receipt أصلًا في هذه النواة.

هذه اختبارات IDB API عبر **fake-indexeddb 6.2.4** داخل Vitest/jsdom، مع اتصالين حقيقيين إلى نفس قاعدة المحاكاة. restart هو إغلاق اتصال وإعادة فتحه مع سياق جديد، وcrash محاكاة لنقاط abort/commit/فقد callback مضبوطة. ليست اختبارات انقطاع طاقة أو native Chromium/Android أو استمرارية عملية متصفح فعلية. قبول Android/WebView ما زال معلقًا.

### 6. V17 وعدم المساس ببياناته

- صالح في مصدر Guest الحالي: يمكن أرشفته synthetic كـlegacy_captured_now، وليس trusted historical أو مكافأة مستحقة.
- بحاجة لتحقق إضافي/سبق ربطه: لا إرسال أو تغيير binding؛ ملف boundUid قائم يُرفض في capture الجديد.
- unpartitioned أو user-owned أو مصدر غير معروف: legacy_unknown/source conflict؛ لا بحث تلقائي أو إعادة نسبة للحساب الحالي.
- تالف: رفض كامل مع الاحتفاظ بالأصل؛ لا إسقاط أعضاء تالفة أو إعادة تهيئة.

snapshot يحتفظ بالـbytes الاصطناعية، بما فيها أرقام V17 لأغراض الأرشفة فقط. لا تتحول xpEarned/coinsEarned/score إلى payload أو رصيد أو entitlement. whitelist مستقبلية للإرسال يجب أن تستبعد الاقتصاد؛ لا توجد send API هنا أصلًا.

## TEST

أضيف `tests/offline/outbox-guest-handoff-contract.test.ts`: **62 حالة قبول**.

التغطية تشمل مصدرًا واحدًا، جهازًا/ضيفًا مختلفًا دون قراءة بياناته، رفض المصدر تحت user، جهازًا غير مثبت، V17 صالحًا/مجهولًا/تالفًا/مربوطًا، signup/login مع فصل الموافقة، decline/cancel/block، ثبات الوجهة، snapshot/transition conflicts، restart، فقد إقرار capture/bind/approve بعد commit، quota على حدود المعاملة، قراءة فاشلة/اتصال مغلق، corruption، CAS، محاولات متزامنة من اتصالين، callback قديم/epoch roundtrip/disposal، وغياب أي caller إنتاجي.

المصدر وauth والخادم اصطناعيون. fetch محظور، وglobal localStorage/sessionStorage يرميان عند الوصول. تفحص الاختبارات أن الحزمة لا تستورد التطبيق ولا تملك مسارات RPC أو grants أو delete/clear، وأنها غير مستوردة من بقية src. لا يُستدل من mocks صامتة على اختبار نقل حقيقي لم يُبنَ.

### نطاق مصفوفة P1-06C ذات 38 حالة

| الحالة | نتيجة هذه الدفعة / المؤجل                                                       |
| ------ | ------------------------------------------------------------------------------- |
| T01    | مثبت للسجل المعزول والالتقاط عبر port اصطناعي؛ anchor الحقيقي مؤجل              |
| T02    | مثبت لرفض عنوان/ضيف آخر وعدم القراءة؛ لا enumeration API                        |
| T03    | مثبت أثناء capture/bind/approve؛ send مؤجل                                      |
| T04    | مثبت لكلا التدفقين الاصطناعيين؛ لا UI مصادقة حقيقية                             |
| T05    | مثبت decline/snapshot mismatch؛ الموافقة البشرية UI مؤجلة                       |
| T06    | مثبت بربط A/B من اتصالين                                                        |
| T07    | ثبات source/handoff/history مثبت؛ entry/Outbox IDs مؤجلة                        |
| T08    | مثبت قبل capture commit                                                         |
| T09    | مثبت بعد commit وقبل تبديل المالك                                               |
| T10    | مثبت بعد تبديل المالك وقبل target/consent                                       |
| T11    | journal bind دائم قبل أي mirror؛ mirror نفسه غير منفذ                           |
| T12    | مؤجل: لا كتابة LS mirror                                                        |
| T13    | مؤجل: لا enqueue ولا transport attempts                                         |
| T14    | مؤجل: لا RPC أو authoritative read                                              |
| T15    | مؤجل لنتيجة الخادم؛ فشل journal لا يصبح empty                                   |
| T16    | فقد إقرار journal/approval مثبت؛ server confirmation/UI مؤجلان                  |
| T17    | مؤجل: لا cleanup authorization                                                  |
| T18    | مؤجل: لا حذف أصل                                                                |
| T19    | IDB quota/corruption/read/closed مثبتة؛ LS/anchor/blocked native مؤجل           |
| T20    | port بلا قفل يفشل دون intent؛ اختبار Web Locks الأصلي مؤجل                      |
| T21    | اتصالان وsnapshot mismatch مثبتان؛ native tabs/guest writer integration مؤجلة   |
| T22    | مؤجل: لا دمج تقدم حساب أو server skip                                           |
| T23    | مؤجل: لا تقييم أهلية إرسال أو prerequisites                                     |
| T24    | snapshot مغاير مرفوض؛ content/server revalidation مؤجل                          |
| T25    | مؤجل: لا نتائج نقل جزئي                                                         |
| T26    | رفض source مجهول/bound مثبت؛ boot migration لم يتغير                            |
| T27    | cancel محلي لا يحرر binding؛ enqueue/flush مؤجلان                               |
| T28    | مؤجل: لا OutboxKind أو receipts                                                 |
| T29    | مؤجل: لا bundle transport جديد أو rollback نشط                                  |
| T30    | غياب RPC/grant/حذف/نقل مثبت للنواة؛ probe indirect listeners عند التفعيل مؤجل   |
| T31    | التصنيفات الاصطناعية مثبتة، دون تعديل V17                                       |
| T32    | logout لا يحرر claim؛ guest writer/إضافات حقيقية مؤجلة                          |
| T33    | محاكاة restart مثبتة؛ native Chromium profile restart لهذه النواة مؤجل          |
| T34    | Android/WebView معلق؛ لم يشغّل Emulator                                         |
| T35    | orphan source/handoff مرفوض؛ anchor/eviction كامل مؤجل                          |
| T36    | Bob لا يستعيد سجل Alice؛ UID/transition جديد لا يستولي على مصدر غير مربوط       |
| T37    | مؤجل: لا تعديل أو ربط AccountProvider/ProfileProvider                           |
| T38    | بوابة الانحدار والتشخيص المحلي مفصولان كما أدناه؛ fixtures الستة وBun لم يُصلحا |

### نتائج التحقق

اكتملت الأوامر التالية بنجاح قبل Commit؛ لا يُحتسب تشخيص P1-06B ضمن المرجع الرسمي.

| الأمر                                                                               | النتيجة                                                                |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| اختبار ملف النواة منفردًا                                                           | PASS: 62/62                                                            |
| `npm run test:outbox`                                                               | PASS: 597/597، 21 ملفًا = 534 سابقة + 62 جديدة + تشخيص P1-06B واحد     |
| `npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts` | PASS: 596/596، 20 ملفًا؛ هذه هي بوابة الانحدار الرسمية المستقلة        |
| `npm run typecheck:outbox`                                                          | PASS، مشروع التطبيق ومشروع Outbox، exit 0                              |
| `npm run build`                                                                     | PASS، exit 0، بناء محلي دون نشر؛ تحذيرات bundler/deprecation غير مانعة |
| `git diff --check` وstaged diff                                                     | PASS؛ الملفات الجديدة خضعت أيضًا لـPrettier                            |

لم تتغير assertions أو إعدادات البوابة لتجاوز فشل. تشخيص P1-06B الواحد نُفذ بسبب glob الحالي لكنه مستبعد من بوابة 596 ومن Commit. لا يُحتسب اختبار Bun المتعثر ولا fixtures الستة ضمن نجاح هذه المجموعة.

الـ6 fixtures القديمة في `tests/campaigns/progress-persistence-v16.test.ts` لم تُعدّل أو تدخل هذه الدفعة. قراراتها الستة باقية كما في P1-06C. تعثر **Bun Identity من الجذر** السابق timeout/124 يبقى غير محسوم؛ لم يُعد تشغيله أو إصلاح harness له هنا، ولا يُعامل كنجاح أو يستبدل بنسخة معزولة.

## ما لم ينفذ وما يلزم قبل send/cleanup

لا recordChapterProgress/RPC أو Outbox أو entry transport IDs، لا إكمال فصل خلفي، لا مسح/نسخ buffer، لا تغيير boundUid الحقيقي، لا XP/دنانير/قلوب أو entitlement/delivered، لا handoff عند login، لا UI نجاح، لا ProfileProvider/Cloud Save/SQL أو مكافآت فعلية. لم تُجرَ اتصالات Production أو اختبارات بيانات حقيقية. build محلي فقط وليس نشرًا.

قبل تفعيل C2 وما بعده يلزم:

1. adapter مصدر إنتاجي ضيق يثبت physicalKey/deviceId الفعليين تحت Web Lock نفسه، والتقاط قبل auth/reset، وanchor دائم يميز journal المفقود دون ذرية LS/IDB وهمية. لا fallback غير ذري.
2. auth adapter يثبت المستخدم الفعلي والجلسة والانتقال، وحواجز lifecycle/epoch على جميع الانتظارات؛ واجهة consent صريحة لمصدر/snapshot/حساب محددين.
3. إثبات سياسة shared device واستمرار guest بعد binding؛ لا نسل جديد للتحايل على الوجهة ولا نقل V17 المجهول تلقائيًا.
4. إثبات عقد الخادم والتقدم الصارم وغياب كل أثر اقتصادي، وقارئ authoritative لا يعتمد الاستنتاجات العابرة في hydrator.
5. OutboxKind مستقل وentry fingerprints/idempotency وunknown/rejected/confirmation recovery، واختبار mixed-version؛ RPC ناجح أو receipt مختف ليس دليل تسليم مكافأة.
6. منع مسار تبني رصيد الضيف المستقل من إعطاء ضمان جديد؛ تكامل AccountProvider/ProfileProvider اختبار لاحق دون توسيع Cloud Save هنا.
7. قبول Chromium native/Android ثم retain_source أولًا. cleanup قرار منفصل بعد durable confirmation/archive ومطابقة snapshot وخطة تعافٍ؛ لا حذف قاعدة/clear storage.

## الملفات السابقة وبصماتها

الملفات الخمسة التالية بقيت bytes مطابقة قبل التنفيذ وبعده، ولا تدخل Commit هذه الدفعة:

| الملف                                                   | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/audits/v18-01a-p1-06b-guest-compatibility.md`     | `316a069672eaca880b17e80253e7cdcf9b4fcd41a7ee009579964dc91efdb370` |
| `tests/offline/browser/build-guest-compatibility.mjs`   | `283907793707d08583fcdc2bfa58db20e23d11606acbefb0d995b7264b62993f` |
| `tests/offline/browser/guest-compatibility-fixture.tsx` | `96c3d160f19112780c03a6fa39c7b186c6faadead4b7012127c175c72ce1a012` |
| `tests/offline/browser/guest-compatibility-native.py`   | `ec0134f9c631a608097782c284548c663e4799da99149d8b360e744c0a694f9a` |
| `tests/offline/outbox-guest-compatibility.test.ts`      | `d8379ddca78c6ac33f497138c72858e15fb234657072d80c01819ef6cc488852` |

تقرير P1-06C محفوظ دون تغيير: `62a94106c28636983415690e46663cd6775776003231c798af4c5fde77282193`؛ مسموح إدراجه كعقد مرجعي ضمن Commit الحالي.

## CLOSE وحدود الحفظ

الملفات المسموح إدراجها صراحة: الوحدات الثلاث، اختبار النواة الجديد، هذا التقرير، وتقرير P1-06C غير المعدّل. لا git add عام ولا إدراج تشخيصات P1-06B. لا تعديل ملفات tracked سابقة أو تاريخ منشور. Commit واحد وPush لفرع العمل فقط مشروطان بنجاح جميع الفحوص؛ نتيجة الحفظ النهائية تُسلَّم مع hash بعد التنفيذ.

**التوقف عند هذه النواة فقط. لا تفعيل handoff، ولا إغلاق P1-06/P1-04/P1-05، وV18 يبقى HOLD.**
