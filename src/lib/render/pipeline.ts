/**
 * Shared client-side production pipeline.
 *
 *   source clip + hook -> video_recipes -> render_jobs -> browser render
 *   -> storage upload -> verified signed URL -> generated_videos
 *
 * A variant is only ever reported (and stored) as `completed` when the output
 * object actually exists in storage and resolves to a playable signed URL.
 */

import { supabase } from "@/integrations/supabase/client";
import { planStartOffsets, renderVariant } from "./browser-render";
import { resolveRenderUrl } from "./output";

export const RENDER_BUCKET = "renders";
export const CLIP_SECONDS = 8;
export const OUT_W = 1080;
export const OUT_H = 1920;

export type RenderStage =
  | "queued"
  | "rendering"
  | "encoding"
  | "uploading"
  | "completed"
  | "failed";

export const STAGE_LABEL: Record<RenderStage, string> = {
  queued: "Queued",
  rendering: "Rendering",
  encoding: "Encoding",
  uploading: "Uploading",
  completed: "Completed",
  failed: "Failed",
};

export type BatchItem = {
  jobId: string;
  recipeId: string | null;
  videoId: string | null;
  hookId: string;
  hookText: string;
  sourceName: string;
  sourceAssetId: string;
  durationSeconds: number;
  createdAt: string;
  outputPath: string | null;
  thumbnailPath: string | null;
  stage: RenderStage;
  progress: number;
  url?: string;
  filename?: string;
  error?: string;
};

export type BatchInput = {
  userId: string;
  projectId: string;
  asset: {
    id: string;
    filename: string;
    duration: number | null;
    storage_path: string;
    hook_placement?: string | null;
  };
  assetUrl: string;
  hooks: { id: string; text: string }[];
  quantity: number;
  onUpdate: (items: BatchItem[]) => void;
};


/**
 * Round-robin the selected hooks across the requested number of variants, so
 * the user gets exactly the quantity they asked for — never more, never fewer.
 */
export function planVariants(hooks: { id: string; text: string }[], quantity: number) {
  if (hooks.length === 0) return [];
  return Array.from({ length: Math.max(1, quantity) }, (_, i) => hooks[i % hooks.length]!);
}

