# V18-01A — P1-06D-04

## Durable Anchor & Exact-Source Recovery Adapters

التاريخ: 2026-11-05. الفرع: `v18-01a-outbox-recovery`.
HEAD الابتدائي المطابق: `f99401298af471650e5dfb592440b1980354850d`.

**محوّلان فعليان غير مفعّلين، ومساحة تشغيل اصطناعية فقط. P1-06 OPEN؛ P1-04/P1-05 OPEN؛ V18 HOLD.**

## AUDIT → RISK → MINIMUM FIX

تحقق الفرع وHEAD وGit Status أولًا؛ tracked كان نظيفًا، مع خمسة ملفات P1-06B المحلية غير المتتبعة. قُرئت تقارير [P1-06C](./v18-01a-p1-06c-guest-handoff-contract.md) و[D-01](./v18-01a-p1-06d-01-handoff-foundation.md) و[D-02](./v18-01a-p1-06d-02-source-adapter.md) و[D-03](./v18-01a-p1-06d-03-transition-coordinator.md)، ووحدات coordinator/contract/source adapter/journal، guest storage/buffer وPartition/owner/reset. reset للقراءة فقط.

كانت D-03 تحقن anchor وقراءة الاستعادة من fixture. المطلوب الآن نقل هذين العقدين إلى وحدتين قابلتين للاختبار بالتخزين الحقيقي، دون login hooks أو تعديل صلاحيات D-02 أو إنشاء سياسة ملكية.

المخاطر: اعتبار missing تثبيتًا جديدًا، استبدال target/revision قديمين، اعتماد journal أو UID منفردين، قبول handoff صحيح مع مفتاح آخر، تجاهل تغيير الهوية/محاولة auth أثناء انتظار، والخلط بين Web Locks/التحقق بعد الكتابة وبين CAS أو معاملة LS/IDB.

## IMPLEMENT

### 1. Durable Anchor Port وحدود ضمانه

`createDurableAnchorPort(namespace)` يعيد AnchorPort، ولا يقبل مفتاح مصدر خارجي:

- namespace يجب أن يبدأ بـ`irth-guest-handoff-synthetic:` مع suffix غير فارغ. لا default namespace أو إنشاء قاعدة إنتاجية.
- يشترط Partition مثبتة، ويقرأ **deviceId المحفوظ** عبر originalGetItem. لا getDeviceId أو إنشاء ID أو install/migrate.
- يشتق guest owner وphysicalKey عبر Identity Partition والمفتاح المنطقي الوحيد `irth.campaign_progress_buffer.v1`.
- هذا الاشتقاق يحدد **عنوان metadata تقنيًا**؛ لا يلتقط buffer بعد login ولا يثبت مصدره أو ملكيته. الوصول إلى bytes محجوب حتى تطابق anchor/journal/auth في Recovery Capability.
- مفتاح anchor اصطناعي مستقل:
  `test-only:guest-handoff-anchor:<encoded namespace>:<encoded deviceId>`.
  لا write إلى buffer أو user namespace. لا enumeration أو delete/clear.
- كل قراءة تتحقق من الجهاز وPartition ومن schema/address/evidence/stage/revision. missing → anchor_missing؛ corruption/unreadable → رفض، لا empty.

`exclusive` يستخدم Web Lock حصرية ثابتة لذلك المفتاح. يثبت owner/epoch عند الطلب وعند acquisition؛ `write` يشترط القفل ويتحقق من السياق. كل المنسقات المتعاونة لنفس المصدر/namespace تستخدم الاسم نفسه.

write:

1. قراءة السجل الحالي والتحقق منه؛ لا إنشاء عند غيابه.
2. فحص expectedRevision وnext.revision=expected+1.
3. منع تعديل evidence بعد تثبيتها، أو تخفيض المرحلة، أو مسح/تغيير target UID وattemptId بعد ربطهما.
4. حفظ record واحدة بـsetItem، ثم **read-after-write** ومطابقة القيمة المقصودة، وفحص السياق مجددًا.
5. عند quota/تجاهل الكتابة/مخالفة readback: anchor_write_unresolved. لا rollback أو overwrite للقيمة التي ظهرت بدلها.
6. إعادة إقرار ضائع لنفس القيمة/revision المحفوظتين تتحقق بالقراءة دون كتابة جديدة. أي proposal مختلف بـrevision قديم يرفض.

