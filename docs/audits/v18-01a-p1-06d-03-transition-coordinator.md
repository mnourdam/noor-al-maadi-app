# V18-01A — P1-06D-03

## Guest Auth Transition Coordinator & Durable Recovery Prototype

التاريخ: 2026-11-05. الفرع `v18-01a-outbox-recovery`.
HEAD الابتدائي المتحقق: `d38471ddabb7333eddc7f1e7b81e633182788a67`.

**منسق غير مفعّل، ببيانات وخدمات مصادقة اصطناعية فقط. P1-06 OPEN؛ P1-04/P1-05 OPEN؛ V18 HOLD.**

## AUDIT → RISK

قورنت حالة Git والفرع وHEAD بالمرجع. tracked كان نظيفًا، وملفات P1-06B الخمسة بقيت untracked. طوبقت بصماتها مع جدول D-02 قبل التنفيذ وبعده. قُرئت تقارير [P1-06C](./v18-01a-p1-06c-guest-handoff-contract.md) و[D-01](./v18-01a-p1-06d-01-handoff-foundation.md) و[D-02](./v18-01a-p1-06d-02-source-adapter.md)، ووحدات foundation/source adapter/guest storage/buffer والهوية؛ account/reset للقراءة والتدقيق فقط، دون تعديل أو تفعيل مسارهما.

المخاطر المثبتة من العقود القائمة:

1. Foundation كانت تصدر handoffId داخل معاملة capture؛ عند crash بعد commit وقبل حفظ معرفها في anchor لا يكفي مؤشر «بدأ الحفظ» لمعرفة أي نية تستعاد. إعادة إصدار UUID تلقائيًا ليست حلًا.
2. getSession/current UID لا يثبت ارتباط تسجيل الدخول بمصدر Guest أو transition أصلي. epoch المخزن لا يصرح بسياق cold restart جديد.
3. source adapter من D-02 يتعمد رفض القراءة بعد انتقال owner إلى user؛ لا يجوز إضعافه أو البحث عن guest namespace لحل recovery.
4. anchor وjournal ليسا ضمن معاملة مشتركة. انتهاء مهلة انتظار لا يثبت أن كتابة/مصادقة معلقة انتهت أو أُلغيت.
5. missing anchor لا يثبت first use، ولا يجوز bootstrap تلقائي لنية بديلة.

## MINIMUM FIX → IMPLEMENT

أضيف منسق وعقد تبعيات محقونان، دون default stores أو SDK أو hooks. التغيير المحدود في Foundation يتيح **حجز sourceId/handoffId قبل capture**، مع بقاء الاستدعاء القديم بلا الحجز كما هو. لا تغيير قاعدة الاختبار أو schema stores أو Schema v2.

لا imports للمنسق من account/boot/gameplay. الاختبار السابق الذي يفحص غياب caller إنتاجي بقي ناجحًا دون تعديل. لا إرسال أو cleanup أو consent أو مكافأة من أي API جديد.

## 1. API المنسق

`createGuestTransitionCoordinator(dependencies)` يعيد:

| API                                    | الوظيفة                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `prepare(transitionId, budgetMs=8000)` | التقاط Guest صريح وحفظ anchor/journal، ثم awaiting_auth دون تشغيل المصادقة                                                  |
| `start(transitionId, budgetMs=8000)`   | prepare ثم marker auth_started، وتشغيل Auth Adapter، والتحقق والربط في journal فقط حتى awaiting_consent                     |
| `resume(transitionId, budgetMs=8000)`  | استعادة صريحة من anchor معروف المصدر والتحقق الجديد من auth/source/journal؛ لا capture من user ولا إعادة تسجيل دخول تلقائية |

كل استدعاء يعيد handle:

- `result`: نتيجة العرض المحدودة بالميزانية؛ awaiting_auth / awaiting_consent / blocked / timed_out.
- `settled`: انتهاء workflow التخزين/التسوية الأصلي فعلًا؛ قد يبقى pending بعد انتهاء result بالمهلة.
- `authWork()`: Promise محاولة المصادقة الجارية إن بدأت؛ قد تستمر المصادقة العادية بعد blocked الخاص بـhandoff. انتهاء settled لا يساوي انتهاء هذا العمل.

