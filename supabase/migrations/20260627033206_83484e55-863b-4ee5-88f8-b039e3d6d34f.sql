
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'ensure_my_delivery(uuid)',
    'list_my_notifications(int,timestamptz)',
    'my_unread_notification_count()',
    'mark_notification_read(uuid)',
    'mark_all_notifications_read()',
    'delete_my_notification(uuid)',
    'clear_my_notifications()',
    'record_notification_dismissed(uuid)',
    'get_my_notification_preferences()',
    'set_my_notification_preferences(jsonb)'
  ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role;', fn);
  END LOOP;
END $$;
