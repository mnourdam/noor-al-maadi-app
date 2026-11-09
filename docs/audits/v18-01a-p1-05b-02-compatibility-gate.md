# V18-01A — P1-05B-02: Inert Backend Compatibility Gate

## القرار والنطاق

**GO لحفظ كود القراءة الخامل ومسودة SQL للمراجعة فقط. Database Acceptance = PENDING؛ NO-GO لتطبيق SQL أو Backend Deploy أو أي تفعيل اقتصادي.** هذه الدفعة أضيق من خطة B-01: لا enforcement اقتصادي جديد على العملاء القدامى، ولا انتقال إلى authority أو إنشاء baseline.

المرجع عند البدء مطابق: `v18-01a-outbox-recovery`، HEAD `94c6e7f5bc1e15ac9054ab0157650eb3f6b653fc`. الملفات المتتبعة نظيفة، والأدلة المحلية السابقة موجودة دون تعديل. البيئة running/connected؛ لا تغيير Proxy أو dependencies أو SQL execution أو اتصال بقاعدة حية. حالة الإصدار HOLD.

## AUDIT قبل التنفيذ — Git ليس catalog حية

رُوجعت B-01 المحلية وA-04 وA-01/02/03/3R وC-01، وprofiles/AccountProvider/Cloud Save وملفات الـSQL المعنية. scan لـ278 migration، مع قراءة العقود ذات الصلة، أكد أحدث تعريفات CREATE الموجودة التالية:

| العقد | أحدث تعريف في المستودع |
| --- | --- |
| sync_my_public_stats(jsonb) | 20260905143448_69d67dc7-08a1-40ec-a877-e59fc988f19e.sql:254 |
| apply_profile_delta | 20260711073913_7b89dce5-3fe2-4a7a-b135-4ad9b7855c64.sql:30 |
| record_campaign_progress_v2 | 20260722063554_8fc784b1-6f3c-4cfc-a54b-1ff205627568.sql:1 |
| complete_investigation_v2 | 20260718134245_94f5a894-96f3-4133-816c-ef8e1c63cf5e.sql:42 |

الأول ما زال يسند client xp/dinars/hearts إلى profiles ضمن clamps وrow lock، ويستخدم admin_balance_grants كحماية جزئية لتعديل المدير، لا economic revision جامعة. التسمية public stats أو تعليق client بأن UPDATE revoked لا يمنحان authority: migration20260624233722 تمنح authenticated UPDATE/INSERT/DELETE على profiles، وRLS تخص المالك ولا تثبت صحة المال.

applied_profile_deltas تسمح بإدخال row لصاحب الحساب؛ generic delta ليست typed economic command أو receipt مغلقة المصدر. campaign progress ليست wallet grant، والتحقيقات لها natural completion key وreward snapshot وحدود evidence التي وثقها B-01. لم تُعدّل أي من هذه العقود أو منحها أو بياناتها.

admin_balance_grants تظهر في generated types وأحدث sync RPC، لكن لم يظهر CREATE TABLE لها في migrations المحفوظة. لم نخترع DDL لها أو نستنتج حالة الخادم من types؛ هذه فجوة إضافية تؤكد ضرورة مراجعة catalog مستقلة مستقبلًا. لا تدّعي هذه الجولة مطابقة Production أو تنفيذ أي RPC عليها.

## MINIMUM FIX — Schema تشخيصية فقط

مسودة غير قابلة للنشر عبر المسار المعتاد:

`docs/proposals/v18-01a-p1-05b-02-compatibility-gate.sql`

الملف **خارج supabase/migrations**، ولا تستدعيه scripts أو workflow. لم يُنقل أو يُنسخ إلى migrations. يبدأ بـBEGIN وينتهي بـCOMMIT حتى تكون DDL والمنح ضمن معاملة واحدة إذا اعتُمدت ونُفذت لاحقًا؛ لم تُنفذ الآن. CREATE لا تستبدل دالة تاريخية أو تتجاهل collision قائمة بصمت.

جدول مقترح `public.economic_protocol_candidates`:

| الحقل | القيد والمعنى |
| --- | --- |
| user_id | UUID PK/FK إلى auth.users مع حذف metadata عند حذف الحساب؛ ليست ملكية wallet جديدة |
| diagnostic_state | NOT NULL؛ فقط candidate أو incomplete |
| created_at | timestamp تشخيصي، لا revision أو CAS أو تاريخ grant |

