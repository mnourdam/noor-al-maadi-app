# V18-01A — P1-05A-01: Real Campaign Reward Atomic Settlement Integration

## القرار والنطاق

**NO-GO: لا يمكن تفعيل vertical slice للنشاط الواحد بأمان قبل إغلاق authority admission وwriter coverage ومصالحة الملف السلطوي.** لم يُنفذ half integration أو Prototype اقتصادي جديد، ولم يتغير كود الإنتاج أو سلوك اللعب.

المرجع v18-01a-outbox-recovery عند 6cd0244ad4cf9de77e2e4d73662ca7e367d07a3a مطابق، والملفات المتتبعة نظيفة. تقرأ هذه الجولة تقرير P1-04C-01 واختباراته الـ32 كما هما دون إعادة كتابة أو تخفيف assertions. روجعت database/transaction/settlement/writer-fence، ProfileProvider، account/identity reset، player/claims/totals/progress، offline recorder/gameplay، وتعريف RPC المحفوظ وتقارير Foundation ومراحل 3A/3B، خصوصًا 2C/2E.

المحاولة العملية للوصول إلى التكامل كانت فحص الـauthority واختبار بواباتها على **ProfileProvider الحقيقي** قبل كتابة grant coordinator. فشلت شروط الدخول نفسها: كتابات حالية تستطيع إلغاء الزيادة أو إعادة خصم قديم، ولا baseline معتمدة في IDB. إنشاء transaction تمنح مع بقاء هذه الكتابات هو تحديدًا التكامل الشكلي الممنوع؛ لذلك توقفت قبل أي تفعيل. الاختبارات الجديدة تشخيص للمسار القائم، وليست نظام اقتصاد بديلًا.

لا عينات لاعبين، ولا خدمة تطبيق أو Production أو RPC/SQL حقيقي. البيئة running/connected؛ الشبكة الفعلية ممنوعة في الاختبارات.

## 1. السلطة الاقتصادية: ما حُسم وما لم يُختر

الحالي ليس سلطة واحدة قابلة لإثبات إدراج operation:

- ProfileProvider يعرض ويعدل XP والدنانير محليًا، ويحفظ لاحقًا في hakaya.profile.v2.
- profiles على الخادم يزوّد إحصاءات مطلقة عبر account/get_my_profile وrealtime وStreak؛ بعض المكافآت والخصومات سلطوية من الخادم.
- Cloud Save يحمل snapshot ملف قابلة للتأخر، وmergeCloudSave ليس سجل عمليات مالية.
- Settlement v2 لا توجد له baseline إنتاجية/authority token أو imported economy معتمدة. الوجود في localStorage أو القيمة المقروءة لا يمنحان صلاحية النقل؛ الاستيراد التلقائي ممنوع في هذه المهمة.

**لم تُختر/تُفعّل سلطة جديدة.** لتسليم محلي ذري مستقبلًا، يجب أن يكون اقتصاد IDB هو سلطة الجزء المحلي المتفق عليه، وتصبح React projection فقط. لكن اختيار حدود ذلك الجزء ومصالحة absolute server stats لم يُحسم بعقد inclusion. لا يجوز تهيئة 0 أو STARTING_DINARS أو نسخ profile قديمة إلى economy ثم تسمية العملية cutover.

الاختبار الذي يفتح schema v2 داخل fake-indexeddb بعد منح حقيقي عبر ProfileProvider يجد جميع stores فارغة. لا يكتب اقتصادًا أو grant أو delivered؛ يثبت غياب الربط/القبول، لا سلامة baseline ما.

## 2. Writer coverage — نقاط المنع المحددة

