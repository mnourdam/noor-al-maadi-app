# Bounded first-launch command wait

## Evidence and exact scope

Prepared from local `ae5eae72df4719ad0b05b7c7f140a31ff7c24187`, tree
`f5d73815eea5b4bd348fa83d0c8b00558b956611`, equal to public
`0a39da334979f57ba634712780fd032f0247f42b` (not the same commit identity).

The independently verified actual0a39 run had exact boot completion around430s,
verified installation/guest APK digest, and one15-second launch timeout. In the
separate diagnostic window the same-process WebView socket was observed by11.10s
and at later30/50-second samples, with fixed Capacitor App started/resumed markers
and the exact activity retained. All captures completed. These observations do
not retrospectively complete `am start -W`, prove JS/Home readiness, or establish
an exact time from dispatch to UI availability. They support a finite longer
first-command wait, not repeated dispatch or a guarantee of completion.

Under explicit parent authorization, the shared launch helper now selects a
60-second maximum only for `verified_install is True`. Source has exactly two
such callsites: the normal initial launch after successful install_once, and the
exploratory initial launch after its successful install_once. The latter remains
capped by its remaining overall deadline. The default Device.launch used for
Home/resume and intentional force-stop/relaunch stays15 seconds. No arbitrary
configurable timeout argument is introduced.

Configured/effective wait values enter the receipt only after remaining-budget
preflight succeeds, before the single dispatch attempt. Expiry cannot record a
launched command or trigger reconciliation. The command, exact component and
single-dispatch rule are unchanged. Page/CDP construction still follows successful
command return only. A timeout still raises the original exception, retains the
same bounded read-only reconciliation/native-initialization observations, and
never retries or promotes a positive diagnostic to launch success. No general
ADB/Page/readiness/boot-budget, resource, host, application or content changes.

## Offline controls

New tests cover normal verified60, strict boolean selection, default lifecycle15,
remaining exploratory budget<60, expiry before dispatch, and actual main-flow
orchestration where a first60 timeout plus positive diagnostics still exits1,
never constructs Page, retains originalfailure and invokes owned teardown.
Existing callsite, no-retry and diagnostic tests remain unchanged.
No native runtime or publication was performed. Independent review is required
before the exact candidate is committed; subsequent measured execution, not these
unit tests, must establish whether the command completes and what the real app
then presents. Six full-app journeys and release readiness remain unproved.
