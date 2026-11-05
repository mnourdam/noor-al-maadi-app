# V18-01A — P1-06D-02

## Real Guest Source Capture Adapter — Inactive Integration

التاريخ: 2026-11-05. الفرع `v18-01a-outbox-recovery`.
HEAD الابتدائي: `242987501187ffcb47b2cbc9cd9cb83f19bbe567`، مطابق للمرجع.

**P1-06 OPEN؛ P1-04/P1-05 OPEN؛ V18 HOLD.** محوّل فعلي غير مفعّل، واختبارات ببيانات اصطناعية فقط. لا التقاط تلقائي، ولا إرسال/تنظيف/مكافآت.

المراجع المقروءة: [عقد P1-06C](./v18-01a-p1-06c-guest-handoff-contract.md)، [تقرير D-01](./v18-01a-p1-06d-01-handoff-foundation.md)، contract/codec/journal، guest-progress-buffer، guest/storage، وIdentity Partition/owner.

## AUDIT → RISK → MINIMUM FIX

Git tracked كان نظيفًا عند البدء؛ بقيت خمسة ملفات P1-06B المحلية غير متتبعة. طوبقت SHA-256 لكل ملف مع جدول D-01 قبل التنفيذ وبعده. لم تستخدم reset/clean/stash أو git add عامًا.

- `getDeviceId()` قد ينشئ معرفًا ويخزنه best effort؛ لذا لا يستدعيه المحوّل، ولا guestOwnerKey.
- `installIdentityPartition()` قد يشغّل migrateLegacyKeys؛ لذا لا يُستعمل كخطوة قراءة أو readiness داخل المحوّل.
- Partition المثبتة تحفظ `Storage.prototype.__originalGetItem`، وphysicalKey يشتق العنوان من logical key والمالك.
- الكاتب الحالي `bufferChapterProgress` يستخدم localScope وwithStorageLock، باسم write نفسه للمفتاح المادي. callback الخاص بالقفل يمكنه إرجاع Promise، وتبقى Web Lock محتجزة إلى أن تستقر.
- buffer-v1 لا يسجل أصلًا بشريًا أو نسخة بروتوكول handoff. قراءة ملف في Guest الحالي لا تثبت أن كل بايت فيه أنشأه هذا الشخص تاريخيًا.

الحل الأصغر: إضافة `createGuestSourceCapturePort()` مستقلة، بلا معاملات owner/key واردة من المستدعي، وبلا تشغيل عند import. تعتمد على أدوات العزل القائمة ولا تغيرها. لا يتطلب ذلك تغيير ترتيب الإقلاع؛ إذا لم تكن Partition مثبتة فالنتيجة partition_unavailable بدل تثبيتها تلقائيًا.

## IMPLEMENT

### 1. deviceId والمالك والمفتاح المادي

1. احصل على localStorage، ثم تحقق أن Partition موجودة بالفعل عبر originalGetItem المحفوظ وأن getItem الحالي ليس الأصل غير المغلف.
2. اقرأ `irth.device.id.v1` **بالدالة الأصلية** دون mapping أو migration، قبل أي helper قد يحل هوية إقلاع. المعرف المفقود/الفارغ يرفض source_conflict، وخطأ القراءة يرفض read_failed؛ لا setItem ولا إنشاء هوية.
3. استدع localScope للمفتاح المنطقي الوحيد `irth.campaign_progress_buffer.v1`. هذا يستعمل physicalKey الحالية، لا بناء عنوان خارجي أو بحثًا في المفاتيح.
4. يجب أن يساوي المالك `guest:<persistedDeviceId>`. المستخدم النشط يرفض not_guest، واختلاف جهاز/مالك يرفض source_conflict.
5. احفظ owner/epoch والعنوان داخل closure، وجمّد DTO العنوان. لا يستطيع المستدعي تبديل physicalKey لإعادة توجيه القراءة.

لا enumeration أو قراءة namespace حساب آخر أو fallback على مفتاح global. إذا أصبح المالك user فلا يمكن إنشاء port صالح أو استخدام port التُقط قبل تبديل epoch. تغيير deviceId المحفوظ يبطل port أيضًا.

### 2. قراءة غير مهاجرة وصريحة

withSnapshot تقرأ المفتاح **المادي الملتقط فقط** باستخدام originalGetItem.call(store, physicalKey)، دون المرور بالقراءة المنطقية أو diagnostics الخاصة بمفاتيح الملف الشخصي. لا استدعاء installation/migration، ولا console/analytics للـsnapshot.

