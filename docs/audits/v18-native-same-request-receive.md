# Same-request receive wait within the existing evaluator deadline

## Measured blocker and baseline

Prepared from local `565acd9e09166e60f974c1ab514351a53296082f`, tree
`5870ae4fa937119f2f94093b73ccccbf10079b3e`, equal to the public8b99 diagnostic
candidate's tree. Commit identities are not interchangeable.

Independent review of run43500516292 found boot/install/launch success and an
actual successful1+1 result. The second native-platform evaluation failed during
receive with websocket_timeout and zero parsed responses. No detach/crash was
observed; target-list HTTP diagnostic independently timed out. This does not
establish an app defect or onboarding condition. Source previously set each recv
wait to at most3 seconds but immediately let a recv timeout escape its larger
15-second evaluator loop. This is a concrete premature-wait boundary to test,
not proof a later response will arrive.

## Library semantics checked

Workflow already pins `websocket-client==1.8.0`. Official tag v1.8.0 resolved to
commit `3dc494588c4bc6ca1cbb745e9d110108f6bf04f0`:

* [Socket receive/send implementation](https://github.com/websocket-client/websocket-client/blob/3dc494588c4bc6ca1cbb745e9d110108f6bf04f0/websocket/_socket.py)
  translates socket timeouts to WebSocketTimeoutException.
* [WebSocket receive implementation](https://github.com/websocket-client/websocket-client/blob/3dc494588c4bc6ca1cbb745e9d110108f6bf04f0/websocket/_core.py)
  closes on connection-closed errors, not ordinary receive timeout. recv may also
  process ping and attempt an automatic pong SEND, whose timeout has the same type.
* [Frame buffer implementation](https://github.com/websocket-client/websocket-client/blob/3dc494588c4bc6ca1cbb745e9d110108f6bf04f0/websocket/_abnf.py)
  retains header/length and partial payload buffer when a read times out.

Same pinned package was installed into an isolated local test-tools directory,
without changing application dependencies/locks. Tests use its actual parser and
fake socket, never a websocket connection or server. Source correspondence is not
claimed as installed emulator binary attestation.

## Narrow repair

The original Runtime.evaluate request is sent once, with the same sequence ID,
socket, original overall15-second deadline and CDP10-second execution-timeout
parameter. Exploratory remaining deadline still caps the overall interval.
Only an actual trusted WebSocketTimeoutException whose traceback contains the
loaded library's `_socket.recv` code object and no `_socket.send` code object is
eligible to continue receiving that same outstanding request. Tracebacks are
examined transiently by code identity; no traceback, path, message or payload is
serialized. Unknown origins fail closed. This distinction prevents swallowing
an automatic-pong send timeout. Classifier failure also propagates the original
exception, not its own failure.

Each remaining recv remains capped to the original deadline and3 seconds. No
resend, reconnect, new evaluation, frame reconstruction or corrupt-frame skipping
is introduced. Repeated timeouts ultimately raise evaluation_deadline once and
increment the existing outer failure count once. A saturated receive-timeout
counter is reported separately. Protocol/closed/JSON errors and detach/crash
remain terminal. A completed recv returning at/after the deadline is rejected
before parsing/acceptance. The existing synchronous library can do internal
reads/control-frame handling; this is not a new OS-hardwall guarantee, and the
post-return check never retroactively admits an over-budget response.

No launch, boot, Page-readiness, native-plugin, Home assertion, resource or host
setting is altered. Positive delayed responses remain subject to the unchanged
native-platform assertion; this does not approve any prior failed request or
establish full-app/release acceptance.

## Offline controls

Actual1.8.0 fake-socket tests cover repeated idle timeouts and a delayed matching
reply with exactly one request, partial header/payload timeout recovery, deadline
exhaustion, late successful return rejection, unrelated message ID, shorter
exploratory budget, detach/crash/protocol/closed failures, original send timeout,
automatic-pong send timeout, unknown timeout origin and classifier failure.
The real library's existing automatic pong is not an extra Runtime.evaluate.
No new dependency was added to CI; the existing pinned install supplies these
controls. All158 native Python controls pass locally with that isolated package.
Independent final review is required before commit. No native runtime or
publication was performed.

Independent full-suite review initially found157PASS/1FAIL in an older collector
redaction test: a nondeterministic elapsed decimal contained the string42 used as
a synthetic PID. No PID disclosure was demonstrated. The fourth changed path
fixes that test's monotonic clock to0 while retaining the same no-PID assertion,
so a genuinely serialized PID still fails and unrelated timing cannot flake it.
