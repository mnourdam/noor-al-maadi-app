# Post-timeout native initialization observation

## Exact baseline / existing measured evidence

Prepared from local `6e11161e9b8a7a136ea8e341d49731bffe2ab9ef`, tree
`9bf2f300c4231265a91d429457abc844027490c1`, equal to public
`4b332e3803458e22ffaba0596c88903122aef716` (different commit identity).
Parent/reviewer verified run43470735159: exact boot1 observed query
486.808769–486.906672 seconds, install and actual guest digest verified. One
`am start -W` timed out at15 seconds; read-only reconciliation saw the exact
resumed component and same unique PID before/after, but did not see its WebView
socket in the complete socket sample. No Page/CDP/JS/Home was reached. These
facts do not establish the cause, an onboarding failure, or that no WebView exists.

## Source-grounded interpretation

Actual `android/app/src/main/java/app/lovable/irth/MainActivity.java` performs
SplashScreen installation, RingerMode registration, then `super.onCreate`, before
explicit debug-only WebView debugging. `IrthApp.java` creates a local notification
channel. Neither is replaced/edited by this change.

Inspected installed Capacitor8.4.1 source agrees with the exact baseline lock's
8.4.1 package version (registry integrity remains recorded in package-lock.json).
This is source guidance, not new installed binary/order attestation:

* `BridgeActivity.java` SHA256
  `344dda9fcee959138cbd70fbe2f66f73938727048455d1082188527266297c67`:
  WebView layout inflation exception selects `no_webview` and returns; the
  `Starting BridgeActivity` marker precedes builder.create. `App started` and
  `App resumed` require a nonnull bridge.
* `Bridge.java` SHA256
  `91bb58293057bee4dd3d10104295b0e01aba2afd4009fbe750a003e9ff4900a7`:
  initWebView enables debugging according to config before loadWebView.
  `System WebView is not supported` is a fixed error marker.
* `Logger.java` SHA256
  `1214d48e8ccacddd2ed4fa7f0b8a3af51aa164ff3deaeea6dbcfc88474fcd83a`:
  core tag `Capacitor`; logging may be disabled. Marker absence is not stage absence.

A resumed Android activity is not proof of successful bridge/JS startup. A missing
socket can also reflect debugging availability. Observed error markers are hints,
not a root-cause verdict.

## Narrow observer contract

Only a verified-install initial launch that was dispatched and raised the original
`TimeoutExpired` may enter. Non-timeout failures and later lifecycle launches do
not gain an observation extension. The existing reconciliation passes a private
caller-owned identity dictionary only after its two unique PID samples match and
its activity predicate observed the exact component, every prerequisite capture was
complete, and socket parsing produced a recognized observation. Prior probe
cleanup/reap uncertainty cannot authorize the new observer. This internal PID is never
serialized. No successor/fresh PID is selected if identity is unavailable.

The separate60-second operation deadline covers sparse socket samples targeted at
0/10/30/50 seconds, followed by terminal activity and one log-tail read only if
budget remains. Every socket/activity/log capture is bracketed by exact-package
PID checks against that original reconciliation baseline. Absence, replacement,
ambiguity or unavailable identity stops observation; identical PID samples still
cannot rule out PID reuse between samples. Capture/reap cleanup errors stop
further reads. Complete capture with no matching socket means not observed in
that sample, not universal absence.

Each capture is <=2 seconds and <=64KiB (log tail<=16KiB/128 lines). At most18
read-only adb probes are admitted; all are capped to remaining60. A response after
the deadline is not accepted as an in-budget observation. Existing capture cleanup
allows up to1 second for each owned-probe reap separately; this is not a hard
OS-preemptive60-second wall. No special work starts after the deadline, and a
partially completed observation is labeled accordingly. The original12-second
launch reconciliation precedes this separate allowance.

Logcat uses read-only `-d`, internal numeric `--pid`, fixed buffers, brief format,
and fixed Capacitor/AndroidRuntime tag filters. Only exact allowlisted lifecycle
markers, fixed error hints, counts and capture states are returned. No raw lines,
messages, PIDs, paths, tokens or foreign component names are emitted. Malformed,
foreign-PID or truncated log output is unavailable; absence of a hint does not
prove its historical absence or lack of an error. This is a bounded tail, never
complete startup history. The installed image's logcat option/format support
remains unverified until actual execution.

Original launch exception and overall failure remain immutable even if every
marker/socket is observed. Import/parser/capture failures cannot replace it or
prevent runner teardown. No second launch, input, force-stop, forwarding, CDP,
settings, application edits, boot-budget changes or launch-timeout changes occur.
No activation, release-readiness or six-journey acceptance is implied.

## Offline validation

Focused synthetic transport/clock controls cover negative admission, provenance,
identity changes around every kind of capture, byte/format/marker lookalikes,
truncation, exhausted deadlines, cleanup/reap errors, and preservation of original
exceptions even with all-positive observation. Existing runner controls remain.
No local SDK/emulator/application runtime or publication was performed. Independent
final review is required before committing/publishing the candidate.

Independent review caught one admission gap before final freeze: a failed prior
socket-probe cleanup could coexist with matching PID/activity and still publish
the internal baseline. Baseline admission now requires all prerequisite captures
complete and a recognized socket observation. Dedicated cleanup/reap/truncation/
timeout negatives prove no identity publication or subsequent observer commands.
