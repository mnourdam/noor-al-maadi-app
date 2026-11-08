# V18-01A — P1-05A-02: Production Profile Writer Fencing & Reconciliation Safety

## القرار وحدود التسليم

**GO محدود لحفظ hardening إنتاجي مستقل للـsnapshots والعمليات المقبولة داخل السياق، وAccount async chains والقراءات التشخيصية. ليس GO لعقد writer coverage الشامل أو authority cutover أو Atomic Settlement؛ P1-05 يبقى OPEN.**

الفرع v18-01a-outbox-recovery وHEAD الابتدائي 6cd0244ad4cf9de77e2e4d73662ca7e367d07a3a مطابقان. الملفات المتتبعة نظيفة قبل البدء. الأدلة المحلية التسعة (B الخمسة، تقرير C-01/32 اختبارًا، تقرير A-01/14 اختبارًا) وتقارير التدقيق السابقة حُفظت ببصمات قبل/بعد؛ لا تغيير لها.

هذا تحسين جزئي حسب البندين 6 و12، لا ادعاء بإغلاق كل مطلب. لا تشغيل Settlement أو Writer Fence القديمة أو import V17 أو appliedGrants/delivered أو أسعار/مكافآت جديدة. المصدر الاقتصادي الحالي لم يُستبدل. الخدمات الحقيقية/Production لم تُستدعَ.

## AUDIT → RISK → MINIMUM FIX

رُوجعت profile/account/cloud-save/social، owner/reset/partition، rewards database/transaction/settlement/writer-fence، الأدلة المحلية، وتقريرا 3B-2C/2E. شمل التدقيق setProfile المباشرة، reducers/مكافآت/شراء/قلوب/cooldowns، hydrate وpersistence وidentity، callbacks بعد Streak/avatar، account session/auth/hydration/debounce/reconnect/realtime/signOut، ومداخل Cloud Save/public stats.

المخاطر المثبتة:

1. profileOwnerRef mutable قد تتغير بينما effect تحمل قيمة قديمة؛ UID وحده لا يكشف ABA.
2. قبول setProfile قبل تأخر React ليس فحصًا وقت تنفيذ updater.
3. Account كانت تستخدم profileRef الأحدث لكتابة تالية من طلب قديم، أو تبدأ طلبًا جديدًا بعد await دون فحص الجيل.
4. فشل fetchCloudSave كان يُعاد null، فيُفسر كعدم وجود ملف ثم يُسمح بعمل seed.
5. pushPublicStats لديها await داخلي لحساب completion count، ثم RPC بلا تحقق من owner/session/revocation.
6. تشخيص mapKey في partition يقرأ المفتاح المنطقي عبر getItem المغلفة، فيعيد جدولة التشخيص بلا نهاية. أثبت Chromium تعليق الصفحة قبل أول render؛ ليس مجرد حد ذاكرة صغير.
7. البيانات التاريخية ونتائج الخادم المطلقة لا تحمل inclusion/revision اقتصادية تربطها بكل local grant. لهذا لم تُغير سياسات الأرقام أو يُنشأ اقتصاد IDB.

الحد الأدنى: frame محلي مرتبط بالهوية، admission/deferred checks، scopes لطلبات Account والعمليات الداخلية، منع القراءة الفاشلة من التحول إلى seed، وكسر re-entry في التشخيص. لا CAS محلية مزعومة ولا توسيع قواعد التسليم.

## ما تغيّر في ProfileProvider

استُورد useProfileWriter فعليًا من profile.tsx. كل مسارات setProfile الحالية تمر الآن عبره؛ ليست مكتبة غير مستخدمة.

كل frame تحتفظ خارج ProfileState بـowner/epoch/generation/revision/snapshot Symbol، وقيمة الملف، وحالة read validity وطلب persistence. لا metadata جديدة داخل JSON/V17. القراءة السليمة لا تعيد كتابة الملف عند mount؛ native Chromium أثبت تطابق bytes قبل/بعد hydration. initial المؤقتة لا تُكتب.

