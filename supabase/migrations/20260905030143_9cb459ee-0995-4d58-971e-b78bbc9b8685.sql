CREATE TABLE public.render_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  video_id uuid NOT NULL REFERENCES public.generated_videos(id) ON DELETE CASCADE,
  project_id uuid,
  rating text NOT NULL CHECK (rating IN ('up','down')),
  reason text,
  issues text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_feedback TO authenticated;
GRANT ALL ON public.render_feedback TO service_role;

ALTER TABLE public.render_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own render feedback"
ON public.render_feedback FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER render_feedback_updated_at
BEFORE UPDATE ON public.render_feedback
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();