- missing: not_found، لا BufferFile فارغ موثوق.
- JSON أو members غير صالحين، أو boundUid سابق: corrupt؛ تبقى bytes كما هي ولا ينفذ callback.
- SecurityError: read_failed، دون نجاح أو تغيير أصل.
- ملف صالح: تمرر bytes الخام نفسها، بما فيها whitespace، إلى callback. لا parse/stringify لإعادة كتابة المصدر.

تعيد codec التحقق من الملف كله، ولا تسقط عناصر تالفة. لقطة legacy الصالحة من Guest الحالي توصف دائمًا **legacy_captured_now**؛ لا ترفع إلى captured_active_guest كدليل أصل تاريخي. لا يُقرأ global V17 أو ملف منقول إلى user أصلًا. إذا كانت migration قد نقلت بيانات إلى Guest **قبل** استدعاء المحوّل، فلا توجد علامة في v1 تكفي لتمييز ذلك؛ لا يُختلق إثبات، ولا تصبح هذه اللقطة مؤهلة للنقل بمجرد التقاطها. سياسة التحقق/القبول اللاحقة ما زالت لازمة.

### 3. نفس قفل الكاتب طوال callback

القفل الفعلي:

`irth:guest-storage:<physicalKey>:write`، mode=`exclusive`.

يستخدم المحوّل withStorageLock نفسها دون suffix بديل، ثم:

1. يفحص owner/epoch/device والـPartition عند الطلب وعند اكتساب القفل.
2. يقرأ raw ويعيد الفحص قبل callback.
3. يتحقق من snapshot، ثم **ينتظر callback بالكامل داخل قفل المصدر**، بما فيه hash وIDB commit عند ربط Foundation.
4. يعيد فحص السياق قبل نشر نتيجة callback الناجحة؛ الخطأ أو الرفض يحرر القفل أيضًا.

غياب Web Locks يرفض coordination_unavailable، ولا localStorage CAS أو fallback غير ذري. لا نعدل المصدر أو boundUid الحقيقي. الكاتب المتعاون الحالي ينتظر؛ كود قديم/تبويب قديم أو setItem مباشر لا يحترم هذا الاسم يستطيع الكتابة خارج القفل. لذلك لا global exclusion، ولا معاملة مشتركة بين LS وIDB، ولا ضمان ضد كود origin خبيث.

### 4. الربط غير المفعّل مع Foundation

اختبار التكامل يستدعي صراحة:

`createHandoffFoundation(testDependencies).capture(createGuestSourceCapturePort(), syntheticTransitionId)`.

تظل أسماء القواعد مقيدة بـ`irth-guest-handoff-synthetic:` دون تغيير. نواتا contract/codec/journal لم تتغيرا. النتيجة awaiting_target وtarget=null وconsent=null وfoundation_only. يوجد snapshot دائم في **journal الاختبار فقط**، ولا server confirmation أو نجاح نقل.

Foundation تستعمل في الاختبارات owner/epoch الحقيقيين من owner.ts وonOwnerChange لإبطال المعاملة. auth verifier في هذا التدفق يرمي إذا استُدعي: لا target binding حتى في اختبارات adapter. ينبغي للتكامل المستقبلي توفير lifecycle/readiness/contextId وsubscription صحيحة؛ port لا ينشئ dependency إنتاجية أو يحل عقد auth بمفرده.

## TEST

### اختبارات الوحدة والتكامل المعزولة

أضيفت **29 حالة** في `tests/offline/outbox-guest-source-adapter.test.ts`، مع Partition وowner وguest storage وكاتب buffer الحقيقيين في jsdom، وfake-indexeddb للنواة:

- exact physical raw snapshot، whitespace، deviceId مثبت، matching owner، اسم القفل الحصري نفسه.
- missing ID دون توليد، absent partition دون boot resolution، جهاز مختلف أو تغير deviceId.
- قراءة الأصل مباشرة حتى إذا رمت القراءة المغلفة؛ global marker وuser marker يبقيان دون migration/enumeration أو كتابة.
- missing/corrupt/bound buffer وSecurityError في الجهاز أو المصدر وغياب locks.
- الكاتب الحقيقي ينتظر نهاية callback؛ رفض callback يحرر القفل.
- Guest→User أثناء انتظار القفل/أثناء hash/قبل IDB commit، port قديم بعد login، Alice→Bob، وGuest→User→Guest مع epoch مختلف.
- snapshot تغير بين محاولتين لا يستبدل journal؛ إعادة فتح journal تستعيد السجل نفسه.
- صفر fetch أو source writes/removes أثناء الالتقاط، ورفض relocation/fallback، وفحص ثابت لغياب استدعاءات mutation/migration/transport من adapter.

