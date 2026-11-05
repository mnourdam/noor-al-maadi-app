# V18-01A — P1-06F-01

## Disabled Email Authentication Observation Integration

التاريخ: 2026-11-05، Asia/Damascus. الفرع `v18-01a-outbox-recovery`.
HEAD الابتدائي المطابق: `c1749e2b5f830dee4e814b9aa343faa606ecadac`.
المرجع المحلي المعتمد: [P1-06E](./v18-01a-p1-06e-integration-go-no-go.md)، محفوظ دون تعديل.

**Observer لا يعمل إلا بحقن اختباري؛ لا enable flag في التطبيق أو Production. Guest Handoff الحقيقي NO-GO. P1-06/P1-04/P1-05 OPEN؛ V18 HOLD.**

## AUDIT → RISK → MINIMUM FIX

تحقق HEAD/branch وGit Status أولًا. tracked كان نظيفًا؛ خمسة ملفات P1-06B وتقرير P1-06E كانت untracked. طوبقت بصمات B مع D-04 وحفظت بصمة E قبل التنفيذ وبعده. قُرئت C وD-01 إلى D-04 وE ومسارا AccountProvider للبريد ومداخل Google/الأحداث القائمة.

نطاق التعديل يقتصر على دالتي signUp/signIn في AccountProvider، مع helper بلا خدمات تطبيقية. لا listener جديد أو reset أو تعديل OAuth أو تخزين. لا استعمال لحزمة foundation أو مفاهيم الملكية أو الاقتصاد. لم تُعالج موانع enrollment/المصادقة/الترقية القديمة في E عرضًا.

تعليمات F-01 أحدث وأشد من مثال flag في E: **لم تُضف `VITE_GUEST_TRANSITION_OBSERVE` أو أي وسيلة لتفعيل Observer في Production**. بدل ذلك حقن React اختباري، لا يُقبل إلا عند MODE=test وPROD=false. لا تفعيل dev أيضًا.

## IMPLEMENT

### 1. ما يُراقب وأين رُبط

جديد: `src/lib/auth/transition-observation.ts`.

- `selectTestEmailObserver`: بوابة قبول injection فقط في الاختبارات.
- `beginEmailObservation`: يصدر invoked بمعرف محاولة رقمي عابر داخل JS runtime.
- `endEmailObservation`: resolved عند رجوع خدمة المصادقة بلا error، أو rejected عند error في النتيجة، ومع boolean returned_session فقط.
- `failEmailObservation`: rejected عند throw من استدعاء المصادقة، دون error/message أو returned_session مختلقة.

حقل returned_session يعني وجود session **في القيمة المرجعة من هذا الاستدعاء فقط**. لا يعني جلسة حالية متحققة سلطويًا، أو اكتمال identity reset، أو ملكية مصدر Guest. عند exception تبقى session presence مجهولة، ولا يُسجل false كدليل عدم حدوث جلسة.

AccountProvider يقبل `emailAuthObserverForTests` اختيارية. ليس في AccountCtx أو useAccount إعداد لتفعيلها. دالتا signUp/signIn تمسكان sink الخاصة بالمحاولة عبر handle محلية، فلا تنتقل النهاية القديمة إلى sink جديدة عند rerender.

نقاط الربط الحالية في [account.tsx](../../src/lib/account.tsx):

- signUp: بعد validation المحلية وقبل `await signUpWithEmail`، ثم بعد نتيجته وقبل تحديث الاسم أو بقية المسار القديم. Validation لا تستدعي observer أو SDK.
- signIn: قبل `await signInWithEmail` وبعد نتيجته فقط.
- catch ضيقة حول await الأصلية تُبلغ rejected ثم **تعيد رمي الكائن الأصلي نفسه**. لا wrapping أو استبدال exception.

بقي await واحد لنفس خدمة المصادقة في كل مسار. لا تغيير arguments/username trim أو return shape/messages أو retries أو session creation أو ترتيب تحديث الاسم. لا await لأعمال المراقبة.

### 2. كيف بقي معطلًا افتراضيًا وفي البناء

كل مدخل في helper يتحقق مباشرة من:

`import.meta.env.MODE === "test" && import.meta.env.PROD === false`.

يلزم أيضًا sink محقونة؛ غيابها يعني no-op حتى في test mode. في development أو production أو build عادي، لا يُقبل الحقن. وحتى build له mode=test مع PROD=true لا يقبلها وفق الحارس. لا متغير VITE إضافي أو global setter أو localStorage switch أو Analytics/Console لتفعيلها.

عند التعطيل:

- لا callback أو attempt counter increment أو clock/UUID أو قراءة owner/device/session/storage.
- لا inspection إضافية لـdata/session في signIn؛ اختُبرت نتيجة لها data getter يرمي، ولم يُقرأ عند غياب sink أو في production.
- تغيّر prop الاختبارية أثناء production لا يغير هويات signIn/signUp callbacks، لأن dependency المقيمة دائمًا undefined.
- لا store أو subscription أو timer جديد. كل module state عداد اختبار عابر فقط، بلا قائمة أحداث أو مرجع إلى ملف لاعب.

**فحص البناء:** النسخة الأولى كانت آمنة ببوابة تعيد false، لكن المُجمّع أبقى emitter خلف دالة الحارس. جُعلت شروط البناء مباشرة في المداخل كي تحذف dead code. أُعيدت البوابة وtypecheck/build على النسخة النهائية؛ نتيجة فحص ملفات JS/MJS النهائية موثقة أدناه. لم يحتج ذلك تغيير إعدادات build أو الاختبارات القديمة.

### 3. الفشل والجدولة

publish يحمي استدعاء sink بـtry/catch. إن أعادت Promise، يلحق rejection handler دون انتظارها. لذلك:

- synchronous throw أو async rejection لا يغير نتيجة auth ولا يصل إلى app unhandled-rejection handlers.
- Promise observer معلقة لا تؤخر بدء SDK أو رجوعه.
- لا logs لخطأ observer، فلا يُسرّب message قد يحتوي بيانات حساسة.
- terminal emission واحدة لكل handle، دون منع SDK calls أخرى مقصودة من التطبيق أو إضافة single-flight للمصادقة.
- unmount لا يدعي إلغاء SDK؛ النتيجة ترجع كما كانت، وأي ملاحظة متأخرة تبقى لمعرف المحاولة وsink القديمتين، دون UI/account mutations من observer.

تزامن الأحداث العامة مع Promise لا يجعلها مغطاة بهذه المراقبة. في الاختبار صدر SIGNED_IN قبل اكتمال signIn، وبقي reset الوهمي pending وowner قبل swap، ثم رجع signIn ناجحًا وreturned_session=true. هذه نهاية الاستدعاء فقط، لا reset acknowledgment أو حق نقل.

### 4. الخصوصية والعزل

لا يستقبل observer response/error/session object أو email/password/username أو tokens أو UID أو owner/epoch أو بيانات جهاز/progress/buffer أو snapshots. Provider يمرر إلى helper فقط operation وbooleans بعد النداء. event مجمدة، وحقولها الوحيدة:

- operation: sign_in / sign_up.
- phase: invoked / resolved / rejected.
- attemptId: عداد عابر، غير ثابت عبر restart وغير صالح idempotency أو handoff identity.
- returned_session عند معرفة وجودها في return value، ولا توجد عند throw.

لا تخزين دائم أو Analytics أو Console أو fetch في helper. الـsink وسجل الأحداث تملكهما fixture فقط. الفحص اختبر بيانات synthetic حساسة في arguments/result/exception، ولم تنتقل إلى المراقبة أو logs الخاصة بها. SDK نفسها تستقبل credentials الأصلية كما قبل، ولا تُنسخ إلى observer.

لا imports أو callbacks من source capture أو anchor/journal أو consent أو progress transport/rewards. لا توليد source owner أو handoff ID، ولا فتح IDB من المراقبة. لم يتغير اقتصاد/ProfileProvider/Cloud Save أو تقدم الحملات. آثار reconciliation القائمة في AccountProvider ليست صفرًا بالضرورة؛ قورنت counters في نفس fixture مع baseline دون observer ولم تُضف آثارًا.

## TEST

أضيف `tests/offline/outbox-auth-transition-observation.test.tsx`: **39 حالة قبول جديدة**.

الاختبار يستخدم React وAccountProvider وuseAccount وGoogleSignInButton الفعلية؛ خدمات SDK/cloud/profile/reset/native وevent delivery وهمية، والبيانات synthetic فقط. لا حسابات أو طلبات حقيقية. لا يُقدَّم ذلك كاختبار Supabase أو OAuth provider أو identity-reset implementation الفعلية؛ reset/readiness معلقتان عمدًا في سيناريو السباق لاختبار حد الملاحظة.