هذا **revision check تحت قفل متعاون وreadback**؛ ليس CAS أصلية في localStorage، أو معاملة مع IDB، أو ضمانًا ضد كاتب لا يحترم القفل. يمكن لكاتب خارجي الكتابة بعد التحقق؛ عمليات لاحقة تعيد الفحص، ولا ندعي global exclusion أو كشف كل rollback خبيث لتخزين origin.

### 2. enrollment الإيجابي — عقد مستقل

لا تنشئ factory أو read/write أو coordinator سجل enrolled من missing.

`enrollSyntheticAnchor(port, authority)` منفصلة وصريحة:

- مسموحة فقط للـport الاصطناعية الصادرة من factory، ومن سياق Guest الأصلي.
- يشترط أن تستهلك `authority.consumeFreshFixtureGrant` إذنًا **لمرة واحدة** مرتبطًا بعنوان المصدر وnamespace، وreceiptId غير فارغ وkind=isolated_synthetic_fixture.
- سلطة الإذن يجب أن تعرف إيجابيًا أن هذه fixture جديدة معزولة. **لا يجوز لها استنتاج freshness من غياب anchor/journal أو من deviceId وحده**.
- تحت القفل، ترفض أي record موجودة، حتى إن كانت تالفة؛ لا تستبدلها. تتحقق من الهوية بعد انتظار authority ثم تحفظ enrolled وتتحقق من readback.
- اختُبر أن إذنًا مستهلكًا لا يعيد إنشاء anchor بعد فقدها مع بقاء journal.

السلطة محقونة ولا يوجد تنفيذ إنتاجي أو bootstrap تلقائي لها. في native، harness ينشئ temporary browser profile جديدًا إيجابيًا ثم يستدعي enrollment صراحة؛ fixture تحفظ استهلاك الإذن في metadata اختبارية مستقلة. هذا ليس دليل ملكية V17، ولا proof جديدًا مستخرجًا من missing key.

إذا استُهلك الإذن ثم فشل التخزين/ضاع الإقرار، فلا يُختلق إذن جديد. اقرأ الدليل المتاح أو توقف للمراجعة؛ سياسة إصلاح enrollment إنتاجي ليست ضمن هذه الجولة. حذف/eviction كل الأدلة لا يثبت fresh install؛ المسار العادي سيبقى missing/blocked.

### 3. Exact-Source Recovery Capability

`createExactSourceRecovery({anchor, foundation, auth})` يعيد الدالة المتوافقة مع `recoveredSnapshot(evidence, callback)` الحالية.

لا public reader يقبل physicalKey حرًا، ولا اختيار namespace مستخدم/ضيف من UI. العنوان يُثبّت عند إنشاء capability من AnchorPort ويُفحص أن physicalKey مطابق تمامًا لـphysicalKey(GUEST_BUFFER_KEY, sourceGuestOwner)، وأن guest owner مطابق deviceId/schema/generation.

قبل قراءة buffer، يلزم تطابق **الرابطة كلها**:

| الطرف                    | المطابقة المطلوبة                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| caller evidence ↔ anchor | transitionId، sourceId، handoffId، owner/device/physicalKey/sourceAddress، captured context/epoch، provenance وsnapshotHash           |
| anchor ↔ journal         | handoffId/sourceId/sourceAddress/transition/hash/provenance والهوية الأصلية؛ Foundation تتحقق أيضًا من source registry وعلاقته بالنية |
| auth proof ↔ evidence    | المحاولة الأصلية، المالك وepoch/context قبل التبديل، hash، UID الفعلي/sessionUid، هوية swap وsession continuity                       |
| actual runtime ↔ proof   | owner/epoch/context/readiness الحالية، ومع owner/epoch الحقيقيين من owner.ts                                                          |
| target ↔ proof           | UID/attemptId المحجوزان في anchor، وUID الموجود في journal إن كان قد رُبط؛ لا إعادة ربط                                               |

