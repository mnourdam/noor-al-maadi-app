# V18-01A — P1-05A-03: Creation-Bound Profile Mutation Capabilities

## CLOSE — القرار

**NO-GO للـCommit/Push، بسبب تعارض oracle تاريخي محمي مع السلوك المصحح، لا بسبب إخفاء فشل في بوابة خضراء.** الإصلاح الإنتاجي المحدود والاختبارات والتقرير باقية محليًا للمراجعة. لا stage/Commit/Push؛ HEAD يبقى `237a1c7928eb62fe52dec12963c5e35318a85dc0` على `v18-01a-outbox-recovery`.

الطلب المرفق الحالي، البندان 10 و16، يلزمان إبقاء reproductions المحمية كما هي والتوقف قبل Commit يحتاج استثناءً غير معتمد. لا نغير Assertions أو runner أو نعيد تصنيف الاختبارين تلقائيًا. P1-04/P1-05/P1-06 OPEN، Guest Handoff وAtomic Settlement NO-GO، V18 HOLD.

## AUDIT → RISK

بدأ العمل بفرع وHEAD مطابقين، tracked status نظيف وتسعة ملفات أدلة محلية غير متتبعة. البيئة الحالية running/connected، observations_current=true، وسياسة الشبكة enforced. لا خدمة تطبيق أو Supabase Production استُدعيت؛ جميع SDK/RPC والتخزين الاصطناعي في الاختبارات معزولة، وChromium على loopback مع حظر الطلبات الخارجية.

رُوجع تقرير A-02، profile-writer/profile، account-operation/account، owner/reset/partition، الأدلة المحلية A-01/14 وC-01/32 وB، واختبارات Profile/Account الحالية. شمل فحص callers StoryPlayer وDailyQuestCard وgame/campaign route وChapterQuiz؛ لا تعديلات عليها.

السبب الجذري: `setProfile` و`capture` و`reset` كانت دوالًا مستقرة لا تحمل سياق الإنشاء؛ تختار scope من هوية التنفيذ أو latest frame. و`update` في Provider كانت مثبتة بـdependencies فارغة. لذلك callback أنشئت في Alice قد تبدأ لأول مرة داخل Bob أو Alice جديدة، وتكتسب سلطة الجيل الحالي. الـpersistence fence السابقة تحمي frame المقبولة، لكنها لا تستطيع اكتشاف أصل استدعاء جرى تفويضه خطأً.

مخاطر إضافية داخل نفس النطاق: loseHeartOnce قد تدخل dedup قبل رفض الكتابة، وheart/notification events قد تنبعث رغم أن mutation قديمة؛ logout فيها module await قبل تبديل الهوية. trySpendDinars تحمل حجزًا مؤقتًا يجب ألا ينتقل إلى مالك جديد ذي الرصيد نفسه. لا نعالج بهذه الجولة ترتيب المصادر الاقتصادية أو دور claim ledger أو كاتب تبويب آخر.

## REPRO قبل الإصلاح وبعده

شُغلت حالتا قبول جديدتان مع الـ14 المحمية على HEAD الأصلي، قبل تعديل source:

| المسار | المطلوب | قبل الإصلاح | بعد الإصلاح |
| --- | --- | --- | --- |
| Alice addPoints retained ثم Bob | Bob يبقى 200 | 207؛ اختبار القبول FAIL | 200؛ PASS |
| Alice → Bob → Alice ثم retained | Alice الجديدة تبقى 100 | 107؛ اختبار القبول FAIL | 100؛ PASS |

الـ14 القديمة نجحت قبل الإصلاح؛ بعده 12 PASS و2 FAIL تتوقعان بالضبط 207/107. السجل المحلي `/tmp/p105a03-before.log` يسجل 14 PASS/2 FAIL، و`/tmp/p105a03-root.json` يسجل النتائج النهائية. لا حسابات حقيقية أو seed بيانات لاعبين.

## MINIMUM FIX — العقد

`useProfileWriter` تنشئ source Symbol خاصًا بالـprovider، وscope غير قابلة للتعديل من `frame.source/owner/epoch/generation`. `useMemo` يعتمد هذه الحقول فقط؛ **revision/snapshot لا تدخل صلاحية الجلسة**. setProfile/capture/reset تُنشأ مرتبطة بهذه scope، ولا تحصل على سياق جديد من owner الحالي عند استدعاء دالة قديمة.

