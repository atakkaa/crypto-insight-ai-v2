CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL DEFAULT '1h',
  action TEXT NOT NULL,
  pattern TEXT,
  confidence INT NOT NULL DEFAULT 0,
  price NUMERIC,
  entry NUMERIC,
  stop NUMERIC,
  targets NUMERIC[] DEFAULT '{}',
  reason TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX alerts_user_created_idx ON public.alerts (user_id, created_at DESC);
CREATE INDEX alerts_dedupe_idx ON public.alerts (user_id, market, symbol, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own alerts" ON public.alerts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own alerts" ON public.alerts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own alerts" ON public.alerts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);