لا يكفي ID صحيح أو deviceId أو UID أو journal بمفرده. لا يقرأ Bob source bytes إذا فشل الإثبات. تُثبّت attemptId من أول تحقق في الاستدعاء؛ تغيرها خلال التحقق يرفض حتى لو بقي UID نفسه.

يستخدم المحوّل Foundation.recover لقراءة journal بصرامة، مع Auth Adapter verifier حديث. عند أول bind من المنسق قد يكون target في journal/anchor ما زال null؛ لا يُفسر ذلك كوجهة. UID حينها من **إثبات auth المرتبط بالانتقال**؛ coordinator يحفظ target_claimed ثم bind، وCapability تعيد مطابقة الطرفين بعد callback. لا تسمى الحالة confirmed أو consent.

إذا كان journal مربوطًا بينما anchor بلا claim، أو كانت anchor.awaiting_consent وjournal بلا target، فالحالة غير متسقة وتُرفض. لا إصلاح تلقائي أو remint. consent أو مراحل غير مدعومة لهذا prototype تُرفض بدل تشغيل مسار grant/transport.

### 4. الوصول المادي والقفل بعد تغيير الهوية

تقرأ capability بـoriginalGetItem **المفتاح الأصلي المثبت فقط**، دون تبديل global owner أو إضعاف localScope أو source adapter من D-02. deviceId يجب أن يبقى مطابقًا. لا migration أو global fallback أو قراءة user buffer.

القفل نفسه لكاتب buffer:

`irth:guest-storage:<physicalKey>:write`، exclusive.

التسلسل:

1. تحقق anchor/auth/journal قبل انتظار القفل؛ لا مصدر يُقرأ من evidence مزورة.
2. بعد acquisition أعد التحقق من السياق والأدلة، ثم اقرأ bytes المصدر.
3. validateSnapshot صارمة، hash محفوظ وraw snapshot مطابقان لما في journal.
4. أعد التحقق قبل callback، ثم انتظر callback كاملة داخل القفل.
5. بعد callback أعد قراءة raw والتحقق من الهوية والجهاز، ثم أعد authorization ومطابقة raw قبل نشر النتيجة.

الانتظار في hash/auth/IDB أو callback لا يصرح باستعمال هوية قديمة. تغير المالك/epoch أو الجلسة/attempt يوقف الاستعادة. غياب locks أو SecurityError/missing/corrupt/mismatch يعطي خطأ يصنفه المنسق blocked/unknown؛ لا write للمصدر ولا grant.

read-after-callback يكشف كاتبًا قديمًا غيّر bytes خارج القفل؛ تبقى bytes الجديدة ولا تُرد إلى snapshot قديمة. لا يمنع ذلك كل كتابة غير متعاونة ولا يمحو آثار callback سبق أن التزمت. في المنسق الحالي callback تقتصر على journal binding/metadata، **لا مكافآت ولا نقل**؛ فشل لاحق لا يدعي التراجع عن commit سابقة.

ترتيب الأقفال في المنسق يبقى anchor ثم source. Capability لا تعيد اكتساب anchor lock داخل callback المنسق، منعًا لقفل ذاتي؛ تعيد قراءة الأدلة، وأي زوج LS/IDB غير متسق يرفض بأمان. لا معاملة مشتركة بينهما.

## TEST — crash/restart/concurrency والفشل

أضيف **47 اختبار قبول** في `tests/offline/outbox-guest-anchor-recovery.test.ts`، باستعمال Partition وowner وsource adapter والمنسق الحقيقيين وStorage API في jsdom، وfake-indexeddb، وWeb Locks منسقة في fixture. Auth والإذن الأولي اصطناعيان فقط.

التغطية:

- Guest→Alice إلى awaiting_consent فقط، source bytes وboundUid الأصليتان دون تغيير؛ D-02 ما زال يرفض الاستدعاء تحت User.
- enrollment بإذن إيجابي؛ رفض الإذن المفقود/المخالف/المستهلك، وعدم إنشاء deviceId أو installation، ورفض enrollment تحت User/فوق record موجودة.
- missing/empty/JSON/schema/address corruption وSecurityError/quota في anchor، دون replacement أو journal جديد.
- expectedRevision، قفل إلزامي، إعادة إقرار ضائع لنفس القيمة دون write/revision ثانية، وتعارض portين مستقلتين.
- منع تعديل evidence/transition/target وربط سابق لـAlice؛ readback يكشف overwrite من كاتب غير متعاون دون repair.
- فقد anchor مع journal، وفقد journal مع anchor، وcorrupt journal؛ لا قراءة source غير مصرح بها أو remint.
- source تغير، وsource owner/physicalKey/handoffId/transition/hash مخالف، ومصدر Guest مختلف على جهاز مشترك؛ لا قراءة namespace sentinel الأخرى.
- Bob وAlice→Bob→Alice وsessionUid/attempt mismatch، وتبديل حساب أثناء proof مؤجلة أو callback.
- fresh context مع إعادة فتح اتصال journal وإعادة auth verification، دون اعتبار epoch قديمة تفويضًا.
- غياب locks، source SecurityError، انتظار كاتب متعاون طوال callback، وكشف كاتب خارج الأقفال.
- callback معلقة مع timeout المنسق: result timed_out، ثم settle متتبع، ولا late bind/consent/نجاح نقل.

الأخطاء quota/SecurityError تُحقن عند حدود Storage API؛ لا ادعاء بمحاكاة quota فعلية أو فشل وسيط Android. أصل البيانات اصطناعي، وfetch محظور. اختبارات D-01/D-02/D-03 السابقة بقيت ناجحة دون تغيير Assertions. فُصلت validation المشتركة من coordinator إلى وحدة واحدة، بدلالاتها السابقة، لتستعملها المحوّلات أيضًا.

### Chromium الأصلي — نفس المحوّلات والمنسق

الأمر:

`python3 tests/offline/browser/guest-anchor-recovery-native.py`.

**13/13 PASS** على Chromium 151.0.7922.173، بــlocalStorage وIndexedDB وWeb Locks أصلية، وتبويبين وpersistent browser profile مؤقت على loopback origin. نفس anchor-adapter وrecovery-adapter وcoordinator/source adapter/identity تُبنى مباشرة من src؛ ليس نموذجًا معاد التنفيذ.

| الحالة الأصلية                                               | النتيجة                                               |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| إذن fixture أحادي + capture قبل auth                         | anchor وjournal محفوظان، target=null قبل auth         |
| Guest→mock Alice                                             | تحقق/claim/bind فقط، لا consent أو source mutation    |
| handoff صحيح مع key أجنبية                                   | source_conflict                                       |
| callback recovery معلقة + buffer writer الحقيقي في تبويب آخر | writer pending بالقفل الأصلي إلى ما بعد كل التحققات   |
| كتابة قديمة خارج locks                                       | snapshot_conflict؛ bytes الخارجية محفوظة لا rollback  |
| AnchorPortان وتعارض revision/target                          | serialization مع رفض تغيير Alice إلى Bob              |
| إغلاق/إعادة فتح متصفح منظم                                   | نفس anchor/journal/source، مع auth verification حديثة |
| Bob                                                          | لا source recovery                                    |
| Alice→Bob→Alice مع session lineage أخرى                      | blocked                                               |
| corrupt journal                                              | ليس إثبات مصدر                                        |
| corrupt anchor                                               | رفض والـbytes باقية                                   |
| missing journal                                              | anchor باقية، لا remint                               |
| missing anchor                                               | لا enrollment تلقائي                                  |

