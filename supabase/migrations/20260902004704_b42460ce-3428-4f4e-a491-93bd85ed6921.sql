CREATE TABLE IF NOT EXISTS public.ai_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'My LLM',
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT NOT NULL,
  key_hint TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT (id, user_id, label, base_url, model, key_hint, is_active, created_at, updated_at) ON public.ai_credentials TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_credentials TO authenticated;
GRANT ALL ON public.ai_credentials TO service_role;

ALTER TABLE public.ai_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own AI credentials" ON public.ai_credentials;
CREATE POLICY "Users manage their own AI credentials"
ON public.ai_credentials FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS ai_credentials_one_active_per_user
ON public.ai_credentials (user_id) WHERE is_active;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS ai_credentials_updated_at ON public.ai_credentials;
CREATE TRIGGER ai_credentials_updated_at
BEFORE UPDATE ON public.ai_credentials
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();