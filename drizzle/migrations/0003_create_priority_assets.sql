CREATE TABLE public.priority_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, market, symbol)
);

GRANT SELECT, INSERT, DELETE ON public.priority_assets TO authenticated;
GRANT ALL ON public.priority_assets TO service_role;

ALTER TABLE public.priority_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own priority assets"
ON public.priority_assets
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own priority assets"
ON public.priority_assets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own priority assets"
ON public.priority_assets
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);