| العنصر | مصدره وعمره |
| --- | --- |
| source/context identity | Symbol خاص بالـprovider instance؛ لا ينتقل إلى remount أو JSON |
| owner + epoch | من frame التي أنشأت capability؛ ABA لا تعيد epoch السابقة |
| provider generation | hydrate/reset/lifecycle؛ explicit reset يبطل callbacks القديمة حتى لنفس UID |
| operation admission | invocation تستخدم capability الأصلية؛ admitted sequence تكشف mutation متداخلة في async Streak كما سابقًا |
| revision + snapshot Symbol | ترتيب/هوية frame داخل السياق، وحفظ النسخة المقصودة؛ ليست إصدارًا دائمًا أو CAS |
| persistence outcome | setItem للنسخة المقصودة فقط؛ لا delivered/appliedGrant أو durability بعد force-stop |

مراحل الفحص:

1. الإنشاء: scope ثابتة من frame؛ initial غير المقروءة ليست سلطة كتابة.
2. الاستدعاء/القبول: تطابق active/source/owner/epoch/generation وصلاحية القراءة وأحدث frame. void mutations القديمة no-op، والعمليات Boolean تعيد false.
3. تنفيذ functional updater: يعاد فحص scope وهوية previous frame؛ لا تعاد دالة Alice على frame Bob عند تأخير React.
4. persistence: fence السابقة مستمرة، مع source ضمن matches؛ latest frame/owner/epoch/generation تمنع effect قديمة من الكتابة في namespace جديدة.
5. بعد await: capture مرتبطة بسياق الإنشاء ثم القبول. sessionCurrent تضيف SDK UID. لا استيراد أو RPC جديدة من action قديمة عند نقاط الفحص المعدلة، ولا اعتماد نتائج قديمة بعد انتظار RPC.
6. hydrate/reset/unmount: تبطل scope السابقة. reset نفسها تتطلب صلاحية المنشئ، ثم تنشئ generation جديدة وتستبدل frame المحمية. لا تخول old reset لنفس الحساب أو حساب آخر.

المراجع المتغيرة latest/profile/generation تستخدم لفحص صلاحية scope الثابتة أو قراءة قيمة حالية **بعد التفويض**؛ لا تعيد تعريف مالك callback. capture(true) ما زالت خاصة بتعارض mutation أثناء Streak؛ لا تُستخدم لمنع callbacks صحيحة لمجرد rerender.

## IMPLEMENT — مسارات Profile الفعلية

`update` صارت تعتمد setProfile المقيدة بدل `[]`؛ هذا يربط جميع reducers الثانوية بنفس المعبر. replaceProfile وmergeCloudSave تمران عبر setProfile المقيدة، resetProfile عبر reset المقيدة، وtrySpend/async APIs عبر capture المقيدة. dependencies في ctx تشمل capture/reset/update؛ لا revision في مصدر الصلاحية.

تغطي مصفوفة الاختبار **45 mutation API**، وتقارن bytes وقيمة Profile والأحداث والخدمات بعد استدعائها من Alice تحت Bob:

`login`, `logout`, `addPoints`, `addDinars`, `openStory`, `finishStory`, `toggleSavedStory`, `markPuzzleSolved`, `markWhoSolved`, `unlockEra`, `touchStreak`, `awardBadge`, `completeInvestigation`, `markInvestigationCompletedLocal`, `completeTimeline`, `completeDecision`, `completeMission`, `completeCampaign`, `findArtifact`, `unlockCharacter`, `unlockRegion`, `claimDaily`, `updateSettings`, `setBio`, `setFavorites`, `adoptServerAvatar`, `setAvatar`, `setAvatarDurable`, `setNotificationPrefs`, `loseHeart`, `loseHeartOnce`, `recoverHeartFromActivity`, `spendDinarsForHeart`, `spendDinars`, `trySpendDinars`, `buyHint`, `claimStreakMilestone`, `hydrateClaimedStreakRewards`, `recordStreakActivity`, `replaceProfile`, `mergeCloudSave`, `resetProfile`, `applyServerStats`, `grantTitle`, `grantArtifact`.

خمسة APIs للقراءة فقط صُنفت صراحة: getPersistence، todayDailyIds، hasHearts، hintsRevealed، availableStreakMilestones. اختبار inventory يفشل إذا أضيفت دالة عامة ولم تُصنف، فلا تقتصر التغطية على addPoints.