بقيت **62 حالة D-01** ناجحة. تغير اختبار static boundary واحد فقط: قُيّد منع imports التطبيقية بنواة contract/codec/journal بدل شمول adapter الجديد المعتمد الذي يحتاج storage/identity. بقيت assertions السلوكية كلها كما هي، وفحص «لا caller إنتاجي يستورد الحزمة» ما زال قائمًا. أضيف فحص مستقل يمنع adapter من إنشاء هوية أو migration أو إرسال أو source mutation. لم تُغيّر fixtures القديمة الستة أو Assertions اقتصادية لإخفاء فشل.

### Chromium الأصلي — نفس المحوّل

الملفات الجديدة تبني **نفس source-adapter.ts** وPartition/owner/guest storage/buffer وFoundation، لا نموذجًا مكررًا. Vite يعمل دون plugins التطبيق أو public assets. تستبدل diagnostics بدالة صامتة ومسار recordChapterProgress بدالة ترمي لو استُدعيت؛ لا خدمة حقيقية أو auth SDK. الـsource adapter والقراءة والكاتب والقفل وIDB ليست mocks في هذا التشغيل.

التشغيل:

`python3 tests/offline/browser/guest-source-adapter-native.py`.

النتيجة: **PASS، 8/8 سيناريوهات، Chromium 151.0.7922.173، صفر طلبات صفحات خارج أصل loopback**:

| الحالة                                       | النتيجة                                                     |
| -------------------------------------------- | ----------------------------------------------------------- |
| exact physical snapshot إلى native IndexedDB | نفس raw bytes، بلا target/consent أو تعديل buffer           |
| global V17 marker بجانب المصدر               | untouched، لا migration من adapter                          |
| تبويبان، writer حقيقي أثناء callback مؤجل    | writer pending في native locks query، ولا تعديل حتى release |
| Guest→User أثناء انتظار native lock          | identity_changed، لا نشر نتيجة قديمة                        |
| Guest→User أثناء SHA-256 مؤجل                | identity_changed، الأصل باقٍ                                |
| navigator.locks غائب                         | coordination_unavailable دون fallback                       |
| فساد native localStorage                     | رفض وbytes محفوظة                                           |
| إغلاق persistent browser وإعادة فتحه         | نفس handoff والـsnapshot والـsource من native IDB/LS        |

التزامن هنا سياقا تنفيذ في تبويبين داخل persistent browser context واحد لأن localStorage/locks/IDB مشتركة بالأصل؛ ليس isolated incognito contexts ذات مخازن منفصلة. ملفات المستخدم مؤقتة منفصلة عن أي موقع منشور. تغيير الهوية عبر helper اختباري إلى user:alice؛ ليس تسجيل دخول فعليًا.

تعثر scaffold الأول لأن alias record لم يُحجب بعد حله إلى مسار مطلق؛ صُحح حاجز الاختبار فقط دون تعديل المنتج. ثم منع sandbox إنشاء socket loopback؛ نجح الأمر المحدد مع require_escalated. لا تعثر عقد قراءة إنتاجي ولا تخفيف Assertions لإخفائه.

ما ثبت بالتخزين الأصلي: semantics قفل Promise بين التبويبين، raw localStorage، IDB commit والاسترجاع بعد إغلاق متصفح منظم. ليست محاكاة jsdom بديلًا لهذه النتائج. ما لم يثبت: crash انقطاع طاقة، Android WebView، كتابة قديمة لا تتعاون، أو ownership بشري/خادم. اختبار before-IDB-commit المبرمج نُفذ على fake-indexeddb، ولا يُنسب إلى native runner.

**Android = PENDING**؛ لم يشغّل WebView/Emulator فعلي. تعثر Bun Identity التاريخي من الجذر timeout/124 ما زال غير محسوم، ولم يُعد تشغيله أو اعتباره ناجحًا. P1-06B التشخيصي مستقل عن البوابة الرسمية.

### نتائج الفحوص النهائية

| الأمر                                                                               | النتيجة                                                               |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ملفا adapter وFoundation منفردان                                                    | PASS: 91/91 = 29 جديدة + 62 D-01                                      |
| `npm run test:outbox`                                                               | PASS: 626/626 في 22 ملفًا، تشمل تشخيص P1-06B المحلي الواحد            |
| `npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts` | PASS: 625/625 في 21 ملفًا = المرجع الرسمي 596 + 29 جديدة              |
| `npm run typecheck:outbox`                                                          | PASS: مشروع التطبيق ومشروع Outbox، exit 0                             |
| `npm run build`                                                                     | PASS: exit 0، بناء محلي فقط؛ تحذيرات bundler/deprecation غير مانعة    |
| native Chromium runner                                                              | PASS: 8/8، نفس adapter والتخزين الأصلي، صفر external page requests    |
| `git diff --check` وفحص staged diff                                                 | PASS؛ Prettier للملفات TS/JS/MD الجديدة والمعدلة، وPython syntax PASS |