قبول تعديل يثبت سياق الاستدعاء، ويفحصه قبل جدولة state ومرة أخرى **داخل updater**، بما في ذلك هوية frame السابقة وgeneration. revisions ترتفع داخل الحساب من previous frame؛ الزيادتان النسبيتان في tick واحدة لا تلغي إحداهما الأخرى. cleanup/identity hydration/explicit reset تُبطل أجيال العمل السابقة.

persistence effect تخص frame نفسها؛ تتحقق من أحدث render frame ومن owner/epoch/generation قبل setItem. لا تعيد تعريف مالك snapshot بواسطة ref متغيرة. getPersistence تعرض نسخة metadata: owner/epoch/revision/snapshot وunwritten/written/failed/unresolved. written تعني رجوع setItem للنسخة المقصودة، **لا fsync/force-stop أو grant inclusion أو delivered**. نتيجة فشل بعد كتابة فعلية لا تثبت rollback؛ اختبار lost-ack ينفذ write ثم throw ويثبت ذلك.

corruption وSecurityError والبيانات الاقتصادية غير المقروءة لا تسمح بكتابة seed أو تعديل مخزن فوق الأصل. initial تبقى placeholder العرض القديمة، وgetPersistence=unresolved؛ ليست رصيدًا موثوقًا. trySpendDinars لا تؤكد reservation لن تُطبق في هذا الوضع. الملف الأصلي لا يُحذف. حالة guest-pollution أصبحت quarantine بلا حذف؛ لا نسخ أو handoff بين الملاك.

async Profile operations (avatar، claimed-Streak hydration، recordStreakActivity) تثبت scope قبل الانتظار، وتتحقق بعد module/session/RPC waits وقبل التطبيق، وداخل updater عند الحاجة. sessionCurrent تربط SDK session كذلك بمالك/epoch render الذي أنشأ الدالة؛ callback async محتفظة من قبل ABA لا تبدأ RPC جديدة. Streak ترفض absolute totals إذا قُبلت كتابة محلية أخرى أثناء الانتظار، دون حساب تعويض أو اختيار Math.max جديد. سجل القبول يُزاد خارج updater، فلا يُعاد إنشاؤه من StrictMode replay؛ تحديث سابق مقبول في tick نفسها لا يفسد صلاحية النشاط لمجرد أن React عرضته لاحقًا.

## عقد revision — وما لا يثبته

| الحقل/الدليل        | الضمان                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| owner/epoch         | سياق namespace الحالي عند قبول/إنشاء frame؛ ليس إثبات ملكية تاريخية قبل ترحيلات قديمة |
| generation          | عمر hydrate/reset/mount داخل provider؛ يبطل العمل المقبول القديم                      |
| revision            | ترتيب frames داخل **instance واحدة** فقط؛ ليس إصدارًا عالميًا في localStorage         |
| snapshot Symbol     | هوية frame داخل الذاكرة؛ لا تصلح كإيصال قابل للاستعادة بعد crash                      |
| admission sequence  | يكشف كتابة محلية قُبلت أثناء انتظار Streak؛ ليس applied grant key                     |
| persistence outcome | نتيجة استدعاء write محددة؛ ليست settlement أو إثبات إدراج منحة                        |

لا timestamp CAS ولا Web Locks ولا read-check-write يُسمى معاملة. لا conflict serialization بين provider آخر أو تبويب أو عميل قديم. اختبار Chromium بتبويبين **أعاد إنتاج** overwrite لمصدر قديم لنفس المالك، لذلك global exclusion غير مثبت وغير مفعل.

الأهم: unversioned APIs القديمة لا تحمل سياق بدء request الخارجي. استدعاء raw addPoints أو replaceProfile أو applyServerStats **لاحقًا** من callback خارج الحدود المجهزة قد يُقبل كعملية جديدة، ولا تستطيع metadata استنتاج مصدره. هذه تختلف عن عملية قُبلت ثم تأخر updater/effect الخاص بها، وهي محمية الآن. الاختبارات الـ14 المحمية لا تزال تثبت بعض هذه المخاطر صراحة. إغلاقها جميعًا يحتاج عقد caller/token عبر بقية المداخل وتحديثًا معتمدًا لدور reproductions التاريخية؛ لم يُدّعَ إنجازه بترقيم العمليات المحلية.

