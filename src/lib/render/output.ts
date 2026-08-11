import { supabase } from "@/integrations/supabase/client";

const RENDER_BUCKET = "renders";

/**
 * Resolve a stored render output path into a playable signed URL.
 * Returns null when the row has no path or the file no longer exists in storage,
 * so a database record alone is never treated as a successful render.
 */
export async function resolveRenderUrl(
  path: string | null | undefined,
  expiresIn = 60 * 60 * 6,
): Promise<string | null> {
  if (!path) return null;
  // Absolute URLs (legacy rows) are already playable.
  if (/^https?:\/\//i.test(path)) return path;

  const { data, error } = await supabase.storage
    .from(RENDER_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;

  // Confirm the object actually exists (a signed URL is minted even for missing files).
  try {
    const head = await fetch(data.signedUrl, { method: "HEAD" });
    if (!head.ok) return null;
  } catch {
    return null;
  }
  return data.signedUrl;
}

export function renderFilename(path: string | null | undefined, label: string) {
  const ext = path?.split(".").pop()?.toLowerCase();
  const safe = ext && ext.length <= 4 ? ext : "mp4";
  return `${label}.${safe}`;
}

export async function downloadRender(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}
