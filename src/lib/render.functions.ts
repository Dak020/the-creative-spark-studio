import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BatchSchema = z.object({
  projectId: z.string().uuid(),
  hookIds: z.array(z.string().uuid()).min(1).max(50),
  mediaAssetIds: z.array(z.string().uuid()).min(1).max(50),
  duration: z.number().min(3).max(60).default(8),
  overlayPosition: z.enum(["top", "center", "bottom"]).default("top"),
  fontSize: z.number().int().min(24).max(140).default(64),
  backgroundColor: z.string().max(20).default("#FFFFFF"),
  textColor: z.string().max(20).default("#000000"),
});

/** Build hook × clip combinations into recipes + queued render jobs. */
export const createBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: hooks, error: hookErr } = await supabase
      .from("hooks")
      .select("id, text")
      .in("id", data.hookIds);
    if (hookErr) throw new Error(hookErr.message);

    const { data: media, error: mediaErr } = await supabase
      .from("media_assets")
      .select("id")
      .in("id", data.mediaAssetIds);
    if (mediaErr) throw new Error(mediaErr.message);

    const recipes = [];
    for (const hook of hooks ?? []) {
      for (const asset of media ?? []) {
        recipes.push({
          user_id: userId,
          project_id: data.projectId,
          hook_id: hook.id,
          media_asset_id: asset.id,
          duration: data.duration,
          overlay_text: hook.text,
          overlay_position: data.overlayPosition,
          font_size: data.fontSize,
          background_color: data.backgroundColor,
          text_color: data.textColor,
          width: 1080,
          height: 1920,
        });
      }
    }
    if (recipes.length === 0) return { recipes: 0, jobs: 0 };

    const { data: insertedRecipes, error: recErr } = await supabase
      .from("video_recipes")
      .insert(recipes)
      .select("id, project_id");
    if (recErr) throw new Error(recErr.message);

    const { error: jobErr } = await supabase.from("render_jobs").insert(
      (insertedRecipes ?? []).map((r) => ({
        user_id: userId,
        project_id: r.project_id,
        recipe_id: r.id,
        status: "queued",
        progress: 0,
      })),
    );
    if (jobErr) throw new Error(jobErr.message);

    return { recipes: insertedRecipes?.length ?? 0, jobs: insertedRecipes?.length ?? 0 };
  });

const ProcessSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(20).default(5),
});

/** Advance the render queue: pick up queued jobs and run them through the engine. */
export const processQueueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProcessSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let query = supabase
      .from("render_jobs")
      .select("id, project_id, recipe_id")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(data.limit);
    if (data.projectId) query = query.eq("project_id", data.projectId);

    const { data: jobs, error } = await query;
    if (error) throw new Error(error.message);
    if (!jobs || jobs.length === 0) return { processed: 0, completed: 0, failed: 0 };

    const { getRenderer } = await import("./render/renderer.server");
    const renderer = getRenderer();

    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
      await supabase
        .from("render_jobs")
        .update({ status: "processing", progress: 10, started_at: new Date().toISOString() })
        .eq("id", job.id);

      const { data: recipe } = await supabase
        .from("video_recipes")
        .select(
          "id, hook_id, media_asset_id, duration, overlay_text, overlay_position, font_size, background_color, text_color, width, height",
        )
        .eq("id", job.recipe_id)
        .maybeSingle();

      if (!recipe) {
        failed++;
        await supabase
          .from("render_jobs")
          .update({ status: "failed", progress: 100, error_message: "Recipe not found." })
          .eq("id", job.id);
        continue;
      }

      const { data: asset } = await supabase
        .from("media_assets")
        .select("id, storage_path, filename, thumbnail_url")
        .eq("id", recipe.media_asset_id ?? "")
        .maybeSingle();

      let sourceUrl = "";
      if (asset?.storage_path) {
        const { data: signed } = await supabase.storage
          .from("media")
          .createSignedUrl(asset.storage_path, 60 * 60 * 24);
        sourceUrl = signed?.signedUrl ?? "";
      }

      const result = await renderer.render({
        jobId: job.id,
        sourceUrl,
        durationSeconds: Number(recipe.duration ?? 8),
        width: recipe.width ?? 1080,
        height: recipe.height ?? 1920,
        overlayText: recipe.overlay_text ?? "",
        overlayPosition: (recipe.overlay_position as "top" | "center" | "bottom") ?? "top",
        fontSize: recipe.font_size ?? 64,
        backgroundColor: recipe.background_color ?? "#FFFFFF",
        textColor: recipe.text_color ?? "#000000",
      });

      if (result.status === "completed") {
        completed++;
        await supabase
          .from("render_jobs")
          .update({
            status: "completed",
            progress: 100,
            output_url: result.outputUrl ?? null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        await supabase.from("generated_videos").insert({
          user_id: userId,
          project_id: job.project_id,
          render_job_id: job.id,
          recipe_id: recipe.id,
          hook_id: recipe.hook_id,
          media_asset_id: recipe.media_asset_id,
          hook_text: recipe.overlay_text,
          output_url: result.outputUrl ?? null,
          thumbnail_url: asset?.thumbnail_url ?? null,
          duration: recipe.duration,
          status: "completed",
        });
      } else {
        failed++;
        await supabase
          .from("render_jobs")
          .update({
            status: "failed",
            progress: 100,
            error_message: result.error ?? "Render failed.",
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    }

    return { processed: jobs.length, completed, failed };
  });

const RetrySchema = z.object({ jobId: z.string().uuid() });

export const retryJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RetrySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("render_jobs")
      .update({ status: "queued", progress: 0, error_message: null, completed_at: null })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
