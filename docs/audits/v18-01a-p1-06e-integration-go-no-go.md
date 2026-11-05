# V18-01A — P1-06E

## Production Integration Readiness — GO / NO-GO Audit

التاريخ: 2026-11-05، Asia/Damascus. الفرع `v18-01a-outbox-recovery`.
HEAD المتحقق: `c1749e2b5f830dee4e814b9aa343faa606ecadac`.

**AUDIT → RISK → DECISION → CLOSE. لا IMPLEMENT أو Commit أو Push. P1-06/P1-04/P1-05 OPEN؛ V18 HOLD.**

## القرار التنفيذي

**NO-GO لربط Handoff الحقيقي بتسجيل الدخول الآن. GO لدفعة إنتاجية واحدة معطلة افتراضيًا، لمراقبة مدخلي تسجيل الدخول/إنشاء الحساب بالبريد فقط، دون capture أو enrollment أو source binding أو قراءة تقدم أو أي نقل.**

هذا GO محدود لاقتراح التنفيذ التالي، وليس تصريحًا بالتنفيذ في هذه الجولة أو تشغيل flag أو تفعيل Handoff. تسجيل الدخول الحالي يستمر بوظيفته المعتادة؛ NO-GO في هذا التقرير يخص إلحاق تقدم الضيف به، لا منع البريد أو Google أو استعادة جلسة صحيحة.

أسباب NO-GO مثبتة من الكود، ولا يحلها نجاح المتاجر المعزولة:

1. لا سلطة enrollment إنتاجية تثبت بداية مصدر موثوق أو تحسم V17/إعادة التثبيت/فقد الأدلة؛ العقد الحالي يقبل إذن fixture اصطناعية فقط.
2. لا Auth Adapter إنتاجي يربط source/transition/attempt/session continuity بنتيجة SDK. events الحالية وGoogle intent لا تحمل ذلك الدليل.
3. مسارات boot/auth القائمة قد تنقل legacy globals إلى المالك النشط، ثم تعمل promotion قديمة مستقلة عن Handoff الجديد. تفعيل مسارين فوق بعضهما لا يثبت حفظ بيانات V17 أو عدم النقل غير المقصود.
4. profile seeding/cloud reconciliation مستقلة عن buffer وعن journal؛ لا يجوز اعتبار نقل progress «بلا اقتصاد» لمجرد أن Handoff نفسه لا يستدعي grant.
5. Android/force-stop وBun Identity من الجذر غير محسومين، وfixtures القديمة الستة غير متوافقة؛ لا دمج لها في رقم نجاح واحد.

## 1. المرجع وطريقة التدقيق

تحقق HEAD/branch وGit Status أولًا. tracked كان نظيفًا؛ خمس ملفات P1-06B غير متتبعة، وطوبقت بصماتها قبل وبعد التدقيق. قُرئت تقارير [P1-06C](./v18-01a-p1-06c-guest-handoff-contract.md) و[D-01](./v18-01a-p1-06d-01-handoff-foundation.md) و[D-02](./v18-01a-p1-06d-02-source-adapter.md) و[D-03](./v18-01a-p1-06d-03-transition-coordinator.md) و[D-04](./v18-01a-p1-06d-04-anchor-recovery.md)، وحزمة guest-handoff كاملة، وaccount/identity/guest storage/buffer/native auth ومسارات العودة.

أُجري بحث مرجعي محلي وقراءة كود وفحص أدوات متاحة فقط. لم تُقرأ قيم أسرار أو جلسات فعلية، ولم يُستدع SDK أو بريد أو Supabase أو endpoint منشور، ولم ينفذ SQL أو أي تدفق مصادقة. لم تُعد تشغيل unit suites أو Chromium أو Bun أو build في هذه الجولة؛ نتائج الاختبارات أدناه **سوابق D-04/P1-06B المعتمدة كما في تقاريرها، وليست نتائج تشغيل E**.

## 2. خريطة مسارات الكود ومصادر الحقيقة

