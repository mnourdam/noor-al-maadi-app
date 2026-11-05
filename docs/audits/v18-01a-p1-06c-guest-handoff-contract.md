# V18-01A — P1-06C

## Guest → User Provenance & Durable Handoff Contract

التاريخ: 2026-11-05. الفرع: `v18-01a-outbox-recovery`.
HEAD المتحقق: `bc812b3a01147d974ad139cebaff8870755559b5`.

**Design only: AUDIT → RISK → MINIMUM FIX DESIGN → TEST PLAN.**
لا تنفيذ، ولا إنشاء handoff فعلي، ولا نقل بيانات، ولا Commit أو Push. ملفات P1-06B الخمسة المحلية محفوظة دون تغيير. **V18 = HOLD؛ P1-06 وP1-04/P1-05 = OPEN.**

## 1. القرار التنفيذي وحدوده

العقد الموصى به: **مصدر صريح ملتقط أثناء جلسة الضيف، نية دائمة، وجهة مصادق عليها مرتبطة بانتقال محدد، موافقة صريحة على snapshot محدد، ونقل حقائق تقدم الحملة فقط، مع إبقاء الأصل في أول إصدار.**

- يمكن تنفيذ أول Commit آمن، معزول وغير مفعّل، لعقد provenance ودفتر النوايا ومعاملاته واختباراته، **دون SQL أو تعديل ProfileProvider أو settlement أو Identity Partition**.
- لا أجيز اعتبار ذلك إصلاحًا كاملًا للنقل. تفعيل الإرسال يحتاج موافقات الملكية الموضحة أدناه وإثبات عقد الخادم والتقدم الصارم وغياب الآثار الاقتصادية. التنظيف مرحلة لاحقة مستقلة؛ الافتراضي `retain_source`.
- لا أستنتج أن SQL جديد مطلوب حتمًا. قد يكفي RPC الحالي لنقل تقدم متقارب إذا ثبتت دلالاته المعتمدة. لكنه **لا يثبت server/cross-device exactly-once أو أن handoff بعينه سبب الإكمال**. إن كان المطلوب receipt خلفيًا خاصًا بالنقل أو منعًا سلطويًا لآثار غير idempotent، فالعقد الحالي لا يكفي، ويُوقف التفعيل بدل اختراع ضمان محلي.

## 2. ما ثبت من التدقيق

تمت قراءة تقريري P1-06A وP1-06B المحلي، guest storage/buffer، owner/reset/partition، AccountProvider، record/flush/gameplay-write، مسارات promotion، وقواعد الحملة والاختبارات الستة القديمة. تم فحص **نصوص migrations محلية للقراءة فقط**؛ لم ينفذ SQL ولم يُفحص نشرها على أي خادم.