| الكاتب                                             | المسار الحالي                                                                    | الحماية الحالية وحدودها                                                                   | أول تغيير لازم قبل منح IDB                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| update/addPoints/addDinars وكل reducers الاقتصادية | profile.tsx:575، 653، 870 وغيرها → React ثم persistence effect                   | لا operation key أو economy revision أو owner/epoch مثبت عند قبول callback                | admission واحدة وcommands مرتبطة owner/epoch/revision؛ لا إعادة منح عند projection                              |
| شراء/خصم/trySpendDinars/buyHint                    | profile.tsx:593–608، 871 وما بعدها؛ dialogs/useBuyHeart                          | reservation محلية وقراءة React؛ لا serialization مع ledger IDB أو سياقات أخرى             | نفس سلطة الرصيد ومعاملة debit، والحفاظ على semantics الإرجاع وعدم قبول شراء على snapshot قديمة                  |
| القلوب/cooldowns/regen                             | loseHeart/loseHeartOnce/recoverHeartFromActivity/spendDinarsForHeart             | قواعد max/cooldown/math قائمة؛ ليست keyed commit مع مكافأة                                | نفس accepted command/version والـsnapshot field patch؛ لا snapshot كاملة تسقط الخصم                             |
| persistence effect                                 | profile.tsx:495–540 → localStorage.setItem                                       | ownerRef guard فقط؛ لا epoch/revision/authority inclusion، ولا CAS بين السياقات           | تعطيل دوره ككاتب اقتصاد للـowner المُعتمد؛ projection mirror فقط من commit أحدث                                 |
| hydrate/identity                                   | profile.tsx:456–491؛ identity/reset.ts owner swap ثم async cache resets ثم event | namespace/epoch تعزل الهوية، لكنها لا تعتمد/تغلق authority أو كل عمل قيد التنفيذ          | boot/identity admission قبل grant؛ trusted read أو unresolved، لا initial باعتبارها baseline                    |
| replaceProfile/resetProfile                        | profile.tsx:990 و1105 → setProfile مباشرة                                        | تتجاوز update، ولا token لمصدر snapshot                                                   | مصادر versioned وحقول محددة، reset ضمن lifecycle صريح وليس إسقاط اقتصاد أحدث                                    |
| mergeCloudSave                                     | profile.tsx:995–1103؛ account.tsx:278                                            | union/max للقيم، وبعض قواعد hearts؛ لا مرجع applied operations أو source revision         | ingress resolution بعقد، لا Math.max العام؛ unknown inclusion يبقى unresolved                                   |
| applyServerStats                                   | profile.tsx:1106؛ account.tsx:511/535، quests/investigations/purchases           | استبدال XP/dinars بقيم مطلقة؛ callers قد تفحص الهوية/الزمن لكن لا تعرف inclusion revision | حفظ provenance/source revision؛ منع stale assignment أو إيقاف المنح عند تعارض غير محسوم                         |
| recordStreakActivity/hydrateClaimedStreakRewards   | profile.tsx:900–988                                                              | awaits ونتائج خادم، مع بعض owner/epoch guards؛ ليست مشاركة في authority admission         | writer مسجل قبل العمل، نتيجة مرتبطة scope/revision ثم durable commit، لا setter مستقل                           |
| account ingress/auto-push                          | account.tsx hydration، refs/realtime، debounce push                              | getActiveUserId/cancelled وREALTIME_GUARD_MS نافذة زمنية؛ لا proof إدراج grant            | تنسيق ingress/egress بنفس admission/version. لا تغيير transport/deployment لـCloud Save في هذه الجولة           |
| claims/progress/grant totals/collection/review     | campaignLedger/campaignRewardsGranted/importedCampaignProgress + player + memory | مفاتيح/سجلات مختلفة، backfill قد يستهلك progress-only claim                               | عزل legacy_unknown، intent/confirmation/delivery refs؛ Memory Review لا يمر بمعبر إضافي غير معتمد               |
| سياق/تبويب آخر أو إصدار قديم                       | نفس namespace localStorage؛ لا يتعاون مع fence الحالي                            | Writer Fence يصرح globalWriterExclusion=unproven وregistered_participants فقط             | lease/admission durable مع fencing عند actual write، وسياسة للأكواد القديمة؛ BroadcastChannel ack وحدها لا تكفي |

