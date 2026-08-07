import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Film, Loader2, Search, Trash2, Upload, Play, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MEDIA_CATEGORIES } from "@/lib/constants";
import { fmtDuration, fmtDate } from "@/lib/db";
import { EmptyState } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MediaAsset = {
  id: string;
  project_id: string | null;
  storage_path: string;
  thumbnail_url: string | null;
  filename: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  category: string;
  tags: string[];
  created_at: string;
};

async function probeVideo(file: File) {
  return new Promise<{ duration: number; width: number; height: number; thumb: Blob | null }>(
    (resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.src = url;
      const fail = () => {
        URL.revokeObjectURL(url);
        resolve({ duration: 0, width: 0, height: 0, thumb: null });
      };
      video.onerror = fail;
      video.onloadedmetadata = () => {
        const meta = {
          duration: video.duration || 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        };
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
        video.onseeked = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = Math.min(540, meta.width || 540);
            canvas.height = Math.round((canvas.width / (meta.width || 1)) * (meta.height || 1)) || 960;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
              (blob) => {
                URL.revokeObjectURL(url);
                resolve({ ...meta, thumb: blob });
              },
              "image/jpeg",
              0.72,
            );
          } catch {
            URL.revokeObjectURL(url);
            resolve({ ...meta, thumb: null });
          }
        };
      };
    },
  );
}

export function MediaLibraryPanel({ projectId }: { projectId?: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ asset: MediaAsset; url: string } | null>(null);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [editCategory, setEditCategory] = useState("Other");
  const [editTags, setEditTags] = useState("");

  const { data: assets, isLoading } = useQuery({
    queryKey: ["media", projectId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("media_assets").select("*").order("created_at", { ascending: false });
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MediaAsset[];
    },
  });

  const filtered = useMemo(() => {
    const list = assets ?? [];
    return list.filter((a) => {
      const matchesCategory = category === "all" || a.category === category;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q || a.filename.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    });
  }, [assets, category, query]);

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");

      for (const file of Array.from(files)) {
        if (!/\.(mp4|mov|m4v)$/i.test(file.name)) {
          toast.error(`${file.name}: only MP4 and MOV files are supported`);
          continue;
        }
        if (file.size > 300 * 1024 * 1024) {
          toast.error(`${file.name}: file is larger than 300MB`);
          continue;
        }

        const meta = await probeVideo(file);
        const id = crypto.randomUUID();
        const ext = file.name.split(".").pop() ?? "mp4";
        const path = `${userId}/${id}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("media")
          .upload(path, file, { contentType: file.type || "video/mp4" });
        if (upErr) throw upErr;

        let thumbnailUrl: string | null = null;
        if (meta.thumb) {
          const thumbPath = `${userId}/${id}-thumb.jpg`;
          const { error: thumbErr } = await supabase.storage
            .from("media")
            .upload(thumbPath, meta.thumb, { contentType: "image/jpeg" });
          if (!thumbErr) {
            const { data: signed } = await supabase.storage
              .from("media")
              .createSignedUrl(thumbPath, 60 * 60 * 24 * 365);
            thumbnailUrl = signed?.signedUrl ?? null;
          }
        }

        const { error: insErr } = await supabase.from("media_assets").insert({
          user_id: userId,
          project_id: projectId ?? null,
          storage_path: path,
          thumbnail_url: thumbnailUrl,
          filename: file.name,
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          size_bytes: file.size,
          category: "Other",
          tags: [],
        });
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast.success("Upload complete");
      qc.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
    onSettled: () => setUploading(false),
  });

  const remove = useMutation({
    mutationFn: async (asset: MediaAsset) => {
      await supabase.storage.from("media").remove([asset.storage_path]);
      const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Clip deleted");
      qc.invalidateQueries({ queryKey: ["media"] });
    },
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("media_assets")
        .update({
          category: editCategory,
          tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
        })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Clip updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["media"] });
    },
  });

  async function openPreview(asset: MediaAsset) {
    const { data } = await supabase.storage.from("media").createSignedUrl(asset.storage_path, 3600);
    if (!data?.signedUrl) {
      toast.error("Could not load clip");
      return;
    }
    setPreview({ asset, url: data.signedUrl });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search filenames and tags"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {MEDIA_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              setUploading(true);
              upload.mutate(e.target.files);
            }
            e.target.value = "";
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Upload clips
        </Button>
      </div>

      {isLoading ? (
        <div className="panel flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Film}
          title={assets?.length ? "No clips match your filters" : "Your media library is empty"}
          description={
            assets?.length
              ? "Try a different category or clear the search."
              : "Upload MP4 or MOV clips. We read duration and dimensions and grab a thumbnail automatically."
          }
          action={
            <Button onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" />
              Upload clips
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((asset) => (
            <div key={asset.id} className="panel group overflow-hidden">
              <button
                type="button"
                onClick={() => openPreview(asset)}
                className="relative flex aspect-[9/16] w-full items-center justify-center overflow-hidden bg-surface-raised"
              >
                {asset.thumbnail_url ? (
                  <img
                    src={asset.thumbnail_url}
                    alt={`Preview frame of ${asset.filename}`}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Film className="size-8 text-muted-foreground" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="size-8 text-primary" />
                </span>
                <span className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px]">
                  {fmtDuration(asset.duration)}
                </span>
              </button>

              <div className="space-y-2 p-3">
                <p className="truncate text-xs font-medium" title={asset.filename}>
                  {asset.filename}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {asset.category}
                  </Badge>
                  {asset.tags.slice(0, 2).map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {asset.width}×{asset.height} · {fmtDate(asset.created_at)}
                </p>
                <div className="flex gap-1 pt-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={() => {
                      setEditing(asset);
                      setEditCategory(asset.category);
                      setEditTags(asset.tags.join(", "));
                    }}
                  >
                    <Tag className="size-3" />
                    Tag
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => remove.mutate(asset)}
                    aria-label={`Delete ${asset.filename}`}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.asset.filename}</DialogTitle>
          </DialogHeader>
          {preview ? (
            <video
              src={preview.url}
              controls
              playsInline
              className="max-h-[60vh] w-full rounded-lg bg-black"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Categorize clip</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDIA_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                value={editTags}
                maxLength={300}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="kitchen, morning, b-roll"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