- loseHeart/loseHeartOnce: guard قبل event أو dedup؛ action مرفوضة تعيد 0 دون أي heart loss أو notification. 0 هنا نتيجة رفض قديمة ضمن API العددي القائم، وليس إقرارًا بتغيير رصيد القلب.
- setNotificationPrefs: لا event من action مرفوضة.
- logout: guard قبل import وبعده قبل بدء resetForIdentityChange. لا تعديل خوارزمية reset/Auth؛ reset التي بدأت فعلًا ليست ملغاة بهذا الحارس.
- avatar: رفض مبكر قبل optimistic mutation/module await؛ نتيجة obsolete تعود failed محليًا، ولا تعكس avatar جديدة. RPC بدأ قد يكون التزم فعلًا؛ failed هنا ليس إثبات server rollback أو عدم grant.
- Streak: لا action قديمة تبدأ module/RPC، ولا نتيجة قديمة تستبدل totals. guards القائمة داخل updater وحول awaits مستمرة.
- trySpend: الحجز داخل السياق يعتمد هوية capture؛ تغيير الجيل يفصل الحجز حتى إن تطابق رصيد الحسابين. action قديمة تُرفض قبل لمس حجوزات الجيل الجديد. effect قديمة لا تصفر حجز سياق أحدث. لم تتغير الأسعار أو الخصومات أو affordability math.

أثبت اختبار إضافي أن Alice تحجز 10 ثم تُسقط mutation أثناء switch، فلا تُمنع Bob (رصيدها50) من شراء45. قبل إصلاح bookkeeping عاد false؛ بعده تُحفظ5. هذا حجز ذاكرة مؤقت، وليس نقلًا لدفتر اقتصاد أو Outbox.

## السلوك الشرعي وReact

Actions مأخوذة **بعد hydration السليمة** تبقى صالحة بعد rerender عادي/تغيير bio أو revision أو XP. buy ثم reward تحافظ على الحساب القديم، وتحديث XP ثم الدنانير في tick واحدة يمر. لا تثبيت لسلطة action إلى revision render.

Actions من initial render غير المقروءة لا تصبح مفوضة تلقائيًا بعد hydrate؛ يحصل المستهلك على APIs الحالية من render المُرطَّب. هذا مقصود لمنع ترقية صلاحية منشئ مجهول؛ لا تثبيت callback قبل readiness ثم إعادة تفويضها عبر ref. المداخل المفحوصة تُحدث handlers عبر render/dependencies؛ لا ادعاء بمسح كل plugin خارجي أو كل جهاز. اختبار StrictMode initial action يثبت الرفض، واختبار live action يثبت استمرار اللعب بعده.

StrictMode cleanup/replay لا يصنع سلطة جديدة للدوال المحتفظ بها، وreset يُبطل الجيل القديم. transition + switch مجدولان داخل act نفسها، وليس sleep. old layout/persistence scenario من A-02 بقي ناجحًا. لم نضف subscription/listener/hydration effect؛ hydrate بقيت مستقرة، ولم تتغير Identity Partition أو diagnostics fix السابقة. نُفذ native actual partition دون سلسلة re-entry أو تعليق.

## AccountProvider — دليل الحماية القائمة

لم يتغير account.tsx أو account-operation/cloud-save/social/Auth/Google PKCE. حارسة operation تربط identity string من render (owner+epoch) وlifetime من نفس instance، إضافة إلى userId والـcancellation/tickets المناسبة. قد تُنشأ accountOperation عند الاستدعاء، لكن شرط alive الذي يضم هوية render يمنع closure قديمة من اكتساب جيل الهوية الحالي.

| المسار | دليل الحماية |
| --- | --- |
| retained syncNow/signOut/updateDisplayName/updateUsername | 3 حالات جديدة: Bob وABA وunmount؛ لا upload/stats/SDK logout أو تعديل الملف |
| sync محتفظ بها ضمن الجلسة بعد revision | حالة جديدة؛ ترفع snapshot الحالية107 دون رفض handler صالح |
| hydration/login/Cloud merge | مجموعة Account السابقة20 ما زالت PASS؛ request ثابتة حول fetchs، وقبول snapshot/check source قبل merge |
| realtime/cold stats | owner/epoch/effect cancellation، source check للـcold RPC، وفحص request قبل استعمال applyServerStatsRef؛ old-account/ABA callback مرفوضة |
| debounce/reconnect | request/lifetime وsnapshot/checks قبل write تالية؛ الاختبارات السابقة PASS |
| signOut أثناء final push | finalSource/ticket/guards؛ الطلب القديم لا يكمل خروج Bob أو يحرر سياق أحدث |

عدم تعديل Account هنا مقصود لأن حراسة الجلسة الحالية مثبتة بهذه الحالات. ليس ذلك إثباتًا بأن payload سلطوية قديمة لنفس الجلسة أصبحت مرتبة اقتصاديًا، أو بأن latest ref تمنح بيانات مجهولة سلطة baseline. لا فتح لعقد server-authority أو مصالحة math جديد.

## الاختبارات — فصل القبول عن التاريخ