البحث الحالي عن callers شمل ActivityRenderer، حملة Imported، القصص/التحقيقات/الألعاب، DailyQuestCard، help dialogs، useBuyHeart وaccount. جدول Stage 3B-2C السابق أوسع ويشمل avatar/public stats وbootstrap/partition وMemory؛ لم يُفترض أن مطابقة owner وحدها تغطيها. لا ادعاء بأن هذه الجولة أثبتت global exclusion.

### الإثبات الجديد بدل افتراض إمكانية حماية writers

تشخيص ProfileProvider الحقيقي يثبت:

- بعد addPoints(7)/addDinars(3) من fixture 100/50، نتيجة server stats مؤجلة 100/50 تمحو 107/53، وeffect تحفظ 100/50.
- شراء من fixture 500 ثم Cloud merge مؤجلة 500 تعيد 490 إلى 500. استُخدم رصيد أعلى من STARTING_DINARS لتجنب خلط هذا الإثبات بحد numMax الافتراضي القائم.
- replaceProfile محتفظة قبل الشراء/خسارة القلب تعيد 40 دينارًا إلى 50 وقلبين إلى ثلاثة.
- مزودان حقيقيان مستقلان لنفس المالك: الأول يحفظ XP=107، والثاني يحفظ snapshot قديمة XP=100 عند إضافة دينار؛ تخزين الملف يصبح 100. هذه نسختان في jsdom نفسها، **ليستا اختبار تبويبين Chromium**، لكنهما تثبتان الكاتب القادر على clobber.
- batching وStrictMode لا يضيفان receipt أو revision checking.
- callback addPoints محتفظة من epoch قديم، عند استدعائها مباشرة بعد هوية جديدة/ABA، تعدل الحالة الحالية. هذا إثبات أن الـAPI العامة نفسها غير fenced، لا اتهام بأن callers المحمية في P1-04A/B/P1-07 تستدعيها خطأ دائمًا.
- corrupt/SecurityError أثناء hydration يؤديان إلى initial rendering، لا trusted economic admission.
- quota في persistence effect بعد mutation تُلتقط بواسطة ErrorBoundary، بينما bytes الدائمة تبقى بالقيمة القديمة؛ نجاح mutation ليس durability.
- إعادة mount تقرأ نتيجة overwrite القديمة؛ لا سجل مستقل يستعيد grant المفقودة.

لم يُستدعَ AccountProvider أو Cloud Save transport في هذه الاختبارات؛ الاختبار يسلّم نتيجة مؤجلة مباشرة إلى API الإنتاجية التي يستعملها account، ولا يزعم اختراق guards الهوية/النافذة الزمنية في AccountProvider نفسه. التأخر داخل المالك نفسه/خارج guard الزمني لا يملك revision اقتصادية أصلًا.

## 3. Blockers تمنع النشاط الواحد وحده

**AUTH-01 — لا baseline admitted:** منع نقل V17 تلقائيًا وعدم وجود economy معتمدة يجعل IDB balance الجديدة مجهولة. نسخ الأرقام أو تهيئة seed ستصنع اقتصادًا ثانيًا وتخالف شروط المهمة.

**WRITE-02 — bypass فعلي:** applyServerStats/replaceProfile/persistence/merge والخصومات لا تستهلك revision أو applied key من IDB. لا يُحل بإضافة API projection واحدة للحملة مع إبقاء بقية المداخل كما هي. اختبار المزودين وoverwrite يثبت الضرورة، وليس مجرد احتمال هندسي.

