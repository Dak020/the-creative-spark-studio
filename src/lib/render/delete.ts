/**
 * Safe deletion of a generated render.
 *
 * Removes the database record, its render job and recipe, and the output +
 * thumbnail objects in storage — but never the source media clip, and never a
 * storage object that another generated video still points at.
 */

import { supabase } from "@/integrations/supabase/client";
import { RENDER_BUCKET } from "./pipeline";

export type DeletableRender = {
  id: string;
  output_url?: string | null;
  thumbnail_url?: string | null;
  render_job_id?: string | null;
  recipe_id?: string | null;
};

function isStoragePath(value: string | null | undefined): value is string {
  return Boolean(value) && !/^https?:\/\//i.test(value!);
}

/** True when no other generated video row references this storage path. */
async function isExclusive(path: string, exceptVideoId: string, column: "output_url" | "thumbnail_url") {
  const { data } = await supabase
    .from("generated_videos")
    .select("id")
    .eq(column, path)
    .neq("id", exceptVideoId)
    .limit(1);
  return (data ?? []).length === 0;
}

export async function deleteRender(video: DeletableRender) {
  const removable: string[] = [];

  if (isStoragePath(video.output_url) && (await isExclusive(video.output_url, video.id, "output_url"))) {
    removable.push(video.output_url);
  }
  if (
    isStoragePath(video.thumbnail_url) &&
    (await isExclusive(video.thumbnail_url, video.id, "thumbnail_url"))
  ) {
    removable.push(video.thumbnail_url);
  }

  // 1. Database record first, so a storage hiccup can never leave a row that
  //    points at a deleted file.
  const { error } = await supabase.from("generated_videos").delete().eq("id", video.id);
  if (error) throw new Error(error.message);

  // 2. Storage objects that belong exclusively to this render.
  if (removable.length > 0) {
    const { error: storageErr } = await supabase.storage.from(RENDER_BUCKET).remove(removable);
    if (storageErr) throw new Error(`Output file cleanup failed: ${storageErr.message}`);
  }

  // 3. The job + recipe that exist only for this render. The source media
  //    asset and the hook are intentionally left untouched.
  if (video.render_job_id) {
    await supabase.from("render_jobs").delete().eq("id", video.render_job_id);
  }
  if (video.recipe_id) {
    await supabase.from("video_recipes").delete().eq("id", video.recipe_id);
  }

  return { removedFiles: removable.length };
}
