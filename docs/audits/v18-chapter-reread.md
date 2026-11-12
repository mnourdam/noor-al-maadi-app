# V18: reread encountered chapter text during play

## Scope

The imported chapter route previously kept its intro/historical summary visible,
but removed each reading activity when the player advanced. The completed-campaign
review is not a substitute for rereading while a question is in progress.

A sibling dialog now offers `إعادة قراءة نص الفصل`. It contains authored chapter
intro/history and text from completed `reading_then_question` activities. It never
renders answer keys, hints, feedback, or future reading activities. For pure reading
steps the framing prompt is included, matching the existing reading renderer.
Repeated text is shown once and imported paragraph arrays use the existing coercion.

The current activity is not navigated, reset, replaced or remounted. The dialog owns
only its open state; it has no save, resolve, grant, answer, or advancement callback.
It remains available when hearts are depleted. Existing Radix/dialog infrastructure
handles focus/Escape and the overlay stack handles Back. Owner changes dismiss it;
the route's campaign/chapter key retires it on chapter navigation.

## Evidence

- The actual-route regression fails against the unchanged baseline because the
  reread control does not exist, then passes with this change.
- Eight focused tests: previous vs future reading/answer exclusion; imported arrays
  and empty state; immutable inputs/deduplication; repeated review preserves answer
  state; Back, Escape/focus, identity/chapter retirement; actual chapter route keeps
  the same unsent question answer and exact stored progress, with no reward, heart,
  RPC, or advancement side effect.
- The route test uses the actual route and progress/ledger modules with a stateful
  activity-renderer fixture; it is not a full browser or Android journey.
- Both source/test TypeScript projects passed. Full local offline aggregate:
  **1,849/1,849 tests across 91 files passed** on candidate `8637bb6`. An independent
  reviewer reran all eight focused cases and cleared the bounded implementation.
  Remote CI still belongs to the integrating coordinator; no publication claimed.

## Limits

No network or real player data used. No production deployment, schema or economy
change. Physical-device focus, Android Back and large-text visual QA remain release
acceptance work. This does not add translation or change chapter imagery/content.