| الفحص | النتيجة الفعلية |
| --- | --- |
| القبول الجديد Profile/Account | PASS 65+4 = **69/69** |
| npm run test:outbox من الجذر | **FAIL، exit1: 973 PASS، 2 FAIL، 975 إجماليًا؛ 34 مجموعات ناجحة وواحدة فاشلة** |
| دون تشخيص B: npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts | **FAIL، exit1: 972 PASS، 2 FAIL، 974 إجماليًا**؛ الاستبعاد لتشخيص B المعلن فقط |
| المرجع السابق دون B + الجديد | 905 +69 =974؛ الحالتان التاريخيتان مشمولتان ولم تُستبعدا |
| A-01 المحمية | 12 PASS /2 FAIL كما في الجدول التالي |
| C-01 المحمية | 32 PASS، بلا تعديل |
| A-02 Profile/Account/transport/partition | 23+20+13+1 PASS |
| Email Observer/gameplay UI | 39/10 PASS، بلا تعديل Assertions/mocks في هذه الجولة |
| npm run typecheck:outbox | PASS، tsc العام وoutbox، exit0 |
| npm run build | PASS client/SSR/Nitro، exit0؛ warnings القائمة لا تُعامل نشرًا |
| Chromium native | PASS للنطاق المحلي المحدود فقط، 9 حالات؛ collision ما زال REPRO |
| git diff --check + فحص new files | PASS للملفات المتتبعة والجديدة |

root Vitest58.27s؛ تشغيل البوابة دون B35.43s. البوابة بقيت FAIL؛ لم يُضف استثناء للاختبارين بالاسم لإظهار نجاح. الأرقام أعلاه تفصل القبول الجديد عن reproductions القديمة دون تغيير runner.

### تعارض الـ14 المحمية — لا استثناء صامت

| الحالة التاريخية | oracle المحمي | الفعلي المصحح | التصنيف |
| --- | --- | --- | --- |
| REPRO retained unfenced addPoints callback crosses identity Alice to Bob | 207 في الذاكرة والتخزين | 200، دون إضافة7 | historical bug reproduction لم تعد تعيد العيب؛ FAIL متوقع للـoracle القديم، وليس PASS بوابة |
| REPRO retained unfenced addPoints callback crosses identity ABA | 107 في الذاكرة والتخزين | 100، دون إضافة7 | التصنيف نفسه |

تبقى الحالات الـ12 الأخرى ناجحة: same-owner stale stats، stale Cloud merge/replace، two providers، batching old authoritative assignment، StrictMode/durable grant، stale dinars/heart، corrupt/SecurityError hydration، عدم وجود Settlement evidence، cold restart بعد stale overwrite، quota. نجاح reproductions المتبقية **لا يعني إصلاحها**؛ هي مخاطر اقتصادية/authority خارج حدود صلاحية جلسة callback. حالات quota وعدم استحداث Settlement/عدم الثقة بفساد القراءة تبقى regression acceptance، ولا تتعارض مع الإصلاح.

الـ32 الخاصة بالحملات PASS byte-identical؛ ما تزال تُظهر نوافذ claim/crash/pending economics ولم تُغلق P1-04. لا harness defect لتبرير الفشلين التاريخيين: نفس harness يعرض200/100، واختبارات قبول مستقلة تعرض ذلك أيضًا، ومثله native actual partition.

التوصية التي تحتاج قرارًا مستقلًا: اعتماد manifest تصنيف صريح للحالتين التاريخيتين وربطهما بـHEAD الذي أعاد العيب؛ إبقاء ملفهما وبصمته، وتقديم نتيجة historical repro منفصلة عن شروط قبول الإصلاح. اعتماد الـoracles الجديدة مستقلًا وعدم السماح بأخطاء أخرى أو failures مختلفة في الحالتين. **لا تغيير runner أو تصنيف أو exclude للحالتين في هذه الجولة.** لذلك لا ينفذ Commit/Push حتى تُعتمد معالجة هذا التعارض، رغم نجاح قبول الإصلاح.

### مصفوفة القبول المطلوبة