كل outcome يحمل `normalLoginAllowed=true` و`handoffConfirmed=false`. لا تتضمن النتيجة نجاح نقل أو وصول مكافأة. awaiting_consent تعني source/target claim في journal مع consent=null، وليست consent محفوظة أو confirmed_transfer.

التبعيات:

- Foundation Dependencies: اتصال اختبار، identity/context/readiness، invalidation subscription، hash، مولد IDs ووقت.
- `source()`: يستعمل المحوّل الحقيقي من D-02 قبل owner swap فقط.
- AnchorPort: عنوان محدد مسبقًا، exclusive/read/write(revision). لا enumeration.
- AuthTransitionAdapter: authenticate وverify، بلا tokens.
- recoveredSnapshot: capability اختبارية ضيقة للمصدر المعروف، تحت قفله حتى انتهاء bind. **لا يوجد تنفيذ إنتاجي لهذه القراءة العابرة للمالك** في هذه الدفعة؛ غيابها يوقف الاستعادة بأمان.

لا يطلب start/resume UID من المستدعي. الوجهة تأتي من تحقق adapter الموثوق وتطابق الهوية الفعلية.

## 2. عقد transitionId والتحقق

TransitionEvidence المحفوظة في anchor تربط:

`transitionId + source address/owner/device/schema/generation + captured identity/context/epoch + provenance + snapshotHash + reserved sourceId/handoffId`.

لا يعاد اشتقاق source من الحساب الحالي، ولا تُنقل legacy_unknown إلى ثقة جديدة. المحوّل الفعلي يقرأ deviceId المحفوظ وphysicalKey الحالية دون توليد أو migration، ويسمي provenance بـlegacy_captured_now كما في D-02.

Auth Adapter محقون، ويلتزم بما يلي:

1. authenticate(evidence) يربط نتيجة محاولة auth بتلك evidence، ويحفظ receipt اختبارية قابلة للاستعادة خارج ذاكرة المنسق. authenticate(null) يعني **تسجيل دخول عاديًا بلا حق مصدر**.
2. verify(evidence) يعيد null إن تعذر إثبات المحاولة أو الجلسة؛ لا يكفي أن يعيد UID الذي طلبه caller.
3. AuthProof يتضمن transitionId وattemptId وsource owner/epoch/context/hash، والـUID المصادق الفعلي/sessionUid، وهوية target عند owner swap، وهوية السياق الحالي بعد تحقق حديث، وإثبات استمرارية الجلسة الأصلية.
4. يطابق المنسق جميع الحقول. هوية swap يجب أن تكون user:UID في سياق محاولة Guest الأصلي، وepoch المصدر +1. في السياق نفسه، لا يقبل epoch آخر ولو عاد UID نفسه.
5. عند cold restart، لا يقارن عداد إقلاع قديم بالعداد الجديد كصلاحية. يلزم أن يثبت adapter receipt الأصلية واستمرارية الجلسة الفعلية؛ ويطابق currentIdentity الجديدة مع السياق الحالي. UID مطابق مع sessionContinuity غير مثبتة يرفض.
6. قبل recover/bind داخل Foundation يعاد verify، وتُفحص الهوية بعد كل await. تغيير UID أو context/epoch أثناء الانتظار يمنع المتابعة المحلية.

attemptId ثابت عند target_claimed. لا يمكن استبدال Alice بـBob أو إعادة توظيف transitionId جديد لتجاوز source claim. لا يحفظ المنسق AuthProof كاملًا أو access/refresh tokens؛ metadata المحفوظة للهدف UID وattemptId فقط. لا يستدعي SDK حقيقيًا في هذه المرحلة.