لا يوجد عمود balance أو authority أو baseline أو entitlement أو migration أو economic epoch. حتى row منشأة بمعرفة SQL operator لا يمكنها تمثيل authoritative. candidate تشخيصية فقط؛ لا grant أو spend أو eligibility أو wallet creation.

لا DML إلى profiles أو applied_profile_deltas أو Cloud Save أو سجلات V17، ولا economic triggers أو RPC جديدة تطبق مبلغًا. لا public enrollment/update API. لا seed أو import أو قراءة رصيد في الدالة الجديدة.

## RPC والـACL/RLS المقترحة

`public.get_economic_protocol_gate_v1()` بلا أي arguments. المالك من auth.uid() فقط، ويُرفض NULL بـSQLSTATE42501. لا يُقبل UID وجهة، ولا يعاد UID أو بيانات row خاصة بحساب آخر.

| حالة metadata | النتيجة |
| --- | --- |
| لا enrollment، سواء V17 أو مستخدم جديد | schema_version1، protocol_state=legacy، diagnostic_state=absent، economic_authority_enabled=false |
| candidate | legacy، candidate، false |
| incomplete | unresolved، incomplete، false |

الدالة STABLE وSECURITY INVOKER، وليست SECURITY DEFINER، وsearch_path ثابتة pg_catalog. auth.uid والجدول وjsonb_build_object مؤهلة بالـschema؛ لا dynamic SQL أو PERFORM لعملية مالية. الناتج false ثابت في النص، لا قيمة تُقرأ من row.

الجدول ENABLE + FORCE RLS. تُسحب كل privileges من PUBLIC/anon/authenticated/service_role صراحة، ثم SELECT فقط إلى authenticated. السياسة الوحيدة SELECT own حسب auth.uid. لا INSERT/UPDATE/DELETE policy أو grant؛ RLS تمنع الكتابة كذلك لو وُسعت ACL بالخطأ في المستقبل. provisioning التشخيصية تتطلب SQL operator مخولة، خارج أي API مستخدم.

EXECUTE مسحوبة من PUBLIC وanon وauthenticated وservice_role ثم تُمنح إلى authenticated فقط. INVOKER تحتاج SELECT own نفسها، فلا bypass لـRLS عبر مالك الدالة. لا نعيد منح privileges مالية موجودة أو نسحبها في هذه الدفعة.

هذه خصائص **المسودة المقروءة**. ثبوتها على PostgreSQL وبالأدوار الفعلية مع العضويات/default grants يتطلب Database Acceptance؛ الاختبارات الساكنة لا تثبت ذلك.

## Client Adapter وAccountProvider

`src/lib/economy/compatibility-gate.ts` تُنتج DTO محلية مقيدة لا spread لرد الخادم:

- economicAuthorityEnabled نوعها وقيمتها false فقط، والـobservations مجمدة Object.freeze.
- parser يقبل schema1 والحالات الثلاث المتوافقة فقط. authoritative أو enabled=true أو schema غير معروفة => unresolved/invalid_response/false.
- readProtocolGate تثبت owner/epoch وشرط حياة المستدعي قبل أي انتظار، وتنتظر Auth Readiness ببول محدود25ms بدل الاحتفاظ بـauth promise غير قابلة للإزالة إلى أجل غير محدد.
- deadline الكلي3000ms يغطي readiness/session/RPC. يُفحص SDK session UID قبل RPC، ثم owner/epoch/lifetime بعد الانتظار. الاسم وحده يُرسل، بلا UID arguments.
- timeout أو RPC/session failure لا يرفع سلطة. timeout توقف المتابعات المحلية ولا تدعي إلغاء read بدأ على الخادم. تأخر session بعد المهلة لا يبدأ RPC جديدة.
- poll وdeadline يُنظفان؛ unmount أو ABA تمنع نشر الرد. لا localStorage/IDB/Settlement أو wallet writes.

AccountProvider تعرض `protocolGate` التشخيصية دون استعمالها لتغيير legacy flow. القراءة opt-in **للاختبارات فقط**: `compatibilityGateProbeForTests===true` مع `MODE==='test'` و`PROD===false`. لا production rollout flag أو environment enable أو زر للاعب. حتى build production بmode test لا تشغلها.