| قبول F-01                    | الدليل                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1،20: default/build disabled | no injection افتراضيًا، وMODE=development/production/test+PROD=true ترفض sink، حتى مع اسم flag إضافي true؛ callback identities ثابتة عند تغيير حقن متجاهل. |
| 2–3: signIn نجاح/فشل         | نفس arguments مرة واحدة ونفس ok/error message، invoked/terminal مرتبطة بنفس attempt.                                                                       |
| 4: signUp مع session         | نفس نتيجة signup، وطلب تحديث الاسم القائم بعد SDK/observation كما كان؛ لا grant جديد.                                                                      |
| 5: signUp دون session        | رسالة «تحقق من بريدك لتأكيد الحساب» محفوظة، resolved+returned_session=false لا User أو reset مصطنع.                                                        |
| 6: local validation          | اسم قصير أو password قصيرة تمنع SDK/observer، والرسالتان الأصليتان محفوظتان.                                                                               |
| 7: SDK error/throw           | returned error لا يتغير، وexception identity محفوظة في المسارين؛ لا false session absence عند throw.                                                       |
| 8: observer errors           | throw متزامن وasync rejection وPromise معلقة، مع استمرار auth؛ لا logs أو global unhandled rejection.                                                      |
| 9: auth event قبل SDK return | listener الأصلي يعمل وreset pending؛ المراقبة لا تدعي انتهاء swap.                                                                                         |
| 10–12 + INITIAL_SESSION      | تكرار SIGNED_IN وTOKEN_REFRESHED وSIGNED_OUT/INITIAL_SESSION لا يبدأ observer أو طلب بريد جديد.                                                            |
| 13–14: Guest/User وA/B       | أحداث الهوية لا تنشئ مراقبة ولا تغير synthetic progress/journal bytes؛ لا منح.                                                                             |
| 15: Google                   | زر Google الحقيقي، web/native بخدمات وهمية؛ نفس الطلب المتوقع مرة واحدة، دون email observation أو تعديل المصدر.                                            |
| 16: no storage reads         | helper تحت global Storage/IDB proxies ترمي، وclock/UUID ممنوعان؛ المراقبة لا تستخدمها.                                                                     |
| 17: الخصوصية                 | fields whitelist وfrozen events، ولا بيانات arguments/session/error أو console messages.                                                                   |
| 18: count/order              | invoked → طلب SDK واحد → resolved؛ لا انتظار للـsink؛ ترتيب signup/displayName محفوظ. counters auth/profile/cloud مطابقة baseline.                         |
| 19: لا آثار Handoff/مكافآت   | لا imports من الحزمة، indexedDB.open ممنوع ولم يُستدع، bytes fixture ثابتة، grant/stats/merge/counters لا تزداد عن baseline.                               |

حالات إضافية: sink تتغير قبل اكتمال محاولة Alice وبدء Bob، unmount أثناء الطلب، استثناء observer أثناء SDK failure، session getter يرمي عند التعطيل، منع terminal مكررة، ومنع أي terminal من handle سابقة عند PROD=true.

### نتائج الفحوص النهائية