| المصدر الفعلي                                                                                                                                        | ما يثبته وما لا يثبته                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [auth.tsx:243](../../src/routes/auth.tsx#L243) → [account.signUp/signIn:546](../../src/lib/account.tsx#L546)                                         | مدخل البريد الفعلي، قبل SDK. signIn يعيد ok/error ويتجاهل data في الواجهة؛ لا transition ID أو source snapshot.                                                |
| [cloud-save.signUpWithEmail:161](../../src/lib/cloud-save.ts#L161)                                                                                   | default الكود `VITE_AUTH_EMAIL_MODE=custom`: طلب dispatch ثم user/session=null. non-custom يستدعي SDK.signUp وقد يعيد جلسة أو لا. لم تُفحص قيمة النشر الفعلية. |
| [auth-emails:33](../../src/lib/auth-emails.ts#L33)                                                                                                   | رابط تحقق بريد web أو bounce native؛ يمكن فتحه على جهاز آخر. dispatch نجح لا يعني تسجيل الدخول أو أن callback من نفس Guest.                                    |
| [account auth listener:92](../../src/lib/account.tsx#L92)                                                                                            | كل حدث يمر إلى resetForIdentityChange؛ setUser يحدث دون انتظار انتهاء reset. لا receipt تربط الحدث بطلب بريد/Google أصلي.                                      |
| [reset:42](../../src/lib/identity/reset.ts#L42)                                                                                                      | readiness=false، انتظار cleanup/cancelQueries، ثم swap في السطر 76، ثم invalidation/event/readiness. idempotent للمالك المهيأ نفسه؛ لا إصدار receipt للمحاولة. |
| [owner:34](../../src/lib/identity/owner.ts#L34)                                                                                                      | deviceId قد يُولد best effort إذا غاب. epoch عداد ذاكرة؛ boot قد يستنتج User من جلسة مخزنة قبل UI. لا human identity أو fresh-install proof.                   |
| [router:2](../../src/router.tsx#L2) و[android-client:1](../../src/android-client.tsx#L1)                                                             | Partition تثبت مبكرًا. user boot قد لا يمر بسياق Guest مرئي أصلًا. لا يمكن استعادة آخر Guest باستنتاجه بعد INITIAL_SESSION.                                    |
| [partition:156](../../src/lib/identity/partition.ts#L156)                                                                                            | migration تضع global personal keys في مساحة مالك boot، وتزيل الأصل؛ flag المكتوب اسم owner وليس provenance بشرية أو installation receipt.                      |
| [GoogleSignInButton:46](../../src/components/GoogleSignInButton.tsx#L46)                                                                             | يبدأ Google من auth route أو FirstLaunchGate. onBeforeRedirect الحالية تنظيف UI، ليست hook awaited لحفظ source.                                                |
| [native-auth:96](../../src/lib/native-auth.ts#L96)                                                                                                   | native PKCE منفصل، Browser.open بعد حفظ verifier. trace owner/epoch تشخيصية، لا evidence للمصدر/نية Handoff.                                                   |
| [native callback:293](../../src/lib/native-auth.ts#L293)                                                                                             | exchange ثم bridge إلى main client. callId عداد ذاكرة، replay marker بصمة code/URL لا source/transition/UID receipt.                                           |
| [recoverExistingSession:523](../../src/lib/native-auth.ts#L523)                                                                                      | يقبل main session موجودة، أو يجسر native session عند فشل exchange. قد يكفي للمصادقة العادية، ولا يثبت أنها جلسة محاولة Guest الأصلية.                          |
| [Google intent:52](../../src/lib/googleAuthResult.ts#L52)                                                                                            | قيمة signin/signup best effort تُستهلك وتُحذف. لا nonce/source/hash، ومعيار created_at≈last_sign_in_at لواجهة النتيجة لا يثبت ملكية/تثبيتًا جديدًا.            |
| [previewAuthStorage:63](../../src/integrations/supabase/previewAuthStorage.ts#L63)                                                                   | preview قد يأخذ الجلسة من broker خارج هذا الإطار. قراءة raw local session وحدها لا تثبت أن المستخدم بدأ محاولة Guest هنا.                                      |
| [guest-progress-buffer:219](../../src/lib/campaigns/guest-progress-buffer.ts#L219)                                                                   | wrapper يفحص current user owner ثم يقرأ **مساحة ذلك المستخدم**، لا guest المصدر. لا يحل cross-owner handoff.                                                   |
| [anchor-adapter:28](../../src/lib/campaigns/guest-handoff/anchor-adapter.ts#L28) و[journal:15](../../src/lib/campaigns/guest-handoff/journal.ts#L15) | test namespaces مفروضة. لا يجوز تغيير الاسم وتشغيلها على اللاعبين باعتباره integration جاهزًا.                                                                 |

**تغطية مداخل أخرى:** AdminLoginForm يستدعي SDK.signInWithPassword مباشرة ([admin-guard:158](../../src/lib/admin-guard.tsx#L158))، وwrapper Lovable OAuth قادر على setSession، لكن البحث لم يجد caller حاليًا له في src. password recovery/magic links/email verification والأحداث USER_UPDATED ليست طلبات تبني Guest. لا يُفتح capture من listener عام لتغطية المداخل غير المراقبة بالتخمين.

**بدء SDK ليس حصرًا عند الضغط:** main client يُنشأ lazy عند أول وصول، مثل getSession في account:85، ثم قد يستعيد الجلسة ويجددها تلقائيًا. native client قد يبدأ التهيئة عند createClient:252 قبل طلب OAuth الصريح. المقصود بنقطة ما قبل signIn/signUp هو قبل **طلب تلك المحاولة**، لا افتراض أن SDK لم تعمل أو أن owner ما زال Guest.

## 3. مصفوفة المصادقة A–K — نقاط التنفيذ

«آخر Guest» أدناه نقطة **ممكنة** إن كان المالك Guest فعلًا؛ ليست ضمانًا لوجود Guest في جميع عمليات الدخول.

| الحالة                                   | البادئ وبدء SDK/الطلب                                                                                                                                                      | آخر نقطة Guest وreset الفعلي                                                                                                                               | موضع evidence الممكن لاحقًا                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A. Email sign-up                         | AuthPage.submit → AccountProvider.signUp؛ بعد validation يستدعي signUpWithEmail:550. custom يرسل طلب البريد، لا session في main SDK؛ legacy قد يشغل SDK.signUp.            | قبل 550 إن كان Guest. reset عند auth listener لاحق فقط إذا تكونت جلسة/عاد تأكيد البريد؛ قد يكون على جهاز آخر.                                              | قبل الطلب source observation؛ durable candidate لاحقًا بعد enrollment. لا تحويل «أرسل البريد» إلى verified target. |
| B. Email sign-in                         | AuthPage → AccountProvider.signIn:585 → SDK.signInWithPassword.                                                                                                            | قبل 586؛ auth callback قد يبدأ reset قبل رجوع Promise إلى signIn. آخر hook عام داخل reset قبل السطر 76 يقع **بعد بدء SDK** وانتظارات reset.                | بداية محاولة واحدة قبل 586، ثم ربط نتيجة نفس Promise بـgetUser والجلسة الحالية وswap فعلي متحقق؛ غير موجود الآن.   |
| C. Google/PKCE                           | GoogleSignInButton من auth أو FirstLaunchGate. web: SDK.signInWithOAuth:94؛ native: إنشاء client في 134/252 ثم signInWithOAuth:157 بعد listener/storage self-test.         | قبل دخول handleClick إلى SDK/native helper؛ لا انتظار capture عبر onBeforeRedirect الحالية. reset بعد exchange/setSession عندما يرى AccountProvider الحدث. | سجل محلي قبل redirect، مرتبط بمقابلة SDK/PKCE للمحاولة نفسها، دون نسخ verifier/tokens إلى Handoff؛ غير منفذ.       |
| D. OAuth return بعد إغلاق الصفحة/WebView | web AuthCallbackPage exchangeCodeForSession:109، أو Capacitor appUrlOpen/getLaunchUrl → handleNativeAuthCallback.                                                          | بعد cold boot قد يبدأ owner كـUser من التخزين، أو Guest قبل bridge؛ لا نفترض أنه Guest الأصلي. reset عند main auth event.                                  | فقط سجل دائم سبق redirect مع receipt رجوع مرتبطة به. لا capture من callback الحالي أو اختيار «آخر ضيف».            |
| E. INITIAL_SESSION cold start            | SDK initialization وAccountProvider.getSession/listener.                                                                                                                   | Partition وboot-owner resolution قد اختارا User بالفعل. reset listener يهيئ المالك نفسه أو يبدله.                                                          | قراءة evidence موجودة والتحقق منها فقط؛ الحدث لا ينشئ نية أو source.                                               |
| F. TOKEN_REFRESHED                       | autoRefreshToken في main/native client؛ ليس click جديدة.                                                                                                                   | غالبًا User نفسه، reset يستدعى ويكون no-op إن مهيأ.                                                                                                        | تحديث تحقق جلسة قائمة فقط بعد إثبات continuity، لا انتقال جديد أو capture/consent.                                 |
| G. SIGNED_IN مكرر                        | SDK resume/bridge أو حدث آخر لنفس UID.                                                                                                                                     | if same initialized owner، reset no-op؛ account hotfix لا يخفض reconciliation عند نفس owner.                                                               | مطابقة receipt قائمة مرة واحدة؛ لا UUID أو owner epoch جديد لمجرد event.                                           |
| H. SIGNED_OUT                            | signOutFn أو SDK expiration/cross-context. signOutFn يحاول pushSave/public stats وlogout flush أولًا، ثم reset إلى Guest **قبل** cloudSignOut:640؛ listener قد يعيد reset. | Guest هو النتيجة، لا source مؤهل لمحاولة انتقال جديدة. epoch لا يزيد إذا كان swap الثاني لنفس المالك.                                                      | وقف صلاحية محاولات User، حفظ journal/anchor دون rebind. العودة Guest ليست شخصًا جديدًا أو إذن enrollment.          |
| I. Alice→Bob                             | طلب بريد/Google جديد، callback/bridge أو جلسة أخرى؛ admin/broker مداخل إضافية.                                                                                             | قد لا توجد Guest خطوة أصلًا؛ reset ينقل User A إلى User B.                                                                                                 | سجل محاولة User→User للتمييز فقط؛ يمنع تبني أي Guest قديم أو مصدر Alice.                                           |
| J. Guest→User→Guest                      | B/C ثم H.                                                                                                                                                                  | capture الأصلية قبل الدخول فقط. logout يرجع إلى guest:<device> نفسه؛ لا يحرر source claim.                                                                 | النية القديمة تبقى لوجهتها؛ أي محاولة لاحقة تحتاج تحققًا وسياسة مصدر ولا يمكنها تجاوز binding.                     |
| K. Android background/force-stop         | Android يعيد WebView ثم listener/launch URL. native install يُطلق بـvoid import في android-client:124، بالتوازي مع router mount:131.                                       | ترتيب completion بين callback وAccountProvider غير مضمون بحاجز awaited، رغم تعليق bootstrap. last Guest قد ضاع عند restart.                                | evidence دائمة قبل SDK/Browser.open ثم recovery موثقة فقط؛ لا استنتاج من launch URL أو جلسة موجودة.                |

### كيف يميز Auth Adapter المحاولة؟ وما أثر restart أو فشل Handoff؟

| الحالة | الإثبات المتاح الآن وحد الاستعادة                                                                                                                                                             | قرار Handoff وأثر فشله على الدخول                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A      | لا انتقال محفوظ في dispatch أو callback؛ رسالة التأكيد قد تفتح في origin/device مختلف. legacy session الفورية فرع آخر، لا يثبت كل التدفق.                                                     | NO-GO. يبقى signup/رسالة التحقق كما هما، بلا source bind.                                |
| B      | يمكن لاحقًا إثبات محاولة داخل السياق نفسه باستدعاء SDK واحد ونتيجته والفحص السلطوي وswap المراقب؛ **لا implementation لذلك الآن**. restart يفقد ربط Promise بالمصدر إن لم توجد receipt دائمة. | NO-GO للنقل. GO لملاحظة المدخل فقط؛ خطأ observer لا يغير SDK call أو نتيجة login.        |
| C      | PKCE يربط code بالـverifier لدى SDK؛ لا يربطهما بحق المصدر. native oauthFlowActive يُصفّر في finally بعد Browser.open، وليس قفل محاولة دائمًا حتى العودة. intent signin/signup لا يكفي.       | NO-GO. لا تغيير OAuth state أو استبدال حماية SDK؛ auth العادي يظل مستقلًا.               |
| D      | replay guard TTL=10 دقائق ويحفظ fingerprints فقط؛ recoverExistingSession يقبل جلسة موجودة بعد فشل exchange. ذلك ليس receipt للمحاولة الأصلية أو Guest الأصلي.                                 | NO-GO. اسمح باستعادة login المعتمدة، لكن Handoff=unverified ولا bind/cleanup.            |
| E      | INITIAL_SESSION تثبت وصول SDK لجلسة، لا أن هذا الجهاز التقط Guest لها. getUser قد يثبت الحساب الآن، ولا يكمل وحده provenance القديمة.                                                         | recovery فقط لو اكتمل العقد لاحقًا؛ الآن NO-GO، ولا تعطيل boot/login.                    |
| F      | تغير token قد يكون الجلسة نفسها، فلا تتغير المحاولة لمجرد refresh. لا session-lineage implementation في Handoff حاليًا.                                                                       | لا capture ولا consent جديدة. فشل تحقق handoff يبقيه blocked ولا يلغي جلسة SDK صحيحة.    |
| G      | نفس UID لا يعني نفس auth attempt. لا durable attemptId يخرج من callbacks الحالية إلى Handoff.                                                                                                 | no-op لمصدر/نية جديدة. لا replay grant.                                                  |
| H      | logout flush قائم وليس إثبات تسوية Handoff/مكافأة. SDK signOut قد يصدر حدثًا إضافيًا؛ logout لا يمحو journal أو الوجهة الأصلية.                                                               | لا إلغاء server effect جارٍ ولا إعادة إسناد. تسجيل الدخول التالي يظل متاحًا.             |
| I      | UID Bob قد يكون صحيحًا سلطويًا، لكنه لا يثبت حقه في مصدر Guest محجوز لـAlice أو attempt قديمة.                                                                                                | conflict؛ احتفظ بالمصدر والأدلة. لا تحوّل successful account switch إلى handoff success. |
| J      | device/namespace نفسه بعد العودة، لكن epoch جديد. consent/claim قديمة لا تشمل شخصًا أو snapshot جديدة.                                                                                        | لا إعادة capture/enrollment/منحة آلية. لا منع اللعب المحلي وفق عقد التخزين القائم.       |
| K      | لم يتوفر Android فعلي. memory counters/active flags تضيع، وPreferences verifier لا تحتوي Handoff evidence. timeout لا يلغي auth/IDB.                                                          | PENDING؛ لا recovery إنتاجية أو دعوى crash safety، ولا حبس login خلف حفظ غير محسوم.      |

**تمييز مهم:** يوجد getClaims في auth-middleware للتحقق من bearer token على طلبات الخادم؛ لا توجد منه receipt تربط attempt/source/session lineage بـHandoff. قد يُستعمل لاحقًا عقد SDK/claims موثق يثبت session identity دون حفظ tokens إذا ثبت دعمه؛ لا نفترض لزوم SQL جديد أو أن decode محليًا غير موثق يعادل ذلك.

## 4. الموانع القائمة خارج المحوّلات

### B1 — Enrollment غير إنتاجي

[anchor-adapter:174](../../src/lib/campaigns/guest-handoff/anchor-adapter.ts#L174) يطلب consumeFreshFixtureGrant، وليس سلطة تثبيت إنتاجية. native harness يملك دليل «أنشأت profile مؤقتة الآن»؛ تطبيق لاعب قديم لا يملك هذا الدليل لمجرد غياب key. تبديل namespace الاصطناعية أو تفعيل synthetic authority في التطبيق **مرفوض**.

### B2 — Event ≠ original attempt

[transition-validation:66](../../src/lib/campaigns/guest-handoff/transition-validation.ts#L66) يطلب source/epoch/context/hash وattempt/UID/session continuity وهوية swap. account/native callbacks الحالية لا تنتج هذا السجل. لا يجوز تركيب proof من current user وepoch الحالي أو traces التشخيصية، أو استخدام token/code/verifier كبيانات Handoff.

### B3 — migration وpromotion القديمتان ليستا مغلقتين بقرار Handoff

[\_\_root:197](../../src/routes/__root.tsx#L197) يستدعي promoteGuestProgressForCurrentUser عند boot، و[\_\_root:288](../../src/routes/__root.tsx#L288) عند SIGNED_IN. المسار يقرأ user partition؛ لذا **ليس صحيحًا أنه يمسح Guest namespace الأصلية في كل login**. في الحالة العادية قد يجد user buffer فارغًا بينما Guest source باقٍ.

لكن [partition:198](../../src/lib/identity/partition.ts#L198) تنقل global legacy إلى owner boot إن لم توجد destination، ثم تزيل global الأصل. وإذا كانت destination موجودة، النص يتخطى النسخ ثم يزيل global الموجود أيضًا، دون merge هنا. هذه مخاطرة حفظ/provenance قائمة **من القراءة الساكنة، ولم تُعَد تجربتها في E**. تقرير B أثبت قبولًا غامض المصدر عند نقل legacy إلى user مع خادم وهمي؛ ليس دليل grant إنتاجي.

بعد وجود ملف في user namespace، [promotion:175](../../src/lib/campaigns/guest-progress-buffer.ts#L175) يثبت boundUid ثم يرسل، وعند acknowledgment يحذف entry المطابقة في السطر 199. هذا لا يستعمل consent/anchor الجديدة. إذن `handoff flag=false` لا يعني إيقاف كل المسارات القديمة. **مانع لتفعيل النقل الجديد أو ضمان شامل «لا نقل/حذف مجهول»** حتى تعتمد سياسة المسار القديم. ليس سببًا لإضافة تعطيل/ترحيل غير مأذون الآن.

### B4 — Profile/Cloud Save مسار مستقل

[account:240](../../src/lib/account.tsx#L240) قد يعمل pushSave(profileRef.current) إذا لم يوجد cloud save، و[account:267](../../src/lib/account.tsx#L267) يدمج save موجودة. بالمقابل [profile:467](../../src/lib/profile.tsx#L467) يفصل حالة المالك السابق ويرطب مساحة الجديد عند identity event. لذلك لا نجزم أن كل login يحمل رصيد Guest، ولا أن snapshot adoption تنقل buffer.

الاستنتاج الملزم: لا ضمان اقتصاد من اختبار Handoff المعزول. يجب قياس ordering مع ProfileProvider الحقيقي وخادم وهمي قبل أي تفعيل يزعم تبني progress دون تبني رصيد. الدفعة الرصدية المقترحة لا تضيف أي مسار profile/Cloud Save، ولا تصلح هذا الخطر أو P1-04/P1-05.

## 5. سياسة enrollment والمحافظة على V17

| الحالة                          | ما يمكن معرفته تقنيًا                                                                                                 | القرار المحافظ الآن                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| تثبيت جديد مثبت إيجابيًا        | يلزم مصدر إثبات مستقل موثوق، مسجل قبل بيانات اللاعب، مع سياسة restore/reinstall واضحة. لا يوجد تنفيذه هنا.            | لا enrollment إنتاجية حتى اعتماد السلطة. لا تعويض «الدليل» بـUUID تولد الآن.                           |
| V17 بلا Anchor                  | وجود bytes/ID قديم يثبت وجود بيانات، لا نسبها بشريًا أو أن current user صاحبها.                                       | احتفاظ وعرض «تقدم سابق لم يُتحقق من نقله». لا import أو bind آلي.                                      |
| إعادة تثبيت                     | غياب keys لا يميز reinstall من fresh install أو storage clear؛ server account موجود لا يثبت أصل Guest على هذا الجهاز. | normal login المعتاد؛ Guest handoff غير محسوم. لا تسجيل generation جديدة لابتلاع القديم.               |
| Anchor مفقودة وJournal موجودة   | توجد بعض الأدلة، لكن anchor admission/claim ناقصة.                                                                    | blocked مع حفظ journal/source؛ repair مقيدة لنفس IDs تتطلب عقدًا واعتمادًا، لا بناء من current UID.    |
| Journal مفقودة وAnchor موجودة   | candidate/target قد يكون محجوزًا بالفعل.                                                                              | captured وما بعدها: لا remint. prepared لها retry **نفس IDs** وفق العقد المحدود فقط، وليست إذن rebind. |
| كلاهما مفقود وGuest buffer باقٍ | لا يمكن إثبات عدم وجود نقل سابق من هذه البيانات وحدها.                                                                | quarantine/needs_review، بلا source جديد أو منح أو نقل تلقائي.                                         |
| جهاز مشترك                      | guest:<device> حاوية واحدة وقد تعود لأكثر من إنسان؛ logout لا ينشئ شخصًا جديدًا.                                      | لا تبنٍّ شامل تلقائي. موافقة على ملف مختلط/متضارب ليست بديلًا عن فصل المصدر والتحقق.                   |

**سياسة قابلة للتطوير لاحقًا دون الكذب بشأن fresh install:** تسجيل بدء بروتوكول مستقبلي صريح لمصدر معلوم، مع إبقاء legacy السابقة معزولة وموسومة unknown، بدل الادعاء أن الجهاز كله جديد. لكن لا يجوز إنشاء source generation جديدة أو نسخ buffer قديمة للتجاوز على claim. يحتاج ذلك قرار مصدر/كاتب/enrollment حقيقيًا معتمدًا؛ ليس جزء الدفعة الرصدية ولا اقتراح Prototype آخر.

إذا لم توجد سلطة كافية، التجربة المحافظة هي الاحتفاظ بالبيانات وإظهار أن النقل غير متحقق أو يحتاج مراجعة، مع استمرار login. لا تستخدم pending/confirmed/reward-delivered لتجميل حالة لم تُحفظ أو تُثبت. رسالة مراجعة لا تمنح زرًا يتجاوز تضارب المالك.

## 6. هل تكفي الموافقة؟

| الحقيقة                          | ما تثبته                           | قرار الموافقة والنقل                                           |
| -------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| deviceId                         | حاوية تقنية best effort            | لا يكفي للملكية البشرية أو enrollment.                         |
| Guest namespace                  | مكان تخزين مفصول تقنيًا            | لا يكفي لنسب كل محتواه للشخص الحالي.                           |
| حساب SDK موثق                    | هوية الوجهة الآن                   | لا يثبت أصل Guest أو original attempt.                         |
| شخص يضغط موافق بعد عرض الحساب    | اختيار وإقرار حاليان               | ضروريان لاحقًا، لكن لا يصلحان فسادًا أو binding متعارضًا.      |
| provenance/hash/transition موثقة | لقطة ومحاولة محددتان وفق العقد     | شرط قبول تقني، لا إكمال خادم أو استحقاق اقتصادي.               |
| eligibility للتقدم               | قواعد محتوى/ترتيب ودليل خادم معتبر | شرط إضافي قبل transport؛ consent لا تتجاوز strict progression. |

القرارات:

- مصدر موثق غير متضارب، snapshot ثابتة، target/session/transition مثبتة، وeligibility صحيحة: **يمكن** أن تعتمد السياسة consent صريحة لنقل progress فقط؛ هذه الشروط ليست مستوفاة إنتاجيًا الآن.
- source bound لـAlice ومحاولة Bob: **لا** تكفي consent لـBob، حتى لو قال إنه صاحب الجهاز. لا إعادة ربط أو إزالة claim.
- global V17 مجهولة أو بيانات relocated أو Journal/Anchor ناقصتان أو ملف مشترك مختلط: **لا** consent واحدة لتجاوز المشكلة. مراجعة منفصلة مع حفظ الأصل، دون صناعة historical provenance.
- corruption/unreadable: لا منح صلاحية اعتمادًا على unknown؛ حفظ الدليل وفشل آمن.
- snapshot تغيرت بعد consent: لا توسيع صامت؛ تحقق وsnapshot/موافقة جديدة للوجهة نفسها إذا سمحت السياسة لاحقًا.
- نفس Alice ونفس snapshot بعد restart: يلزم revalidation/resume صريح؛ ليس إعادة مكافأة أو إكمال. لا يُنفذ مسار الموافقة/الاستئناف الإنتاجي الآن.

## 7. Android والأدوات الفعلية

فحص هذه الجولة: `/usr/bin/chromium` موجود وPython Playwright متاح. لا adb أو emulator في PATH، ولا SDK في المواقع المعروفة المفحوصة، ولا `/dev/kvm`. لا بيئة Android/WebView متصلة مثبتة. Bun ليس في PATH، لكن مساره المعروف `/workspace/.onboarding-tools/node_modules/.bin/bun` موجود؛ ذلك لا يحل timeout suite من الجذر.

**Android Acceptance = PENDING.** يمكن الآن إعداد/مراجعة السيناريوهات وتكرار desktop local-origin إن طُلب؛ لا يمكن ادعاء force-stop Android أو Google return واقعي من أدوات Chromium المكتبي.

قائمة قبول لاحقة على APK اختبارية وحسابات/خادم staging مأذونين، دون Production ودون clear app data:

1. Web Locks وsecure context داخل WebView الفعلي؛ كاتب buffer ينتظر lock فعلية، وغيابها يفشل دون fallback.
2. IDB transaction.oncomplete وreopen مع حفظ source bytes/anchor/journal IDs؛ لا اعتبار React أو request.onsuccess commit.
3. Alice→Bob→Alice وGuest→User→Guest أثناء انتظار hash/auth/bind؛ no rebind أو آثار محلية قديمة.
4. Google PKCE return عبر appUrlOpen وgetLaunchUrl بعد background وبعد process restart؛ إثبات original attempt أو blocked، لا any-existing-session proof.
5. background/resume وSIGNED_IN المكرر وTOKEN_REFRESHED دون نية/موافقة/منحة جديدة.
6. force-stop قبل capture وبعد commit وقبل auth، ثم بعد auth وقبل bind وبعد bind قبل marker؛ مراجعة outcome_unknown وعدم remint.
7. V17 قديمة ومجهولة/متعارضة دون uninstall/clear storage؛ source باقية ولا automatic adoption.
8. quota/SecurityError وفقد أحد سجلات الإثبات؛ login مستقل، لا buffer delete، ولا XP/دنانير/قلوب/entitlement/delivered من Handoff.

## 8. فصل مجموعات الاختبار وتعارضات التفعيل

| المجموعة                 | النتيجة المعتمدة سابقًا / فحص E                                            | أثرها على القرار                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| الرسمية D-04             | 714/714 في 23 ملفًا؛ **لم تُعد تشغيلها في E**                              | تثبت العقود المختبرة، لا auth/enrollment إنتاجيتين. يلزم استمرارها في أول Commit.                                                      |
| root مع local diagnostic | 715/715 = 714 + AST diagnostic واحدة من B                                  | لا تُحسب 715 مرجعًا رسميًا مستقلًا ولا تُرفع diagnostic تلقائيًا.                                                                      |
| Chromium D-04            | 13/13 على نفس adapters، Auth/authority اصطناعيتان؛ **لم يُعد تشغيله في E** | native stores/locks/orderly reopen فقط؛ لا Android أو PKCE حقيقي أو force-stop.                                                        |
| P1-06B native diagnostic | 14 سيناريو تاريخيًا، gate blocked                                          | مجموعة مختلفة عن 13 D-04؛ لا جمع أعدادها كاختبارات رسمية.                                                                              |
| ملفات P1-06B المحلية     | خمس بصمات مطابقة الآن                                                      | لا تعارض في محتواها، تبقى خارج Commit.                                                                                                 |
| fixtures الستة القديمة   | B وثّق 6 failed الحالية مقابل 6 passed قبل A؛ لم تُعد تشغيلها في E         | API/fixture وpromotion policy غير متوافقتين؛ مانع لاعتمادها كدليل integration كما هي، لا مانع معماري للـobserver المعطل الذي لا يمسها. |
| Bun Identity من الجذر    | timeout/124 سابق بعد ست حالات؛ ليس نجاحًا؛ لم يُعد تشغيله                  | نقص تحقق هوية شامل، لا يعوض بنسخة معزولة. يمنع ادعاء اكتمال قبول runtime، ولا يفرض تغيير assertions.                                   |

تصنيف الستة منفصل كما في C: حفظ/monotonic sync يحتاج await+Partition/locks؛ promote-and-clear توقع policy غير صالح؛ no-leak invariant يبقى لكن يحتاج fixture binding حقيقية؛ retry يجب فصل ack عن cleanup؛ no-identity يحتاج async setup/clear الصحيحين. **لا تعديل لها أو لإعدادات البوابة في E.**

تعارض guard مهم: [outbox-guest-handoff-contract:687](../../tests/offline/outbox-guest-handoff-contract.test.ts#L687) يفحص أن src خارج الحزمة لا يستوردها. توصيل coordinator مباشرة بـaccount سيخالفه حتى لو flag=false. لا يُضعف هذا الاختبار في هذه الجولة. الدفعة الأولى المقترحة لا تستورد هذه الحزمة أصلًا؛ يبقى الحاجز صحيحًا لأنها لا تفعّل foundation.

## 9. جدول قرارات التفعيل

الجدول يقيّم **Handoff إنتاجيًا**، لا صلاحية تشغيل المصادقة العادية. GO المحدود للـobserver في القسم التالي لا يغير NO-GO لأي عنصر هنا.

| البند                   | القرار      | سبب الحسم                                                                                                                        |
| ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1. Enrollment           | **NO-GO**   | لا positive production authority أو سياسة V17/restore معتمدة.                                                                    |
| 2. Email sign-in        | **NO-GO**   | لا attempt/session/source receipt إنتاجية؛ دخول البريد المعتاد يبقى متاحًا.                                                      |
| 3. Email sign-up        | **NO-GO**   | custom لا يعيد جلسة، وقد يعود التأكيد من جهاز آخر؛ لا ربط مصدر بالـcallback.                                                     |
| 4. Google PKCE          | **NO-GO**   | verifier/replay/intent لا تثبت Guest transition، وfallback يقبل جلسة موجودة.                                                     |
| 5. Guest source capture | **NO-GO**   | adapter مجرّب، لكن enrollment/ملكية/enabled admission قبل SDK غير محسومة.                                                        |
| 6. Post-auth recovery   | **NO-GO**   | يتطلب Auth Adapter حقيقية وreceipt/lineage وسياسة فقد الأدلة؛ الحالي اختباري.                                                    |
| 7. Consent UI           | **NO-GO**   | لا semantics إنتاجية مكتملة لما يمكن قبوله، ولا تجاوز للتعارض بالموافقة. يمكن لاحقًا رسالة حفظ/مراجعة بلا زر نقل، باعتماد منفصل. |
| 8. Progress transport   | **NO-GO**   | الموانع السابقة + مسار promotion قديم/eligibility/strict/server contract غير محكومة بالعقد الجديد.                               |
| 9. Cleanup              | **NO-GO**   | لا تأكيد نقل كامل معتبر أو retention/repair contract إنتاجي؛ الأصل محفوظ.                                                        |
| 10. Android             | **PENDING** | لا runtime جهاز/Emulator فعلي أو force-stop/PKCE acceptance.                                                                     |

## 10. أول Commit إنتاجي محدد — GO معطل افتراضيًا فقط

**العنوان المقترح:** `Add default-off email auth transition observation`.

هذه ليست وحدة Handoff مستقلة أخرى. هي instrumentation صغيرة عند **المداخل الإنتاجية الفعلية**، دون استخدام prototype أو تغيير المصدر. لم تُنشأ الملفات التالية الآن؛ إنها نطاق Commit لاحق لاعتماد التنفيذ:

| الملف/الدالة المقترح تعديلها                                     | التعديل المحدود                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/auth/transition-observation.ts` جديد                    | `beginEmailObservation / endEmailObservation / failEmailObservation`: بوابة `VITE_GUEST_TRANSITION_OBSERVE === "true"`، default false؛ حالة واحدة محدودة في الذاكرة، بلا Storage/IDB/SDK/network/analytics أو صلاحية مصدر. |
| `src/lib/account.tsx`، signUp                                    | نقطة بعد validation:549 وقبل signUpWithEmail:550، ثم ملاحظة رجوع الطلب/خطئه فقط. custom email dispatched لا تصبح verified target. لا تغيير رسائل التأكيد أو beta/welcome behavior.                                         |
| `src/lib/account.tsx`، signIn                                    | قبل signInWithEmail:586، وبعد رجوع نفس Promise أو فشلها. استدعاء SDK واحد كما في المرجع، والنتيجة/الخطأ يظلان كما هما.                                                                                                     |
| `tests/offline/outbox-auth-transition-observation.test.tsx` جديد | real AccountProvider مع خدمات auth/profile/cloud وهمية، وفشل observer وتأجيل SDK وrace schedules مضبوطة كما أدناه.                                                                                                         |
| `docs/audits/v18-01a-p1-06e-01-email-observation.md` لاحقًا      | تقرير التنفيذ والبوابة، وإثبات تعطيل flag افتراضيًا وعدم وجود صلاحية capture/transport.                                                                                                                                    |

عقد الدفعة:

- قبل gate=false لا قراءة owner/epoch أو توليد attempt ID أو timer أو تخزين. import helper لا يفتح store أو ينشئ source؛ dependency-free بلا import من حزمة guest-handoff.
- عند تفعيل observation في بيئة اختبار مأذونة: metadata دنيا في الذاكرة فقط (method، محاولة سياق غير دائمة، owner/epoch إن كانت معروفة، started/sdk_returned_unverified/failed/interrupted). لا email/password/username أو tokens/codes/URLs أو أرصدة أو snapshot أو hash للمحتوى.
- لا durable evidence claim؛ reload يفقد observation وتعود unknown، لا إعادة تركيب attempt من session. لا capture ولا source binding حتى لو صاحب الحساب نفسه Guest.
- فشل observer لا يؤخر/يرفض auth؛ لا await observer أو Web Lock أو IDB أمام SDK. لا SDK timeout جديد أو retry للمصادقة؛ preserve original return/throw.
- لا observer عام في auth listener/reset/Google/callbacks الآن؛ لا تغيير ordering الإقلاع أو listener أو Cloud Save/ProfileProvider.
- لا success/pending transfer UI جديدة. إن عرضت الحالة لاحقًا فلا تتجاوز «لم يُتحقق من نقل تقدم الضيف» دون صلاحية نقل؛ UI ليست جزء هذا Commit الأول.

**سبب GO لهذه الدفعة:** وجود نقطة بريد محلية محددة قبل الطلب يتيح observation بلا دخول لأي مصدر بيانات أو قرار ملكية. التعطيل يترك فرع SDK الأصلي، والتفعيل الاختباري لا يملك أدوات نقل/رصيد. لا نعتمد على عدد اختبارات D-04 لإثبات ذلك؛ يجب إثباته في الاختبارات التالية قبل حفظ Commit لاحق.

### معايير الاختبار لذلك Commit

1. default/unset/false flag: SDK الأصلي يستدعى مرة واحدة وبنفس arguments/result/throw، لا observer effects أو قراءة device/source/Storage/IDB. لا imports أو open لحزمة foundation.
2. flag=true في fixture: sign-in نجاح/رفض/throw/hang؛ sign-up custom session-null وlegacy session/non-session؛ لا تفسير الإرسال كتأكيد دخول/نقل.
3. SDK callback قبل promise completion، UID swap وAlice→Bob→Alice، unmount وduplicate taps وlate finally؛ attempt قديمة لا تعيد توصيف السياق الجديد.
4. Observer يرمي أو يفشل أو لا يتوفر: login يتم كما في المرجع، دون duplicate request أو إعادة auth أو تغيير رسائل التحقق.
5. قارن استدعاءات ProfileProvider/Cloud Save والأرصدة مع baseline المطابقة **لا تفترض أنها صفر في تسجيل الدخول العادي**؛ المطلوب صفر أثر إضافي للـobserver. existing hydrate/seed قد يحدث كما سبق، وما زال مانع التفعيل الحقيقي B4.
6. source/V17/anchor/journal/Outbox bytes ثابتة بالنسبة إلى مسار الاختبار المرجعي؛ لا callback إلى grant/consent/transport. لا تعديل fixtures الستة أو guard عدم تفعيل foundation.
7. البوابة الرسمية 714 + العدد الجديد المعلن، وroot مع diagnostic منفصلة، وtypecheck/build/diff. Native D-04 عند تغير اعتماداته فقط؛ لا ادعاء Android أو Bun ناجحين دون تشغيل صحيح.

### التعطيل والتراجع

flag افتراضيًا false ولا تُفعّل في Production بهذا القرار. أي تشغيل تشخيصي يحتاج اعتماد نطاقه. العودة إلى false تعيد no-op observer واستدعاءات SDK الأصلية، أو يُحذف wiring في Commit لاحق محافظ؛ لا amend لتاريخ منشور.

observer لا تكتب سجلات، فلا حاجة إلى حذف DB/anchor/Journal أو مسح V17. أي بيانات موجودة من العقود السابقة تُترك كما هي ولا تُعاد نسبتها. لا نزيل guards أو نجعل missing تثبيتًا جديدًا. استعادة السلوك السابق تعني إزالة آثار observation فقط، **ولا تعني أن legacy promotion/migration أو profile reconciliation السابقة صارت آمنة لكل حالات Handoff**.

### المخاطر الباقية وموافقات التفعيل

بعد ذلك Commit ستظل موانع B1–B4 وAndroid/Bun وSDK lineage كما هي؛ ليس معيار الإغلاق أن observer اشتغلت. للانتقال إلى Handoff حقيقي يلزم اعتماد صريح لسلطة enrollment وسياسة V17/الجهاز المشترك/تعارضات الوجهة، وتنفيذ Auth Adapter داخل المسارات الفعلية مع إثبات cold restart/PKCE، وقرار مسار promotion القديم قبل coexistence، وقبول عدم انتقال الاقتصاد مع ترتيب profile الحقيقي.

ثم يعتمد نطاق consent/eligibility/strict progress والاحتفاظ بالأصل قبل أي transport؛ وcleanup تحتاج موافقة مستقلة بعد أدلة acknowledgments/recovery، لا لأنها نتيجة auth ناجحة. لا اقتراح Prototype جديد في هذه الجولة؛ العمل التالي الفعلي، إن اعتمد، هو Commit المراقبة الموضعي المذكور، لا توسيع test models.

## 11. الملفات المحلية والتحقق الختامي

التغيير الوحيد في E: **هذا التقرير المحلي غير المتتبع**. لا كود أو Storage/schema أو Assertions/config تغيّرت. لا tests/build/auth/Production/SQL/نشر أو Commit/Push في الجولة. نجحت فحوص القراءة المرجعية وSHA-256 و`git diff --check`؛ فحص تنسيق التقرير منفصل عن اختبارات التطبيق.

ملفات P1-06B الخمسة بقيت مطابقة:

| الملف                                                   | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/audits/v18-01a-p1-06b-guest-compatibility.md`     | `316a069672eaca880b17e80253e7cdcf9b4fcd41a7ee009579964dc91efdb370` |
| `tests/offline/browser/build-guest-compatibility.mjs`   | `283907793707d08583fcdc2bfa58db20e23d11606acbefb0d995b7264b62993f` |
| `tests/offline/browser/guest-compatibility-fixture.tsx` | `96c3d160f19112780c03a6fa39c7b186c6faadead4b7012127c175c72ce1a012` |
| `tests/offline/browser/guest-compatibility-native.py`   | `ec0134f9c631a608097782c284548c663e4799da99149d8b360e744c0a694f9a` |
| `tests/offline/outbox-guest-compatibility.test.ts`      | `d8379ddca78c6ac33f497138c72858e15fb234657072d80c01819ef6cc488852` |

**القرار النهائي: GO لدفعة مراقبة البريد المعطلة افتراضيًا فقط وفق نطاق القسم 10، بعد اعتماد التنفيذ؛ NO-GO لتفعيل Handoff/capture/recovery/نقل أو تنظيف اللاعبين الآن. Android PENDING؛ P1-06/P1-04/P1-05 OPEN؛ V18 HOLD. التوقف بعد التقرير.**