**SERVER-03 — confirmation ليست entitlement attestation:** تعريف record_campaign_progress_v2 المحفوظ يتحقق من المستخدم والحملة وانتماء الفصل، ثم upsert score/xp_earned/coins_earned المقدمة من العميل ويحدّث سجل إكمال الحملة. لا يتلقى activityId أو answer/full-half-min/terms fingerprint أو grant key، ولا يمنح profiles XP لهذه العملية. إقراره دليل تقدم الفصل المربوط بالعملية فقط؛ لا يثبت صحة كل إجابة/مقدار مكافأة. يجب تسمية الاستحقاق المحلي بعقد client validation صريح، وعدم اختراع توقيع سلطوي. لا تعديل RPC هنا.

**RECON-04 — server inclusion مجهولة:** مطلق XP/dinars القادم من الخادم لا يخبرنا أي local operation IDs دخلته. إضافة local overlay ثم أخذ max أو إضافة كل pending grants قد يكرر مالًا/يعكس شراءً؛ اعتماد المطلق قد يفقد grant. مع التعارض المطلوب unresolved، يلزم تحديد أثره على HUD/الإنفاق قبل تشغيل المسار.

**ATOMIC-05 — العقد الحالي غير كافٍ:** transaction.ts تدعم compareWrite لـeconomy/appliedGrants/migrationState وreadEntitlement فقط. settlement.prepare/settle تستخدم معاملة مستقلة على entitlements. لا يمكن إنتاج commit واحد يغير economy+applied+delivered عبر API الحالية. توسيعها صغير بذاته، لكنه لا يحل AUTH-01/WRITE-02/RECON-04؛ لذلك لم يُنفذ primitive آخر منفصل.

**OFFLINE-06 — حل النشاط منفردًا يتقاطع مع مكافآت النهاية:** recordActivity قد يكمل الفصل/الحملة ويفتح التالي قبل إقرار الخادم، ثم claims الفصل والحملة/collection/modal تعمل في الاستدعاء نفسه. عند إضافة تأجيل للنشاط مع استمرارها سيبقى نجاح/اقتصاد غير متسق؛ تعطيلها أو offline سيغير السلوك الممنوع دون قرار. تقرير C-01/اختباراته يثبتان ذلك، ولا نعيد كتابتهما.

## 4. أول تعديل مطلوب — بوابة سلطة إنتاجية شاملة، قبل delivery

الخطوة التالية المطلوبة للاعتماد ليست Prototype ولا منحة جديدة:

1. حسم حدود authority: اقتصاد محلي admitted مع React projection، وقاعدة ingest مطلق server profile. تحديد متى تكون العملية unresolved وكيف يستمر/يتوقف الإنفاق عندها. لا أصل/إثبات baseline قديم → لا activation لهذا المالك.
2. إدخال admission/revision على **كل** setters المذكورة في ProfileProvider، بما فيها مسارات setProfile المباشرة وuseEffect/hydrate/identity، وتوصيل account ingress/egress وpurchase helpers. هذه هي أقل boundary حقيقية، وليست تغيير activity handler وحدها.
3. API projection مستقبلية تتلقى owner + current epoch/authority session + committed revision + exact projection/commit identity. تتحقق ثانية داخل React update وعند mirror persistence، وتقرأ الرصيد الملتزم دون addPoints/addDinars. source conflict لا يختار الرقم الأكبر.
4. إثبات durable exclusion/serialization للسياقات الحديثة وسياسة للأقدم؛ تعديل writer-fence.ts/adapter فقط دون enforcement عند write ليس إثباتًا.
5. بعد admission موثوقة، توسيع transaction capability لتحديث entitlement المقيدة مع intent/economy/applied record في المعاملة نفسها. ثم coordinator **مستورد فعليًا من player**، لا helper اختباري.

مسارات أول تغيير لازم: src/lib/profile.tsx وsrc/lib/account.tsx وsrc/lib/identity/reset.ts، مع production authority/admission adapter في src/lib/rewards؛ وحماية callers التي تستبدل snapshots، خصوصًا useBuyHeart/help، دون تغيير قيم الاقتصاد أو النقل الشبكي. يجب ألا يبدأ هذا التغيير باستيراد V17 أو صرف grant أو schema seed. يحتاج اعتمادًا لتغطية المداخل المشتركة وأثر unresolved على الشراء/offline؛ لا يمكن إعلان GO للنشاط بمجرد نجاح معاملة IDB معزولة.

