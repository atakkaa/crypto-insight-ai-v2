CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('formasyon-ai-scan') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'formasyon-ai-scan'
);

SELECT cron.schedule(
  'formasyon-ai-scan',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--32377e2c-04bd-4126-b864-9e62bf96c86d-dev.lovable.app/api/public/scan',
    headers := '{"Content-Type":"application/json","x-scan-token":"7d959fad3a2d7812aaafd8f35b5dc40502566488189916a5"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);