## ما تغيّر في AccountProvider

accountOperation مستخدمة إنتاجيًا في account/cloud-save/social؛ تثبت owner/epoch/uid، مع mount lifetime وeffect cancellation/request tokens عند المستدعي. hook الهوية يعيد تشغيل reconciliation عند جيل هوية جديد حتى لو عاد UID نفسه، دون اعتبار duplicate auth event انتقالًا جديدًا تلقائيًا.

account metadata نفسها في frame مرتبطة owner/epoch، وsetAccount تفحص السياق داخل updater. initial getSession لا يتجاوز auth event أحدث. reset continuation القديمة لا تنظف pending state لسياق أحدث. لم يُغير signIn/signUp/email-observer sequence أو Google PKCE؛ مقاطع SDK/auth الطلبية قورنت حرفيًا بـHEAD.

- **hydrate:** انتظار readiness مع scope؛ فحص قبل/بعد fetchs وكل continuation. sourceProfile ثابتة للطلب؛ تغيّرها أثناء fetch يمنع merge/seed ويُسجل offline-local بسبب profile-revision-unresolved.
- **read failure:** fetchCloudSave/fetchAccountProfile failures لا تصبح absence. SDK session UID تُفحص قبل عمليات الحساب وبعد الانتظار. owner mismatch لا يُعاد كملف مفقود يسمح بالتصفير.
- **legacy owner marker:** تعارض prev user مع المستخدم الحالي لا يحذف Profile أو refclaim ولا يعمل reset/seed؛ يحفظ bytes ويوقف seeding بسبب profile-owner-unresolved.
- **unreadable local:** لا seed أو merge فوق أساس مجهول؛ boot يصل لحالة offline-local بسبب profile-read-unresolved، وليس loading إلى الأبد. offline-local هنا readiness للعرض، لا baseline اقتصادية.
- **debounce/manual sync/reconnect:** outgoing snapshot واحدة immutable؛ بعد كل await تُفحص الهوية والمراجعة المحلية قبل بدء write أخرى. تغيير profile أثناء push يمنع public-stats القديمة ويترك النتيجة unresolved، ولا يزيل local-change guard كأن الأحدث تزامن.
- **public stats:** guard المستدعي يمتد إلى داخل انتظار canonical-count ثم إلى ما قبل RPC. pinned input وSDK UID/epoch تحمي من session-reset lag. القيم وRPC payload/تعريفه لم تتغير.
- **syncing/single-flight UI:** ticket خاصة بكل محاولة؛ finally القديمة لا تزيل busy لمحاولة أحدث. لا ادعاء بإلغاء RPC سابقة بدأت.
- **cold stats/realtime:** owner/epoch/effect lifetime وsnapshot للطلب البارد، مع الإبقاء على guard الأربع ثواني القديمة كقاعدة توافق، لا proof اقتصادية.
- **signOut:** final push مثبتة؛ تبديل الهوية أو تغير profile أثناء انتظارها يمنع write تالية/خروجًا هدّامًا فوق snapshot لم تُزامن. الخروج السليم ما زال يرسل قبل reset وSDK signOut. pending Outbox تُحفظ، والـtimeout لا يلغي عملًا أصليًا.
- **soft reconciliation timeout:** late callbacks لا تتجاوز المالك/الجيل/lifetime؛ التأخر لا يعتبر cancel.

سياسة حالات unresolved محافظة: لا تعويض أو رصيد تخميني. ممكن أن يعود manual sync=false أو تُلغى سلسلة signOut قبل اكتمالها إذا تغيرت snapshot؛ يمكن إعادة المحاولة من الحالة الحالية. الطلب الأول ربما التزم بالفعل في الخادم، فلا تُفسر false/obsolete بأنها rollback.

## سياسة المصادر والمصالحة الاقتصادية

A — profiles السلطوية: لا math جديدة. استقبالها ضمن سياق حي وknown request snapshot؛ لو تغيّر المحلي أثناء الطلب يُرفض known stale result. payload بلا inclusion/revision لا يؤسس baseline.

