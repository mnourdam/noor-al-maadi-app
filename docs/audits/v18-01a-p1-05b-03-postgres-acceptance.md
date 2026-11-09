# V18-01A — P1-05B-03: Isolated PostgreSQL Acceptance

## القرار

**A: PostgreSQL Engine Acceptance محليًا PASS. GitHub Actions execution غير متحقق؛ Database Acceptance الكلية تبقى PENDING. B: Supabase Integration Acceptance PENDING. C: Production Deployment Approval غير مأذونة / NO-GO.**

المرجع عند البدء: `v18-01a-outbox-recovery`، `829c17d039aeb922fb07a8eee82df1b90d0714ac`، دون تعديلات متتبعة. الأدلة العشرة المحلية السابقة بقيت دون تغيير وخارج Commit. قُرئت B-02 والمسودة والقبول والـadapter وAndroid workflow وB-01 المحلية. لا تغيير بسلوك التطبيق أو الاقتصاد أو SQL proposal الأصلية.

## AUDIT → RISK → MINIMUM FIX

ملف قبول B-02 كان معدًا فقط. الاختبارات السلبية تستخدم check_violation (23514) وundefined_function (42883) وinsufficient_privilege (42501)، بينما RAISE EXCEPTION الخاص بنجاح العملية المحظورة يستخدم P0001. لذلك لا يلتقط اختبار الرفض استثناءه الخاص باعتباره رفض صلاحية صحيحًا. لم نجد حاجة لتصحيح المسودة.

فجوات الاختبار التي أغلقت: إضافة تحقق runtime من current_user وغياب SUPERUSER/BYPASSRLS عند Alice/Bob، وفحص USAGE على public/auth وSELECT، وقراءة Bob المباشرة لمنع الاتجاه المعاكس، وتنفيذ محاولة RPC فعلية بدور service_role بدل الاكتفاء بفحص ACL. أضيف snapshot قبل DDL، لأن snapshot داخل اختبار B-02 وحده تبدأ بعد تطبيق المسودة. بقيت assertions السابقة كما هي ولم تُخفف.

الخطر الرئيسي: fixtures ليست catalog Supabase؛ نجاح المحرك لا يثبت دور PostgREST أو عضويات أدوار staging أو تطابق auth.uid المستضافة. لا تحمل هذه النتائج أي استنتاج عن Production.

## البيئة الفعلية وطريقة الإنشاء

- المحرك: **PostgreSQL 17.6 (Debian 17.6-2.pgdg12+1)، x86_64**.
- الصورة الرسمية `postgres:17.6-bookworm`، digest `sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3` في التشغيل المحلي.
- حاوية جديدة `p105b03-isolated`، قاعدة `p105b03`، storage مؤقتة خاصة بالحاوية، `--network none`، بلا نشر منافذ. المستودع mount للقراءة فقط في `/work`.
- اتصال psql عبر Unix socket داخل الحاوية، لا URL بعيدة. كلمة مرور ثابتة اصطناعية خاصة بالاختبار، لا secret لاعب أو تطبيق. لم تُقرأ SUPABASE_URL أو Service Role Key أو repository secrets.
- تنفيذ المسودة داخل هذه القاعدة وحدها مصرح به لهذه الجولة. لم تُنفذ migrations التاريخية أو SQL على أي خدمة منشورة.

Docker socket غير متاح داخل العزل؛ فحص daemon والتنزيل وتشغيل الحاوية والأوامر المحددة استُخدمت معها require_escalated دون إذن دائم أو تغيير Proxy. daemon المحلي 28.4.0. صلاحية التنفيذ لم تُستخدم للوصول إلى قاعدة أخرى.

## ملفات البيئة الاصطناعية

| الملف | الدور |
| --- | --- |
| `tests/sql/p1-05b-03/fixtures.sql` | يرفض اسم قاعدة غير p105b03 أو auth schema قائمة؛ يهيئ الأدوار والمخطط و4 مستخدمين وصفوف الاقتصاد الوهمية وsnapshot السابقة للمسودة |
| `tests/sql/p1-05b-03/run.sql` | version ثم fixtures ثم المسودة الأصلية ثم قبول B-02 ثم مقارنة ما قبل DDL وما بعد الاختبار |
| `tests/sql/p1-05b-03/check-negative-controls.sh` | ثلاثة تغييرات صلاحيات متعمدة داخل معاملات تلغى عند فشل القبول؛ يتطلب الفشل بالرسالة المحددة لا أي خطأ عابر |
| `.github/workflows/p1-05b-03-postgres.yml` | job SQL فقط، PostgreSQL service خاصة بالـjob، فرع V18 وحده، checkout بلا credentials دائمة، بلا secrets/Android/Deploy |
| `tests/sql/p1-05b-02-gate-acceptance.sql` | تقوية الاختبارات الموجودة دون تغيير عقد المسودة |