معيار قبول أول خطوة: الاختبارات الحالية المضبوطة لا تعود تسمح لـsnapshot بلا token بتجاوز رصيد revision أحدث، وتحافظ على debit/heart/Streak/المقتنيات، وتثبت استقلال الحسابين وABA وrestart والكتّاب في متصفحين حقيقيين. سياق قديم غير مسوّر يجب أن يُمنع فعليًا من الكتابة أو يبقى التفعيل HOLD، لا مجرد غياب استجابة له.

## 5. عقد intent/applied key المطلوب بعد حل المانع — غير منفذ

- entitlement key ثابت: owner/campaign/chapter/activity ونوع المنحة، مع operationId ثابت للقبول؛ لا IDs جديدة بعد timeout.
- payload محفوظ غير قابل للتغيير: content/reward version/fingerprint، authored terms الأصلية وcaps/full-half-min وXP/dinars النهائية، skip/acceptance evidence وdependencies.
- progress binding مستقل operationId/revision/snapshot؛ queued ليست confirmed. chapter ID وحدها تتشارك عدة أنشطة؛ يلزم ربط snapshot بدليل تقدم كل intent دون اختراع attestation للخادم.
- missing/corrupt لا تصبح pending؛ historical absence لا تصبح due. prepare لا يعني entitlement مؤكدة.
- applied grant key دائم مع fingerprint والقيم/revision/inclusion evidence. نفس المفتاح مع payload أخرى conflict؛ بيانات legacy تصنف unknown.
- grant/economy/applied/delivered وقراءة النسخة الحالية داخل transaction واحدة؛ oncomplete حد durability، ولا delivered تُعرض قبله.

لا تعديل schema/version أو entitlement API أو production imports في هذه الجولة.

## 6. ما أصبح ذريًا فعليًا والاستعادة

**لا شيء جديد في الإنتاج.** لم تُنشأ delivered أو grant أو economy أو baseline. الآليات القديمة كما هي؛ IDB guarantees السابقة لا تسد الفاصل بينها وبين localStorage.

عقد restart المطلوب لاحقًا: فتح هوية/authority جديدة، discover intents، مطابقة snapshot والـevidence، عدم صرف pending/rejected/unresolved؛ فحص applied inclusion عند ضياع commit callback، وإعادة projection دون زيادة ثانية. الذاكرة السابقة للـfence لا تمنح حق الاستئناف. لا يمكن تنفيذ ذلك للنشاط الآن مع منع bootstrap المجهولة وبقاء writers مستقلة.

## 7. queued/rejected/unresolved وV17 وCloud Save

التصرف المطلوب لم يُفعّل كي لا يخفي الرصيد المصروف القديم أو يوقف offline صامتًا. اختبارات C-01 الـ32 ما زالت تثبت تصرف الإنتاج القائم، بما فيه queued grants ونافذة claim/crash وbackfill. لا pending UI تجميلية أضيفت.

V17 claim أو رصيد منفرد لا يثبت inclusion أو provenance. لا تعويض أو auto import أو إدراج applied key بناء على parseable profile. fallback initial الحالية خاصية العرض القديم؛ لم تُعتمد baseline جديدة ولم تُمسح بيانات لاعب.

Cloud Save/account تشارك في سلطة الأرصدة حتى لو لم يتغير deployment الخاص بها. يجب تنظيم المداخل المحلية قبل cutover، لا تعديل خدمة Cloud Save أو نشرها. نقل profile كاملًا أو Math.max العام ليس حلًا معتمدًا. server-authoritative rewards لا تُعاد محليًا عند replay؛ المسار المحلي للحملة يحتاج inclusion semantics مختلفة.

