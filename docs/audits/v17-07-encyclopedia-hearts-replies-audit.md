# V17-07 — Encyclopedia comment Hearts + Replies (READ-ONLY AUDIT)

No code, schema, migration, or production data was changed. All backend facts
below were read from LIVE definitions (`pg_get_functiondef`, `pg_policy`,
`pg_indexes`, `pg_constraint`, `pg_publication_tables`), not from migrations.

## 0. Branch / HEAD

- Branch: `edit/edt-82e76904-ee34-4af5-9a5a-dcb787da8641` (working tip of `v17-development`)
- HEAD: `75516bb9fc2506d3112d7d3911c8e940a8a7bbf9` — "Added V17-06B baseline docs"
- Baseline doc in force: `docs/v17-production-migration-baseline.md`

---

## 1. Current Encyclopedia comment client flow

```
src/routes/encyclopedia.entity.$id.tsx : 413
  <StoryComments anchorType="entity" anchorId={entity.id} />
src/routes/encyclopedia.state.$id.tsx   (same component, state pages)
   └─ src/components/social/StoryComments.tsx        list + sort + pagination
        ├─ src/components/social/GuidedCommentComposer.tsx   add
        ├─ src/components/social/CommentItem.tsx             card, edit/delete
        │     └─ src/components/social/ReportCommentButton.tsx
        │     └─ src/components/social/ContributionBadge.tsx
        │     └─ src/components/EmblemArt.tsx
        └─ src/lib/social/comments.ts   listComments / addComment /
                                        editComment / deleteOwnComment
           src/lib/social/reactions.ts  toggleReaction / fetchReactionStates
           src/lib/social/contributions.ts, src/lib/social (public profiles)
```

RPC callers: `list_comments_v2`, `add_story_comment_v2`, `edit_story_comment_v2`,
`delete_own_comment_v2`, `report_comment_v2`, `toggle_reaction_v2`,
`get_reactions_for_anchors_v2` (the last two are used today only by
`Istazadtu` on the entity/story anchor, **not** on comments).

### Comment card facts

| Aspect | Current state |
|---|---|
| Author metadata | `author_name` from RPC; emblem/level/display name hydrated client-side via `fetchPublicProfilesByIds` (signed-in only) |
| Comment ID | Present (`row.id`), already used as DOM id `comment-<id>` |
| `helpful_count` | Returned by `list_comments_v2`, present in the TS type, **never rendered** |
| Controls | Edit (inside `edit_deadline_at`), Delete (own), Report (others) |
| Loading/error | Single `loading` flag + Arabic error box; no retry button |
| Pagination | Keyset cursor, 20/page, "عرض المزيد", disabled offline |
| Optimistic | None. Add/edit/delete splice local state from the server row |
| Offline | Reads are network-only (no cache); composer/load-more gated by `useOnline()` |
| Refetch after mutation | **No refetch** — local array mutation only |
| Replies feasible without redesign | Yes. `CommentItem` is a self-contained `<article>`; a replies block + reply button fit inside it, and `StoryComments` already owns list state |

---

## 2. LIVE comment-heart contract (`toggle_reaction_v2`)

Proven behaviour for `anchor_type='comment'`:

1. `auth.uid()` required → `{ok:false, reason:'auth_required'}`.
2. Parent must exist **and** `status='visible'`, else `anchor_not_found`.
   Hidden / removed / nonexistent comment cannot be hearted **through the RPC**.
3. Unique index `social_reactions(user_id, anchor_type, anchor_id)` → one heart
   per user per comment. Toggle = `DELETE … RETURNING` then conditional `INSERT`.
4. Self-heart is **allowed** as an action; no notification is emitted
   (`v_comment.author_id <> v_uid`, plus a second guard inside
   `_emit_personal_notification`).