الأدوار anon/authenticated غير superuser وغير BYPASSRLS؛ service_role اصطناعية تحمل BYPASSRLS لا عضوية authenticated. الـoperator وحدها تجهز fixtures. auth.uid تقرأ claim محلية؛ public/auth USAGE صريحة. default privileges متعمدة تمنح الصلاحيات للأدوار على الجداول والدوال الجديدة قبل التطبيق، لإثبات أن REVOKE المسودة تبطل grants الموروثة في هذا النموذج.

profiles الوهمية تحوي XP=17 ودنانير=23 وقلوب=3 وJSON legacy؛ هذه بيانات اختبار لا تغيير لأرقام اللعبة. يوجد delta اصطناعية مسبقة و4 cloud snapshots. لا تحميل لبيانات لاعب أو استيراد V17 حقيقية.

## ما شُغّل فعلًا — PostgreSQL

```sh
# داخل الحاوية الاصطناعية، من /work
psql -X -U postgres -d p105b03 --set=ON_ERROR_STOP=1 --file=tests/sql/p1-05b-03/run.sql
PGUSER=postgres PGDATABASE=p105b03 bash tests/sql/p1-05b-03/check-negative-controls.sh
psql -X -U postgres -d p105b03 --set=ON_ERROR_STOP=1 --file=tests/sql/p1-05b-02-gate-acceptance.sql
```

جميعها exit0. الأولى طبقت SQL الحقيقية وأنشأت الجدول والدالة بنجاح، ثم أظهرت:

```text
P105B03 ENGINE ACCEPTANCE PASS; economic snapshots unchanged; NOT Supabase integration acceptance
```

| الإثبات | النتيجة الفعلية |
| --- | --- |
| V17/new بلا enrollment | legacy/absent/false لكليهما |
| Alice candidate وBob incomplete | legacy/candidate/false وunresolved/incomplete/false |
| authoritative | INSERT بدور operator رُفض بـ23514 |
| Alice↔Bob | كل دور يرى صفه فقط مباشرة ومن خلال RPC؛ current_user وnon-bypass مؤكدتان |
| authenticated writes | محاولات INSERT/UPDATE/DELETE الفعلية رُفضت بـ42501 |
| UID خارجي | overload غير موجودة؛ محاولة النداء رُفضت بـ42883 |
| null UID | 42501 |
| anon/service_role | EXECUTE الفعلية رُفضت بـ42501؛ ACL كذلك بلا grant |
| خصائص catalog | ENABLE+FORCE RLS، SECURITY INVOKER، STABLE، صفر arguments، search_path=pg_catalog |
| SELECT/USAGE | grants runtime صالحة لمستخدم الاختبار؛ لا privilege bypass |

استخدمت SET LOCAL ROLE قبل اختبارات المستخدم؛ session_user operator ليست current_user أثناء التحقق، ودالة القراءة INVOKER. لا تعتمد اختبارات العزل على SELECT كـpostgres. تشغيل القبول الأخير بعد controls نجح أيضًا، بما يثبت عدم تسرب التغييرات المتعمدة.

### إثبات حساسية الاختبارات

ثلاث controls فعلية، كل واحدة بsession ومعاملة مستقلة:

1. GRANT UPDATE للمستخدم: فشل القبول عند `unexpected write/execute privilege`.
2. SELECT policy تسمح بقراءة الجميع: فشل عند `Alice can read Bob or has lost her own row`.
3. إضافة overload تقبل UID: فشل عند `RPC accepted a destination UID`؛ هذا P0001 لم يُلتقط كـ42883.

shell تتطلب nonzero وظهور الرسالة المتوقعة معًا. إذا نجحت العملية الممنوعة أو فشل الاختبار بسبب آخر، تفشل control. انتهاء اتصال psql الفاشل يلغي المعاملة المفتوحة؛ لا COMMIT للخلل المتعمد. تحذير BEGIN داخل المعاملة لا يغير هذه الدلالة.

## حفظ الأدلة الاقتصادية

snapshot JSONB لجميع أعمدة وصفوف profiles/applied_profile_deltas/cloud_saves **قبل تطبيق المسودة**، ثم مقارنة IS DISTINCT FROM بعد القبول. توجد مقارنة ثانية داخل BEGIN/ROLLBACK الخاصة بقبول B-02. كل المقارنات ناجحة، وenrollment الاختبار لم تتسرب خارج rollback. عدد public tables بعد التشغيل 4 فقط: الثلاث الأصلية وجدول gate؛ لا entitlement/delivered/baseline جديدة. لا تستعمل الدالة أي financial writer أو balance. هذه مساواة صفوف كاملة في النموذج الاصطناعي، لا برهان مطابقة مخططات الإنتاج أو تسليم ProfileProvider بعد crash.