صفر external page requests. لا Supabase أو حسابات فعلية. diagnostics صامتة، وrecordChapterProgress stub يرمي إن استُدعي. لا خدمات تطبيقية أو Cloud Save/SQL/اقتصاد. كل raw writes/deletions في harness مخصصة لتهيئة **fixture اصطناعية** أو حقن فساد/فقد سجل journal الاختباري؛ ليست cleanup داخل المحوّل أو حذف buffer لاعب.

Auth Adapter وحده وهمي؛ لا يماثل Supabase proof إنتاجيًا. native enrollment إيجابي لأن harness أنشأ profile جديدة معزولة ثم استدعى seed صراحة، وليس لأن anchor key غائبة. إعادة fixture لبيانات اختبار بعد fault ليست repair آلية في المنتج.

احتاج الخادم المحلي require_escalated لأن sandbox يمنع socket loopback. لا سماح عام للشبكة، وطلبات الصفحات محصورة بالأصل المحلي.

**Orderly close/reopen ≠ crash/force-stop/power loss.** اختبارات interruption/quota/timeout المضبوطة وحدوية؛ لا تُنسب إلى native run. **Android/WebView PENDING**؛ لم يُختبر جهاز/Emulator فعلي.

### الفحوص النهائية

| الأمر                                                                               | النتيجة النهائية                                                              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| اختبار المحوّلين منفردًا                                                            | PASS: 47/47 حالة جديدة                                                        |
| `npm run test:outbox`                                                               | PASS: 715/715 في 24 ملفًا = 667 سابقة + 47 جديدة + تشخيص P1-06B المحلي الواحد |
| `npm run test:outbox -- --exclude tests/offline/outbox-guest-compatibility.test.ts` | PASS: 714/714 في 23 ملفًا؛ البوابة الرسمية المستقلة                           |
| `npm run typecheck:outbox`                                                          | PASS: التطبيق وOutbox، exit 0                                                 |
| `npm run build`                                                                     | PASS: exit 0، بناء محلي فقط؛ تحذيرات bundler/deprecation غير مانعة            |
| Chromium native runner بعد الحارس النهائي                                           | PASS: 13/13، نفس المحوّلات؛ صفر external page requests                        |
| `git diff --check` وstaged diff                                                     | PASS؛ Prettier للـTS/JS/MD وsyntax Python ناجحة                               |

الـ667 الرسمية السابقة بقيت ناجحة. لا يُحسب التشخيص المحلي أو fixtures الستة أو Bun المتعثر جزءًا من نجاح 714.

الاختبار المحلي P1-06B منفصل عن العدد الرسمي وخارج Commit. fixtures الستة القديمة لم تُعدّل أو تدخل البوابة الرسمية. Bun Identity الأصلي من الجذر يبقى غير محسوم بالنتيجة التاريخية timeout/124؛ لم يُعامل كنجاح أو يستبدل بنسخة معزولة.

## حدود الملكية والإثبات قبل أول تكامل فعلي

لا blocker جديد يمنع **هذه المحوّلات المعزولة** من تطبيق fail-closed تحت العقود المختبرة. لكن لا تفعيل login/recovery إنتاجي الآن. يلزم اعتماد وإثبات:

1. **Auth Adapter حقيقي** يربط محاولة الانتقال والهوية قبل/بعد swap والجلسة الفعلية واستمراريتها عبر callbacks/OAuth/restart. حقول UID/attempt في origin ليست توقيعًا؛ لا يمكن لهذه الجولة إثبات ذلك مع خادم وهمي فقط.
2. **سلطة enrollment إنتاجية إيجابية** وسياسة V17/فقد الأدلة وإصلاح metadata. missing key ليست fresh install. لا default provider لهذا القرار، ولا إعادة تفسير ملف V17 منقول كأصل موثوق.
3. **ملكية بشرية/جهاز مشترك**: deviceId يحدد الحاوية التقنية فقط. لا ينسب تقدم الشخص السابق للحساب الحالي؛ يلزم قرار صريح وموافقة لاحقة على source/snapshot/target. لا consent UI في هذه الجولة.
4. **Android وforce-stop**: اختبار التخزين/locks/secure context وإعادة تشغيل WebView الفعلية وقيود eviction/quota. نجاح desktop Chromium لا يثبتها.
5. **تكامل محدود قابل للإيقاف** قبل SDK auth/owner swap، مع readiness/disposal/deadlines وتجارب تبويبات وحزم قديمة؛ caller يجب أن يظل guarded قبل side effects. لا تمكين إذا عجزت التبعيات عن الإثبات، ولا مسح سجلات عند rollback.
6. تبقى transport/strict-progress/server semantics وconsent ثم cleanup مراحل منفصلة. لا P1-04/P1-05 repair أو exactly-once reward guarantee من نجاح القراءة أو journal bind.