B — Cloud snapshot: لا تتقدم على أحدث local operation المعروفة خلال fetch. mergeCloudSave الخام ما زالت تحت قواعد التوافق القديمة، ومنها numMax؛ لم تُختر قاعدة اقتصادية بديلة أو الأعلى كحل جديد.

C — Local snapshot: القراءة السليمة تعني readable، لا trusted economic origin أو استحقاقًا لمكافأة.

D — Pending gameplay: Outbox/claim/progress لا تتحول إلى delivered. هذه الدفعة لا تصلح claim/crash أو ربط مكافأة الحملة بالتأكيد.

E — التاريخ غير المثبت: legacy_unknown مفاهيميًا كما في تقارير الأهلية؛ لا استيراد/تعويض أو تصنيف تلقائي due/delivered. الملف بلا revision لا يصبح جديدًا ولا تُستبدل قيمته بـseed.

قواعد الأسعار والمستوى/full-half-min وchapter/campaign caps وMemory Review والقلوب/math/regen لم تُعدل. ترفض الحماية سياقًا قديمًا أو غير مقروء؛ لا تغير قيمة المنحة المقبولة. لم يُعد تنظيم Cloud Save transport أو deploy لها أو تعديل SQL/RPC.

## الاختبارات القديمة والجديدة — القراءة الصحيحة للنتائج

- **14 P1-05A-01:** الملف byte-identical. PASS يعني أن reproductions الخاصة بالـraw APIs/المصالحة غير المحسومة ما زالت قابلة للرصد؛ ليس دليلًا أن كل خطر فيها عولج. retained raw callback استُدعيت بعد switch، same-owner raw stats، raw merge/replace، وprovider ثانية ما زالت حدودًا صريحة.
- **32 C-01:** byte-identical. queued campaign grant وclaim/crash/backfill تبقى مخاطر مثبتة. لم تتغير claims لتجميل البوابة.
- **39 Email Observer:** نفس assertions والمصدر الإنتاجي؛ أضيف exportان فقط إلى mock owner لدعم imports الجديدة getIdentityEpoch/onOwnerChange. ليست إضافة مراقبة أو تغيير رسائل/منطق المصادقة/Handoff.
- **اختبارات جديدة:** أربع مجموعات على الكود الإنتاجي الفعلي، بلا نظام اقتصاد تجريبي. ProfileProvider/AccountProvider حقيقيان؛ الشبكة/SDK والخدمات الثانوية وهمية، والجدولة deferred/transition/timers محكومة.

### مصفوفة قبول النطاق وحدوده

| المطلوب                          | الدليل                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1–3 update/logout/ABA/old effect | transition + identity hydration، layout-switch قبل passive effect، scopes قبل/بعد RPC وداخل updater                            |
| 4–5 hydration                    | قراءة synchronous interrupted بهوية أخرى؛ hydrate هوية جديدة دون temporary initial write. لا ادعاء أن localStorage نفسها async |
| 6–8 StrictMode/batching/tick     | قيم XP والدنانير تحفظ معًا، revisions محلية، hydrate لا يعيد كتابة bytes                                                       |
| 9–12 stale cloud/stats/push      | queued cloud result بعد debit، cold stats بعد reward وخارج time-window، snapshot واحدة للطلب ومنع write تالية قديمة            |
| 13 realtime                      | callback قديمة بعد ABA لا تطبق بيانات                                                                                          |
| 14 reconnect                     | flush قديمة لا تبدأ cloud push لحساب آخر                                                                                       |
| 15 final signOut                 | happy path محفوظ؛ identity/profile change أثناء final push توقف السلسلة القديمة                                                |
| 16 reset/callback                | explicit reset يبطل Profile RPC أقدم؛ raw callback جديدة الاستدعاء بلا token ليست مغطاة كإنشاء قديم                            |
| 17/24 contexts/tabs              | القديمة ما زالت repro، وChromium بتبويبين يثبت overwrite الممكن؛ لا global CAS                                                 |
| 18–20 quota/Security             | لا written كاذبة؛ read failure يحتفظ بالملف؛ write ثم throw لا يُعتبر rollback                                                 |
| 21–23 V17                        | valid file بلا metadata لا يُعاد كتابته عند hydrate، لا schema/seed فوق فساد، ولا baseline creation                            |
| 25 Locks                         | native بدون navigator.locks: local-only يعمل؛ لم يُنتخب Web Locks protocol ولا fallback CAS                                    |
| 26 timeout/late                  | soft timeout ثم تبديل هوية؛ late response لا تعتمد. lost-ack write bytes قد تكون موجودة رغم failure                            |
| 27 unmount                       | transition أو push مؤجلة لا تتجاوز lifetime                                                                                    |
| 28 decrement                     | debit مشروعة لا تستعاد من incoming cloud المتأخرة ضمن chain المحمية                                                            |
| 29 replay                        | لا grant API أو تغير claim/reward idempotency؛ القديم باقٍ في C-01، لا ضمان exactly-once جديد                                  |
| 30 Settlement                    | spy لا indexedDB.open للـprovider + native database list بلا Settlement؛ src/lib/rewards بلا diff                              |

