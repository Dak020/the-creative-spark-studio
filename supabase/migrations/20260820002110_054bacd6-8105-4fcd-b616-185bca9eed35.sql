ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS dna_role text,
  ADD COLUMN IF NOT EXISTS allowed_speeds numeric[] NOT NULL DEFAULT '{1.0,1.5,1.7,2.0}'::numeric[];

ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_dna_role_check CHECK (dna_role IS NULL OR dna_role IN ('start','middle','end'));

CREATE TABLE IF NOT EXISTS public.dna_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_duration numeric NOT NULL DEFAULT 8,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  hook_id uuid REFERENCES public.hooks(id) ON DELETE SET NULL,
  hook_placement text NOT NULL DEFAULT 'top',
  final_duration numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dna_recipes TO authenticated;
GRANT ALL ON public.dna_recipes TO service_role;

ALTER TABLE public.dna_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own dna recipes" ON public.dna_recipes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);