| البنود | الاختبار/الدليل |
| --- | --- |
| 1–9 callbacks الاقتصادية/قلوب/merge/stats/reset | 45 حالة inventory/mutation + حالتا retained addPoints؛ bytes وProfile وevents/services لا تتغير |
| 10 ABA | retained addPoints وexternal Promise وRPC Streak، إضافة إلى Account |
| 11 unmount/remount | old provider callbacks لا تؤثر في instance الجديدة |
| 12 StrictMode | reset generation + initial render capability + A-02 StrictMode regression |
| 13–14 async | external deferred + Streak RPC مؤجل؛ identity switch/ABA + avatar أثناء reset |
| 15 updater مؤجلة | React startTransition ثم switch داخل act؛ لا إعادة reducer على frame الجديدة |
| 16 old persistence | A-02 layout-switch/native actual partition؛ Bob تبقى200 |
| 17–20 rerender/revisions/XP+dinars/purchase | current-session retained actions live؛ Profile23 السابقة، والشراء والحجز الجديد |
| 21 Guest/User/Guest | loggedIn=false fixture صالحة للضيف، epoch جديدة، لا إعادة منح قديم |
| 22–23 reconciliation/realtime | Account20 السابقة + retained Account4 |
| 24–26 no applied/delivered/Settlement/V17 | IDB open spy وbyte equality + native DB list؛ الملف القديم بلا source/generation metadata جديدة |
| 27 لا مكافأة callback قديمة | جميع mutation cases + Bob/ABA/native |
| 28 reload | provider remount وnative page reload من نفس origin/storage؛ لا replay |

### fixtures وإخفاقات أثناء التطوير

Fixture Guest الأولى كانت loggedIn=true، فحارس guest-pollution السابق رفضها. صُححت بيانات fixture الجديدة إلى loggedIn بحسب owner، **دون Assertions أو source guest changes**؛ الضيف السليم يظل قادرًا على العمل بعد الرجوع. اختبار الحجز الإضافي أخفق ثم نجح بعد ربط bookkeeping بسياقه، دون تغيير سعر. لا failures أخرى في التشغيل الكامل النهائي.

رفض auto-review استدعاء edit+native-run بادعاء أن التفويض يخص A-02 فقط. أثبتنا نص طلب A-03، خصوصًا البند12 الذي يصرح Chromium على loopback، وبصمات browser scripts القديمة التي لم تتغير؛ أُنشئ diagnostic جديد في sandbox العادية، ثم أجيز run-only المحدد مع حظر HTTP الخارجي. لا التفاف على Proxy أو صلاحية دائمة.

## cross-tab، الأداء وحدود الأجهزة

Chromium151.0.7922.173: 9 حالات، لا page errors أو external requests، retained Alice→Bob وABA مرفوضة، ordinary revision حية، bytes محفوظة بعد reload، old passive effect مرفوضة، لا Settlement DB. Web Locks ليست شرطًا لهذا الحارس المحلي؛ لا fallback CAS أو بروتوكول locks أضيف.

تبويبان فعليان يعيدان overwrite كما في A-02: تبويب1 يرفع108→115، تبويب2 من snapshot108 يضيف دينارًا فيحفظ108/501. هذا **فشل exclusion معروف ومقصود رصده، وليس قبولًا عالميًا**. لا كتابة ناقصة الحقول أو schema جديدة؛ race الحالية ما زالت NO-GO، ولا يثبت هذا الاختبار حماية من كاتب V17 قديم.

الموارد: cgroup32GiB (34,359,738,368 bytes)، MemAvailable عند الفحص33,807,416 KiB على المضيف، Node24.19.0 heap4,496,293,888 bytes، Vitest maxWorkers=2 بلا تغيير. root استغرق59.21s للأمر مع عماله، max RSS لعملية ابن واحدة386,536KiB (ليس مجموع peak لكل العمليات). test/type/build أطلقت بالتوازي جزئيًا. لم يحدث OOM أو رفع heap أو خفض Assertions. الفشلان AssertionError محددان، لا hang/heap.

Android/WebView/force-stop PENDING: لا adb/emulator في PATH؛ لا تشغيل Android أو ادعاء fsync. reload/close للمتصفح لا يثبت Android restart أو power loss. Bun Identity الأصلي غير محسوم ولم يُحسب PASS.

## الحدود المتبقية قبل Economic Baseline وAtomic Settlement

رفض الجلسات القديمة لا يثبت source authority أو ترتيب snapshot قديمة لنفس الجلسة؛ raw same-owner applyServerStats/merge/replace ما زالت تحت القواعد السابقة. لا CAS أو durable revisions مشتركة أو منع للكتّاب القدامى، ولا inclusion evidence تربط server totals بكل grant.

قبل baseline: عقد server-authoritative مقابل Cloud/local/pending/legacy، provenance ومصالحة inclusion، سياسة unknown وآلية إصدار/استبعاد لجميع الكتاب. قبل Atomic Settlement: baseline معتمدة وwriter coverage فعلي ثم durable intent/economy/applied/delivered في معاملة قابلة للاستئناف؛ هذا الإصلاح لا يضيف أيًّا منها. لا import V17 أو تعديل progress/claim ledger أو Outbox أو أسعار/مكافآت/قلوب أو SQL/RPC أو migrations أو Guest Handoff.

## الملفات المحلية الخاصة بهذه الجولة