**حد الإثبات:** interface ليست توقيعًا أو خادم مصادقة. الاختبارات تقدم adapter موثوقًا وهميًا وسجل جلسات اصطناعيًا. بناء adapter حقيقي يثبت الارتباط عبر callbacks/OAuth/session refresh ما زال شرطًا قبل التفعيل؛ لا يجوز استبداله بـboolean أو current session UID وحده.

## 3. سياسة anchor — دون ذرية وهمية

AnchorPort مرتبط بعنوان مصدر واحد قبل auth. الحالة:

`enrolled → prepared → captured → auth_started → target_claimed → awaiting_consent`.

- enrolled لا يُنشأ من غياب التخزين. **fixture الاختبار وحدها** تجهز slot أول استعمال صريحًا. المنسق لا يملك enroll/reset/delete API؛ missing anchor دائمًا blocked، سواء وجد journal أم لم يوجد.
- سياسة تجهيز slot إنتاجي يثبت first use/وجود سجل سابق **غير منفذة وغير معتمدة تلقائيًا هنا**. هذا شرط تفعيل، لا ضمان تم التحايل عليه بتفسير غياب key.
- prepared يحجز sourceId وhandoffId ويحفظ المصدر/hash/transition قبل IDB capture. فشل anchor write يمنع إنشاء journal جديد.
- Foundation.capture تقبل reserved IDs اختيارية وتتحقق منها. إذا كان source registry موجودًا لهوية أخرى، لا تتبناه أو تستبدله؛ conflict مع احتفاظ الأصل.
- بعد commit capture يحفظ captured. إن كان prepared باقياً بعد فقد إقرار، recover يستعمل handoffId المحجوز؛ إذا لم توجد النية في هذه المرحلة فقط، يسمح بإعادة **نفس IDs ونفس snapshot ونفس transition**، لا نية بديلة. لا يمكن أن يكون bind متعاون قد بدأ في prepared؛ يشترط captured وما بعدها.
- إذا كان anchor قد بلغ captured أو مرحلة لاحقة ثم فقد journal، فالفعل blocked، لا recapture أو remint. حتى لو اعتُقد أن journal فارغ.
- target_claimed يحفظ UID/attemptId **قبل** bind في IDB. إذا توقف التطبيق بعد bind وقبل آخر marker، يجد نفس الهدف، ويستكمل marker دون تكرار binding/history.
- غياب anchor مع journal موجود لا يبيح إعادة بناء anchor من current user أو تبني سجل مجهول.

التنسيق: AnchorPort.exclusive يحمي عمليات anchor المتعاونة؛ write يقارن revision تحت هذا القفل. التنفيذ native fixture يستعمل getItem/setItem تحت Web Lock منفصلة، **وليس CAS أصلية في localStorage**. CAS الخاص بصفوف Foundation يتم داخل IDB transaction كما سابقًا. لا معاملة مشتركة بين المتجرين ولا atomicity مع profile.

ترتيب الأقفال ثابت: coordinator-anchor lock ثم source write lock. authenticate يجرى **خارج** هذين القفلين. فحص snapshot الراجع وbind يجريان داخل capability المصدر الاختبارية. لا global exclusion من كود قديم أو خبيث يتجاوز البروتوكول أو يغير enrolled slot يدويًا. eviction/clear شامل لا يمكن إعادة بناء نسبه تاريخية منه؛ missing anchor يوقف العمل، ولا يمحو شيئًا أو ينشئ إثباتًا جديدًا.

## 4. تسلسل crash/restart