## GitHub Actions — غير متحقق

أُعدت workflow مستقلة بservice `postgres:17.6-bookworm` وhealth check، اتصال ثابت loopback إلى p105b03، permissions contents:read فقط، ولا `${{ secrets.* }}` أو SUPABASE credentials. تعمل على push الخاص بملفات SQL/هذه workflow على فرع V18 فقط، أو manual dispatch على الفرع نفسه. لا jobs أخرى أو reusable Android invocation أو artifact release أو deploy.

محاولة فحص Actions عبر:

```sh
gh api repos/mnourdam/noor-al-maadi-app/actions/permissions --jq '.enabled'
```

فشلت أولًا بسبب sandbox proxy socket، ثم أعادت المحاولة المحددة بـrequire_escalated: `Get "https://api.github.com/repos/mnourdam/noor-al-maadi-app/actions/permissions": Forbidden`. لم تُغير سياسة الشبكة أو أسرار المصادقة. لذلك **لا Run URL موثقة ولا logs Actions مقروءة ولا ادعاء نجاح CI**. إنشاء YAML أو Push ليس إثبات تشغيل PostgreSQL في GitHub. بعد Push قد تشتغل trigger؛ يجب مراجعة run المرتبطة بالـCommit فعلًا في GitHub قبل ترقية هذه البوابة من PENDING.

## بوابة التطبيق

| الفحص | النتيجة |
| --- | --- |
| npm run test:outbox | 1015/1015،38 مجموعة،41.15s |
| الرسمي دون outbox-guest-compatibility.test.ts | 1014/1014،37 مجموعة،27.74s |
| npm run typecheck:outbox | PASS،exit0 |
| npm run build | PASS،exit0 |
| git diff --check | PASS |
| PostgreSQL المحلي الحقيقي | PASS منفصل عن أعداد JS |
| Negative controls | 3/3 اكتشفت المخالفة الصحيحة |
| GitHub Actions logs | PENDING؛ API Forbidden |

سجلات التطبيق المحلية `/tmp/p105b03-root.log` و`/tmp/p105b03-official.log` و`/tmp/p105b03-types.log` و`/tmp/p105b03-build.log` تخص هذه الجلسة.

لم تضف هذه الجولة JavaScript assertions أو تعدل أرقامها. SQL وnegative controls منفصلة عن1014 الرسمية؛ ملف B التشخيصي الواحد غير المتتبع يفسر1015. لا تغيير للـadapter أوAccount/Profile/Cloud/WriterFence/Settlement أو أي migration. جميع ملفات البداية الأخرى مطابقة بصماتها باستثناء ملف قبول SQL المقصود، وتقارير B/A/C السابقة محفوظة. ملفات P1-06B الخمسة لا تدخل Commit.

## حدود الاعتماد والخطوات اللاحقة

- **A محلي PASS فقط؛ Actions PENDING** كما سبق. يحفظ هذا Commit أدوات اختبار حقيقية ومسودة workflow، لا يفعّل backend أو feature للاعب.
- **B PENDING**: يلزم staging مستقلة مصرح بها، مراجعة catalog/role membership/default ACL/schema ownership/auth.uid/PostgREST الحقيقي، واختبار ACL عبر API المستخدم، ثم مقارنة grants مع النموذج. BYPASSRLS لا تتجاوز ACL لكن العضويات قد تورث EXECUTE، ولا يدّعي هذا النموذج تغطية جميع عضويات Supabase.
- **C غير مأذونة**: لا Production ولا نشر backend أو نقل المسودة إلى migrations في هذه الجولة. أي migration مستقبلية تحتاج مراجعة مستقلة ونجاح Actions موثق وB؛ لا تغيير migration تاريخية. لا تجعل row candidate baseline أو wallet ownership.
- V17 الوهمية تثبت absent→legacy وبقاء bytes الاصطناعية؛ ليست اختبار ترقية V17 حقيقية أو سماحًا باستيراد بيانات أو منح تعويض. APIs الاقتصادية القديمة تبقى مفتوحة كما وثقت B-01/B-02؛ لا authoritative activation قبل enforcement خادمية مستقلة.
- Android/WebView وBun Identity الأصلية ما زالت PENDING؛ لا يحلها PostgreSQL المكتبي أو اختبارات JS.
- rollback لهذه الأدوات لا يمس بيانات اللاعبين؛ الحاوية disposable مستقلة. لا clear storage أو قاعدة حية، ولا reset/clean/stash للتاريخ. لم تُكتشف حاجة لتعديل SQL proposal.

**P1-04/P1-05/P1-06 OPEN. Atomic Settlement وGuest Handoff غير مفعّلتين. V18 HOLD.**