التشخيص المحلي لا يدخل عدد 625 الرسمي أو Commit. لا تُعد نتائج fixtures الستة أو Bun المتعثر نجاحًا ضمن هذه البوابة.

## مخاطر ما قبل runtime integration ونقطة الإدماج اللاحقة

- هذا adapter يثبت المصدر التقني النشط الآن، ولا يثبت هوية الشخص على جهاز مشترك. deviceId وnamespace لا يحددان الإنسان؛ يلزم اختيار/إقرار صريح قبل أي binding أو consent.
- لا anchor إنتاجي؛ فقد journal لا يصبح إذن remint أو نقل. تنفيذ anchor/نية capture_ready عبر LS/IDB وحدود crash يحتاج المرحلة التالية وفق P1-06C، دون ادعاء ذرية مشتركة.
- لا تعليق auth على lock/IDB للأبد، ولا نقل نتيجة من epoch قديم. مهلة coordinator وإدارة callback المتأخر وreadiness والإغلاق تحتاج اختبارًا عند التكامل.
- نقطة الإدماج المناسبة للتدفقات التي يملكها التطبيق: منسق transition **قبل بدء signIn/signUp وتغيير namespace**، بإذن حفظ المصدر المحلي، ثم ينتقل إلى auth دون أن يجعل فشل الالتقاط نجاح نقل. callback مصادقة خارجي يحتاج hook محدودًا قبل `setActiveOwnerInternal` في resetForIdentityChange، مع معالجة ترتيب readiness وعدم انتظار SDK داخل قفل auth callback. هذا **اقتراح لاحق فقط**؛ لم يعدل account/reset أو ترتيب الإقلاع.
- بعد auth يلزم إثبات transition والمستخدم الفعلي ثم consent منفصلة؛ لا يستنتج المصدر من user الحالي ولا no-cloud-save. owner/epoch القديم لا يعاد استعماله بعد restart.
- لا تفعيل send حتى إثبات strict progression وcanonical server semantics وغياب الآثار الاقتصادية. retain_source أولًا، cleanup لاحق بعد إثباتات مستقلة.

## الملفات المعدلة وحدود الحفظ

- جديد: `src/lib/campaigns/guest-handoff/source-adapter.ts`.
- جديد: `tests/offline/outbox-guest-source-adapter.test.ts`.
- تعديل محدد: `tests/offline/outbox-guest-handoff-contract.test.ts`، نطاق static core فقط كما بُين أعلاه.
- جديد: `tests/offline/browser/build-guest-source-adapter.mjs`.
- جديد: `tests/offline/browser/guest-source-adapter-fixture.ts`.
- جديد: `tests/offline/browser/guest-source-adapter-native.py`.
- جديد: هذا التقرير.

لم تتغير AccountProvider أو identity/reset أو router/android-client أو ProfileProvider أو campaignLedger أو Cloud Save أو SQL/RPC أو settlement/Schema v2 أو شروط الحملات أو المكافآت. لا import/copy/delete لبيانات V17 أو أصل لاعب، ولا التقاط تلقائي أو bind/consent فعلي. لا نشر أو دمج.

### ملفات P1-06B الخمسة المحفوظة خارج Commit

| الملف                                                   | SHA-256 مطابق لجدول D-01                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/audits/v18-01a-p1-06b-guest-compatibility.md`     | `316a069672eaca880b17e80253e7cdcf9b4fcd41a7ee009579964dc91efdb370` |
| `tests/offline/browser/build-guest-compatibility.mjs`   | `283907793707d08583fcdc2bfa58db20e23d11606acbefb0d995b7264b62993f` |
| `tests/offline/browser/guest-compatibility-fixture.tsx` | `96c3d160f19112780c03a6fa39c7b186c6faadead4b7012127c175c72ce1a012` |
| `tests/offline/browser/guest-compatibility-native.py`   | `ec0134f9c631a608097782c284548c663e4799da99149d8b360e744c0a694f9a` |
| `tests/offline/outbox-guest-compatibility.test.ts`      | `d8379ddca78c6ac33f497138c72858e15fb234657072d80c01819ef6cc488852` |

## CLOSE

الحفظ المأذون: Commit واحد بالمسارات السبعة المحددة فقط، وPush لفرع العمل بعد نجاح الفحوص. حالة الملفات الخمسة السابقة تبقى untracked دون تغيير. hash ونتيجة Push يُسلّمان بعد التنفيذ.

**التوقف هنا؛ لا انتقال تلقائي لتعديل AccountProvider أو identity/reset أو تفعيل handoff. V18 HOLD؛ P1-06/P1-04/P1-05 OPEN.**