5. Returns `{ok, active, count}` — sufficient for optimistic UI.
6. Notification: `_emit_personal_notification(author, 'story_reaction_on_comment',
   'comment', comment_id, batch_key='reactions', actor, payload, batched=true)`
   → upsert on `(user_id, kind, subject_id, batch_key)`, `count = count + 1`,
   `read_at = NULL`.

### Defects found

- **Re-heart spam**: heart → unheart → heart increments `count` each time and
  clears `read_at`. There is no per-actor dedupe; one user can inflate
  "استزاد N قرّاء" indefinitely and repeatedly re-notify the author.
- **Direct-table bypass**: `social_reactions` grants INSERT/DELETE/SELECT to
  `authenticated`, and the policies are `WITH CHECK (auth.uid() = user_id)` /
  `USING (auth.uid() = user_id)` / `USING (true)`. **Any authenticated user can
  PostgREST-insert a reaction with an arbitrary `anchor_type`/`anchor_id`**,
  including nonexistent, hidden, or cross-anchor ids. The RPC validation is
  advisory only. Counts read by `get_reactions_for_anchors_v2` are therefore
  forgeable today.
- `social_reactions_sync_counter` maintains `stories.reaction_count` only;
  the `comment` branch does nothing.

Production usage today: `comment` reactions = **0 rows**, `personal_notifications`
= **0 rows**, `social_comments.helpful_count` non-zero = **0 rows**. The comment
heart path is live but never exercised — a clean slate.

---

## 3. `helpful_count` recommendation

Consumers: `list_comments_v2` returns it and **sorts the default
`editors_helpful_new` feed by it** (`ORDER BY helpful_count DESC, created_at
DESC, id DESC`), with the keyset cursor encoding `hc`. Index
`social_comments_anchor_helpful_idx` is built on it. No writer exists.

- **A. Transactional maintenance** — correct, index-compatible, keeps the cursor
  valid, O(1) per toggle. Concurrency safe if the counter is written inside
  `toggle_reaction_v2` (already a single statement per toggle) or, better, in
  the existing `social_reactions_sync_counter` trigger, which is already
  `AFTER INSERT/DELETE` and where `GREATEST(0, …)` clamping is established.
  Drift risk exists but is repairable with the existing
  `rebuild_reaction_counters()` pattern.
- **B. Compute from `social_reactions` in the list RPC** — always correct, but
  it breaks the keyset cursor (sort key becomes non-stored), forces a join or
  lateral count per row per page, and cannot use the helpful index. Worst
  option for mobile.
- **C. Other** — none exists.

**Recommendation: A**, implemented in the trigger's `comment` branch (not in
the RPC), so direct-table inserts stay consistent too, plus extension of
`rebuild_reaction_counters()` to rebuild `helpful_count`.

---

## 4. Reply data model

`social_comments` has no parent column. Options:

- **A. `parent_comment_id uuid REFERENCES social_comments(id) ON DELETE CASCADE`,
  nullable.** Reply keeps the **same `anchor_type`/`anchor_id` as its parent**
  (root entity), so every existing anchor-scoped query, index, moderation RPC,
  report, and contribution FK keeps working unchanged. Root entity is a column
  read, never a recursive walk. One-level nesting is a trivial constraint.
- **B. Reuse `anchor_type='comment'`, `anchor_id=parentId`.** The enum already
  has `comment`, and `notify_admins_new_comment_v16` already resolves a
  `comment`-anchored row to its parent's anchor — so this shape was clearly
  anticipated. But it **detaches replies from the entity**: `list_comments_v2`
  for the entity would not see them, `total_visible` would be wrong, admin
  lists key on `anchor_type in ('entity','story')`, the anchor-scoped indexes
  do not cover it, and `anchor_id` becomes polymorphic (already text). It also
  collides with `toggle_reaction_v2`'s `comment` anchor semantics.
- **C. Separate `social_comment_replies` table.** Duplicates moderation,
  reporting, editing, contributions, and admin surfaces. Largest blast radius.