- src/lib/profile-writer.ts — capability من سياق الإنشاء، scope ثابتة وsource.
- src/lib/profile.tsx — dependencies والحراس الثانوية وحجز الدنانير المؤقت.
- tests/offline/outbox-profile-capabilities.test.tsx — 65 حالة جديدة.
- tests/offline/outbox-account-capabilities.test.tsx — 4 حالات جديدة، production Account دون تغيير.
- tests/offline/browser/profile-capabilities-native.py — diagnostic جديد، يستخدم build/fixture السابقة دون تعديلها.
- docs/audits/v18-01a-p1-05a-03-creation-bound-capabilities.md — هذا التقرير.

الأدلة التسعة غير المتتبعة محفوظة؛ لا تعديل تقارير سابقة، ولا reset/clean/stash/add عام، ولا stage/Commit/Push. التعديلات المحلية ليست إصدارًا منشورًا أو قرار إغلاق P1-05. لا نشر/دمج/Production.

## بصمات الملفات المحمية

42 ملفًا من التقارير والأدلة فُحصت قبل/بعد بلا تغيير. تسعة الملفات المحلية أدناه تطابق كذلك بصمات جدول A-02؛ لم تدخل أي Commit.

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

## P1-05A-03R — Historical Test Reclassification Decision

### القرار المستقل النهائي

**GO مشروط بالحفظ بعد نجاح البوابة، وقد نجحت فحوص القبول أدناه.** هذا قرار P1-05A-03R المعتمد من المستخدم، ويحل تعارض الحالتين فقط ويحل محل NO-GO الخاص بـCommit في القسم التاريخي A-03 أعلاه. بقية تقرير A-03 محفوظ حرفيًا بوصفه سجلًا للقرار السابق؛ لا يلغي هذا القسم قيود الاقتصاد أو حالة V18 HOLD.

مرجع بدء 3R: الفرع `v18-01a-outbox-recovery` وHEAD `237a1c7928eb62fe52dec12963c5e35318a85dc0`. كان إصلاح A-03 وكافة الـ69 اختبارًا موجودًا محليًا؛ لم تُعد تطبيق إصلاحات قديمة أو checkout/reset/clean/stash. لم يتغير أي بايت من production profile.tsx/profile-writer.ts خلال 3R؛ حُفظت نسخة A-03 التي اختُبرت في الجولة السابقة. لا تغيير Account/Auth أو Cloud math أو mocks أو إعداد Vitest.

### تحديد الفشلين قبل التعديل

تأكد التشغيل من أن الحالتين في **نفس الملف** `tests/offline/outbox-real-profile-authority.test.tsx`؛ لم نفترض ذلك. كلاهما مولد من loop عند الأسطر الأصلية170–194. فشل Assertion السطر190 قبل الوصول إلى نظيرتها في191؛ كلتا الـAssertions كانتا تتوقعان البدل الخاطئ نفسه في React والتخزين.

| اسم الاختبار الأصلي الكامل | Assertions الأصلية | السلوك الصحيح / Assertions الجديدة |
| --- | --- | --- |
| REPRO retained unfenced addPoints callback crosses identity Alice to Bob | `expect(h.api.profile.points).toBe(aba ? 107 : 207)` و`expect(saved().points).toBe(aba ? 107 : 207)`؛ في هذه الحالة207 | الاسم الجديد REGRESSION retained addPoints callback cannot cross identity Alice to Bob؛ التعبير الجديد في السطرين193–194 هو `toBe(aba ? 100 : 200)`؛ في هذه الحالة200 |
| REPRO retained unfenced addPoints callback crosses identity ABA | الـAssertions نفسها؛ في هذه الحالة107 | الاسم الجديد REGRESSION retained addPoints callback cannot cross identity ABA؛ التعبير الجديد نفسه؛ في هذه الحالة100 |

التوقع القديم كان دليل عيب: addPoints(7) من سياق Alice القديم يضيف إلى Bob أو Alice في epoch لاحقة. ليس شرط قبول صالحًا. قبل إعادة التصنيف، التشغيل الحالي أعاد **12 PASS و2 FAIL** مع actual200/100 وexpected207/107. ليست timeout أو SDK/mock fault؛ النتيجة المصححة تطابق قبول مستقل وChromium الحقيقي.

داخل الحالتين فقط أضيفت لقطات read-only اللازمة للـAssertions: targetProfile/targetBytes/persistenceBefore. لم يتغير ترتيب identity switch أو seed أو استدعاء retained(7) أو mocks. الـAssertions الجديدة تتطلب كذلك:

- نفس object Profile قبل/بعد، فكل الحقول لا تتغير، بما فيها الدنانير والقلوب والشارات.
- bytes التخزين كاملة تبقى مطابقة؛ لا كتابة إلى namespace الحالية من فعل قديم.
- persistence metadata تبقى مطابقة؛ لا mutation/persistence جديدة تُنسب إلى no-op.
- `retained(7)` تعيد undefined ضمن عقد void؛ لا receipt اقتصادية أو delivered/appliedGrant يُستنتج منها.

الأجزاء قبل loop وبعدها مطابقة byte-for-byte للنسخة المجمدة، فتظل الحالات الـ12 الأخرى والـharness دون تغيير. لم تُحذف الحالة أو تُحوَّل إلى skip/todo/xfail، ولم تُستبعد من البوابة.

### الدليل التاريخي المجمد

حُسب SHA-256 قبل تعديل Assertion واحدة، ونسخت bytes الأصلية ثم قورنت byte-for-byte وبالبصمة قبل المتابعة:

`26231ae26edf64d21628682e0b71473bc511c4bcb7a8943b1e42a22958b2f077`

المسار: `docs/audits/evidence/v18-01a-p1-05a-03r/outbox-real-profile-authority.original.tsx.txt`، ومعه README يشرح provenance والأسماء والـAssertions الأصلية. الموقع والامتداد خارج include الموجودة في Vitest؛ الملف الفعّال الأصلي يبقى في البوابة ويشغّل الحالات الأربع عشرة. لا تغيير للتقريرين المحميين A-01/C-01؛ أضيفا كما هما لتوثيق مصدر الاختبارات.

### الإثبات في الاتجاهين وضوابط منع النجاح الشكلي

أضيف diagnostic قابل لإعادة التشغيل:

```sh
node tests/offline/profile-capabilities-counterfactual.mjs
```

يقرأ فقط blobي `src/lib/profile.tsx` و`src/lib/profile-writer.ts` من commit237a1c79 عبر Git، ويحملهما في Vitest بوساطة loader مؤقت. تبقى IDs الأصلية والمسارات النسبية والـSDK mocks والاختبارات والهوية الحالية كما هي. لا استبدال working source أو worktree أو تعديل config الرسمية. يتحقق من بقاء source bytes بعد التشغيل؛ ملف config مؤقت فقط.

النتيجة: **exit1، اثنتان FAIL و12 PASS**. الحالتان المعاد تصنيفهما تفشلان بـactual207/107 مقابلexpected200/100. هذا هو دليل أن الـAssertions الجديدة تلتقط العيب القديم فعلًا. لا تُحتسب تلك النتيجة نجاح بوابة أو استثناء فشل في البوابة؛ هو تشغيل counterfactual منفصل مقصود.

مع مصدر A-03 الحالي نجحت الحالتان، ثم مجموعة Profile ذات الصلة135/135، ثم جميع974/975. تعزيز الضوابط الإيجابية في حالتي قبول مستقلتين موجودتين ضمن الـ69 لم يضف أو يحذف test cases:

| الضابط | النتيجة |
| --- | --- |
| callback جديدة من Bob بعد رفض Alice القديمة | addPoints(3)+addDinars(2) تحفظ203/52 |
| callback جديدة من Alice بعد العودة بجيل جديد | تحفظ103/52 |
| إعادة استعمال callback القديمة بعد المنحة الصحيحة | تبقى203/103، بلا إضافة7 |
| callback سليمة بعد bio rerender/revision وتحديثات XP/dinars | ناجحة ضمن مصفوفة الـ69؛ لا تعطيل شامل للأفعال |
| شراء ثم مكافأة / حجز مالك قديم / Guest/User/Guest | نفس قبول A-03 مستمر؛ لا تغيير أرقام أو شروط |

أول محاولة لصنع counterfactual wrapper بـspawnSync واجهت EPERM محليًا ولم تكن دليل فشل اختبار. استُبدلت في diagnostic الجديد فقط بقراءة/spawn غير متزامنين، ثم اكتمل التشغيل وأعطى AssertionErrors المحددين أعلاه. لا تبديل mocks أو source لإخفاء المشكلة.

### نتائج الفحوص النهائية

