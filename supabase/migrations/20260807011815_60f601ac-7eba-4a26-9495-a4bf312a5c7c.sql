
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'both',
  content_style TEXT NOT NULL DEFAULT 'ugc',
  videos_to_generate INT NOT NULL DEFAULT 10,
  target_gender TEXT,
  target_age TEXT,
  target_location TEXT,
  target_interests TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_projects_user ON public.projects(user_id, created_at DESC);
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT,
  description TEXT,
  price TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own products" ON public.products FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_products_project ON public.products(project_id);
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- media_assets
CREATE TABLE public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  file_url TEXT,
  thumbnail_url TEXT,
  filename TEXT NOT NULL,
  duration NUMERIC,
  width INT,
  height INT,
  size_bytes BIGINT,
  category TEXT NOT NULL DEFAULT 'other',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own media" ON public.media_assets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_media_user ON public.media_assets(user_id, created_at DESC);
CREATE INDEX idx_media_project ON public.media_assets(project_id);
CREATE INDEX idx_media_category ON public.media_assets(category);

-- hooks
CREATE TABLE public.hooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'curiosity',
  structure TEXT,
  emotional_trigger TEXT,
  audience TEXT,
  platform TEXT NOT NULL DEFAULT 'both',
  source TEXT NOT NULL DEFAULT 'manual',
  is_winner BOOLEAN NOT NULL DEFAULT false,
  performance_score NUMERIC NOT NULL DEFAULT 0,
  views BIGINT NOT NULL DEFAULT 0,
  retention NUMERIC NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  saves BIGINT NOT NULL DEFAULT 0,
  conversion_rate NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hooks TO authenticated;
GRANT ALL ON public.hooks TO service_role;
ALTER TABLE public.hooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own hooks" ON public.hooks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_hooks_user ON public.hooks(user_id, created_at DESC);
CREATE INDEX idx_hooks_category ON public.hooks(category);
CREATE INDEX idx_hooks_winner ON public.hooks(is_winner);
CREATE TRIGGER trg_hooks_updated BEFORE UPDATE ON public.hooks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- hook_variants
CREATE TABLE public.hook_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  parent_hook_id UUID REFERENCES public.hooks(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  category TEXT,
  structure TEXT,
  emotional_trigger TEXT,
  score NUMERIC NOT NULL DEFAULT 0,
  rationale TEXT,
  saved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hook_variants TO authenticated;
GRANT ALL ON public.hook_variants TO service_role;
ALTER TABLE public.hook_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own hook variants" ON public.hook_variants FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_variants_user ON public.hook_variants(user_id, created_at DESC);

-- video_recipes
CREATE TABLE public.video_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  hook_id UUID REFERENCES public.hooks(id) ON DELETE SET NULL,
  media_asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
  duration NUMERIC NOT NULL DEFAULT 8,
  overlay_text TEXT NOT NULL DEFAULT '',
  overlay_position TEXT NOT NULL DEFAULT 'top',
  font_size INT NOT NULL DEFAULT 64,
  background_color TEXT NOT NULL DEFAULT '#FFFFFF',
  text_color TEXT NOT NULL DEFAULT '#000000',
  width INT NOT NULL DEFAULT 1080,
  height INT NOT NULL DEFAULT 1920,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_recipes TO authenticated;
GRANT ALL ON public.video_recipes TO service_role;
ALTER TABLE public.video_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recipes" ON public.video_recipes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_recipes_project ON public.video_recipes(project_id, created_at DESC);

-- render_jobs
CREATE TABLE public.render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.video_recipes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INT NOT NULL DEFAULT 0,
  output_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_jobs TO authenticated;
GRANT ALL ON public.render_jobs TO service_role;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own render jobs" ON public.render_jobs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_jobs_project ON public.render_jobs(project_id, created_at DESC);
CREATE INDEX idx_jobs_status ON public.render_jobs(status);

-- generated_videos
CREATE TABLE public.generated_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  render_job_id UUID REFERENCES public.render_jobs(id) ON DELETE SET NULL,
  recipe_id UUID REFERENCES public.video_recipes(id) ON DELETE SET NULL,
  hook_id UUID REFERENCES public.hooks(id) ON DELETE SET NULL,
  media_asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
  hook_text TEXT,
  output_url TEXT,
  thumbnail_url TEXT,
  duration NUMERIC NOT NULL DEFAULT 8,
  status TEXT NOT NULL DEFAULT 'completed',
  is_winner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_videos TO authenticated;
GRANT ALL ON public.generated_videos TO service_role;
ALTER TABLE public.generated_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own generated videos" ON public.generated_videos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_gv_project ON public.generated_videos(project_id, created_at DESC);

-- performance_metrics
CREATE TABLE public.performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  generated_video_id UUID REFERENCES public.generated_videos(id) ON DELETE CASCADE,
  hook_id UUID REFERENCES public.hooks(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  views BIGINT NOT NULL DEFAULT 0,
  avg_watch_time NUMERIC NOT NULL DEFAULT 0,
  completion_rate NUMERIC NOT NULL DEFAULT 0,
  likes BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  shares BIGINT NOT NULL DEFAULT 0,
  saves BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_metrics TO authenticated;
GRANT ALL ON public.performance_metrics TO service_role;
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own metrics" ON public.performance_metrics FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_metrics_video ON public.performance_metrics(generated_video_id);
CREATE INDEX idx_metrics_hook ON public.performance_metrics(hook_id);