| الحد                                               | الأثر الدائم والاستعادة                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| قبل anchor prepared                                | لا journal موثوق جديد؛ فشل الحفظ لا يصبح نجاحًا                                                                        |
| anchor prepared، قبل IDB commit                    | الهوية المحجوزة باقية؛ retry Guest لنفس snapshot/transition فقط، دون UUID بديل                                         |
| IDB capture commit، قبل captured marker            | recover لنفس handoffId، ثم حفظ captured؛ لا إعادة capture إذا السجل موجود                                              |
| بعد captured، قبل auth                             | لا target أو consent؛ restart دون receipt موثقة يبقى awaiting verification، ويسمح بتسجيل دخول عادي                     |
| auth_started، قبل بدء auth فعلي أو أثناءه          | لا يستأنف auth تلقائيًا؛ الحالة غير محسومة، وresume يحتاج receipt أصلية وجلسة فعلية. لا بدء محاولة handoff ثانية صامتة |
| auth نجح، قبل تحقق الهدف                           | المستخدم يبقى مسجلاً، journal قد يبقى awaiting_target. لا تعرض نجاح نقل؛ resume يعيد التحقق                            |
| target_claimed، قبل bind                           | UID محجوز؛ لا وجهة أخرى. استئناف الفحص وbind لنفس UID فقط                                                              |
| IDB bind commit، قبل awaiting_consent marker       | journal يحمل الهدف وconsent=null؛ resume يطابقه ويكمل marker دون bind آخر                                              |
| بعد awaiting_consent، قبل أي UI                    | إعادة عرض الحالة من السجل بعد تحقق حديث؛ لا منحة ولا consent تلقائية                                                   |
| anchor أو journal تالف/غير مقروء/مفقود بعد الإثبات | blocked؛ الاحتفاظ بالدليل المتاح، لا empty fallback أو overwrite                                                       |
| source تغير بين capture وrecovery                  | snapshot_conflict؛ لا توسيع موافقة أو تحديث صامت للدفعة                                                                |

قبل auth في cold restart، إن لم يوجد receipt موثق فلا يختلق المنسق epoch/محاولة auth جديدة باعتبارها امتدادًا قديمًا. الاستعادة قد تكون **blocked / auth_unverified**؛ لا ندعي أن كل انقطاع يؤدي تلقائيًا إلى awaiting_consent. تسجيل الدخول العادي يبقى متاحًا دون حمل المصدر معه.

### timeout وsingle-flight

result المحدود بالميزانية يعيد timed_out/outcome_unresolved، لا «لم يُحفظ» أو «أُلغيت المعاملة». الكتابة الأصلية قد تلتزم لاحقًا. يبقى settled متتبعًا، وlive guard يمنع العمل المنتهي الميزانية من نشر awaiting_consent أو بدء bind جديد بعد اكتشاف المهلة. إذا التزم bind قبل اكتشاف المهلة فـtarget_claimed موجود والاستعادة تتحقق؛ لا يعاد إسناده.

إن لم تبدأ المصادقة في start بسبب handoff معلق أو فاشل، يمكن للـadapter بدء authenticate(null) كتسجيل دخول عادي، دون حق مصدر؛ لا يتحول اكتمال capture المتأخر إلى مصدر لذلك الدخول. الأخطاء المرتبطة بمحاولة auth سابقة/transition/target لا تطلق handoff auth أخرى تلقائيًا؛ normalLoginAllowed يبقى true للمسار العادي المستقل.

نفس transition في نفس المنسق يعيد handle نفسها؛ transition مختلفة تُرفض concurrent_transition. slot يبقى محجوزًا أثناء workflow أو fallback auth المعلقة. بعد حفظ auth_started لا يبدأ منسق آخر authenticate ثانية لتلك المحاولة؛ يستخدم resume أو يتوقف awaiting verification. هذه حدود منسقات متعاونة، وليست إلغاءً لخادم مصادقة أو تزامنًا عالميًا لعملاء قدامى.

قد يبقى قفل prototype محتجزًا إذا علقت تبعية داخل المنطقة الحرجة؛ result ينتهي ضمن الميزانية، لكنه **لا يعلن تحرير القفل أو إلغاء العمل**. قبل runtime يجب تصميم deadlines/cancellation في adapters دون تحرير مصدر بينما كتابة مجهولة ما زالت جارية.

## TEST

### اختبارات الوحدة — جدولة مضبوطة