**Recommendation: A**, with `ON DELETE CASCADE` **replaced by `ON DELETE
RESTRICT`-style logic in practice**: parent deletion is already a soft delete
(`status='removed'`), so cascade never fires in normal operation and only
protects against a hard admin `DELETE`. Keep `ON DELETE CASCADE` for that case
— it prevents orphans.

Nesting: enforce **exactly one level** server-side by rejecting a parent that
itself has a non-null `parent_comment_id` (reason `nested_too_deep`).
Normalizing-to-root is rejected: it silently misattributes the reply target.

---

## 5. Cross-thread integrity (server-side only)

The reply RPC must, in one transaction, before inserting:

1. `auth.uid()` present.
2. Load parent `FOR SHARE`; not found → `parent_not_found`.
3. `parent.status = 'visible'` → else `parent_not_available`.
4. `parent.parent_comment_id IS NULL` → else `nested_too_deep`.
5. **Derive `anchor_type`/`anchor_id` from the parent row — never from client
   input.** The RPC should not accept an anchor argument at all.
6. Optional defence in depth: `CHECK`-style trigger asserting a reply's
   `(anchor_type, anchor_id)` equals its parent's.

This makes "Entity A reply attached to Entity B parent", story-comment parents,
hidden parents, nonexistent parents, and arbitrary UUIDs structurally
impossible: the anchor is a server-side copy of the validated parent's anchor.

---

## 6. Reply RPC recommendation

`add_story_comment_v2(anchor_type, anchor_id, body)` is called by every comment
surface in the app (stories and encyclopedia). Adding a fourth parameter
changes an overload used on the hot path and forces reply-specific branching
into anchor-specific validation and the 3-per-anchor cap.

**Recommendation: a new narrow RPC `add_comment_reply_v1(p_parent_id uuid,
p_body text)`.** Blast radius = zero for existing callers; `add_story_comment_v2`
stays byte-identical.

It should: verify auth → normalize body with `_normalize_comment_body` and the
same 300-char limit → validate parent per §5 → resolve anchor from parent →
apply reply rate limits (§10) → insert with `parent_comment_id` → return
`{ok:true, comment: to_jsonb(row) - 'moderation_reason' - 'moderated_by'}`,
matching the existing add/edit shape so the client type is reused. The existing
`notify_admins_new_comment_v16` trigger fires unchanged on INSERT; its
`anchor_type='comment'` branch is not taken (replies carry the entity anchor),
and its deep link already yields `/encyclopedia/entity/<id>?comment=<reply id>`.

---

## 7. Replies listing recommendation

`list_comments_v2` today returns `{editors_notes, items, next_cursor,
total_visible}` for one anchor, `status='visible'`, flat.

**Recommendation: one flat extension, no new RPC.**

1. Add `AND sc.parent_comment_id IS NULL` to the editors-notes, helpful, and
   newest branches, and to `total_visible` — so pagination and counts keep
   meaning "top-level comments" and existing cursors stay valid.
2. Attach replies to the returned page in a **single set-based lateral**:
   for the ids on this page only, select their replies ordered
   `created_at ASC, id ASC`, capped at the first N (recommend 3) plus a
   `reply_count`. This is one extra index scan per page — no N+1.
3. Add `parent_comment_id`, `reply_count`, and `replies` to each item.

A separate `list_comment_replies_v1(parent_id, cursor)` is still needed, but
only for "عرض كل الردود" when `reply_count > 3`. Ship it in the same migration;
it is ~15 lines and prevents an unbounded reply array on hot comments.

Heart state: extend the page with the viewer's own heart state per comment and
per returned reply, computed in the same RPC (the viewer is `auth.uid()`), so
the client makes **no** extra `get_reactions_for_anchors_v2` round trip.
Moderation filtering, author metadata, and ordering follow the existing rules.

---

## 8. Notification architecture and the current mismatch