الافتراضي legacy/false مع readState=disabled وdiagnosticState=not_read؛ هذا default-off محلي، لا شهادة على قراءة فعلية للخادم. الرد المقروء له readState=resolved، والأخطاء unresolved. لا loadingSession أو syncing أو reconciliation state أو signIn/signUp/Google PKCE تتوقف على نجاح gate. metadata الخاصة بها مربوطة owner/epoch، مع فحص قبل وداخل functional updater؛ Alice القديمة لا تلوّن سياق Bob أو Alice الجديدة.

إضافة Account تقتصر على import/type/diagnostic state/effect/context property. مقطع signUp/signIn وEmail Observer قورن byte-for-byte بـHEAD دون اختلاف؛ reset/PKCE وProfileProvider وCloud Save وsocial وOutbox وSettlement لم تتغير. لا generated Supabase types لدالة لم تُطبق؛ adapter تفحص unknown DTO بدل ادعاء schema منشورة.

دليل production build: فُحصت470 ملفات JavaScript تحت .output/public؛ **لا ظهور لاسم RPC الجديدة**. اختبارات normal login لا تستدعي gate، وتبقى استدعاءات SDK الثلاث القائمة للـboot وclaimed-streak checks كما هي. هذا يتجاوز مجرد وعد أن flag معطلة.

## اختبار SQL/RLS الحقيقي — PENDING

لا psql/postgres/initdb/pg_ctl في PATH. Docker موجود، لكن الفحص العادي تعذر بسبب socket permission؛ أُجيز فحص `docker ps` للقراءة فقط وأظهر عدم وجود حاويات جارية. لم تُطلق أو تُثبت PostgreSQL، ولم تُنفذ SQL أو تُبحث credentials اتصال. لا قاعدة اختبار جاهزة متاحة، ولا Production.

أُعد ملف قابل للمراجعة، غير منفذ وغير موصول بـCI أو migrations:

`tests/sql/p1-05b-02-gate-acceptance.sql`

يطلب Supabase محلية disposable، ومراجعة المسودة وتطبيقها بإذن مستقل، وأربع fixture auth.users اصطناعية مُهيأة سلفًا (Alice/Bob/V17/new). يشغل BEGIN/ROLLBACK ويقارن profiles/deltas/cloud قبل وبعد القراءة. لا يهيئ حسابات فعلية أو ينفذ المسودة تلقائيًا.

يشمل: absent لكلا نوعي الحساب، قراءة candidate/incomplete، Alice ترى row واحدة ولا Bob، غياب overload تقبل UID، رفض INSERT/UPDATE/DELETE للـauthenticated، عدم وجود authoritative في CHECK حتى للoperator، grants لأدوار الخدمة/anon، NULL UID، SECURITY INVOKER/search_path/STABLE وRLS catalog flags، وعدم تعديل wallet/delta/Cloud. فشل أي صلاحية غير متوقعة يوقف Database Acceptance ويمنع تطبيق/ترقية المقترح؛ لا يُخفى بموك.

**هذه الحالات لم تُشغل على PostgreSQL. لا نقول إن RLS اجتازت اختبارًا فعليًا.** قبول حفظ المقترح الخامل لا يساوي قبول backend deployment.

## اختبارات JS والساكنة — فصل النطاقين

40 حالة جديدة، موزعة على:

| المجموعة | العدد وما يثبت |
| --- | --- |
| outbox-protocol-gate.test.ts |25 runtime adapter tests: parse/false-only/readiness/zero-args/session lag/errors/deadlines/lateRPC/ABA/unmount/no storage |
| outbox-account-protocol-gate.test.tsx |9 actual AccountProvider+ProfileProvider tests: default-off وproduction builds، readiness، فشل/timeout لا يمنع login، owner/ABA/unmount، وعدم تغير wallet/Cloud/Settlement |
| outbox-protocol-gate-sql-static.test.ts |6 **STATIC فقط**: مسار المسودة ومعاملة DDL/قيود الحالات/نص grants وRLS/صفرarguments/readonly وfalse وEXECUTE |

مصفوفة قبول الطلب:

| البنود | الدليل وحدوده |
| --- | --- |
| 1–3 V17/new/absence | parser وSQL literals، واختبارات DB معدة؛ Database PENDING |
| 4 RPC بلاUID | runtime toHaveBeenCalledExactlyOnceWith(name) وSQL signature، وDB overload negative معدة |
| 5–6 Bob/RLS writes | epoch tests فعلية client؛ own-row SQL/ACL static + prepared DB tests. ليس RLS PASS |
| 7 Guest | adapter لا تبدأ أي RPC في guest؛ anon EXECUTE مسحوبة في المقترح، تنفيذDB معلق |
| 8–9 candidate/no-authoritative | false-only DTO وCHECK وناتجfalse ثابت، ولا code path مالي |
| 10–12 failure/timeout/ABA | deferred promises وجدولة fake timers؛ رد قديم لا يكتب frame جديدة |
| 13–14 normal login/PKCE | default no-gate، production test-mode يظلoff؛ 39 Email Observer الحالية PASS ومقاطع Auth source ثابتة |
| 15–19 wallet/Settlement/delivery/Cloud/V17 | bytes قبل وبعد observation، لا DB open أو push/stats جديدة، Profile/Cloud/rewards source دون تغيير |
| 20 permissions | Static checks ناجحة، real DB PENDING؛ لا إقرار أمان SQL من JS |

إخفاقات تطوير harness كانت منفصلة ومصححة في الملفات الجديدة فقط: كان عدد SDK المتوقع1 مع أن المسار السابق يستعمل3، وفُعلت fake timers مرتين ففقدت poll timer، وSDK fixture بقيتAlice عندBob فرفضتها session guard كما ينبغي. صُححت fixture/clock والعد بدليل المسار القائم؛ لا assertions أو mocks قديمة تغيرت، وهناك اختبار مستقل يثبت رفض session lag.

## نتائج البوابة

| الفحص | النتيجة |
| --- | --- |
| التشغيل الرسمي دون ملف B التشخيصي غير المتتبع | 1014/1014، 37 مجموعة؛ المرجع السابق 974 + 40 جديدة |
| npm run test:outbox من الجذر، يشمل B المحلي | 1015/1015، 38 مجموعة |
| الاختبارات الجديدة | 40: 25 للـAdapter و9 لـAccount و6 SQL ساكنة فقط |
| Account/Email Observer القائمة | 59/59 دون تعديل |
| npm run typecheck:outbox | PASS |
| npm run build | PASS |
| git diff --check | PASS |
| فحص حزمة الإنتاج | 470 ملف JS؛ صفر ظهور لاسم RPC الجديد |
| PostgreSQL/RLS فعلية | PENDING؛ لم يُنفّذ SQL |

حفظت مخرجات التشغيل في `/tmp/p105b02-root.log` و`/tmp/p105b02-official.log` و`/tmp/p105b02-types.log` و`/tmp/p105b02-build.log` داخل هذه الجلسة. زمن root الكامل46.28 ثانية، max child RSS نحو376MiB، دون رفع حد heap. الاختبارات الساكنة الستة ليست إثباتًا لقبول قاعدة البيانات.

لم تُشغل SQL/RLS حقيقية أو native Android. لا حاجة لتكرار browser economics repro هنا لأن المسار الجديد default-off ولا يغير writer؛ مخاطر A-04 ما زالت مفتوحة. Android/WebView/Bun Identity الأصلية غير محسومة؛ لا APK/Web deploy.

## ما يجب تغييره قبل أول حساب authoritative

المقترح **لا يملك حالة authoritative قابلة للتفعيل أصلًا**. أول حساب يحتاج مشروعًا آخر معتمدًا، لا إضافة row candidate:

1. server mode/epoch موثوقة وoperation ledger وreceipts/revisions، وgate عند **كل** wallet/evidence ingress؛ لا يمكن لـversionCode أو user-agent أو شرط داخل Account توفير ذلك.
2. إغلاق/تقييد direct authenticated UPDATE/INSERT/DELETE على profiles للحساب المحول. RLS own-row وحدها لا تثبت صحة المال. SECURITY DEFINER القديمة تتجاوز RLS، فيلزم boundary جدول/privileged writer lane مثبتة بأدوار حقيقية.
3. تعديل sync_my_public_stats بحيث لا تقبل XP/dinars/hearts totals من العميل للحساب المحول؛ لا max أو success صورية. فصل metadata/avatars عن payload اقتصاد قديم مع سياسة ترقية معتمدة.
4. تغطية apply_profile_delta وpurchase_heart بلاID وstory/investigation/achievement/Streak القديم وv16/admin/system grants. منع client-writable receipt/preseed، مع حفظ الأدلة والبيانات السابقة.
5. منع wallet/claim fields في Cloud/localStorage من الرجوع كمصدر سلطة بعد activation. حفظ raw legacy evidence بدل import/fallback؛ delayed push لا تُعتبر مُلغاة أو rollback.
6. اعتماد V17 support/bridge وopening baseline وoffline spend وAndroid acceptance وrollback. لا تحويل أوحساب من غياب record أو فشل read، ولا financial application مبنية على هذا RPC.

أي API عامة في هذه الدفعة لا تقدر على تنفيذ هذه الخطوات أو تغيير mode اقتصادي؛ يحتاج ذلك schema/RPC وقرارًا آخرين.

## أول Backend Migration فعلية بعد المراجعة المستقلة

لا ملف في migrations الآن. الخطوة اللاحقة الممكنة: مراجعة أدوار/catalog في PostgreSQL/Supabase اختبار معزولة، تشغيل acceptance المعدة، ثم اعتماد نسخة جديدة مثل `supabase/migrations/20261109000200_v18_inert_protocol_gate.sql` ذات نفس semantics الخاملة، لا تعديل migrations التاريخية. الاسم مثال لخطة لاحقة ولم يُنشأ.

يجب إثبات atomic DDL والمنح وown-row select ورفض writer roles وعدم وجود overload لUID، ومطابقة جدول/functions/grants بعد التطبيق في staging. إذا فشلت الصلاحيات أو ظهر default grant موروث غير مقصود، فالقرارNO-GO لإصدار backend. نقل المسودة أو نشرها يحتاج اعتمادًا مستقلًا، ولا يفعّل client probe للاعبين تلقائيًا.

هذه migration الخاملة لا تغلق مداخل الاقتصاد القديمة ولا تفتح سلطة جديدة. لا يجوز تحويل candidate إلى authoritative قبل enforcement المشروع التالي؛ SQL الحالية لا توفر API لذلك.

## التراجع وحماية الأدلة

اليوم لا deployment، فيكفي revert عادي للكود بعد مراجعة إذا لزم؛ لا بيانات اقتصاد أو storage تحتاج مسحًا. بعد تطبيق مقترح خامل مستقبلًا، يمكن إبقاء metadata/readonly RPC وإيقاف القراءة بدل DROP أو reset لملفات اللاعبين. لا rollback تزيل economic fence لاحقة لحساب سبق تحويله؛ ذلك لم يحدث هنا أصلًا.

ثبتت409 بصمات قديمة دون تغيير، باستثناء account.tsx وحدها المعدلة ضمن410 ملفًا محفوظًا قبل العمل. تشمل جميع migrations، B الخمسة، A-04 المحلية وB-01، archived3R وtestي regression والـ32. التقرير السابق والتشخيصات غير المتتبعة لا تدخل Commit الجديد. B الخمسة تبقى خارج Git.

## الملفات المحددة للحفظ

- src/lib/account.tsx
- src/lib/economy/compatibility-gate.ts
- docs/proposals/v18-01a-p1-05b-02-compatibility-gate.sql
- tests/sql/p1-05b-02-gate-acceptance.sql
- tests/offline/outbox-protocol-gate.test.ts
- tests/offline/outbox-protocol-gate-sql-static.test.ts
- tests/offline/outbox-account-protocol-gate.test.tsx
- docs/audits/v18-01a-p1-05b-02-compatibility-gate.md

Commit واحد بالمسارات الثمانية فقط ثم Push إلى فرع العمل إذا اكتملت فحوص العزل؛ لا SQL execution أو Backend Deploy/Production أو merge أو authoritative/baseline/Atomic Settlement/Guest Handoff.

**P1-04/P1-05/P1-06 OPEN؛ V18 HOLD. Database Acceptance PENDING.**