المحوّلات تحمي من الاستدعاءات غير المتسقة ضمن كود متعاون؛ ليست RLS أو حماية من كود origin خبيث يزوّر جميع المتاجر/سلطة الإذن، ولا ضمانًا ضد rollback/eviction شامل. بعد فقد أدلة الإثبات لا نصنع دليلًا بديلًا أو نعرض نجاح نقل.

## الملفات المعدلة

- `src/lib/campaigns/guest-handoff/anchor-adapter.ts` جديد: AnchorPort فعلية وإذن fixture منفصل.
- `src/lib/campaigns/guest-handoff/recovery-adapter.ts` جديد: exact-source read capability مع authorization/locks.
- `src/lib/campaigns/guest-handoff/transition-validation.ts` جديد: validation المشتركة المستخرجة دون تغيير عقد المنسق.
- `src/lib/campaigns/guest-handoff/transition-coordinator.ts`: استعمال validators المشتركة فقط.
- `src/lib/campaigns/guest-handoff/transition-contract.ts`: تحديث وصف capability؛ لا تغيير API أو schema.
- `tests/offline/outbox-guest-anchor-recovery.test.ts` جديد.
- `tests/offline/browser/build-guest-anchor-recovery.mjs` جديد.
- `tests/offline/browser/guest-anchor-recovery-fixture.ts` جديد.
- `tests/offline/browser/guest-anchor-recovery-native.py` جديد.
- هذا التقرير.

لا تعديل AccountProvider أو reset/router/android-client/ProfileProvider أو Cloud Save أو SQL/RPC أو Outbox/settlement/Schema v2 أو الحملات/الاقتصاد. Source Adapter D-02 وguest storage/buffer لم تتغير. لا capture/recovery تلقائية أثناء login، ولا تغيير boundUid حقيقية، ولا نسخ/حذف buffer أو منح مكافأة أو عرض نجاح نقل.

## ملفات P1-06B المحفوظة

مطابقة لجدول D-03 قبل التنفيذ وبعده، وتبقى untracked وخارج Commit:

| الملف                                                   | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/audits/v18-01a-p1-06b-guest-compatibility.md`     | `316a069672eaca880b17e80253e7cdcf9b4fcd41a7ee009579964dc91efdb370` |
| `tests/offline/browser/build-guest-compatibility.mjs`   | `283907793707d08583fcdc2bfa58db20e23d11606acbefb0d995b7264b62993f` |
| `tests/offline/browser/guest-compatibility-fixture.tsx` | `96c3d160f19112780c03a6fa39c7b186c6faadead4b7012127c175c72ce1a012` |
| `tests/offline/browser/guest-compatibility-native.py`   | `ec0134f9c631a608097782c284548c663e4799da99149d8b360e744c0a694f9a` |
| `tests/offline/outbox-guest-compatibility.test.ts`      | `d8379ddca78c6ac33f497138c72858e15fb234657072d80c01819ef6cc488852` |

## CLOSE

Commit واحد بالمسارات العشرة المعتمدة فقط ثم Push لفرع العمل بعد نجاح الفحوص؛ hash والنتيجة يسلمان بعد التنفيذ. لا انتقال تلقائي إلى hooks/consent/send/cleanup. **P1-06/P1-04/P1-05 OPEN؛ V18 HOLD.**