| الأمر / الفحص                                                                       | النتيجة النهائية                                                                                                |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run test:outbox`                                                               | PASS: 754/754 في 25 ملفًا = 714 سابقة + 39 جديدة + diagnostic محلية واحدة من P1-06B                             |
| `npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts` | PASS: 753/753 في 24 ملفًا؛ هذه البوابة الرسمية المستقلة                                                         |
| `npm run typecheck:outbox`                                                          | PASS: التطبيق وOutbox، exit 0                                                                                   |
| `npm run build`                                                                     | PASS: exit 0، build محلي فقط، وتحذيرات bundler/deprecation غير مانعة                                            |
| فحص الحزمة الإنتاجية                                                                | 470 ملف JS/MJS للعميل و472 للخادم؛ صفر ظهور لحقل payload `returned_session` بعد حذف emitter من المسارات المجمعة |
| Prettier للـhelper/tests/reports و`git diff --check` وstaged diff                   | PASS؛ لم يُعَد تنسيق account.tsx كاملًا                                                                         |

فحص bundle يساند اختبارات البوابة `MODE=test && PROD=false` والـproduction-injection rejection، وليس بديلًا عنها. لا اختبار خادم Auth أو Android حقيقي في هذه الجولة. نتيجة standalone الأولية كانت 37 حالة قبل إضافة حالتي الخصوصية/default؛ العدد النهائي 39 مثبت ضمن تشغيل البوابة الكامل، لا ادعاء بتشغيل مستقل آخر.

لم تُغيّر Assertions أو config قديمة أو fixtures الستة غير المتوافقة. لا إصلاح لتعثر Bun Identity الأصلي؛ timeout/124 السابق يبقى غير محسوم، ولا يُحسب كاختبار ناجح أو يُستبدل بنسخة معزولة. Native Chromium D-04 (13) نتيجة سابقة منفصلة لم تُعد تشغيلها في F-01، إذ لم تتغير اعتماداتها؛ Android/force-stop PENDING.

## حدود المراقبة والفجوات غير المشمولة

هذه المراقبة ليست Auth Adapter، ولا تغطي أو تثبت OAuth redirect/INITIAL_SESSION/callback after restart/refresh/identity swap completion. حصول returned_session أو SIGNED_IN لا ينسب تقدم ضيف للحساب.

مداخل لا تمر بالدالتين المعدلتين، ولم توسع إليها المراقبة:

- GoogleSignInButton web → signInWithOAuth؛ native → signInWithGoogleNative ثم exchange/bridge.
- auth.callback.tsx وروابط التأكيد/recovery/magic link وnative appUrlOpen/getLaunchUrl.
- INITIAL_SESSION/TOKEN_REFRESHED/SIGNED_IN/SIGNED_OUT في listener القائمة.
- AdminLoginForm → SDK.signInWithPassword مباشرة.
- wrapper Lovable OAuth قادر على setSession؛ لم يظهر له caller حالي في تدقيق E.

لا تزال Google PKCE تحتاج attempt/source/session receipt إنتاجية، ومعالجة replay/cold restart وany-existing-session fallback كما وثّق E، دون الاستناد إلى signin/signup intent أو owner/device وحدهما. لا تعتبر اختبارات الزر الوهمية قبولًا لـGoogle أو Android.

NO-GO الحقيقي باقٍ: لا enrollment إنتاجية، ولا capture/bind/consent/send/cleanup، ولا معالجة للمسار القديم للترقية أو profile seeding، ولا إغلاق P1-06/P1-04/P1-05.

## الملفات المعدلة والحفظ

1. `src/lib/auth/transition-observation.ts` جديد.
2. `src/lib/account.tsx` import/prop اختبارية وربط signIn/signUp فقط؛ بقية الملف لم تُعد تنسيقه أو تُعدّل listener/reset/Google/Cloud Save.
3. `tests/offline/outbox-auth-transition-observation.test.tsx` جديد.
4. هذا التقرير.
5. تقرير P1-06E السابق **دون تغيير**، مسموح إدراجه كمرجع معتمد.

لا config أو env flag أو package/lock changes. لا SQL/RPC migrations أو بيانات حقيقية أو اتصال Production أو Web/Android Release أو merge.

### الملفات المحلية السابقة وبصماتها

ملفات P1-06B الخمسة بقيت مطابقة لجدول D-04، وخارج Commit:

| الملف                                                   | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/audits/v18-01a-p1-06b-guest-compatibility.md`     | `316a069672eaca880b17e80253e7cdcf9b4fcd41a7ee009579964dc91efdb370` |
| `tests/offline/browser/build-guest-compatibility.mjs`   | `283907793707d08583fcdc2bfa58db20e23d11606acbefb0d995b7264b62993f` |
| `tests/offline/browser/guest-compatibility-fixture.tsx` | `96c3d160f19112780c03a6fa39c7b186c6faadead4b7012127c175c72ce1a012` |
| `tests/offline/browser/guest-compatibility-native.py`   | `ec0134f9c631a608097782c284548c663e4799da99149d8b360e744c0a694f9a` |
| `tests/offline/outbox-guest-compatibility.test.ts`      | `d8379ddca78c6ac33f497138c72858e15fb234657072d80c01819ef6cc488852` |

تقرير E محفوظ حرفيًا، وبصمته: `65ac3d9e88c6a8c81504c6fcf5346d4bd616495bec9aad349d6ec66b04f2d75a`.

## إزالة Observer دون حذف بيانات

يمكن إزالة import/prop وبدايات/نهايات المراقبة وcatch الخاصة بها، وإعادة صيغة await الأصلية وdependency arrays للدالتين، ثم حذف helper/tests الخاصة بها في Commit عادي مع مراجعة diff. لا إزالة أي منطق مصادقة/تنظيف بيانات، ولا clear Storage/IDB أو تغيير source/anchor/journal؛ لا توجد سجلات observer تحتاج ترحيلًا أو حذفًا.

البناء العادي أصلًا يرفض injection ولا يحتاج أي switch لتعطيلها. لا تُفعّل في Production، ولا تجعل إزالة instrumentation ذريعة لاستعادة نقل Guest غير معتمد.

## CLOSE

الحفظ المأذون: Commit واحد بمسارات F-01 الأربعة وتقرير E غير المعدّل فقط، باستخدام git add صريح؛ ثم Push لفرع العمل. hash والنتيجة يسلمان بعد التنفيذ. لا خطوة إضافية بعد التسليم.

**Guest Handoff NO-GO؛ P1-06/P1-04/P1-05 OPEN؛ V18 HOLD.**
