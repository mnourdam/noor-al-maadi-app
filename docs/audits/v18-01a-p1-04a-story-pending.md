# V18-01A — P1-04A: Story Completion Pending vs Confirmed

## AUDIT → RISK → MINIMUM FIX

المرجع: الفرع v18-01a-outbox-recovery، HEAD الابتدائي 9c31450ed85e81d4b7bcf5331e198cc2a5a6b5f5. الملفات المتتبعة نظيفة قبل العمل؛ ملفات P1-06B المحلية الخمسة موجودة وخارج Git.

قُرئت phase-e وتقرير F-01 وStoryPlayer وstories/progress وgameplay-write ومسار receipts في Outbox وdead-letter ونهاية القصة وRewardMoment. السبب الجذري: StoryPlayer يستخدم saveAccepted، الذي يقبل queued دون acknowledged، ثم يحوّل هذا القبول إلى completionFired وRewardMoment وSimpleEnd («اكتملت القصة»). المكافأة الصفرية ليست تمثيلًا أمينًا لعملية غير مؤكدة.

completeStory نفسه يستعمل المعرف المستقر story_completion:userId:storyId، ولا يحدّث مرآة الإكمال أو حدث story-completions إلا بعد إقرار الخادم. saveGameplay يفصل receipt المحفوظ عن RPC وإزالة receipt، ويعيد storageState=unresolved عند مهلة التخزين. الرفض الدائم قد يبقى queued إذا تعذرت أرشفته؛ لذلك queued وحدها لا تكفي حتى لوصف الانتظار العادي.

الحد الأدنى لا يحتاج تغيير progress أو Outbox أو dead-letter أو أي عقد مكافأة. المخاطر الأساسية: نجاح وهمي، نتيجة مؤجلة تعبر الحساب/القصة، وfinally قديمة تحرّر حارس عملية أحدث.

## IMPLEMENT — الحالات والواجهة

| النتيجة                                                 | سلوك StoryPlayer                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| acknowledged=true                                       | مسار المكافأة الحالي ثم SimpleEnd؛ نفس XP والدنانير من الاستجابة، ونفس RewardMoment دون تعديل                |
| acknowledged=false، queued=true، reason فارغة أو queued | شاشة pending مستقلة: «حُفظت محاولة إكمال القصة على جهازك، وهي بانتظار تأكيد الخادم. لم تُعتمد المكافأة بعد.» |
| storageState=unresolved أو storage_pending              | شاشة «نتيجة الحفظ غير محسومة»؛ لا ادعاء بثبوت الحفظ أو فقده                                                  |
| رفض/فشل آخر                                             | خطأ مع إعادة المحاولة؛ لا نهاية مكتملة أو مكافأة. فشل إعادة التحقق يزيل شاشة pending السابقة                 |
| replay لقصة مكتملة                                      | المسار الصامت الحالي؛ لا completion RPC أو منحة جديدة                                                        |
| Guest                                                   | نفس guestMarkCompleted ونتيجة saved/firstTime وإصلاح P1-06A؛ لا تحويله لعقد مكافأة الخادم                    |

pending وunresolved لا تستدعيان addPoints أو addDinars أو Streak أو completionFired أو RewardMoment أو SimpleEnd. لا حدث confirmed جديد في الواجهة، ولا entitlement أو delivered جديد.

زر إعادة التحقق يستدعي completeStory نفسه؛ لا UUID أو معرف بديل ولا قراءة قائمة Outbox للاستنتاج. إعادة التحقق قد تعيد queued أو رفضًا أو acknowledged. اختفاء الصف ليس دليلًا على تأكيد أو صرف مكافأة. لا مراقبة تلقائية لتسوية flush اللاحقة في هذه الدفعة؛ يلزم إقرار جديد من المسار الأصلي عند إعادة التحقق.

## الهوية ودورة الحياة وsingle-flight

wrapper مشترك في onOwnerChange بواسطة useSyncExternalStore، ويفصل instance الواجهة حسب owner/epoch/story.id. يشمل ذلك Alice → Bob → Alice؛ عودة الاسم لا تعيد epoch القديم. لكل instance حارس single-flight مستقل؛ finally الخاصة بـAlice لا يمكنها تعديل حارس Bob.

تثبت instance owner وepoch وتتحقق منهما مع activeRef قبل بدء الإكمال وبعد انتظار guestMarkCompleted أو completeStory وبعد الاستيراد غير المتزامن لـStreak وقبل إظهار المكافأة/الإكمال. إشعار مشهد مؤكد لا يبطل queries في واجهة خرجت أو تبدلت. جميع مسارات الخروج تستخدم إبطال activeRef، بما فيها Escape والسحب وزر الإغلاق؛ unmount يبطلها أيضًا.

لا ادعاء بإلغاء RPC بدأ بالفعل. يمكن للـrecorder إنهاء تأكيد صحيح ومرآة تقدم للمالك نفسه بعد إغلاق الواجهة، دون إعادة واجهتها أو منح محلي منها. عند تبدّل الحساب تبقى حماية recorder الأصلية؛ الاختبارات تثبت أيضًا غياب completion RPC قديم جديد إذا تبدلت الهوية أثناء انتظار enqueue. لا تغيير لتسلسل المشاهد أو كتابة التأملات أو فتح القصص أو حسابات المكافأة/حدودها.

## TEST — قبول مضبوط الجدولة