`tests/offline/outbox-guest-transition.test.ts`: **42 حالة جديدة**. تستخدم source adapter/Partition/owner الحقيقيين في fixture jsdom، وfake-indexeddb للنواة، وanchor محقونًا مع قفل وrevision، وAuth Adapter وهميًا فقط. fetch محظور. ليست اختبار auth حقيقي أو Android.

| قبول المستخدم                         | الدليل الجديد                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1–2 Guest → حساب جديد/موجود           | capture قبل swap، proof صحيحة، journal target، consent=null                                        |
| 3 User A → B                          | لا source()/capture، المسار العادي بلا handoff source                                              |
| 4 جهاز مشترك                          | legacy_captured_now فقط، لا موافقة/ملكية بشرية                                                     |
| 5–6 Guest→User→Guest وAlice→Bob→Alice | رفض callback/epoch/session lineage القديم                                                          |
| 7 قبل capture commit                  | quota تعيد IDB كاملًا، prepared IDs باقية                                                          |
| 8 بعد commit وقبل auth                | نفس journal/anchor، لا target من login الحالي                                                      |
| 9 توقف أثناء auth                     | result timeout، auth pending متتبع، لا consent                                                     |
| 10 بعد auth قبل bind                  | auth success محفوظة في fixture، تحقق فاشل يترك الهدف null؛ resume جديدة تتحقق                      |
| 11 بعد bind قبل consent               | فشل آخر marker ثم recovery دون تكرار bind، consent=null                                            |
| 12 UID تغير أثناء الانتظار            | gates مؤجلة وroundtrip؛ لا bind محلي قديم                                                          |
| 13–14 transition/hash مخالفان         | رفض proof أو snapshot conflict دون overwrite                                                       |
| 15 journal اختفى والـanchor باقٍ      | blocked، لا remint                                                                                 |
| 16 anchor اختفى والـjournal باقٍ      | anchor_missing، لا bootstrap                                                                       |
| 17 source تغير                        | اختلاف raw/hash يوقف bind                                                                          |
| 18 محاولتان متزامنتان                 | single-flight داخل السياق وقفل anchor بين منسقين؛ لا إعادة auth_started                            |
| 19 مصدر واحد/وجهتان                   | target claim لا يعاد ربطه؛ transition جديدة لا تتجاوز القديمة                                      |
| 20 غياب locks                         | فشل آمن، ordinary login متاح دون journal جديد                                                      |
| 21 quota                              | قبل prepared، وأثناء capture، وبعد auth عند bind، وبعد commit قبل marker                           |
| 22 تعليق auth أو IDB                  | fake timers لـsetTimeout فقط؛ result لا يدعي الإلغاء وsettled يبقى pending حتى settle/abort الفعلي |
| 23 لا إرسال/حذف/مكافأة                | لا مسار transport أو rewards في المنسق؛ الأصل ثابت، consent=null، fetch محظور                      |

حالات إضافية: إقرار anchor ضاع بعد كتابته، سجل تالف، غياب كلا المتجرين لا يثبت first use، intent مستقل موجود لا يتبناه reserved ID جديد، وفحص sessionContinuity بعد restart وfallback auth single-flight.

الـ62 Foundation والـ29 source adapter السابقات بقيت ناجحة؛ لم تتغير Assertions القديمة أو fixtures الستة غير المتوافقة. تعثر Bun Identity السابق من الجذر timeout/124 ما زال غير محسوم؛ لم يُعد تشغيله أو استبداله بنسخة معزولة.

### Chromium الأصلي — نفس المنسق

الأمر: `python3 tests/offline/browser/guest-transition-native.py`.

**9/9 PASS** على Chromium 151.0.7922.173، بقاعدة `irth-guest-handoff-synthetic:` فقط، وlocalStorage/IndexedDB/Web Locks أصلية على loopback origin مؤقت. نفس transition-coordinator وFoundation وsource adapter ووحدات owner/Partition تُبنى من src، وليست إعادة تنفيذ للمنسق.

