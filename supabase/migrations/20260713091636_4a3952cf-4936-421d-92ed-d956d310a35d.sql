-- Create dedicated pgmq queue for the new custom auth email pipeline.
-- Independent from Lovable's managed `auth_emails` queue. The existing
-- enqueue_email / read_email_batch / delete_email / move_to_dlq RPCs are
-- queue-name-parameterized so no new RPC wrappers are needed.
SELECT pgmq.create('auth_emails_custom');
SELECT pgmq.create('auth_emails_custom_dlq');