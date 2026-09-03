# Phase 3B — pre-change rollback record

Captured 2026-09-03, before implementing R1 + R2 + R3 + R5.

## Database replication settings (pre-change)

```
public.profiles                 relreplident = 'f'  (REPLICA IDENTITY FULL)
public.notification_deliveries  relreplident = 'd'
public.notifications            relreplident = 'd'
public.feedback_issues          relreplident = 'd'
public.feedback_messages        relreplident = 'd'

publication supabase_realtime = profiles, notification_deliveries,
  notifications, feedback_issues, feedback_messages
```

Rollback (R2):

```sql
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
```

No table was added to or removed from `supabase_realtime`.

## R1 — `src/lib/account.tsx` profile-sync effect (pre-change)

Effect dependency array was:

```ts
  }, [user?.id, applyServerStats]);
```

`applyServerStats` came straight from `useProfile()` and changed identity on
every profile mutation. To roll back: delete `applyServerStatsRef` and the
ref-sync effect, replace `applyServerStatsRef.current(` with
`applyServerStats(` in both call sites, and restore the dependency array
above.

## R3 — `src/lib/notifications/server.ts` (pre-change body)

```ts
export function subscribeToMyNotifications(onChange: () => void): () => void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return () => {};
  let alive = true;
  const channels: Array<ReturnType<typeof supabase.channel>> = [];

  (async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!alive || !uid) return;

    channels.push(
      supabase
        .channel(`notif-deliveries-${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notification_deliveries", filter: `user_id=eq.${uid}` },
          () => onChange(),
        )
        .subscribe(),
    );

    channels.push(
      supabase
        .channel(`notif-inserts-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          () => onChange(),
        )
        .subscribe(),
    );
  })();

  return () => {
    alive = false;
    for (const c of channels) supabase.removeChannel(c);
  };
}
```

## R5 — `src/routes/profile.tsx` `FeedbackInboxLink` (pre-change)

```ts
    const channel = supabase
      .channel("profile-feedback-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_issues" }, refresh)
      .subscribe();
```

Effect deps were `[]`; there was no `useAccount()` call in the component.