Auth Adapter وهمي يحفظ receipt وجلسة **اصطناعيتين بلا tokens** في مفاتيح test-only، ويثبت الاستمرارية بينهما. recoveredSnapshot capability **اختبارية** تستعمل المفتاح الملتقط نفسه وقفل المصدر الأصلي؛ لا تسمح بالبحث في مساحات أخرى. هذا الجزء ليس source adapter إنتاجيًا صالحًا للعبور بعد auth.

السيناريوهات: capture/anchor قبل auth؛ auth وهمية ثم target بلا consent؛ إغلاق متصفح منظم ثم إعادة فتحه والتحقق الحديث؛ سياق تبويب آخر لنفس النية؛ رفض Bob؛ رفض Alice→Bob→Alice مع جلسة مستبدلة؛ عودة Guest/transition جديدة لا تعيد نسب المصدر؛ فقد journal مع anchor؛ وفقد anchor لا يعني first use. بقي source buffer الخام نفسه، ولم تتغير boundUid الحقيقية.

صفر طلبات صفحات خارج الأصل المحلي، لا موقع منشور أو Supabase. diagnostics مستبدلة بصامت، وrecordChapterProgress stub يرمي لو استدعي. لم يُنفذ SQL أو Cloud Save أو منحة أو نقل بيانات. احتاج خادم loopback require_escalated لأن sandbox يمنع socket محليًا؛ لا توسيع شبكة عام.

هذه **orderly browser close/reopen**، لا crash/force-stop أو انقطاع طاقة. نقاط commit/timeout/quota المضبوطة اختبارات وحدة ولا تُنسب إلى native runner. **Android PENDING** حتى اختبار WebView فعلي.

### نتائج الفحوص النهائية

| الأمر                                                                               | النتيجة النهائية                                                              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| اختبار المنسق منفردًا                                                               | PASS: 42/42 حالة جديدة                                                        |
| `npm run test:outbox`                                                               | PASS: 668/668 في 23 ملفًا = 625 سابقة + 42 جديدة + تشخيص P1-06B المحلي الواحد |
| `npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts` | PASS: 667/667 في 22 ملفًا؛ هذه البوابة الرسمية المستقلة                       |
| `npm run typecheck:outbox`                                                          | PASS: التطبيق وOutbox، exit 0                                                 |
| `npm run build`                                                                     | PASS: exit 0، build محلي فقط؛ تحذيرات bundler/deprecation غير مانعة           |
| Chromium native runner بعد تعديل single-flight النهائي                              | PASS: 9/9، نفس المنسق؛ صفر external page requests                             |
| `git diff --check` وstaged diff                                                     | PASS؛ Prettier للملفات TS/JS/MD وsyntax Python ناجحة                          |

الـ625 الرسمية السابقة، ومنها 62 Foundation و29 Source Adapter، بقيت ناجحة. التشخيص المحلي الواحد ليس جزءًا من 667 ولا من Commit. لا يحتسب Bun أو fixtures الستة المتعثرة ضمن هذه النتائج.

أخطاء التطوير الأولية كانت في fixture: wrapping mock استدعى نفسه، وfake timers واسعة علقت جدولة fake-indexeddb، ثم typing getter/Promise للـfixture. صُححت الآليات دون إضعاف assertions أو تغيير اختبارات قديمة؛ النتائج أعلاه تخص التشغيل النهائي فقط.

## حدود الملكية وblockers قبل التفعيل

لا blocker جديد يمنع **النموذج المحقون غير المفعّل** من التصرف fail-closed كما اختبر. لكنه ليس بوابة login إنتاجية جاهزة. الشروط المتبقية تمنع التفعيل التلقائي:

1. سياسة enrollment/anchor إنتاجية لا تستنتج first use من غياب التخزين، وتوافق V17/فقد الأدلة دون remint.
2. Auth Adapter حقيقي يثبت الانتقال/الجلسة عبر signup/signin/OAuth/refresh/restart؛ لا يمكن تعويض غياب ذلك بقيم يرسلها caller.
3. SourceCapability إنتاجية ضيقة للاستعادة بعد owner swap؛ D-02 ما زال Guest-only. غياب capability في هذا النموذج يؤدي blocked، لا قراءة مصدر آخر.
4. عقد readiness/disposal/deadlines متكامل مع SDK والهوية، واختبارات old bundles/cross-tab وAndroid/force-stop. البيانات التقنية لا تثبت أن الشخص الحالي صاحب تقدم الضيف على جهاز مشترك.
5. consent UI صريحة منفصلة عن auth، وسياسة snapshot/content evidence/strict progression، ثم transport/reconciliation/cleanup في مراحل معتمدة لاحقة. لا شيء من ذلك أصبح مكافأة مؤكدة أو غطاءً لإغلاق P1-04/P1-05.

## أول نقاط الإدماج المقترحة لاحقًا — لم تُعدّل

- قبل signUpWithEmail داخل AccountProvider.signUp وقبل signInWithEmail داخل signIn: منسق transition بإذن حفظ مصدر محلي، قبل دخول SDK أو owner swap؛ فشل handoff لا يلغي حق login عادي.
- auth listener: لا يعتبر SIGNED_IN أو INITIAL_SESSION consent/ملكية. يتحقق عبر adapter من نتيجة المحاولة الأصلية بعد خروج callback من قفل SDK.
- identity/reset: hook محدود **قبل** setActiveOwnerInternal، مع عقد pre-readiness والتقاط Guest الموجود فعلًا؛ لا إعادة اكتشاف source بعد swap. لا ننتظر SDK داخل auth callback بصورة تقفل نفسها.

هذه نقاط تصميم فقط. لم يُستورد المنسق أو تعدل account/reset/router/android-client/ProfileProvider/campaignLedger أو Cloud Save أو SQL/RPC أو settlement/Schema v2 أو اقتصاد/شروط الحملات.

## الملفات والبصمات والحفظ

الملفات المعتمدة لهذه الدفعة فقط:

- `src/lib/campaigns/guest-handoff/transition-contract.ts` جديد.
- `src/lib/campaigns/guest-handoff/transition-coordinator.ts` جديد.
- `src/lib/campaigns/guest-handoff/journal.ts` تعديل صغير لحجز IDs؛ لا schema change.
- `tests/offline/outbox-guest-transition.test.ts` جديد.
- `tests/offline/browser/build-guest-transition.mjs` جديد.
- `tests/offline/browser/guest-transition-fixture.ts` جديد.
- `tests/offline/browser/guest-transition-native.py` جديد.
- هذا التقرير.

خمسة ملفات P1-06B بقيت خارج Commit، وبصماتها مطابقة لجدول D-02:

| الملف                                                   | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/audits/v18-01a-p1-06b-guest-compatibility.md`     | `316a069672eaca880b17e80253e7cdcf9b4fcd41a7ee009579964dc91efdb370` |
| `tests/offline/browser/build-guest-compatibility.mjs`   | `283907793707d08583fcdc2bfa58db20e23d11606acbefb0d995b7264b62993f` |
| `tests/offline/browser/guest-compatibility-fixture.tsx` | `96c3d160f19112780c03a6fa39c7b186c6faadead4b7012127c175c72ce1a012` |
| `tests/offline/browser/guest-compatibility-native.py`   | `ec0134f9c631a608097782c284548c663e4799da99149d8b360e744c0a694f9a` |
| `tests/offline/outbox-guest-compatibility.test.ts`      | `d8379ddca78c6ac33f497138c72858e15fb234657072d80c01819ef6cc488852` |

## CLOSE

Commit واحد وPush لفرع العمل بعد نجاح الفحوص، بإضافة المسارات الثمانية المحددة فقط. hash/نتيجة Push تسلم بعد التنفيذ. لا hooks تلقائية أو تفعيل runtime أو send/cleanup، ولا بيانات لاعب حقيقية. **التوقف هنا. P1-06/P1-04/P1-05 OPEN؛ V18 HOLD.**