There are **two live inboxes**:

| | System Notification Center | Personal inbox |
|---|---|---|
| Tables | `notifications` + `notification_deliveries` | `personal_notifications` |
| Read RPC | `list_my_notifications(p_limit, p_before)` | `list_my_notifications(p_cursor, p_limit)` (overload) |
| Unread | derived client-side from the list | `unread_notification_count()` |
| Mark read | `mark_my_notification_read`, `mark_all_my_notifications_read` | `mark_notification_read`, `mark_all_notifications_read` |
| Client | `src/lib/notifications/server.ts` → HUD bell, `/notifications`, `InAppBanner`, push | `src/lib/notifications/personal.ts` → `PersonalInboxBell` (Mail icon in HUD), `/inbox` |
| Realtime | `notifications` + `notification_deliveries` are in `supabase_realtime` | not in the publication |
| Deep link | `notifications.deep_link` | derived in `personalPresentation.ts` |

Correction to the V17-06 note: `personal_notifications` is **not dead and not
unreadable**. It has RLS on with no policies *by design* — all access is through
SECURITY DEFINER RPCs, both of which are granted to `authenticated`, and both
are wired to real UI (`PersonalInboxBell` in the HUD, `/inbox` route, linked
from `/profile`). It is intentionally RPC-only. **No GRANT or policy is needed.**

Comment hearts already land in `personal_notifications` with kind
`story_reaction_on_comment`; `personalPresentation.ts` already renders it in
Arabic with a `/encyclopedia/entity/<id>` deep link. The only real gaps are:

- the deep link omits `?comment=<id>`, so it opens the entity but not the thread
  (`StoryComments` already implements `?comment=` scroll + highlight);
- `personal_notifications_kind_chk` has no reply kind;
- the re-heart `count`/`read_at` inflation described in §2.

**Integration path A (comment heart):** keep `personal_notifications`,
unchanged pipeline; add `?comment=` to the payload-derived href; add per-actor
dedupe so a re-heart by the same user does not re-increment or re-unread.

**Integration path B (comment reply):** same pipeline. Add kind
`comment_reply` to `personal_notifications_kind_chk`, emit from
`add_comment_reply_v1` via `_emit_personal_notification(parent.author_id,
'comment_reply', 'comment', parent_id, batch_key='replies', actor, payload,
batched=true)`, and add a `comment_reply` case to `personalPresentation.ts`.

Do **not** route social notifications through `notifications` /
`notification_deliveries`: that pipeline is admin/broadcast/push and is in the
realtime publication — adding per-heart rows there would multiply realtime
traffic straight after the Phase 3B work.

---

## 9. Self-action rules

| Action | Allowed? | Notification |
|---|---|---|
| Heart own comment | Allowed (current live behaviour; do not change) | Never |
| Reply to own comment | Allowed | Never |
| Heart own reply | Allowed | Never |
| Reply to own reply | **Rejected** (`nested_too_deep`) regardless of author | — |

Self-suppression is already structural: `_emit_personal_notification` returns
early when `p_actor = p_user_id`. Keep that as the single choke point rather
than duplicating the check in callers.

**Hearts on replies for V17: YES.** The heart primitive is anchor-agnostic and
a reply *is* a `social_comments` row, so `toggle_reaction_v2` supports it with
zero extra code; excluding replies would cost more code than allowing them.
Reply hearts use the same notification kind and dedupe.

---

## 10. Spam / abuse / rate limits

Existing, all inside `add_story_comment_v2`:

- max 3 `visible|pending` comments per author per anchor → `anchor_limit_reached`
- max 10 comments per author per hour → `rate_limited`
- body: normalized, non-empty, ≤300 chars (plus two table CHECKs)
- edit: only own, only `visible|pending`, only before `edit_deadline_at`
- report / reactions: **no rate limit at all**
- notification creation: batched upsert only

Minimal protection for replies (reuse the same two SELECT counters, no new
subsystem):