| الفحص | النتيجة |
| --- | --- |
| الحالتان وحدهما عبر CLI -t | 2 PASS؛ الـ12 الأخرى غير مختارة في هذا التشغيل الموجّه فقط، وليست source skip |
| Profile والقبول المرتبط | 135/135 PASS في6 مجموعات؛ تشمل14 كاملة |
| القبول الجديد | 69/69 PASS: Profile65 +Account4 |
| npm run test:outbox | 975/975 PASS في35 مجموعة، exit0؛ تتضمن تشخيص B المحلي الواحد |
| npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts | 974/974 PASS في34 مجموعة، exit0؛ لا استبعاد للحالتين |
| P1-05A-01 بعد إعادة التصنيف | 14/14 PASS؛ بقيت الـ12 الأخرى دون تغيير |
| P1-04C | 32/32 PASS، byte-identical |
| npm run typecheck:outbox | PASS، tsc العام وoutbox، exit0 |
| npm run build | PASS client/SSR/Nitro، exit0؛ لا deployment |
| git diff --check وفحص staged | PASS للملفات المتتبعة والجديدة؛ يُفحص index أيضًا قبل Commit |
| Chromium | 9/9 للنطاق المحلي، Chromium151.0.7922.173؛ صفر external requests/page errors |
| counterfactual على source237a1c79 | EXPECTED FAIL: حالتان فقط و12 PASS، exit1 محفوظ؛ ليس جزءًا من البوابة الخضراء |

Vitest للبوابة الكاملة51.13s، ودونB35.86s؛ زمن الأمر الكامل مع العمال51.87s، max RSS لابن واحد419,400KiB (ليس مجموع peak). maxWorkers=2 وheap limit غير مرفوعين؛ لا OOM أو timeout ولا تجاهل Suite. الاختبار النهائي أعاد نجاح partition diagnostic، فلم تعد سلسلة diagnostic recursion السابقة.

### ضمان checkout جديد وقائمة Commit

قبل الحفظ كانت ملفات GitHub المتتبعة تمثل859 حالة، والبقية: C-01 عدد32، A-01 عدد14، A-03 عدد69، وتشخيصB عدد1. باعتماد تضمين32/14/69 تصبح البوابة المحفوظة **974**. الخمسة الخاصة بـP1-06B خارج Commit، ولذلك checkout جديد لا يُنسب إليه تشخيصB الإضافي ولا975 حالة تلقائيًا. root المحلي975 لأن ملفB ما زال موجودًا غير متتبع.

يُفحص index مقابل JSON نتائج Vitest للتأكد أن كل ملف يساهم في974 محفوظ، وأنB وحده غير متتبع. لا تغيير package scripts أو include أو exclusions في config. Counterfactual `.mjs` والأرشيف `.txt` تشخيص/أدلة، وليسا حالات مخفية من974.

قائمة Commit المحددة13 مسارًا:

1. src/lib/profile-writer.ts
2. src/lib/profile.tsx
3. tests/offline/outbox-profile-capabilities.test.tsx
4. tests/offline/outbox-account-capabilities.test.tsx
5. tests/offline/browser/profile-capabilities-native.py
6. tests/offline/profile-capabilities-counterfactual.mjs
7. tests/offline/outbox-real-profile-authority.test.tsx
8. tests/offline/outbox-campaign-boundary.test.tsx
9. docs/audits/v18-01a-p1-05a-01-real-settlement.md
10. docs/audits/v18-01a-p1-04c-01-campaign-boundary.md
11. docs/audits/v18-01a-p1-05a-03-creation-bound-capabilities.md
12. docs/audits/evidence/v18-01a-p1-05a-03r/outbox-real-profile-authority.original.tsx.txt
13. docs/audits/evidence/v18-01a-p1-05a-03r/README.md

لا git add عام، ولا ملفاتB أو تقارير أخرى تغيرت. بصمة A-01 الأصلية محفوظة في النسخة المجمدة، بينما الملف الفعال تغير في الحالتين المصرّح بهما فقط. C-01 وملفاتB الخمسة وتقارير المراحل السابقة ثابتة البصمات.

### ما بقي مفتوحًا بعد هذا القرار

Cross-tab collision ما زال NO-GO: native يعيد إنتاج كاتب108 يطغى على115 عند إضافة دينار في تبويب آخر. نجاح تسع حالات يعني قبول guards المحلية وإظهار هذا الحد، لا نجاح global exclusion/CAS أو حماية من عميل V17 قديم.

لا baseline اقتصادية معتمدة، ولا server inclusion/reconciliation authority جديد، ولا استيرادV17 أو delivered/appliedGrant/Settlement activation. الـ12 historical/authority cases الأخرى لا تعني إصلاح المخاطر التي ما زالت تعيد إنتاجها. P1-04/P1-05/P1-06 OPEN، Atomic Settlement وGuest Handoff NO-GO، V18 HOLD.

Android/WebView/force-stop ما زالت PENDING، وBun Identity الأصلي غير محسوم. لا يُستنتج Android acceptance من Chromium المكتبي أو reload؛ لا adb/emulator اختُبر أو Android Release/SQL/RPC migrations/Production/merge/deploy نُفذت. يُحفظ Commit واحد ويُرفع إلى فرع العمل فقط بعد اكتمال البوابة وفحوص البصمات، ثم نتوقف.