| المصدر                                                    | الحقيقة المتاحة / الحد                                                                                                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guest/storage.ts`                                        | الكتابات الحالية تتطلب Web Locks ومالكًا/epoch صالحين؛ مصدر localStorage فعلي محدد. لا CAS ولا معاملة مع IndexedDB.                                                                                        |
| `guest-progress-buffer.ts`                                | الملف v1 يحوي boundUid وentries، لكنه لا يحوي أصلًا بشريًا، handoff ID، موافقة، revision موثوقًا أو activity evidence كاملًا.                                                                              |
| `identity/reset.ts`                                       | يستطيع تغيير المالك قبل انتهاء أي عمل لاحق. يلزم capture قبل setActiveOwnerInternal؛ لا يجوز استنتاج المصدر بعده. epoch عداد ذاكرة يبدأ من جديد عند cold start.                                            |
| `account.tsx`                                             | no-cloud-save قد يستخدم profileRef.current؛ هذا ليس عقدًا لنقل buffer ولا إذنًا لنقل رصيد الضيف. غياب Cloud Save لا يثبت أن الحساب جديد.                                                                   |
| `record.ts`                                               | العملية العادية تستخدم `chapter_progress:<uid>:<campaign>:<chapter>`؛ RPC لا يستقبل هذا ID. acknowledged يثبت ok في مسار العميل، وليس حفظ handoff receipt أو reward delivery.                              |
| `flush.ts`                                                | قد يزيل receipt بعد ok؛ اختفاؤه لا يثبت أن دفتر handoff سجل التأكيد. المسار العادي يرسل إشعارات تقدم عامة؛ لا يجوز افتراض خلو مستمعيها من آثار لاحقة.                                                      |
| `types.ts` وتعريف RPC المحلي الأحدث `20260722063554_…sql` | المدخلات campaign/chapter/completed/score/xp/coins؛ لا source/handoff/operation ID أو expected revision. النص المحلي يستخدم auth.uid ومفتاح user+campaign+chapter ودمج completed ثابت وGREATEST للإحصاءات. |
| تعريف RPC المحلي                                          | يتحقق من وجود الحملة وعضوية الفصل ويجمع الفصول المطلوبة لإكمال الحملة؛ **لا يظهر فيه فحص كل نشاط أو ترتيب الفصول/شروط فتح الحملات**. لا يكفي وحده لإثبات تلك الشروط أو مطابقة نشر فعلي.                    |
| `importedCampaignProgress.ts`                             | قواعد فصل صارمة؛ كما أن hydrator قد يستنتج إكمال فصول سابقة من فصل لاحق. هذا الإسقاط المستنتج **ليس** قارئ إثبات مناسبًا للنقل.                                                                            |

`first_time_completion` أو `campaign_completion_updated` ليسا إذن مكافأة. تعريف upsert المحلي قد يبلغ تحديثًا حتى عند وجود سجل سابق؛ لا يُستعملان لمنح XP أو دنانير أو لإثبات استحقاق جديد.

## 3. تعريفات الهوية والسجل

### Source

مصدر واحد مسجل، لا بحث عن «أي guest namespace»:

- `sourceId`: معرف يصدر مرة واحدة داخل سجل محلي دائم لعنوان المصدر نفسه. لا يُشتق من snapshot hash وحده؛ تغير البيانات لا ينشئ مصدرًا جديدًا للتحايل على الربط.
- `sourceOwner`: قيمة `guest:<deviceId>` التي كانت نشطة **قبل** الانتقال.
- `deviceId`: الهوية المثبتة في تخزين الجهاز؛ يجب التحقق من وجود قيمتها المحفوظة ومطابقتها، لا اعتبار قيمة أنشأها getDeviceId في الذاكرة بعد فشل الكتابة دليلًا قديمًا.
- `physicalKey`: المفتاح الفعلي المحدد لملف الحملة، و`schema=buffer-v1`، و`sourceGeneration=1` لهذا العنوان. لا تغيير Identity Partition.
- `capturedEpoch` و`captureAttemptId` و`transitionId`: حواجز runtime وربط بمحاولة auth؛ ليست إثباتًا دائمًا صالحًا بعد restart بمفردها.
- `provenance`: مثل `captured_active_guest` أو `legacy_captured_now` أو `unknown`؛ وصف لما ثبت فعلًا، لا مصادقة بشرية.
- `rawSnapshot` و`rawHash` و`entriesHash` وبصمة كل إدخال. البصمة تشمل bytes/schema/IDs المطلوبة؛ لا تعني توقيع خادم أو كشف تلاعب من كود origin خبيث.
- `boundUid`: null أو وجهة واحدة مثبتة. وجود قيمة قديمة وحده يحظر الربط بوجهة مختلفة، لكنه لا يثبت تأكيدًا خلفيًا.

صلاحية SourceCapability تسمح بالالتقاط من Guest النشط، ثم بالعبور المحدد من نفس Target المصادق لأغراض binding/verification/cleanup فقط. يعاد فحص owner/epoch بعد كل انتظار وقبل أي كتابة؛ لا تستمر صلاحية Alice أثناء نشاط Bob ولا تنقل من الذاكرة إلى restart بلا إعادة تحقق.

مفتاح source registry الطبيعي هو `[deviceId, sourceOwner, physicalKey, schema, generation]`؛ uniqueness عليه يمنع إنشاء sourceId آخر للمحتوى نفسه لتجاوز binding. لا تصنع generation جديدة تلقائيًا عند logout/login أو بتغيير hash. دعم ضيوف بشريين مستقلين على جهاز واحد يحتاج سياسة منفصلة.

### Target

`{uid, owner:'user:'+uid, authTransitionId, verificationEvidence, verifiedAt}`.

التحقق: اكتمال reset/auth readiness، ثم قراءة جلسة/مستخدم مصادق عليه عبر SDK في السياق الحالي، ومطابقة UID مع owner، وفحص epoch قبل الانتظار وبعده. تسجيل ملاحظة محلية عن UID ليس توقيع ملكية من الخادم. لا تخزن tokens أو كلمات مرور.

عند binding الأول يلزم تحقق SDK سلطوي للمستخدم مثل getUser، ومطابقته مع الجلسة والمالك بعد الانتظار؛ getSession محلي أو UID مخزن لا يرقى وحده إلى إثبات جديد. إن تعذر التحقق online تبقى awaiting_target/blocked، ولا تتحول إلى verified.

عند كل استئناف تؤخذ **runtime authorization جديدة** `{owner, epoch, contextInstanceId}`. لا تقارن epoch محفوظًا من إقلاع سابق بالعداد الجديد كإثبات هوية. تطابق UID مع الوجهة المثبتة لازم حتى عند العودة Alice → Bob → Alice.

### Handoff / Entry / Attempt

- `handoffId`: UUID يصدر مرة عند إنشاء النية، ثم يبقى ثابتًا. ربط هدف تحقق لاحق لا يغيره.
- `transitionId`: معرف دخول/إنشاء حساب محدد؛ لا «آخر انتقال» عام يمكن لحساب B الاستيلاء عليه.
- `snapshotId`: hash للدفعة المحددة المعروضة للموافقة. الإضافات اللاحقة ليست مشمولة تلقائيًا.
- `entryId = H(protocol, sourceId, handoffId, campaignId, chapterId, progressFingerprint)`.
- `progressFingerprint`: حقائق التقدم المعتمدة وإصدار المحتوى/دليلها، **لا** الرصيد أو bufferedAt. `rawEntryHash` منفصل للتنظيف الدقيق.
- `attemptId`: لكل محاولة اتصال؛ للتتبع فقط. لا يغير entryId أو payload أو handoffId.

كل محاولة سابقة، قرار موافقة/رفض، ونتيجة غير محسومة تحفظ في history. unique source claim يحظر وجهتين، وunique `(sourceId,targetUid,entryKey,progressFingerprint)` يحظر إعادة عرض حقيقة مؤكدة كمنحة/نقل جديد لمجرد تغير تاريخ أو قيمة إحصائية.

## 4. التخزين المقترح — ليس جزءًا من settlement

قاعدة IndexedDB مستقلة مقترحة `irth-guest-campaign-handoff-v1`، version 1؛ **لا فتح أو إنشاء لها الآن** ولا استعمال stores المكافآت:

| Store      | المفتاح / الوظيفة                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `sources`  | sourceId + unique natural source address؛ boundUid، provenance، revision، active capture/claims                |
| `handoffs` | handoffId؛ transitionId، source/snapshot refs، target، consent، phase، policyVersion، revision، blocked reason |
| `entries`  | entryId؛ immutable sanitized payload، raw source fingerprint، state، persisted confirmation، cleanup status    |
| `attempts` | attemptId؛ entryId، authorization context، request/response أو uncertainty، sequence                           |

معاملة IDB واحدة تنشئ source claim والنية ولقطة الإدخالات، أو تحدث binding+consent+revision معًا. انتظار **transaction.oncomplete** إلزامي؛ request.onsuccess ليس قبولًا دائمًا. CAS برقم revision **داخل معاملة IDB**، لا قراءة localStorage ثم ادعاء CAS. فشل القراءة أو corruption لا يستبدل السجل بمصفوفة فارغة.

قواعد الوصول على مستوى التطبيق: عرض مرشح غير مربوط يتطلب سياق Guest المصدر أو transition موثقًا مطابقًا؛ عرض handoff مربوط يتطلب نفس UID المصادق. لا يعرض B تفاصيل مصدر/خطة Alice، ولا يبحث في كل المساحات لتقديم اقتراح. يسجل رفض B دون تسريب محتوى مصدر A. هذه حدود العميل داخل origin وليست RLS أو حماية من كود origin خبيث.

لا حذف للسجلات المؤكدة أو fingerprints في أول إصدار. retention/compaction قرار لاحق يجب أن يحافظ على منع إعادة الاستيراد وعلى دليل الربط.

## 5. الحالات والموافقة

| مستوى         | حالات مقترحة ومعناها                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| Capture       | `capture_pending` ثم `captured` فقط بعد IDB commit؛ فشل/مهلة → `capture_unresolved` أو blocked، دون ادعاء حفظ  |
| Handoff       | `awaiting_target` → `awaiting_consent` → `verified` → `sending` → `partially_confirmed` → `confirmed_retained` |
| حالات إيقاف   | `blocked(reason)`, `paused_identity`, `paused_by_user`, `declined` قبل الإرسال؛ لا تعني إلغاء RPC جارٍ         |
| Entry         | `pending`, `waiting_prerequisite`, `queued`, `sending`, `outcome_unknown`, `confirmed`, `rejected`, `blocked`  |
| Cleanup مستقل | `not_authorized`, `authorized`, `pending`, `done`؛ لا يغير حقيقة confirmation ولا ينشئ delivered               |

`verified` يعني مصدرًا/وجهة/موافقة مثبتة محليًا، **لا يعني إكمال الفصل على الخادم**. handoff confirmed لا يتحقق إلا إذا لكل إدخال مطلوب دليل دائم صالح؛ وجود rejected/unknown يمنع عبارة «اكتمل نقل الكل». لا تُستخدم Boolean واحدة للتقدم والملكية والتسليم.

قواعد الموافقة الموصى بها:

1. قبل auth: إذن حفظ مرشح الاستعادة محليًا؛ هذا **ليس** إذن النقل لحساب مجهول.
2. بعد التحقق من الهدف: عرض الحساب المصادق عليه والفصول المختارة بوضوح، وأن النقل للتقدم فقط ولا ينقل XP/دنانير/قلوب/ألعاب/قصص. لا اختيار مسبق بالموافقة، للحساب الجديد أو الموجود.
3. يجب أن يقر المستخدم أن هذه محاولة تقدمه؛ على جهاز مشترك، إن لم يستطع تأكيدها يبقى الملف دون نقل. deviceId واسم الملف الشخصي لا يثبتان هوية الشخص.
4. تحفظ الموافقة مع uid وsourceId وsnapshotId وpolicyVersion والقرار والتوقيت. تغيّر snapshot/UID يحتاج مراجعة جديدة، لا توسيعًا صامتًا للموافقة.
5. إذا ثبت boundUid=A، لا يُعاد ربط المصدر بـB حتى لو ألغي النقل أو لم ينجح إرسال. الإلغاء يوقف العمل، ولا يمحو حجز الوجهة الموثوق.
6. بعد cold restart، التوصية للإصدار الأول: اكتشاف وعرض ثم **استئناف صريح** بعد مصادقة نفس UID؛ لا إعادة موافقة لحقيقة مختلفة، ولا إرسال تلقائي لحساب آخر.
7. إلغاء الموافقة يمنع RPC/queue جديدًا؛ المحاولة الجارية قد تكون التزمت. تبقى الوجهة الأصلية، وتبقى البيانات والأدلة للمراجعة.

لا يثبت SIGNED_IN وحده أن الحساب أُنشئ للتو، ولا يفعل غياب Cloud Save ذلك. تصنيف «حساب جديد» وصفي للواجهة، وليس استثناءً لقواعد الملكية أو الموافقة.

## 6. مخطط وتسلسل Guest → User

```mermaid
sequenceDiagram
    participant G as Guest UI
    participant C as Transition coordinator
    participant L as Guest localStorage + Web Lock
    participant J as Handoff IndexedDB
    participant A as Auth / reset
    participant U as Verified User
    participant S as Canonical campaign server
    G->>C: Begin auth transition / capture permission
    C->>L: Lock exact source; validate owner+epoch; read snapshot
    C->>L: Persist separate provenance anchor
    C->>J: Source claim + handoff + entries
    J-->>C: transaction.oncomplete
    C->>L: Mark anchor journal-established
    C-->>L: Release write lock; original retained
    C->>A: Continue login/signup and normal owner reset
    A-->>U: Authenticated target / readiness
    U->>C: Confirm exact source snapshot for this UID
    C->>J: CAS bind target + consent
    J-->>C: transaction.oncomplete
    C->>L: Validate source; mirror same boundUid only
    C->>J: Persist verified plan / attempt before send
    loop Eligible chapters in strict order
        C->>S: Existing canonical RPC, progress-only arguments
        S-->>C: Response or unknown transport outcome
        C->>S: Strict authoritative postcondition read
        C->>J: Persist per-entry confirmation / uncertainty
        J-->>C: transaction.oncomplete
    end
    C-->>U: Confirmed / partial / blocked; no wallet grant
    Note over L,J: First release retains original. No shared LS/IDB transaction.