1. Reuse the hourly cap but count comments **and** replies together — the
   existing query already counts every `social_comments` row by author, so it
   works as-is if replies live in the same table (another argument for model A).
2. Cap replies per author per parent thread at 3 (`thread_limit_reached`),
   mirroring the per-anchor cap.
3. Add per-actor heart dedupe (see §8) — this is the only new anti-spam logic.

---

## 11. Hidden / deleted / moderated behaviour

| Case | Recommended behaviour |
|---|---|
| A. Top-level hidden (`moderate_comment_v2` → `status='hidden'`) | Parent leaves the list; its replies are hidden **from the entity feed as a consequence** because they are fetched through the parent. Do not cascade the status — the replies remain intact for restore. |
| B. Top-level deleted by author (`delete_own_comment_v2` → `status='removed'`, body blanked) | Same as A: the thread disappears from the feed. Replies are preserved but unreachable. Alternative "tombstone" UI is explicitly out of scope for V17. |
| C. Reply hidden | Hidden from the replies array; `reply_count` must count only `visible` rows. |
| D. Reply deleted | `delete_own_comment_v2` already works on any `social_comments` row → `status='removed'`, blanked body; disappears from the array. |
| E. Author account deleted | `social_comments.author_id` and `social_reactions.user_id` are `ON DELETE CASCADE` to `auth.users` — comments and replies **hard-disappear**, and the FK cascade on `parent_comment_id` then removes their replies too. This is existing behaviour, not new; flag it as a known consequence. |
| F. Parent moderated after replies exist | Replies are orphaned from view but not from data. `notify_admins_new_comment_v16` and the moderation payloads keep working because replies carry the entity anchor. |

No orphan rows are possible: replies always carry both a valid
`parent_comment_id` and the parent's anchor, and the FK cascade covers hard
deletes.

---

## 12. Admin compatibility

`admin_list_content_comments_v1` selects **all** `social_comments` rows joined
to entity/story titles by `anchor_type`. Because model A gives replies the same
`anchor_type`/`anchor_id` as the parent, **replies appear in `/admin/comments`
automatically**, correctly attributed to the entity, with working search and
pagination. `moderate_comment_v2`, `report_comment_v2`,
`list_comment_reports_v2`, and `admin_content_comment_rankings_v1` all operate
per-comment-id and work on replies unchanged.

Minimal optional improvement (not required for V17): expose
`parent_comment_id` in the admin list so a moderator can see "رد" vs top-level.
One column, no UI redesign. Under model B this whole section would have
required admin changes — another reason to reject B.

---

## 13. Realtime

**Recommendation: no realtime for comments, replies, or hearts.**

`social_comments` and `social_reactions` are not in `supabase_realtime` and
should stay out. The interaction is a deliberate, low-frequency reading surface;
optimistic heart toggles plus a targeted refetch after posting a reply are
sufficient and cost nothing at idle. Adding a per-entity subscription would
reintroduce exactly the per-client socket load Phase 3B removed, and the
Notification Center realtime channel already covers "something happened to me".

---

## 14. Offline behaviour

Current architecture: social reads and writes are **online-only by frozen
contract** (`src/lib/social/reactions.ts` header, `src/lib/social/comments.ts`
header), and there is no comment cache.

Recommendation — keep it that way:

- Viewing: no cached comments today; leave unchanged (the list simply shows its
  error state offline).
- Heart offline: button disabled via `useOnline()`, Arabic hint "يتطلب اتصالًا".
  No optimistic success.
- Reply offline: composer disabled, same copy.
- Retry: manual, on reconnect the user re-taps. `StoryComments` can re-run
  `load(sort)` when `online` flips false→true — a 3-line change, no queue.
- **No durable social outbox.** Nothing in the current architecture supports it,
  and a queued heart on a comment that was meanwhile hidden would fail anyway.

---