## 8. الاختبارات: تشخيص إنتاجي لا نموذج اقتصاد

الجديد: tests/offline/outbox-real-profile-authority.test.tsx، **14 اختبارًا**. ProfileProvider وuseProfile وReact/StrictMode وidentity owner حقيقية؛ diagnostics/android instrumentation/Supabase وهمية، ولا requests حقيقية. اختبار IDB يقرأ stores الحقيقية من schema الحالية تحت fake-indexeddb دون كتابة grant أو baseline.

حالات snapshot معروفة اصطناعيًا، وليست ملفات V17 حقيقية. harness النهائي يستخدم Web Storage الخام المعزولة للـprovider؛ **لا يشغّل installIdentityPartition أو resetForIdentityChange الكامل أو AccountProvider**. عند تبديل المالك تُختار seed اصطناعية صراحة ويُرسل حدث الهوية الذي يستهلكه provider. يثبت ذلك حدود API/epoch وReact/persistence، لا صحة boot migration/namespace isolation أو كامل lifecycle. اختبارات C-01/P1-06A الحالية تغطي partition الخاصة بها دون تعديل.

الاختبارات تغطي: delayed same-owner stats، delayed cloud ingress، retained replaceProfile، مزودين متنافسين، batching، StrictMode، Alice→Bob وABA callbacks، debit/reward/heart، corruption وSecurityError، غياب economy admitted، remount بعد overwrite، وquota after mutation.

تصحيحان في توقعات **الملف الجديد فقط** بعد قراءة نتائج فعلية: mergeCloudSave له STARTING_DINARS floor؛ استُخدم fixture أعلى منه لعزل stale debit. applyServerStats حاليًا لا تطبق hearts أصلاً رغم قبولها في type، لذلك اختبارها يثبت ضياع currency مع بقاء خسارة القلب، بينما replaceProfile هي التي أثبتت استعادة القلب. كما صُححت fixture Cloud Save إلى snapshot كاملة وفق نوع API بعد TS2345، بدل ملف جزئي؛ لم تُغير assertions قديمة أو تُعمم ادعاء إسقاط كل writer لكل حقل.

### ما لم يُثبت

لا production atomic delivery أو crash داخل transaction جديدة أو exactly-once بعد commit/reply loss أو replay عشر مرات على منحة إنتاجية. لا cross-tab Chromium exclusion أو Android force-stop. لا acceptance لقيمة server RPC باعتبارها تصديق إجابة. لا trusted migration/baseline، ولا deadline يعني cancel.

متطلبات القبول الكاملة للمسار (intent قبل التسليم، transaction crash/abort/oncomplete، inclusion عند ضياع callback، replay 1/2/10، concurrent purchase/heart، tab/restart، balances server conflicts، corruption/quota) **بوابة غير مستوفاة، وليست اختبارات ناجحة مزعومة**. لا يوجد target إنتاجي متصل يمكن تشغيل اختبار Chromium لذرية تسليمه؛ لم يُستبدل بنموذج native جديد. orderly close ليست force-stop.

## 9. heap failure — إعادة الإنتاج والحدود

سجلات الجولة السابقة بقيت: /tmp/p104c-full.log و/tmp/p104c-verbose.log أظهرتا OOM متكررًا في harness قبل عزل diagnostics/sticky writer. ليست حادثة عشوائية واحدة مثبتة في runner. الملف المحلي الـ32 الحالي لم يُغير، ويُعاد تشغيله ضمن البوابة الجديدة.