التشغيل الكامل الأول بعد إضافة فحص SDK كشف فشل حالتي Streak في gameplay-ui: mock owner يعيد u1 بدل user:u1 رغم جلسة user id=u1. صُححت صيغة mock فقط، دون Assertions؛ التشغيل الموجه أعاد نجاح العشرة. لا يسجل التشغيل الفاشل PASS.

التصحيحات أثناء الاختبار: نموذج signOut الأول استعمل guest:fixture بدل guestOwnerKey الحقيقية فرفضته الحماية؛ صُحح harness فقط. test web switching اختار marker namespace اصطناعيًا بدل إبقاء marker Alice تحت Bob في Web Storage الخام؛ لم يُخفف فحص المصدر المختلف (له اختبار مستقل). source update أثناء upload صار يمنع كتابة ثانية بدل مجرد إرسال النسخة المثبتة القديمة. أضيفت assertions بدء RPC قبل إطلاق deferred responses لمنع tests تمر بلا ممارسة المسار.

## Chromium الأصلي وheap

ProfileProvider وProfileWriter وowner/partition حقيقية في fixture على أصل localhost معزول. services وdiagnostics وعمليات async غير المستهدفة (Streak/avatar/reset transport) وهمية؛ لا origin تطبيق أو بيانات لاعب، وكل الطلبات الخارجية ممنوعة.

قبل إصلاح partition: المستند وfixture.js وصلا بنجاح؛ توقف التنفيذ بعد install/seed وقبل أول React render. mapKey تُجدول callback تقرأ logical key عبر wrapper، فتُجدول callback مماثلة بلا نهاية. ربط القراءة التشخيصية الحالية بـwithoutMapping السريعة/read-only قطع هذه السلسلة. لا تغيير mapping أو migration أو owner data أو إزالة مفاتيح.

اختبار unit جديد يحد logical reads بـ64 ليحوّل regression إلى failure محددة بدل OOM، ويثبت أقل من32 قراءة مع hydrate/write حقيقيتين. Chromium بعد الإصلاح أتم خمس حالات: bytes hydration، stale-owner passive write، **repro cross-tab unsupported**، غياب Web Locks، وعدم فتح Settlement؛ صفر page errors وexternal requests. لا claims Android/WebView أو force-stop، وorderly close ليست force-stop.

الذاكرة الحالية: cgroup limit 34,359,738,368 bytes (32 GiB)، وMemAvailable عند البداية 34,135,224 KiB على المضيف (حد cgroup هو الأقل). Node heap limit 4,496,293,888 bytes لكل العملية؛ لم يُرفع. Vitest maxWorkers=2. فحوص test/type/build أطلقت كأوامر مستقلة بالتوازي أثناء بعض التحقق؛ الموارد المقاسة أدناه من أمر اختبار واحد مع عماله، وليست مجموع peak لكل الأوامر. لا استبعاد suites أو خفض assertions لإخفاء المشكلة.

