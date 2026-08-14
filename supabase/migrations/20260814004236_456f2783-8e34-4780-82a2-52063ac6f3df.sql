ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS hook_placement text NOT NULL DEFAULT 'top';

ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_hook_placement_check
  CHECK (hook_placement IN ('top', 'middle', 'bottom'));