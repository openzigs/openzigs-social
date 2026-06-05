-- 0012-youtube-quota-alert: per-day Telegram alert-sent flag (epic #58).
--
-- Adds an `alert_sent` column to the existing quota ledger so the once-per-day
-- 80%-threshold Telegram notification is never sent more than once regardless of
-- how many quota-recording calls happen in the same UTC day.
--
-- ALTER TABLE on a table with a UNIQUE constraint is safe; SQLite fully supports
-- adding a NOT NULL DEFAULT column without rebuilding the table.

ALTER TABLE youtube_quota_usage ADD COLUMN alert_sent INTEGER NOT NULL DEFAULT 0;