سجلات heap الأصلية من البيئة السابقة لم تكن موجودة في /tmp الجديدة؛ مرجعها التقرير المحلي المحمي A-01 (OOM مرتان، لا PASS). نعيد هنا إثبات re-entry والتعليق في native، ثم نجاح المسار بعد fix؛ لا نقول إن كل OOM تاريخية أو Bun Identity لها السبب نفسه. fallback raw-storage harness السابق ليس بديلًا عن التحقق الأصلي المنفذ هنا.

تعثر البنية والتحميل الأول في fixture كان منفصلًا: عُزلت imports غير المستهدفة التي تحتاج TanStack entry أثناء build؛ رفض sandbox loopback تطلب تشغيل الاختبار المحدد بـrequire_escalated. رفض auto-review مرة أمر edit+run لأنه اعتبر الملف دليلًا محميًا؛ git ls-files والبصمات أثبتت أنه diagnostic جديد، ثم قُبل run-only المحدد. لا تخطٍّ للـProxy/قيود الشبكة أو إذن دائم.

## نتائج البوابة النهائية

| الفحص | النتيجة |
| --- | --- |
| npm run test:outbox من الجذر | PASS: 906/906، 33 مجموعة؛ Vitest 51.23s |
| البوابة دون تشخيص B: npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts | PASS: 905/905، 32 مجموعة؛ 38.14s |
| المرجع GitHub + الأدلة المحلية + الجديد | 802 + 32 C-01 + 14 A-01 + 57 جديدة = 905؛ B التشخيصي = 1 إضافية |
| الجديد على Profile / Account / transport / partition | 23 / 20 / 13 / 1 = 57 PASS |
| 14 A-01 و32 C-01 و39 Observer و10 gameplay UI | PASS، assertions لم تتغير؛ بقاء reproductions كما شُرح أعلاه |
| Chromium أصلي مع actual Profile + partition | PASS للنطاق المحدود: 5 حالات، Chromium 151.0.7922.173، لا external requests/page errors؛ cross-tab failure reproduced عمدًا |
| npm run typecheck:outbox | PASS: tsc العام ثم tsconfig.outbox، exit 0 |
| npm run build | PASS، client/SSR/Nitro؛ warnings deprecation/dynamic imports القائمة، بلا deploy |
| git diff --check، وفحص staged/new files | PASS: tracked + new files؛ أعيد فحص staged قبل Commit |

تشغيل test الكامل النهائي خرج 0، الزمن المقاس للأمر مع العمال 52.42s، وأعلى RSS لعملية ابن واحدة 415,844 KiB (ليس مجموع الذاكرة). maxWorkers=2، لا تغيير heap/config أو Assertions، ولا OOM في التشغيلين الكاملين الناجحين. تشغيل 903 PASS +2 fail السابق كان mock contract failure موثقًا وليس نجاح بوابة.

Bun Identity الأصلي غير محسوم ولم يحسب PASS. Android/force-stop PENDING؛ لا adb متاح في PATH ولم تُشغل اختبارات Android. لا إعلان توافق WebView اعتمادًا على Chromium المكتبي.

## الملفات والحماية

إنتاج:

- src/lib/profile-writer.ts، src/lib/profile.tsx.
- src/lib/account-operation.ts، src/lib/account.tsx.
- src/lib/cloud-save.ts، src/lib/social.ts.
- src/lib/identity/partition.ts — diagnostic reads فقط.

اختبارات:

- outbox-profile-writer-fence.test.tsx.
- outbox-account-writer-fence.test.tsx.
- outbox-cloud-writer-fence.test.ts.
- outbox-profile-partition-diagnostics.test.tsx.
- outbox-auth-transition-observation.test.tsx — exportان في mock الهوية فقط.
- outbox-gameplay-ui.test.tsx — تصحيح getActiveOwner في mock إلى user:<uid> فقط؛ Assertions العشرة دون تغيير.
- browser/build-profile-writer.mjs، profile-writer-fixture.tsx، profile-writer-native.py.
- التقرير الحالي.