في هذه الجولة أعاد harness جديد يشغل installIdentityPartition مع ProfileProvider الحقيقي OOM مرتين: مجموعة 13 حالة قبل اكتمال أي حالة، ثم حالة واحدة محددة (12 skipped)؛ logs /tmp/p105a-focused.log و/tmp/p105a-one.log. لم تُرفع heap ولم تُخف errors. بعد عزل اختبار الـprovider عن partition bootstrap/diagnostic dynamic imports نجح سريعًا. هذا يحدد configuration قابلًا لإعادة الإنتاج، **ولا يثبت أي دالة داخل partition/runner وحدها سببًا جذريًا، ولا يثبت تسرب ذاكرة في Android/الإنتاج**. النسخة التشخيصية الأولى محفوظة في /tmp/p105a-profile-partition-diagnostic.tsx، وهي اختبار حالي للإثبات لا prototype اقتصاد.

لم يُعد تركيب harness القديم للجولة C-01 أو تعديل ملفه المحمي. مسار الـprovider مع partition الحقيقي يحتاج التحقيق/القبول لاحقًا؛ نسخة Web Storage المعزولة لا تحل محله كقبول للتكامل. Bun Identity الأصلي يبقى غير محسوم ولا يحسب PASS.

## 10. نتائج البوابة

| الفحص                                                                             | النتيجة النهائية                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| التشخيص الجديد المحدد                                                             | PASS: 14/14 على ProfileProvider الحقيقي ضمن harness النهائي الموصوف، لا production delivery acceptance |
| npm run test:outbox                                                               | PASS: 849/849 في 29 ملفًا، بعد تصحيح fixture الكاملة                                                   |
| npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts | PASS: 848/848 في 28 ملفًا = 802 على GitHub + 32 محلية سابقة محفوظة + 14 جديدة محلية                    |
| npm run typecheck:outbox                                                          | PASS: التطبيق وOutbox، exit 0 بعد تصحيح fixture                                                        |
| npm run build                                                                     | PASS: exit 0؛ bundler/deprecation warnings غير مانعة؛ بناء محلي فقط                                    |
| git diff --check                                                                  | PASS؛ فحص الملفين الجديدين أيضًا بـgit diff --no-index --check /dev/null                               |
| حماية Git                                                                         | PASS: src وstaging بلا diff، كل hashes المحمية مطابقة، لا Commit أو Push                               |
| HEAD                                                                              | 6cd0244ad4cf9de77e2e4d73662ca7e367d07a3a دون تغيير                                                     |

هذه أعداد بوابة العمل المحلية، وليست ادعاء بأن GitHub يحتوي 848 اختبارًا؛ الـ32 السابقة والـ14 الجديدة لم تُرفع. تشغيل 849/849 أول سابق لتكييف fixture TS نجح أيضًا، لكنه لم يُستخدم بدل إعادة التشغيل النهائي. تشغيل OOM الأول والثاني في harness partition لا يُحسب PASS.

## 11. حماية الملفات والتراجع وCLOSE

التغيير المحلي المقصود ملفان فقط: التقرير الحالي وoutbox-real-profile-authority.test.tsx. لا src أو config/dependency/schema change. كل تقارير الإصلاحات السابقة وتقرير C-01 والـ32 tests وملفات P1-06B الخمسة بقيت byte-identical وفق البصمات الابتدائية. لا staging أو Commit أو Push، وHEAD لم يتغير.

لا مسح DB أو storage أو V17 أو refund أو تعديل أرقام الاقتصاد، ولا SQL/RPC migrations أو Cloud Save deployment أو Production أو Android Release أو Merge أو Handoff. التراجع عن هذه الجولة هو إزالة الملفين التشخيصيين لاحقًا بمراجعة فقط؛ لا بيانات إنتاجية استحدثت. أي cutover مستقبلية يجب أن تبقي authoritative records وlegacy snapshots، ولا تعيد تفعيل persistence قديمة فوق سلطة أحدث.

**NO-GO — المانع الأول هو ProfileProvider/account authority admission مع baseline غير معتمدة وكتابات لا تحمل revision؛ يُعالج قبل أي grant transaction أو ربط لاعب.** P1-04/P1-05/P1-06 OPEN، Guest Handoff NO-GO، V18 HOLD. التوقف هنا بتقرير واختبارات محلية دون Commit/Push.