## 15. Minimum UI proposal (no redesign)

Inside `CommentItem`'s existing footer row, on the left of the metadata line:

- **Heart**: `Heart` lucide icon + `tabular-nums` count, gold when active,
  muted when not. Same size/typography as the existing edit/delete buttons.
  Optimistic toggle with rollback on failure. Hidden entirely for guests
  (tap prompts sign-in, matching the composer).
- **Reply**: text button "رد" next to it. Opens a compact composer **inside the
  card**, reusing the composer's textarea styling, 300-char counter, and
  Arabic error copy.
- **Replies block**: indented `pe-4` (RTL-correct logical padding) with a thin
  right border, directly under the parent card. Show the **first 3** replies
  expanded — collapsing everything hides the conversation and defeats the
  feature; more than 3 collapses behind "عرض جميع الردود (N)".
- Reply cards are the same `CommentItem` at a smaller scale (no emblem level
  chip), with heart + edit/delete/report, and **no reply button** (one level).

Nothing about the Encyclopedia page, hero, or comment section header changes.

---

## 16. Proposed migration plan (NOT executed, NOT written)

Authored against live definitions. Two migrations, in order.

**Migration 1 — schema + integrity**
1. `ALTER TABLE public.social_comments ADD COLUMN parent_comment_id uuid
   REFERENCES public.social_comments(id) ON DELETE CASCADE;`
2. Trigger `social_comments_reply_integrity`: on INSERT/UPDATE, when
   `parent_comment_id IS NOT NULL`, assert the parent exists, is `visible` at
   insert time, has `parent_comment_id IS NULL`, and shares
   `(anchor_type, anchor_id)`.
3. Indexes:
   - `CREATE INDEX … ON social_comments(parent_comment_id, created_at, id) WHERE parent_comment_id IS NOT NULL AND status='visible';`
   - partial-index review: the three existing anchor indexes must gain
     `AND parent_comment_id IS NULL` so top-level pagination stays index-only.
     (Rebuild as new indexes, then drop the old ones, in this same migration.)
4. `personal_notifications_kind_chk` → add `'comment_reply'`.
5. Extend `social_reactions_sync_counter` with a `comment` branch maintaining
   `social_comments.helpful_count`; extend `rebuild_reaction_counters()` to
   rebuild it.
No new table, so no new GRANT block; the column inherits table privileges.

**Migration 2 — RPCs**
1. `CREATE FUNCTION public.add_comment_reply_v1(p_parent_id uuid, p_body text)`
   — SECURITY DEFINER, `SET search_path='public'`, `REVOKE ALL FROM public`,
   `GRANT EXECUTE TO authenticated`. Emits `comment_reply`.
2. `CREATE OR REPLACE FUNCTION public.list_comments_v2(...)` — same signature,
   top-level filter + replies lateral + viewer heart state. Grants unchanged
   (`authenticated`, `anon`).
3. `CREATE FUNCTION public.list_comment_replies_v1(p_parent_id uuid,
   p_cursor text, p_limit integer)` — grants `authenticated`, `anon`.
4. `CREATE OR REPLACE FUNCTION public.toggle_reaction_v2(...)` — same signature;
   add per-actor notification dedupe and `?comment=` in the payload.
5. Security hardening (**recommended, decide explicitly**): drop the direct
   INSERT/DELETE grants/policies on `social_reactions` for `authenticated` so
   the RPC becomes the only write path, closing the forgery hole in §2.
   `get_reactions_for_anchors_v2` and `toggle_reaction_v2` are SECURITY DEFINER
   and unaffected; `src/lib/social/reactions.ts` never writes the table
   directly, so the client needs no change.

**Rollback considerations**: migration 1 is additive except the index swap —
the column can be dropped, but only after replies exist nowhere. Once replies
have been written, rollback is data-destructive; treat migration 1 as one-way.
Migration 2 is fully reversible by restoring the captured prior
`pg_get_functiondef` text of `list_comments_v2` and `toggle_reaction_v2` —
**capture both verbatim before authoring**.