لا package/config أو schema أو rewards/settlement/Writer Fence source changes. قصص/تحقيقات/Guest Handoff/Email Observer production لم تتغير. SDK signIn/signUp ومقطع Email Observer في account قورنت حرفيًا بـHEAD. تسعة الملفات المحلية والتقارير السابقة ثابتة SHA-256 قبل/بعد، وخارج Commit؛ لا git add عام/reset/clean/stash.

## ما بقي مفتوحًا ولماذا لا baseline/Atomic Delivery

لا authority cutover أو trusted baseline، ولا global exclusion/actual CAS أو durable revision بعد restart. تدخل raw APIs غير المجهزة والمتعارضات بين التبويبات والعميل القديم ما زالت تحتاج عقودًا ومستهلكين ملزمين بها. writer receipts المحلية ليست delivery evidence. الأرصدة السلطوية المطلقة/Cloud Save لا تتضمن مفاتيح local grants الداخلة فيها، فلا تعويض/Math.max جديد.

نحتاج قبل التسليم الذري: reviewed caller-token contract لبقية الكتاب، serialization/lease enforcement مع سياسة old clients، baseline provenance وserver inclusion/reconciliation، ثم intent/economy/applied/delivered داخل معاملة واحدة. لا يمكن استعمال نجاح هذه الحماية الجزئية لتفعيل Foundation.

التراجع: revert عادي للمسارات الجديدة/الربط بعد مراجعة، بلا clear storage/DB أو مسح بيانات. لا metadata دائمة أضيفت حتى تحتاج ترحيلًا؛ لا يُعاد حذف الملفات الفاسدة أو تفسيرها initial، ولا يُفعّل كاتب قديم فوق سلطة IDB (غير مفعلة أصلًا).

**CLOSE: hardening محدود قابل للمراجعة والحفظ فقط. P1-04/P1-05/P1-06 OPEN؛ Guest Handoff NO-GO؛ V18 HOLD.** Commit واحد بالمسارات السبعة عشر المعتمدة فقط عند اكتمال البوابة، ثم Push إلى فرع العمل وتوقف.

## بصمات الأدلة المحلية المحمية

فحصت 40 ملفًا من الأدلة والتقارير السابقة بلا اختلاف. التالية SHA-256 قبل/بعد للملفات المحلية التسعة؛ لم تُضمّن في Commit:

| الملف | SHA-256 قبل العمل | بعد العمل |
| --- | --- | --- |
| `docs/audits/v18-01a-p1-06b-guest-compatibility.md` | `316a069672eaca880b17e80253e7cdcf9b4fcd41a7ee009579964dc91efdb370` | مطابق |
| `tests/offline/browser/build-guest-compatibility.mjs` | `283907793707d08583fcdc2bfa58db20e23d11606acbefb0d995b7264b62993f` | مطابق |
| `tests/offline/browser/guest-compatibility-fixture.tsx` | `96c3d160f19112780c03a6fa39c7b186c6faadead4b7012127c175c72ce1a012` | مطابق |
| `tests/offline/browser/guest-compatibility-native.py` | `ec0134f9c631a608097782c284548c663e4799da99149d8b360e744c0a694f9a` | مطابق |
| `tests/offline/outbox-guest-compatibility.test.ts` | `d8379ddca78c6ac33f497138c72858e15fb234657072d80c01819ef6cc488852` | مطابق |
| `docs/audits/v18-01a-p1-04c-01-campaign-boundary.md` | `074ff8d418589512e5401e8aaa6b1cdf31a8b6e8e7f6823e7a7a0ec789b19a19` | مطابق |
| `tests/offline/outbox-campaign-boundary.test.tsx` | `b26a8d506d6a54b1c7019a87ee640f3bf162a2e1943e4c6891ceeee8db6153c8` | مطابق |
| `docs/audits/v18-01a-p1-05a-01-real-settlement.md` | `324c98c570a29b3d7bd7f109343067299bac73fdedf8f5323f963e37fd10866c` | مطابق |
| `tests/offline/outbox-real-profile-authority.test.tsx` | `26231ae26edf64d21628682e0b71473bc511c4bcb7a8943b1e42a22958b2f077` | مطابق |
