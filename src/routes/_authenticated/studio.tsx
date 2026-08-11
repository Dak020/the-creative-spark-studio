import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Film, Loader2, Plus, Trophy, Upload, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState, PageHeader, StatusPill } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HOOK_CATEGORIES } from "@/lib/constants";
import { videoExtension, videoFileError, withTimeout } from "@/lib/video-file";
import { fmtDuration, signedUrl } from "@/lib/db";
import { planStartOffsets, renderVariant } from "@/lib/render/browser-render";
import { downloadRender, renderFilename, resolveRenderUrl } from "@/lib/render/output";


const CLIP_SECONDS = 8;
const OUT_W = 1080;
const OUT_H = 1920;
const MAX_VARIANTS = 5;


export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "Studio — Creative Factory" },
      {
        name: "description",
        content: "Upload one clip, pick 5 winning hooks, and render 5 ready-to-post vertical videos.",
      },
      { property: "og:title", content: "Studio — Creative Factory" },
      {
        property: "og:description",
        content: "The complete upload, hook selection, render and download workflow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioPage,
});

type BatchItem = {
  jobId: string;
  hookId: string;
  hookText: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  url?: string;
  filename?: string;
  error?: string;
};

function StudioPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [rendering, setRendering] = useState(false);

  const [text, setText] = useState("");
  const [category, setCategory] = useState<string>(HOOK_CATEGORIES[0]);
  const [notes, setNotes] = useState("");
  const [winner, setWinner] = useState(true);
  const [savingHook, setSavingHook] = useState(false);

  const { data: assets } = useQuery({
    queryKey: ["studio-assets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("media_assets")
        .select("id, filename, storage_path, duration, created_at")
        .order("created_at", { ascending: false })
        .limit(12);
      return data ?? [];
    },
  });

  const { data: hooks } = useQuery({
    queryKey: ["studio-hooks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("hooks")
        .select("id, text, category, notes, is_winner, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  // Previously rendered variants, so results survive a page reload.
  const { data: pastResults } = useQuery({
    queryKey: ["studio-results"],
    queryFn: async (): Promise<BatchItem[]> => {
      const { data } = await supabase
        .from("generated_videos")
        .select("id, hook_text, output_url, status, created_at")
        .order("created_at", { ascending: false })
        .limit(VARIANTS);
      const rows = data ?? [];
      return Promise.all(
        rows.map(async (r): Promise<BatchItem> => {
          const url = await signedUrl("renders", r.output_url, 60 * 60 * 6);
          return {
            jobId: r.id,
            hookId: "",
            hookText: r.hook_text ?? "",
            status: r.status === "completed" ? "completed" : "failed",
            progress: 100,
            ...(url ? { url } : {}),
            filename: `variant-${r.id.slice(0, 6)}.webm`,
          };
        }),

      );
    },
  });

  const results: BatchItem[] = batch.length > 0 ? batch : (pastResults ?? []);



  const asset = useMemo(
    () => (assets ?? []).find((a) => a.id === assetId) ?? (assets ?? [])[0] ?? null,
    [assets, assetId],
  );

  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!asset?.storage_path) {
      setAssetUrl(null);
      return;
    }
    signedUrl("media", asset.storage_path, 60 * 60 * 6).then((u) => {
      if (active) setAssetUrl(u);
    });
    return () => {
      active = false;
    };
  }, [asset?.storage_path]);

  const onUpload = useCallback(
    async (file: File) => {
      if (!user) {
        toast.error("You are signed out — sign in again to upload.");
        return;
      }
      const invalid = videoFileError(file);
      if (invalid) {
        toast.error(invalid);
        return;
      }
      setUploading(true);
      try {
        const projectId = await ensureStudioProject(user.id);
        if (!projectId) throw new Error("Could not prepare the studio project.");
        const meta = await withTimeout(probeVideo(file), 15000, {
          duration: 0,
          width: 0,
          height: 0,
        });
        const ext = videoExtension(file);
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("media")
          .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

        const { data, error } = await supabase
          .from("media_assets")
          .insert({
            user_id: user.id,
            project_id: projectId,
            storage_path: path,
            filename: file.name || `clip.${ext}`,
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            size_bytes: file.size,
            category: "Other",
          })
          .select("id")
          .single();
        if (error || !data) {
          await supabase.storage.from("media").remove([path]);
          throw new Error(`Saving the clip failed: ${error?.message ?? "no record returned"}`);
        }

        setAssetId(data.id);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["studio-assets"] }),
          qc.invalidateQueries({ queryKey: ["media"] }),
          qc.invalidateQueries({ queryKey: ["project"] }),
        ]);
        toast.success("Source video uploaded");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [qc, user],
  );


  async function saveHook() {
    if (!user) return;
    if (text.trim().length < 4) {
      toast.error("Write the hook text first.");
      return;
    }
    setSavingHook(true);
    const { error } = await supabase.from("hooks").insert({
      user_id: user.id,
      text: text.trim(),
      category,
      notes: notes.trim() || null,
      is_winner: winner,
    });
    setSavingHook(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
    setNotes("");
    await qc.invalidateQueries({ queryKey: ["studio-hooks"] });
    toast.success("Hook saved");
  }

  function toggleHook(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((h) => h !== id);
      if (prev.length >= VARIANTS) {
        toast.info(`Select exactly ${VARIANTS} hooks.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  async function createVariants() {
    if (!user || !asset || !assetUrl) {
      toast.error("Upload a source video first.");
      return;
    }
    if (selected.length !== VARIANTS) {
      toast.error(`Select exactly ${VARIANTS} hooks.`);
      return;
    }
    const chosen = selected
      .map((id) => (hooks ?? []).find((h) => h.id === id))
      .filter((h): h is NonNullable<typeof h> => Boolean(h));

    const projectId = await ensureStudioProject(user.id);
    if (!projectId) {
      toast.error("Could not prepare the studio project.");
      return;
    }

    setRendering(true);
    const offsets = planStartOffsets(Number(asset.duration ?? CLIP_SECONDS), VARIANTS, CLIP_SECONDS);
    const items: BatchItem[] = [];

    try {
      for (const hook of chosen) {
        const { data: recipe, error: recipeErr } = await supabase
          .from("video_recipes")
          .insert({
            user_id: user.id,
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
        if (recipeErr) throw new Error(recipeErr.message);

        const { data: job, error: jobErr } = await supabase
          .from("render_jobs")
          .insert({
            user_id: user.id,
            project_id: projectId,
            recipe_id: recipe.id,
            status: "queued",
            progress: 0,
          })
          .select("id")
          .single();
        if (jobErr) throw new Error(jobErr.message);

        items.push({
          jobId: job.id,
          hookId: hook.id,
          hookText: hook.text,
          status: "queued",
          progress: 0,
        });
      }
    } catch (e) {
      setRendering(false);
      toast.error((e as Error).message);
      return;
    }

    setBatch(items);

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const patch = (p: Partial<BatchItem>) =>
        setBatch((prev) => prev.map((b) => (b.jobId === item.jobId ? { ...b, ...p } : b)));

      patch({ status: "processing", progress: 5 });
      await supabase
        .from("render_jobs")
        .update({ status: "processing", progress: 5, started_at: new Date().toISOString() })
        .eq("id", item.jobId);

      try {
        const { blob, extension, mimeType } = await renderVariant({
          sourceUrl: assetUrl,
          startSeconds: offsets[i] ?? 0,
          durationSeconds: CLIP_SECONDS,
          width: OUT_W,
          height: OUT_H,
          text: item.hookText,
          fontSize: 64,
          onProgress: (pct) => patch({ progress: Math.max(5, pct) }),
        });

        const outPath = `${user.id}/${item.jobId}.${extension}`;
        const { error: upErr } = await supabase.storage
          .from("renders")
          .upload(outPath, blob, { contentType: mimeType, upsert: true });
        if (upErr) throw new Error(upErr.message);

        await supabase
          .from("render_jobs")
          .update({
            status: "completed",
            progress: 100,
            output_url: outPath,
            completed_at: new Date().toISOString(),
          })
          .eq("id", item.jobId);

        await supabase.from("generated_videos").insert({
          user_id: user.id,
          project_id: projectId,
          render_job_id: item.jobId,
          recipe_id: null,
          hook_id: item.hookId,
          media_asset_id: asset.id,
          hook_text: item.hookText,
          output_url: outPath,
          duration: CLIP_SECONDS,
          status: "completed",
        });

        const url = URL.createObjectURL(blob);
        patch({
          status: "completed",
          progress: 100,
          url,
          filename: `variant-${i + 1}.${extension}`,
        });
      } catch (e) {
        const message = (e as Error).message;
        patch({ status: "failed", progress: 100, error: message });
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

    setRendering(false);
    await qc.invalidateQueries({ queryKey: ["studio-results"] });
    toast.success("Batch finished");

  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Studio"
        description={`Upload one clip, pick ${VARIANTS} winning hooks, render ${VARIANTS} ready-to-post 8s vertical videos.`}
      />

      {/* 1. Source video */}
      <section className="panel p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">1. Source video</h2>
            <p className="text-xs text-muted-foreground">One MP4 or MOV clip powers the whole batch.</p>
          </div>
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} variant="secondary">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload video
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov"
            hidden
            onChange={(e) => {
              const input = e.currentTarget;
              const files = Array.from(input.files ?? []);
              input.value = "";
              const f = files[0];
              if (f) void onUpload(f);
            }}
          />
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[240px_1fr]">
          <div className="overflow-hidden rounded-xl border border-border bg-black">
            {assetUrl ? (
              <video src={assetUrl} controls playsInline className="aspect-[9/16] w-full object-cover" />
            ) : (
              <div className="flex aspect-[9/16] items-center justify-center text-xs text-muted-foreground">
                No source video
              </div>
            )}
          </div>
          <div className="space-y-3">
            {asset ? (
              <div className="text-sm">
                <p className="font-medium">{asset.filename}</p>
                <p className="text-xs text-muted-foreground">
                  Duration {fmtDuration(asset.duration)} · output {OUT_W}×{OUT_H} · {CLIP_SECONDS}s per variant
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Upload a clip to get started.</p>
            )}
            {(assets ?? []).length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Use another upload</Label>
                <Select value={asset?.id ?? ""} onValueChange={setAssetId}>
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder="Pick a clip" />
                  </SelectTrigger>
                  <SelectContent>
                    {(assets ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.filename}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2. Hook library */}
      <section className="panel p-5">
        <h2 className="text-sm font-semibold">2. Hook library</h2>
        <p className="text-xs text-muted-foreground">
          Save your winning openings, then select exactly {VARIANTS} for this batch.
        </p>

        <div className="mt-5 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hook-text" className="text-xs">
                Hook text
              </Label>
              <Textarea
                id="hook-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="I tried this for 30 days and…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Content style</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOOK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hook-notes" className="text-xs">
                Notes (optional)
              </Label>
              <Input
                id="hook-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Where it worked, why it hit…"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="flex items-center gap-2 text-xs">
                <Trophy className="size-3.5 text-primary" /> Winner
              </span>
              <Switch checked={winner} onCheckedChange={setWinner} />
            </div>
            <Button onClick={() => void saveHook()} disabled={savingHook} className="w-full">
              {savingHook ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save hook
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {selected.length}/{VARIANTS} selected
              </p>
            </div>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {(hooks ?? []).length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No hooks yet — save your first one.
                </p>
              ) : (
                (hooks ?? []).map((h) => (
                  <label
                    key={h.id}
                    className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface-raised/50"
                  >
                    <Checkbox
                      checked={selected.includes(h.id)}
                      onCheckedChange={() => toggleHook(h.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{h.text}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {h.category}
                        {h.is_winner ? " · Winner" : ""}
                        {h.notes ? ` · ${h.notes}` : ""}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Batch */}
      <section className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">3. Create the batch</h2>
          <p className="text-xs text-muted-foreground">
            Each variant trims a different {CLIP_SECONDS}s section and burns in one hook.
          </p>
        </div>
        <Button
          onClick={() => void createVariants()}
          disabled={rendering || selected.length !== VARIANTS || !asset}
        >
          {rendering ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          Create {VARIANTS} Variants
        </Button>
      </section>

      {/* 4. Results */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">4. Results</h2>
        {results.length === 0 ? (
          <EmptyState
            icon={Film}
            title="No variants yet"
            description={`Upload a clip, select ${VARIANTS} hooks and run the batch.`}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((b, i) => (
              <div key={b.jobId} className="panel space-y-3 p-4">
                <div className="overflow-hidden rounded-lg border border-border bg-black">
                  {b.url ? (
                    <video src={b.url} controls playsInline className="aspect-[9/16] w-full" />
                  ) : (
                    <div className="flex aspect-[9/16] items-center justify-center text-xs text-muted-foreground">
                      {b.status === "failed" ? "Render failed" : `Rendering variant ${i + 1}…`}
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 text-sm font-medium">{b.hookText}</p>
                <div className="flex items-center justify-between gap-2">
                  <StatusPill status={b.status} />
                  {b.url ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void downloadVariant(b.url!, b.filename ?? `variant-${i + 1}.webm`)}
                    >
                      <Download className="size-3.5" />
                      Download
                    </Button>
                  ) : null}
                </div>

                {b.status !== "completed" && b.status !== "failed" ? (
                  <Progress value={b.progress} className="h-1.5" />
                ) : null}
                {b.error ? <p className="text-[11px] text-destructive">{b.error}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function downloadVariant(url: string, filename: string) {
  try {
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
  } catch (e) {
    toast.error((e as Error).message);
  }
}


async function ensureStudioProject(userId: string) {
  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("name", "Studio")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data } = await supabase
    .from("projects")
    .insert({ user_id: userId, name: "Studio", platform: "both", content_style: "ugc" })
    .select("id")
    .single();
  return data?.id ?? null;
}

function probeVideo(file: File) {
  return new Promise<{ duration: number; width: number; height: number }>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const meta = {
        duration: Number.isFinite(video.duration) ? Math.round(video.duration * 100) / 100 : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ duration: 0, width: 0, height: 0 });
    };
    video.src = url;
  });
}
