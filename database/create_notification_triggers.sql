-- database/create_notification_triggers.sql
-- Optional: Database triggers to call Edge Function when expenses are created
-- Note: This is an alternative approach. The current implementation uses Edge Function
-- called directly from the client after expense creation.

-- Function to call Edge Function via HTTP (requires pg_net extension)
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to trigger notifications when expense is created
-- CREATE OR REPLACE FUNCTION trigger_expense_notifications()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   -- Call Edge Function via HTTP
--   PERFORM net.http_post(
--     url := current_setting('app.supabase_url') || '/functions/v1/create-expense-notifications',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
--     ),
--     body := jsonb_build_object(
--       'expense_id', NEW.id,
--       'group_id', NEW.group_id
--     )
--   );
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- Trigger to call function on expense insert
-- CREATE TRIGGER expense_notification_trigger
--   AFTER INSERT ON expenses
--   FOR EACH ROW
--   EXECUTE FUNCTION trigger_expense_notifications();

-- Note: The current implementation uses client-side Edge Function calls
-- which is simpler and doesn't require database extensions.

