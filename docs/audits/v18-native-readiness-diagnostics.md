# Fixed native readiness diagnostics

Prepared against local `26fe3caa38b1ea56cc4a5505aaaca6e277cf2bb0`, tree
`390b217e0205565e49b2de30667eb97c0f3d5339`, equal to public
`beee2a0c4d9451a19666656beb52bd8adccbe214`, not the same commit identity.

Parent/reviewer verified actual beee run43486335679: boot and installed APK hash
passed; first launch command returned successfully in25.709s within60; Page
construction completed. Failure then occurred at app_readiness with generic
runtime_error and connection_failures1, no reported detach/crash. Later diagnostic
HTTP target enumeration returned no usable result (null count), while process
and socket were still observed. Null count is not proof the target disappeared.
The existing evidence does not locate the failed readiness check or establish a
transport timeout, app defect, onboarding surface or successful JavaScript.

## Diagnostic-only changes

Existing readiness assertions remain in the original order:1+1, Android native
platform, App.getState active, then unchanged transport/native guard and strict
Home predicate. Fixed active readiness phase is set before each check. Four
completed booleans start false and become true only after the original assertion
passes. No new JavaScript, DOM read, native action or CDP request is introduced.

Existing evaluate operations are labeled before deadline setup, websocket timeout
setup/send/receive, JSON decode and response dispatch. Existing exception still
propagates and increments connection_failures once. Diagnostic classification
uses trusted isinstance checks against fixed builtin/websocket exception classes;
an identically named unrelated exception is still unknown. Arbitrary exception
text, expression strings, response bodies, URLs and target identifiers are never
included. Failure of the diagnostic classifier cannot replace the original error.
Parsed-response count is numeric and saturates at1000; it neither limits nor
changes the existing response loop. Recognized protocol errors/detach/crash keep
their prior behavior. Classification identifies the observed exception family,
not its underlying cause.

The already-existing postfailure HTTP target-list probe records its own fixed
error category separately from the original evaluate error. It still makes the
same one lookup and leaves target existence/count null on failure. No retries,
reconnections, extra probes, wider budgets, assertion relaxation, app changes,
permission changes or automatic onboarding dismissal occur. First-launch60,
lifecycle15, boot900 and existing receive/readiness deadlines are unchanged.

## Offline verification

149/149 native Python controls pass, including mock-socket success and each
instrumented failure phase, preserved prior readiness checks, assertion-negative
controls, classifier failure preserving the original exception, strict exception
type identity, separate target-probe error, and bounded numeric count without a
second send. These are offline controls only, not a device or JavaScript result.
Independent final review is required before commit/publication. Actual runtime
must identify the remaining failure; no app/Home/six-journey or release acceptance
is inferred from this change.