ملف جديد: tests/offline/outbox-story-pending.test.tsx، **19 اختبارًا**. يشغّل StoryPlayer الحقيقي وcompleteStory وsaveGameplay الحقيقيين؛ Supabase/RPC وOutbox/dead-letter وحدود المرآة وهمية، والشبكة الفعلية ممنوعة. RewardMoment leaf وهمية لرصد amounts/onDone دون مؤقتات الحركة؛ مكون RewardMoment الإنتاجي لم يتغير. SimpleEnd الحقيقي يُفحص نصيًا.

التغطية: confirmed والمقادير والنهاية، queued وعدم XP/دنانير/المكافأة/حدث التأكيد، retry بنفس ID وqueued→confirmed، storage timeout مع write مؤجلة، فشل التخزين وRPC، رفض دائم مع فشل الأرشفة، غياب receipt، unmount، Escape، Alice→Bob، Alice→Bob→Alice، فتح قصة مختلفة، انتهاء Alice أثناء طلب Bob، replay، رفض بعد pending، إغلاق pending وثبات fixture V17 بلا entitlement/delivered، تبديل أثناء enqueue قبل RPC، وحدثا نهاية متزامنان. استُخدمت deferred promises ومؤقتات مضبوطة؛ لا اعتماد على تكرار سريع للحظ.

الاختبارات السابقة للضيف/P1-06A وDaily Quest/P1-07 ضمن البوابة الكاملة. لا اختبارات تحقيق معدلة ولا assertions لإخفاء عدم استقرار.

تعديل اختبار قديم واحد في outbox-gameplay-ui.test.tsx: mock الهوية صار يوفر اشتراكًا حقيقيًا ضمن الاختبار، وسيناريو تبديل الحساب ينشر الإشعار داخل act. التوقع القديم كان ظهور خطأ العملية القديمة عند Bob؛ استُبدل بتوقع عدم تسرب الخطأ أو المكافأة، مع إبقاء assertions منع الأرصدة وعدم صفوف Bob. انتظار فراغ Outbox أصبح waitFor لأن mount واجهة Bob يسجل مشهدًا مشروعًا ثم يزيله بعد الإقرار؛ لم يُستثنَ أي صف من الفحص. هذا تغيير عقد مقصود، وليس flaky failure. التشغيل الأول كشف أربع حالات missing mock export، ثم حالة التوقع القديم؛ وُثقت وأُعيدت البوابة بعد تصحيح harness/العقد. فشل أولي في الاختبارات الجديدة كشف matcher غير مثبت، وتوقعًا غير صحيح بمنع recorder من تحديث مرآة المالك نفسه بعد الخروج؛ صُحح نطاق assertions ليختبر واجهة المنح المحلية، دون تغيير recorder.

### النتائج النهائية

| الفحص                                                                             | النتيجة                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| npm run test:outbox                                                               | PASS: 773/773، 26 ملفًا؛ 753 سابقة + 19 جديدة + diagnostic P1-06B محلية واحدة |
| npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts | PASS: 772/772 في 25 ملفًا؛ العدد الرسمي دون diagnostic المحلية                |
| npm run typecheck:outbox                                                          | PASS، exit 0؛ فحص التطبيق وOutbox                                             |
| npm run build                                                                     | PASS، exit 0؛ تحذيرات bundler/deprecation غير مانعة، بناء محلي فقط            |
| git diff --check                                                                  | PASS                                                                          |
| بصمات B/E/F-01                                                                    | PASS، دون تعديل                                                               |

تعثر Bun Identity الأصلي يبقى غير محسوم؛ لم يُصلح ولم يُحسب ناجحًا أو يُستبدل بنتيجة معزولة. لا قبول Android أو اختبار Production في هذه الجولة.

## حماية الملفات وحدود CLOSE

الملفات المعدلة المعتمدة فقط:

1. src/components/stories/player/StoryPlayer.tsx
2. tests/offline/outbox-story-pending.test.tsx
3. tests/offline/outbox-gameplay-ui.test.tsx — harness وتوقع السياق الجديد الموصوف أعلاه
4. هذا التقرير

بصمات ملفات P1-06B الخمسة مطابقة لتقرير F-01، وتقرير F-01 بقي مطابقًا لبصمته الابتدائية 4dec69b462f8b340f4421fbf1b8533d73944e74c6ce21e0e28637aeb20be0359، وتقرير E بقي 65ac3d9e88c6a8c81504c6fcf5346d4bd616495bec9aad349d6ec66b04f2d75a. لا git add عام ولا reset/clean/stash.

هذه الدفعة تعالج الحالة الفورية لقصة واحدة؛ لا pending UI للحملات أو التحقيقات، ولا معالجة الرفض المؤرشف اللاحق تلقائيًا أو استعادة pending في واجهة جديدة بعد restart. قد تكون محاولة قديمة مؤكدة عند الخادم ثم تعيد المنحة السلطوية صفرًا؛ لا تعويض محلي أو افتراض صرف في ProfileProvider. فجوة crash بين الإقرار والمنحة المحلية باقية ضمن P1-05؛ تحديث React ليس دليل تسليم دائم.

لا تغيير settlement أو Writer Fence أو ProfileProvider أو V17 أو Cloud Save أو SQL/RPC. Guest Handoff مجمد وNO-GO. لا اتصال Production أو نشر/Android release أو merge.

**P1-04A مُعالج ضمن الشاشة الفورية المختبرة فقط؛ P1-04/P1-05/P1-06 OPEN؛ V18 HOLD.** التوقف بعد Commit واحد وPush لفرع العمل عند نجاح البوابة.