export async function runBatch(input: BatchInput): Promise<BatchItem[]> {
  const { userId, projectId, asset, assetUrl, quantity, onUpdate } = input;
  const plan = planVariants(input.hooks, quantity);
  if (plan.length === 0) throw new Error("Select at least one hook.");

  const offsets = planStartOffsets(Number(asset.duration ?? CLIP_SECONDS), plan.length, CLIP_SECONDS);
  let items: BatchItem[] = [];
  const push = () => onUpdate([...items]);
  const patch = (jobId: string, p: Partial<BatchItem>) => {
    items = items.map((b) => (b.jobId === jobId ? { ...b, ...p } : b));
    push();
  };

  // 1. Persist the full recipe + job graph up front so the requested quantity
  //    is visible and truthful before any pixels are drawn.
  for (const hook of plan) {
    const { data: recipe, error: recipeErr } = await supabase
      .from("video_recipes")
      .insert({
        user_id: userId,
        project_id: projectId,
        hook_id: hook.id,
        media_asset_id: asset.id,
        duration: CLIP_SECONDS,
        overlay_text: hook.text,
        overlay_position: "top",
        font_size: 64,
        background_color: "#FFFFFF",
        text_color: "#000000",
        width: OUT_W,
        height: OUT_H,
      })
      .select("id")
      .single();
    if (recipeErr || !recipe) throw new Error(recipeErr?.message ?? "Could not create the recipe.");

    const { data: job, error: jobErr } = await supabase
      .from("render_jobs")
      .insert({
        user_id: userId,
        project_id: projectId,
        recipe_id: recipe.id,
        status: "queued",
        progress: 0,
      })
      .select("id, created_at")
      .single();
    if (jobErr || !job) throw new Error(jobErr?.message ?? "Could not queue the render job.");

    items.push({
      jobId: job.id,
      recipeId: recipe.id,
      videoId: null,
      hookId: hook.id,
      hookText: hook.text,
      sourceName: asset.filename,
      sourceAssetId: asset.id,
      durationSeconds: CLIP_SECONDS,
      createdAt: job.created_at,
      outputPath: null,
      thumbnailPath: null,
      stage: "queued",
      progress: 0,
    });
  }
  push();

  // 2. Render each variant.
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    try {
      patch(item.jobId, { stage: "rendering", progress: 4 });
      await supabase
        .from("render_jobs")
        .update({ status: "processing", progress: 4, started_at: new Date().toISOString() })
        .eq("id", item.jobId);

      const { blob, extension, mimeType, thumbnail } = await renderVariant({
        sourceUrl: assetUrl,
        startSeconds: offsets[i] ?? 0,
        durationSeconds: CLIP_SECONDS,
        width: OUT_W,
        height: OUT_H,
        text: item.hookText,
        fontSize: 64,
        onProgress: (pct) => patch(item.jobId, { stage: "rendering", progress: Math.max(4, pct * 0.8) }),
      });

      patch(item.jobId, { stage: "encoding", progress: 85 });
      if (!blob || blob.size === 0) throw new Error("Renderer produced an empty video file.");

      patch(item.jobId, { stage: "uploading", progress: 90 });
      const outPath = `${userId}/${item.jobId}.${extension}`;
      const { error: upErr } = await supabase.storage
        .from(RENDER_BUCKET)
        .upload(outPath, blob, { contentType: mimeType, upsert: true });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      let thumbPath: string | null = null;
      if (thumbnail && thumbnail.size > 0) {
        thumbPath = `${userId}/${item.jobId}.jpg`;
        const { error: thumbErr } = await supabase.storage
          .from(RENDER_BUCKET)
          .upload(thumbPath, thumbnail, { contentType: "image/jpeg", upsert: true });
        if (thumbErr) thumbPath = null;
      }

      // 3. Verify the object is really there and playable before completing.
      const url = await resolveRenderUrl(outPath);
      if (!url) throw new Error("Upload finished but the output file could not be read back.");

      const { data: video, error: videoErr } = await supabase
        .from("generated_videos")
        .insert({
          user_id: userId,
          project_id: projectId,
          render_job_id: item.jobId,
          recipe_id: item.recipeId,
          hook_id: item.hookId,
          media_asset_id: asset.id,
          hook_text: item.hookText,
          output_url: outPath,
          thumbnail_url: thumbPath,
          duration: CLIP_SECONDS,
          status: "completed",
        })
        .select("id")
        .single();
      if (videoErr) throw new Error(videoErr.message);

      await supabase
        .from("render_jobs")
        .update({
          status: "completed",
          progress: 100,
          output_url: outPath,
          error_message: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", item.jobId);

      patch(item.jobId, {
        outputPath: outPath,
        thumbnailPath: thumbPath,
        stage: "completed",
        progress: 100,
        url,
        videoId: video?.id ?? null,
        filename: `hook-variant-${i + 1}.${extension}`,
      });
    } catch (e) {
      const message = (e as Error).message || "Render failed.";
      patch(item.jobId, { stage: "failed", progress: 100, error: message });
      await supabase
        .from("render_jobs")
        .update({
          status: "failed",
          progress: 100,
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", item.jobId);
    }
  }

  return items;
}

/** Jobs left in an active state longer than this were abandoned (tab closed, crash). */
export const STALE_JOB_MS = 1000 * 60 * 20;

/**
 * Renders run in the browser tab that started them, so a closed tab can strand
 * a job in `queued`/`processing` forever. Flip anything older than the cutoff to
 * `failed` so the active queue only ever shows work that is really in flight.
 */
export async function reapStaleJobs(userId: string, projectId?: string) {
  const cutoff = new Date(Date.now() - STALE_JOB_MS).toISOString();
  let q = supabase
    .from("render_jobs")
    .update({
      status: "failed",
      progress: 100,
      error_message: "Render was interrupted before it finished. Run it again.",
      completed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .in("status", ["queued", "processing"])
    .lt("created_at", cutoff);
  if (projectId) q = q.eq("project_id", projectId);
  const { error } = await q;
  if (error) return 0;
  return 1;
}