```

تفاصيل تنفيذ لازمة للتسلسل:

- capture يبدأ قبل SDK signIn/signUp في التدفق الذي يتحكم به التطبيق. pre-transition hook قبل setActiveOwnerInternal يغطي auth callbacks غير المتوقعة؛ ليس إعادة استنتاج بعد تسجيل الدخول.
- العمل داخل callback المصادقة يجب أن يُجدول دون انتظار auth SDK بصورة قد تسبب قفلًا ذاتيًا. لا تنتظر فحص جلسة SDK داخل قفل auth callback نفسه؛ تحقق الهدف بعد عودة callback/readiness.
- بميزانية انتظار محدودة (إعادة استعمال سقف الحفظ الحالي 8 ثوانٍ إن اعتمد) لا تتعطل المصادقة للأبد بسبب Web Lock/IDB. الفشل يسمح بمتابعة تسجيل الدخول **دون نقل**، مع رسالة أن استعادة الضيف لم تُجهز. لا يختلق مصدرًا في مساحة المستخدم.
- timeout لا يعني إلغاء معاملة تخزين. تظل الكتابة المقبولة متتبعة حتى settle/abort؛ إذا التزمت ثم انتهى السياق، يكتشف السجل، لكنه لا يرسل/ينشر تحت epoch قديم. لا «نجاح capture» من finally أو مجرد تغير owner.
- إذا لم تُحفظ أي نية قبل فقد سياق الضيف، لا استعادة تلقائية من login الحالي. يمكن الرجوع صراحة إلى جلسة الضيف لالتقاط المصدر والتحقق منه من جديد.

## 7. عبور localStorage / IndexedDB دون ذرية وهمية

### الالتقاط والربط

1. تحت **نفس Web Lock** الذي يستخدمه كاتب buffer، ثبت owner/epoch، اقرأ الملف بصرامة، واحسب fingerprints. Hash async يجرى قبل فتح IDB transaction؛ يعاد فحص السياق بعد الانتظار.
2. قبل التسجيل الجديد، اقرأ source registry و**anchor محليًا منفصلًا** محدد العنوان، مثل logical `irth.guest-campaign-handoff.anchor.v1.<source-address-hash>` في مساحة المصدر. إنشاء anchor جديد يثبت sourceId وschema والعنوان وأن journal متوقع، دون تعديل bytes ملف V17 نفسه. فشل حفظه يمنع بدء capture الموثوق. وجود anchor/claim قديم لا يسمح بإعادة إصدار sourceId لمجرد غياب صف.
3. احفظ source claim + snapshot + handoff في IDB وانتظر oncomplete. ثم أثبت `journalEstablished` في anchor واحفظ تأكيد ذلك في journal. لا تعلن captured جاهزًا للربط قبل اكتمال هذه المراحل. crash بينها يعيد anchor_pending/capture_unresolved لنفس المصدر، لا نجاحًا وهميًا أو مصدرًا جديدًا.
4. إن وجد anchor established أو boundUid محفوظ بينما journal مفقود/غير مقروء، فهذا **فقد دليل/تخزين غير محسوم** وليس تثبيتًا جديدًا فارغًا: blocked، دون إسناد إلى current login. إن وجد journal والـanchor مفقودًا، لا يتم النقل حتى إصلاح المطابقة وفق السجل نفسه وسياق صالح، لا UUID جديد. فقد كل آثار البروتوكول معًا لا يمكن تمييزه مضمونًا عن بيانات legacy؛ ليس هناك ضمان ضد eviction شامل أو clear خارجي.
5. بعد target verification والموافقة، اجعل binding+consent داخل IDB transaction واحدة ذات guards قبل/داخل callbacks وعند الإكمال. أي source claim مربوط لغير الهدف يفشل؛ لا تحرير وإعادة ربط عن طريق UUID جديد.
6. mirror boundUid في **المصدر المحدد نفسه** بعد commit الربط فقط. يلزم capability داخلية ضيقة تمنح القراءة/الكتابة لهذا المفتاح الملتقط من سجل موثوق؛ لا تبديل global owner مؤقتًا ولا تمرير owner اعتباطي إلى feature عامة. `localScope` الحالي يرفض هذا العبور عمدًا؛ لا نضعفه.
7. خزّن mirror plan/hash مسبقًا. إذا توقف التطبيق بعد IDB bind وقبل LS write فالحالة `binding_mirror_pending`، ولا إرسال. إذا كُتب LS ثم توقف قبل IDB mirror receipt، تُطابق bytes مع الخطة والـUID الثابت قبل إثبات اكتمالها. اختلاف/فشل قراءة/وجهة أخرى → blocked والأصل محفوظ. الـanchor ليس بديلًا عن تأكيد خادم أو موافقة.
8. لا يُنسخ source buffer إلى user namespace باعتباره حقيقة جديدة. IDB journal هو فهرس نقل محدود، وليس بديلًا عن profile أو دليل مكافأة. اللقطة immutable، والإضافات اللاحقة ليست إذنًا ضمن الدفعة السابقة.

### استمرار الضيف بعد الالتقاط/العودة

الموافقة تخص snapshot لا كل ما سيكتبه الجهاز مستقبلًا. إدخالات/تعديلات لاحقة تحتاج snapshot وموافقة جديدتين لنفس الوجهة المحجوزة؛ لا تُرسل تلقائيًا. اللقطة الأصلية تبقى في journal، والتنظيف يقارن rawEntryHash حتى لا يزيل تعديلًا أحدث.

P1-06A يرفض حاليًا الكتابة إلى ملف bound. لذلك **قبل تفعيل النقل فعليًا** يجب اعتماد سلوك العودة للضيف: التوصية السماح بحفظ إضافات محلية فقط إلى المصدر ذي **binding موثوق في journal مطابق للملف**، مع إبقاء UID نفسه ومنع الترقية التلقائية. لا يكفي حذف شرط boundUid بصورة عامة. الملف القديم المرتبط بلا provenance يظل blocked.

على جهاز مشترك لا يحول logout نفس `guest:<device>` إلى شخص جديد موثوق. نقل المصدر نفسه إلى B يظل ممنوعًا. دعم «ضيف جديد مستقل» يحتاج مصدرًا/مساحة مستقلة وسياسة واضحة دون نسخ القديم؛ ليس remint لـsourceId أو تغيير boundUid، وليس جزءًا من أول Commit. إذا لم يعتمد سلوك الاستمرار، يبقى التفعيل محجوبًا بدل إدخال انحدار صامت في لعب الضيف.

### التنظيف — معطل افتراضيًا في أول إصدار

التنظيف لا يبدأ لمجرد RPC ok أو نفاد Outbox:

1. احفظ confirmation مثبتًا ونسخة المصدر في IDB، ثم transaction منفصلة تحفظ `cleanup_authorized` مع sourceId/target/entry hash/evidence refs.
2. بعد oncomplete، تحقق fresh من نفس target UID/owner/epoch وصلاحية SourceCapability، وخذ source Web Lock وأعد التحقق بعد الانتظار، ثم أعد القراءة الصارمة؛ احذف **فقط الإدخال المطابق** الذي بقي له تصريح تنظيف. احتفظ بالإدخالات الأحدث/غير المحسومة وبالحقول الأخرى.
3. احفظ القائمة الجديدة في LS. حتى عند فراغها أبق الملف وboundUid؛ لا removeItem/clear/reset عامًا للمصدر.
4. احفظ cleanup done في IDB بعد نجاح الكتابة. quota يترك المصدر القديم وcleanup pending؛ لا ينقص عداد sourceRemaining بالتخمين.
5. crash بعد LS write وقبل IDB done: يستأنف فقط من cleanup authorization المحفوظ والأرشيف المطابق. غياب إدخال دون ذلك دليل غير محسوم، لا إثبات transfer أو reward delivery.

لا تعالج هذه الخطوات eviction/تلف المساحتين أو انقطاع طاقة كضمان فيزيائي. الرجوع الآمن يبقي الأصل والسجل؛ لا إعادة تشغيل كاتب أقدم يتجاهل binding ولا حذف قاعدة البيانات.

## 8. النقل القانوني وidempotency والدمج

### ما يُرسل وما لا يُرسل

payload whitelist: campaignId وchapterId وحقيقة completed المسموح بها فقط. لا ترسل قيم source xpEarned/coinsEarned أو رصيد Profile، ولا score ضيف يعتمد عليه فتح/مكافأة دون عقد تحقق مستقل. إن استُخدم RPC الحالي: `p_xp_earned=null`, `p_coins_earned=null`, `p_score=null`؛ هذه ليست منحة «صفرية» شكلية، بل عدم نقل أي رصيد أو إحصاء اقتصادي من الضيف.

`locked`/`unlocked`/محاولة جزئية ليست صلاحية إرسال `p_completed=false` لفتح فصل؛ تبقى محلية/معلقة. لا يحول consent إكمالًا غير مثبت إلى حقيقة معتمدة. raw snapshot قد يحتفظ ببيانات buffer القديمة محليًا كدليل، لكنها لا تدخل projection الإرسال أو wallet.

حد Cloud Save المستقل مهم: P1-06B أثبت أن فرع AccountProvider يمكنه استعمال profileRef.current المحقون كضيف دون معالجة buffer. لا يغير هذا العقد Cloud Save، ولا يفترض أن المسار الموجود أصبح خاليًا من نقل أرقام بمجرد إضافة handoff. قبل تفعيل رحلة فعلية يجب إثبات ترتيب real ProfileProvider/AccountProvider وعدم تبني wallet الضيف عبر الفرع المستقل؛ إن لم يثبت ذلك، يظل تفعيل الرحلة محجوبًا ويحتاج قرارًا منفصلًا خارج هذه المهمة. C1 غير المفعّل لا يفتح هذا المسار.

لا `addPoints/addDinars` أو قلوب أو مقتنيات أو مكافآت قصص/ألعاب/achievement claim بسبب handoff. يلزم اختبار مستمعي الأحداث غير المباشرين كذلك؛ لا تعديل stores المكافآت أو baseline لتحقيق كبت شكلي. إن تعذر إثبات خلو الإرسال/المستمعين من منحة، يتوقف تفعيله؛ P1-05 لا يُغلق.

### strict progress / overlap

- تُقرأ حالة الخادم وmanifest الحالي بصرامة وبمالك/epoch صالحين؛ error ليس empty. لا تستخدم profile seed أو local pending أو hydrateLegacyProgressFromCloud الذي يستنتج فصولًا سابقة كدليل تصريح.
- تُحترم قواعد campaign progression وisChapterUnlocked القائمة، بما فيها prerequisites الصريحة وكل الفصول السابقة والقواعد الخاصة. ترتيب الإدخالات من manifest، لا من ترتيب Object.values في الملف.
- عند غياب دليل تحقق الأنشطة/معنى IDs عبر الإصدار، يبقى الإدخال waiting_prerequisite/blocked. لا يُستبدل الدليل بموافقة المستخدم أو بمجرد status=completed.
- إذا كانت حالة الخادم تغطي الفصل بالفعل: لا RPC جديد؛ احفظ `proof.kind=authoritative_existing`. لا تدع أن handoff منحه أو أنه يستحق مكافأة.
- إذا كان الحساب جزئيًا: أرسل فقط المرشح الذي استوفى القواعد، ثم أثبت الفصل الحالي قبل الانتقال لما يليه. لا تنقص تقدم المستخدم، ولا تجمع XP/coins، ولا تعلن الحملة كاملة من عد الفصول المحلية.
- نص RPC المحلي يثبت membership/sticky merge، لا كل هذه القواعد. اعتماد الدلالة الخلفية الفعلية ومعنى version/IDs شرط تفعيل؛ لا تعديل لسياسة التقدم لتعويض نقص الدليل.

### هوية صف التقدم مقابل هوية طلب النقل

المفتاح الخلفي المتاح هو `(auth.uid, campaignId, chapterId)`. تكرار الطلب قد يكون متقاربًا على completed/max fields وفق النص المحلي، لكنه ليس receipt لطلب handoff. لا تغير ID العملية العادية `chapter_progress:<uid>:...`.

التوصية للربط اللاحق: **Outbox kind مخصص** `guest_campaign_handoff` مع ID ثابت `guest_chapter_handoff:<targetUid>:<entryId>` ومرجع handoff/snapshot، بدل استبدال receipt عمل لعب عادي على المفتاح نفسه. يعاد استخدام مسار النقل القانوني إلى نفس RPC ووسائل الحفظ القائمة، دون SQL، مع handler ضيق:

- يقرأ journal ويثبت binding/consent/entry revision والجلسة قبل كل RPC وبعد كل انتظار؛ revoked/unknown/missing journal → blocked، لا send ولا dequeue.
- الطلب يحمل whitelist التقدم فقط؛ تبقى IDs الطبيعية والـRPC العادية كما هي.
- يسجل attempt في IDB قبل enqueue/send. retry لنفس الحقيقة يستخدم نفس entryId وOutbox ID وpayload؛ attempts فقط تتغير.
- لا يعيد handler `ok:true` للـflush إلا بعد persist confirmation في journal. إذا فشل حفظ الإقرار تبقى العملية غير محسومة، وإن كان الخادم ربما التزم.
- الرفض الدائم يحفظ أولًا كـentry rejected مع السبب/binding/payload؛ بعدها فقط يرجع سببًا يسمح بالأرشفة. إن فشل journal فترجع حالة transient خاصة بالنقل، لا سبب permanent يؤدي إلى حذف receipt قبل تثبيت الرفض. الأرشفة ليست confirmation أو تصريح تنظيف للمصدر.
- replay من client قديم لهذا kind لا يجب أن يرسله كفعل لعب: الكود الحالي يرفض unknown-kind، وسبب unknown-kind ليس permanent في قائمته. يلزم اختبار mixed-version فعلي قبل اعتماد rollout/rollback؛ هذا استنتاج مصدر لا ضمان شامل لكل إصدار قديم.
- لا تستخدم kind chapter_progress بلا journal gate، وإلا يستطيع flush لاحق الإرسال بعد إلغاء الموافقة. إضافة kind/handler **قرار تكامل لاحق**، ليست من أول Commit أو تعديل Schema v2.

إشعارات المصدر الجديد تكون تقدم handoff فقط بعد التأكيد، لا احتفالًا/claim. لأن flush العام ومستمعيه قد يعيدون تحميل التقدم، يظل اختبار عدم استدعاء أي منح اقتصادية شرط قبول شاملًا للمسار؛ لا يكفي عدم وجود addPoints في handler نفسه.

### الإقرار المفقود / حالة L

دليل التأكيد واحد من: رد RPC مطابق ومعه postcondition موثوق، أو قراءة سلطوية تثبت أن الحالة المطلوبة موجودة أصلًا. يتحقق adapter من UID وcampaign/chapter/version ودلالة completed ويحفظ الدليل داخل IDB. ok=true وحدها ليست كافية.

بعد crash في sending أو بعد حذف Outbox receipt: اقرأ **الحالة السلطوية** أولًا. إذا غطت المطلوب فاحفظ confirmed/server_satisfied دون طلب أو منحة جديدة. إذا فشلت القراءة فابق outcome_unknown. إذا لم توجد الحقيقة، لا تعتبر الغياب إلغاءً للطلب القديم؛ retry بنفس الهوية جائز فقط بعد اعتماد idempotency دلالي بلا آثار اقتصادية. إذا لم يثبت هذا العقد فلا retry تلقائي ولا cleanup.

لا توجد وسيلة عميل لإثبات أن طلب handoff المحدد سبب الحالة، أو لاسترجاع receipt خلفي لم يُحفظ، أو لتحقيق exactly-once خلفي بمعرف لا يستقبله RPC. الحاجة إلى هذا المستوى تتجاوز العقد الحالي وتتطلب قرار backend مستقلًا، لا delivered محليًا.

## 9. سيناريوهات A–L

| الحالة                            | السلوك الملزم                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. ضيف ينشئ حسابًا                | capture أثناء الضيف، ربط بمحاولة signup، تحقق UID بعد auth، موافقة صريحة؛ لا استثناء من القواعد لأن الحساب يبدو جديدًا.                                                 |
| B. دخول حساب موجود                | عرض منفصل للتقدم والوجهة والتعارضات؛ الدمج لا يستبدل تقدم الحساب؛ رفض الموافقة يبقي المصدر.                                                                             |
| C. A → B                          | ليس انتقال Guest أصلًا؛ لا التقاط مصدر A كضيف، ولا إلحاق candidate سابق لحساب A بـB. أي binding لـA يبقى محجوزًا له.                                                    |
| D. جهاز مشترك                     | guest owner هو حاوية تقنية لا هوية شخص. مراجعة وإقرار المستخدم، والشك يبقي المصدر دون نقل؛ لا استعمال الاسم أو «آخر حساب».                                              |
| E. توقف أثناء الانتقال            | استئناف من journal+transitionId؛ لا current-user inference. no durable capture يعني لا استعادة تلقائية.                                                                 |
| F. دخول ثم خروج وعودة للضيف       | عرض الأصل/status النقل محفوظين. لا regrant. إضافات محلية جديدة لا تُرسل تلقائيًا، وbound source لا يعاد إلى UID آخر؛ سلوك الاستمرار المذكور يحتاج اعتمادًا قبل التفعيل. |
| G. buffer مربوط بغير الهدف        | blocked/source_bound_elsewhere؛ لا تعديل boundUid ولا نسخ الملف بمعرف جديد إلى الوجهة الحالية.                                                                          |
| H. نفس الحملة في الحساب والضيف    | dominance لحالة الخادم؛ تخطي الموجود، نقل الفصول المؤهلة بترتيب صارم، تأكيد مستقل، لا جمع مكافآت أو تراجع.                                                              |
| I. V17 بلا intent                 | تصنيف الثقة أدناه؛ يمكن capture الآن من سياق ضيف مثبت، لا backfill بملكية login الحالي.                                                                                 |
| J. نجاح بعض الفصول                | partially_confirmed؛ كل فصل ذو إثبات مستقل، البقية pending/blocked. لا «نقل الكل»، ولا مسح المصدر كله.                                                                  |
| K. غياب locks أو فشل LS/IDB       | لا capture/bind/send/cleanup جديد غير موثوق. auth يمكن أن يتابع دون handoff. لا fallback LS غير ذري أو empty على error.                                                 |
| L. RPC التزم ثم crash قبل الإقرار | outcome_unknown؛ fresh auth لنفس UID، authoritative read، ثم confirmation journal أو إبقاء مجهول. لا إعادة منح ولا تكرار بمعرف جديد.                                    |

## 10. سياسة V17

الثقة في **المالك** مستقلة عن صلاحية **الإكمال**:

| التصنيف                     | أمثلة / القرار                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| مصدر موثوق تقنيًا يمكن عرضه | ملف صالح في مساحة guest النشطة، device ID محفوظ متطابق، capture قبل الانتقال تحت القفل؛ يسجل `legacy_captured_now` بوقت الالتقاط الحقيقي، لا تاريخ ملكية مختلق. العرض لا يساوي إرسالًا أو confirmation. |
| يحتاج موافقة/تحقق إضافي     | جهاز مشترك، محتوى/version غير مثبت، boundUid قديم مطابق بلا journal، أو فقد سياق الانتقال؛ لا rebind، ويجب إعادة إثبات المصدر/المحتوى قبل التأهيل.                                                      |
| مجهول لا يجوز إسناده        | ملف global غير مربوط، ملف نُقل عند boot إلى user namespace بلا أصل موثق، device identity مفقودة/متعارضة، أو namespace آخر عُثر عليه بعد login. current UID ليس علاجًا للغموض.                           |
| تالف                        | JSON/shape/IDs أو حقول متضاربة/قراءة فاشلة؛ احتفاظ bytes ومؤشر خطأ، دون filter إلى مصفوفة فارغة أو إصلاح/reset تلقائي.                                                                                  |

ملف V17 بلا intent ليس مرفوضًا لمجرد قدمه؛ يمكن التقاطه الآن فقط من سياق مصدر قابل للتحقق. لكن غياب activity/content-version evidence لا يُحل بمجرد capture أو الموافقة. لا تعيد استخدام ملف unbound نُقل إلى المستخدم تلقائيًا كإثبات أن هذا المستخدم مالكه. لا تغيير Identity Partition أو مسح/إعادة تهيئة V17.

## 11. قرار مستقل لكل اختبار قديم من الستة

لم تعدل أي Assertions. P1-06B وثق 6/6 ناجحة على مرجع ما قبل P1-06A مقابل 6 إخفاقات في fixture الحالي؛ لا تدخل هذه الحالات في مجموعة 535.

| الحالة                             | التصنيف المستقل                                                                    | تحديث مستقبلي مطلوب ولماذا                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| persists chapter progress locally… | مشكلة mock + عقد async؛ ليست دليل فقد إنتاجي                                       | اجعل الاختبار async، await saved:true، وركّب owner/partition/locks حقيقية. تحقق بعد ذلك من قراءة المصدر نفسه وإعادة الفتح، لا read فور استدعاء Promise.                                            |
| merges monotonically…              | مشكلة mock/API؛ invariant صحيح                                                     | await الكتابتين بقيم الإحصاءات المحلية نفسها، ثم تحقق من sticky completed/max داخل المصدر. لا تغير أرقام Assertions لتخفي خطأ ولا تستخدمها كإذن نقل XP.                                            |
| promotes… signed-in… and clears it | توقع قديم غير صحيح + فجوة نقل حقيقية سابقة، لا مجرد runner                         | استبدل السيناريو بعد اعتماد العقد بالتقاط Guest صريح، تحقق/consent للهدف، تأكيد فصلين، ثم مصدر retained أولًا. اختبار cleanup منفصل بعد إثباته؛ لا تحويل promoted المتوقع إلى صفر لتمرير الاختبار. |
| never leaks… another account       | invariant صحيح؛ mock لا ينشئ binding موثوقًا                                       | أنشئ claim وموافقة Alice دائمين، حاكِ فشل الإرسال، ثم Bob؛ تحقق من no send/no rebind/الأصل محفوظ. failure الحالي partition_unavailable لا يختبر invariant المقصود.                                 |
| keeps buffer for retry…            | مبدأ الاحتفاظ صحيح؛ انتظار ACK ثم افتراض تنظيف فوري توقع قديم                      | افصل network outcome_unknown عن confirmed وعن cleanup pending؛ استأنف بنفس IDs وتحقق أن مصدرًا غير منظف لا يعني فشل الخادم. remaining=null ليس صفرًا/واحدًا مفترضًا عند خطأ قراءة.                 |
| does nothing without identity      | no send invariant صحيح؛ mock + clear API قديمان، وبدون target مسار غير مدعوم عمدًا | تحقق no_uid/blocked وraw unchanged؛ لا تفترض empty. clearGuestBuffer async ليس جزء handoff ولا دليل تنظيف، ويختبر مستقلاً إذا أُبقي كفعل مستخدم صريح.                                              |

تعثر Bun Identity من **الجذر** يظل غير محسوم: آخر تشغيل P1-06B انتهى timeout/124 بعد ست حالات. لا تعتبر نسخة معزولة بديلًا عن نجاحه، ولا تعديل harness له في هذه الجولة.

## 12. أول Commit المقترح وتقسيم التفعيل

**C1 المقترح للاعتماد فقط — dormant provenance journal، لا نقل ولا binding على ملفات اللاعب:**

1. `src/lib/campaigns/guest-handoff/contract.ts`: DTOs/state transitions/reasons، فصل ownership عن progress confirmation، whitelist لا تتضمن اقتصادًا.
2. `src/lib/campaigns/guest-handoff/codec.ts`: strict validation، canonical fingerprints/source identity؛ لا إصلاح بيانات.
3. `src/lib/campaigns/guest-handoff/journal.ts`: IDB مستقل بمعاملات source/intent/entries/CAS؛ لا استيراد ProfileProvider/settlement أو فتح عند import.
4. `tests/offline/outbox-guest-handoff-contract.test.ts`: بيانات اصطناعية، capture/bind conflicts/crash/quota/corruption؛ تأكيد أن الوحدة غير مستوردة من boot/account/gameplay.
5. تقرير تنفيذ C1 بعد الاختبارات؛ تقارير واختبارات P1-06B الحالية تبقى مستقلة محفوظة، ولا تُدرج أو تُعاد كتابتها تلقائيًا ضمن Commit آخر.

C1 **ليس** runtime freeze للكتّاب أو حل اكتشاف guest source في التطبيق. لا يُكتب boundUid فعلي ولا تتصل الوحدة بـauth/Outbox. فائدته المحددة إثبات أن سجل provenance/claim/consent يتصرف ذريًا داخل IDB ويحفظ المصدر دون افتراض ذرية مع LS.

بعد مراجعة C1، وليس الآن:

- **C2 Capture & consent integration:** coordinator + hooks محدودة في account.tsx وidentity/reset.ts **قبل swap**؛ guest-progress-buffer/storage source capability؛ سلوك متابعة الضيف ذي binding موثوق. لا تعديل Cloud Save/ProfileProvider أو مسارات reward.
- **C3 Progress transport:** adapter منفصل + OutboxKind/flush handler خاصان، stable entry IDs وjournal gates وstrict authoritative reader. لا تفعيل حتى يثبت backend/strict/no-economic-side-effects؛ العملية العادية ومعرفاتها وأرقامها لا تتغير.
- **C4 Recovery and acceptance:** cold restart/partial transfer/mixed-version/native Chromium وAndroid. يبقى retain_source.
- **C5 Cleanup اختياري:** لا يدخل أول تفعيل؛ يعتمد بعد crash matrix وarchive/entry comparison وقرار retention.

إذن **MINIMUM FIX آمن دون SQL ممكن لمرحلة الحفظ/التهيئة المحدودة**. نقل آلي كامل وتنظيف المصدر لا يُعتمد الآن بمجرد نجاح هذه النواة؛ يحتاج الإثباتات والقرارات المحددة، وقد لا يحتاج SQL إذا ثبت كفاية العقد الموجود. لا توسع تلقائيًا إلى ProfileProvider أو مخازن المكافآت.

## 13. مصفوفة اختبارات قابلة للتنفيذ

كل خادم/RPC وهمي؛ Native tests على أصل اختباري، لا موقع إرث. نقاط توقف مضبوطة لا تكرار سريع عشوائي.

| ID  | الجدولة/البيانات                                         | معيار القبول                                                                                       |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| T01 | مصدر Guest صالح، capture ثم قراءة من سياق جديد           | sourceId/snapshot/transition ثابتة؛ لا target أو نجاح قبل commit                                   |
| T02 | مصدران/جهازان/ملف آخر بعد login                          | لا enumeration/تلقين مصدر جديد من current owner؛ لا read/send لمصدر غير ملتقط                      |
| T03 | Alice→Bob→Alice أثناء capture/bind/send                  | runtime tokens القديمة ترفض؛ target UID ثابت؛ لا نشر/cleanup تحت Bob                               |
| T04 | signup جديد مقابل existing account                       | كلاهما يحتاج confirmation؛ no cloud save لا يتجاوز consent                                         |
| T05 | shared device/decline/تغير snapshot                      | no send؛ الأصل محفوظ؛ snapshot جديد ليس مشمولًا بالموافقة السابقة                                  |
| T06 | سياقان يربطان نفس source إلى A/B                         | IDB transaction واحد يفوز؛ الآخر blocked؛ لا UUID جديد للتحايل                                     |
| T07 | نفس source+target+entry retry/attempts                   | handoff/entry/outbox IDs ثابتة؛ تاريخ attempts مستقل؛ لا إعادة تفسير delivered                     |
| T08 | stop قبل IDB capture commit                              | لا intent موثوق ولا مصدر يُستنتج من login؛ الأصل باقٍ                                              |
| T09 | stop بعد capture commit وقبل owner swap                  | اكتشاف awaiting_target؛ لا RPC؛ استئناف نفس الانتقال بإذن جديد مناسب                               |
| T10 | stop بعد swap وقبل target/consent                        | لا bind من الحساب الحالي وحده؛ candidate مرتبط authTransition الأصلي                               |
| T11 | stop بعد IDB bind وقبل mirror                            | binding_mirror_pending لنفس UID؛ لا نقل أو rebind                                                  |
| T12 | LS mirror نجح ثم crash قبل journal marker                | تحقق الخطة/bytes والـUID ثم استئناف؛ mismatch→blocked                                              |
| T13 | record attempt/enqueue commit ثم stop                    | queued/sending ليست confirmation؛ receipt missing لا يثبت النقل                                    |
| T14 | RPC التزم، ضاع callback؛ server read ناجح                | server_satisfied evidence دائم؛ لا RPC/منحة جديدة ولا claim causal receipt                         |
| T15 | الحالة نفسها، server read SecurityError/offline          | outcome_unknown؛ المصدر محفوظ، لا empty أو retry غير معتمد                                         |
| T16 | durable confirmation ثم stop قبل UI                      | إعادة عرض من journal بلا منح؛ Profile methods لا تُستدعى                                           |
| T17 | cleanup authorization ثم stop قبل LS                     | المصدر موجود؛ cleanup pending لا transfer failed                                                   |
| T18 | LS cleanup نجح ثم stop قبل journal done                  | archive+authorization يسمحان بالمطابقة؛ لا إعادة إرسال/منح                                         |
| T19 | quota/corrupt/blocked IDB أو LS في كل حد                 | لا partial IDB binding؛ لا empty fallback؛ auth يتابع دون نجاح handoff وهمي                        |
| T20 | لا Web Locks في Chromium                                 | لا mutation/fallback؛ رسالة واضحة؛ الأصل محفوظ                                                     |
| T21 | تبويبان + mutation بعد snapshot                          | snapshot ثابت؛ الإدخال الأحدث لا يحذف؛ source binding لا يتغير                                     |
| T22 | حساب له فصل/حملة مكتملة مسبقًا                           | skip RPC وproof authoritative_existing؛ لا sum XP ولا reward claims                                |
| T23 | target جزئي، فصل لاحق بلا prerequisites/activities proof | waiting_prerequisite؛ لا ملء فجوات أو استعمال transitive hydration كإثبات                          |
| T24 | تغير المحتوى/ID/version أو API response ناقص             | blocked أو authoritative revalidation؛ لا قبول ok وحدها                                            |
| T25 | جزء confirmed وجزء rejected/unknown                      | partially_confirmed، مصدر retained، لا complete-all أو cleanup عام                                 |
| T26 | boundUid مخالف أو ملف legacy نُقل عند boot               | لا إسناد/إعادة ربط؛ raw bytes محفوظة؛ current session لا تصلح provenance                           |
| T27 | إلغاء بعد enqueue وقبل flush                             | kind handler يرفض الإرسال؛ الأصل والنية محفوظان؛ لا تفسير cancellation كـrollback                  |
| T28 | active gameplay Outbox على نفس الفصل                     | handoff ID مستقل؛ لا overwrite/dequeue لإيصال اللعب؛ merging سلطوي فقط                             |
| T29 | client قديم يرى kind جديد / rollback                     | unknown-kind لا يرسل أو يسقط البيانات؛ journal/source retained؛ اختبار فعلي لا افتراض              |
| T30 | probe كل direct/indirect reward callback وRPC args       | صفر Profile/addXP/dinars/hearts/collection grants؛ source stats لا تُرسل؛ لا delivered             |
| T31 | V17: صالح في Guest/غير مؤكد/مجهول/تالف                   | التصنيفات الأربعة صحيحة؛ لا تغيير buffers القديمة أو Partition                                     |
| T32 | logout→Guest ثم إضافات جديدة                             | محلية فقط، لا تشملها consent قديمة ولا تنتقل لـB؛ لا إعادة تسمية المصدر للتحايل                    |
| T33 | Chromium native مع إغلاق/إعادة فتح profile مؤقت          | استعادة intent/consent/confirmed؛ لا إعادة منح؛ لا claim power-loss                                |
| T34 | Android WebView/emulator فعلي عند توفره                  | secure context/Web Locks وIDB/LS failure/restart؛ القبول Pending حتى ينفذ فعليًا                   |
| T35 | anchor موجود وjournal مفقود أو العكس                     | blocked/recovery لنفس المصدر؛ لا fresh install أو UID جديد بالتخمين                                |
| T36 | تبديل الشخص/الحساب مع journal خاص بـAlice                | Bob لا يقرأ تفاصيله ولا يستولي على intent غير مربوط بانتقاله                                       |
| T37 | real AccountProvider/ProfileProvider startup order       | لا wallet carry ضمن الرحلة المقبولة؛ الفشل يحجب التفعيل دون تغيير Cloud Save في هذا الإصلاح        |
| T38 | الاختبارات السابقة وP1-06B                               | استمرار 535 السابقة وتحديث الستة لاحقًا وفق قراراتها، دون تعديل historical Assertions لإخفاء العيب |

لا تدّعي هذه الخطة نتائج تنفيذ لم تحدث. اختبارات P1-06B المحفوظة: 535 ناجحة، 14 سيناريو Chromium تشخيصيًا، legacy fixture ستة إخفاقات، وBun root timeout؛ هذه نتائج الجولة السابقة وليست تشغيلًا جديدًا في جولة التصميم.

## 14. القرارات المطلوب اعتمادها قبل IMPLEMENT

1. اعتماد C1 فقط كوحدة غير مفعّلة، وقاعدة handoff مستقلة عن settlement، دون مصادر/نيات حقيقية؛ وanchor منفصل في تكامل C2 لمنع اعتبار journal مفقود تثبيتًا جديدًا.
2. موافقة صريحة للحساب الجديد والموجود، وتقييد كل موافقة بـsource/snapshot/UID، واستئناف صريح بعد cold restart في أول إصدار.
3. مصدر تقني واحد/عنوان واحد لا يعاد ربطه؛ سياسة الجهاز المشترك والعودة إلى ضيف ذي مصدر مربوط، وحدود الإضافات المحلية؛ لا personas أو generations جديدة تلقائيًا.
4. `retain_source` افتراضيًا، والتنظيف مرحلة اعتماد منفصلة مع archive وcleanup authorization.
5. تصنيفات V17 الأربعة؛ لا إسناد للملف global/user-unbound الغامض باسم login الحالي.
6. اعتماد دلالات backend الفعلية: sticky progress بلا آثار اقتصادية، strict prerequisites/activities/version behavior وإعادة الطلب. النص المحلي وحده لا يثبت نشرًا فعليًا.
7. الموافقة لاحقًا على adapter/kind/Outbox ID مستقلين وتحقق journal داخل flush، بدل استعمال sender قديم يمكنه الإرسال بعد revocation؛ لا تغيير ID العادي أو SQL ضمن ذلك.
8. اشتراط إثبات عدم منح مباشر/غير مباشر عند handoff، وعدم اعتبار profile seed أو RPC ok أو Outbox drain تسوية مكافآت.
9. تحديث fixtures الستة بموافقة مستقلة على contract الجديد؛ إبقاء Bun الأصلي وAndroid غير محسومين حتى تحقق مناسب.

**خلاصة القرار:** العقد قابل للتنفيذ على مراحل صغيرة؛ أولها آمن ومعزول دون SQL، لكنه لا يفتح بوابة نقل حقيقية الآن. لا يوجد أساس لادعاء exactly-once أو تنظيف آمن بلا إثبات backend/confirmation والحدود بين المخزنين. بقيت ملفات P1-06B كما هي، ولم يُنشأ handoff أو Commit أو Push. انتهت الجولة عند التصميم وخطة الاختبار. **V18 HOLD؛ P1-06 OPEN؛ P1-04/P1-05 OPEN.**