---

## 17. Client files that would change

| File | Change |
|---|---|
| `src/lib/social/comments.ts` | `parent_comment_id`, `reply_count`, `replies`, `my_heart`/`heart_count` on the row type; `addReply()`; `listCommentReplies()`; new Arabic reasons (`parent_not_found`, `parent_not_available`, `nested_too_deep`, `thread_limit_reached`) |
| `src/components/social/CommentItem.tsx` | heart button, reply button, inline reply composer, nested replies block, `isReply` prop |
| `src/components/social/StoryComments.tsx` | thread state, reply insert/delete handlers, expand-all-replies, online→offline refetch |
| `src/lib/notifications/personalPresentation.ts` | `comment_reply` case; append `?comment=` to `commentHref` |
| `src/lib/notifications/personal.ts` | add `comment_reply` to `PersonalNotificationKind` |
| `src/integrations/supabase/types.ts` | regenerated after the migrations |
| `src/lib/social/reactions.ts` | unchanged (already anchor-agnostic) |

---

## 18. Test plan

**Hearts** — heart a comment; unheart; rapid double toggle converges to one row;
two users → count 2; heart own comment allowed with no notification; heart
hidden / removed / nonexistent comment rejected `anchor_not_found`;
`helpful_count` matches `social_reactions` after every case; reaction on entity
anchor does not affect the comment anchor and vice versa; author notified once;
heart→unheart→heart does **not** re-increment or re-unread; direct PostgREST
insert into `social_reactions` is rejected after hardening.

**Replies** — create reply; appears under the correct parent; reply while on
Entity A cannot target an Entity B parent; story-comment parent rejected;
nonexistent parent rejected; hidden/removed parent rejected; reply-to-reply
rejected `nested_too_deep`; edit/delete/report a reply; parent hidden →
thread leaves the feed, replies intact; parent hard-deleted → replies cascade;
author account deleted → rows disappear cleanly; per-thread cap and hourly cap
fire; reply appears in `/admin/comments`.

**Notifications** — heart notification once per actor; reply notification;
self-heart and self-reply produce nothing; unread → read transitions in
`/inbox` and the HUD Mail dot; deep link opens the right entity **and** scrolls
to the right comment; batched count text reads correctly for 1 vs N.

**Client** — optimistic heart rolls back on RPC failure; reply submit shows
loading and a specific Arabic error per reason; list stays consistent after
add/edit/delete without a full reload; RTL indentation and mobile tap targets
≥40px; offline disables both actions and recovers on reconnect; no realtime
subscription added (assert channel count unchanged).

---

## 19. Risks and unresolved questions

1. **`social_reactions` direct-write hole is live today** (§2). It predates
   V17-07 and affects story/entity hearts too. Needs an explicit go/no-go.
2. **Re-heart count inflation** in `_emit_personal_notification` is a shared
   primitive — a per-actor dedupe changes behaviour for every batched kind, not
   just hearts. Needs a decision on scope (heart-only vs primitive-wide).
3. **Index swap on `social_comments`** briefly rebuilds three partial indexes on
   a 193-row table — negligible now, but the migration must use
   `CREATE INDEX` + `DROP INDEX` in the right order.
4. **`auth.users` cascade** hard-deletes comments and replies (§11E). Confirm
   this is intended before shipping replies, since it now removes other
   players' visible reply context.
5. **Two `list_my_notifications` overloads** coexist and are disambiguated only
   by named arguments. Any future signature change to either risks an ambiguous
   call. Not a V17-07 blocker; worth a note.
6. **`notify_admins_new_comment_v16` fires per reply**, so admins get a push per
   reply. Confirm that is wanted, or exclude replies from admin push.
7. Reply body limit is assumed to be 300 chars (same as comments). Confirm.
