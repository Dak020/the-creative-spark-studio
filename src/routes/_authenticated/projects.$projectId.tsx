import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Play, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaLibraryPanel } from "@/components/MediaLibraryPanel";
import { HookLibraryPanel } from "@/components/HookLibraryPanel";
import { EmptyState, PageHeader, StatCard, StatusPill } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDate, audienceSummary, signedUrl } from "@/lib/db";
import { downloadRender, renderFilename, resolveRenderUrl } from "@/lib/render/output";
import {
  CLIP_SECONDS,
  STAGE_LABEL,
  reapStaleJobs,
  runBatch,
  type BatchItem,
} from "@/lib/render/pipeline";
import { deleteRender } from "@/lib/render/delete";
import { DeleteRenderButton } from "@/components/DeleteRenderButton";
import { RenderPlayer } from "@/components/RenderPlayer";
import { platformLabel, styleLabel } from "@/lib/constants";

const QUANTITY_PRESETS = [1, 5, 10, 20, 30] as const;
const MAX_QUANTITY = 30;


export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project workspace — Creative Factory" },
      { name: "description", content: "Media, hooks, batch generation and render queue for this project." },
      { property: "og:title", content: "Project workspace — Creative Factory" },
      { property: "og:description", content: "Produce short-form video batches from hooks and clips." },
    ],
  }),
  component: ProjectWorkspace,
});

function ProjectWorkspace() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [quantityChoice, setQuantityChoice] = useState("5");
  const [customQuantity, setCustomQuantity] = useState("8");
  const [live, setLive] = useState<BatchItem[]>([]);

  const quantity = useMemo(() => {
    if (quantityChoice !== "custom") return Number(quantityChoice);
    const n = Math.round(Number(customQuantity));
    if (!Number.isFinite(n)) return 1;
    return Math.min(MAX_QUANTITY, Math.max(1, n));
  }, [quantityChoice, customQuantity]);

  // Abandoned jobs (closed tab, crashed render) must not sit in the queue forever.
  useEffect(() => {
    if (!user) return;
    void reapStaleJobs(user.id, projectId).then(() =>
      qc.invalidateQueries({ queryKey: ["project", projectId] }),
    );
  }, [user?.id, projectId, qc]);

  const { data, isLoading } = useQuery({
    // Scoped to the signed-in user so a different account never reads this cache.
    queryKey: ["project", projectId, user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 15_000,
    queryFn: async () => {
      const [project, product, jobs, videos, hooks, media] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
        supabase.from("products").select("*").eq("project_id", projectId).maybeSingle(),
        supabase
          .from("render_jobs")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("generated_videos")
          .select("*, media_assets(filename)")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
        supabase.from("hooks").select("id, text").eq("project_id", projectId),
        supabase
          .from("media_assets")
          .select("id, filename, duration, storage_path, hook_placement")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ]);
      const videoRows = await Promise.all(
        (videos.data ?? []).map(async (v) => ({
          ...v,
          playbackUrl: await resolveRenderUrl(v.output_url),
          posterUrl: await resolveRenderUrl(v.thumbnail_url),
        })),
      );
      return {
        project: project.data,
        product: product.data,
        jobs: jobs.data ?? [],
        videos: videoRows,
        hooks: hooks.data ?? [],
        media: media.data ?? [],
      };
    },
    // Only poll while something is actually in flight.
    refetchInterval: (q) => {
      if (running) return false;
      const active = (q.state.data?.jobs ?? []).some(
        (j: { status: string }) => j.status === "queued" || j.status === "processing",
      );
      return active ? 8000 : false;
    },
  });

  async function generateBatch() {
    if (!user) return;
    const hooks = data?.hooks ?? [];
    const asset = (data?.media ?? [])[0];
    if (hooks.length === 0) {
      toast.error("Add at least one hook to this project first.");
      return;
    }
    if (!asset) {
      toast.error("Upload at least one clip to this project first.");
      return;
    }
    const url = await signedUrl("media", asset.storage_path, 60 * 60 * 6);
    if (!url) {
      toast.error("The source clip could not be read from storage.");
      return;
    }
    const count = quantity;
    setRunning(true);
    setLive([]);
    try {
      const items = await runBatch({
        userId: user.id,
        projectId,
        asset,
        assetUrl: url,
        hooks: hooks.map((h) => ({ id: h.id, text: h.text })),
        quantity: count,
        onUpdate: setLive,
      });
      const done = items.filter((i) => i.stage === "completed").length;
      if (done === items.length) toast.success(`${done} of ${count} variants rendered`);
      else toast.warning(`${done} of ${count} variants rendered — check the failed jobs`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const project = data?.project;
  if (!project) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Project not found"
        description="It may have been deleted."
        action={
          <Button asChild>
            <Link to="/projects">Back to projects</Link>
          </Button>
        }
      />
    );
  }

  const requested = live.length;
  const completed = live.filter((l) => l.stage === "completed").length;
  const failed = live.filter((l) => l.stage === "failed");

  return (
    <div className="space-y-8">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All projects
      </Link>

      <PageHeader
        title={project.name}
        description={`${platformLabel(project.platform)} · ${styleLabel(project.content_style)} · ${audienceSummary(project)}`}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Batch quantity</Label>
              <Select value={quantityChoice} onValueChange={setQuantityChoice}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUANTITY_PRESETS.map((q) => (
                    <SelectItem key={q} value={String(q)}>
                      {q} variant{q === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {quantityChoice === "custom" ? (
              <div className="space-y-1.5">
                <Label htmlFor="project-custom-qty" className="text-xs">
                  How many? (1–{MAX_QUANTITY})
                </Label>
                <Input
                  id="project-custom-qty"
                  type="number"
                  min={1}
                  max={MAX_QUANTITY}
                  value={customQuantity}
                  onChange={(e) => setCustomQuantity(e.target.value)}
                  className="w-28"
                />
              </div>
            ) : null}
            <Button onClick={() => void generateBatch()} disabled={running}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Render {quantity} variant{quantity === 1 ? "" : "s"}
            </Button>
          </div>
        }

      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Hooks" value={(data?.hooks ?? []).length} icon={Sparkles} accent />
        <StatCard label="Clips" value={(data?.media ?? []).length} icon={Play} />
        <StatCard
          label="Videos"
          value={(data?.videos ?? []).filter((v) => v.playbackUrl).length}
          icon={Trophy}
        />
        <StatCard
          label="Queue"
          value={(data?.jobs ?? []).filter((j) => j.status === "queued" || j.status === "processing").length}
          icon={Loader2}
        />
      </div>

      {requested > 0 ? (
        <div className="panel px-5 py-4 text-xs">
          <p className="font-medium">
            {completed} completed / {requested} requested
          </p>
          {failed.length > 0 ? (
            <p className="mt-1 text-destructive">
              Failed jobs: {failed.map((f) => `${f.jobId.slice(0, 8)} (${f.error ?? "unknown"})`).join(" · ")}
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            {live
              .filter((l) => l.stage !== "completed" && l.stage !== "failed")
              .map((l) => (
                <div key={l.jobId} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="line-clamp-1 text-muted-foreground">{l.hookText}</span>
                    <StatusPill status={STAGE_LABEL[l.stage]} />
                  </div>
                  <Progress value={l.progress} className="h-1.5" />
                </div>
              ))}
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="hooks">
        <TabsList>
          <TabsTrigger value="hooks">Hooks</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="renders">Renders</TabsTrigger>
        </TabsList>

        <TabsContent value="hooks" className="pt-6">
          <HookLibraryPanel
            projectId={projectId}
            generatorContext={{
              product: data?.product?.name ?? project.name,
              productUrl: data?.product?.url ?? null,
              audience: audienceSummary(project),
              platform: project.platform,
              contentStyle: project.content_style,
            }}
          />
        </TabsContent>

        <TabsContent value="media" className="pt-6">
          <MediaLibraryPanel projectId={projectId} />
        </TabsContent>

        <TabsContent value="renders" className="space-y-6 pt-6">
          <div className="panel divide-y divide-border overflow-hidden">
            {(data?.jobs.length ?? 0) === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-muted-foreground">No render jobs yet.</p>
            ) : (
              data?.jobs.map((j) => (
                <div key={j.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{j.id.slice(0, 8)}</span>
                    <StatusPill status={j.status} />
                  </div>
                  <Progress value={j.progress} className="mt-3 h-1.5" />
                  {j.error_message ? (
                    <p className="mt-2 text-[11px] text-destructive">{j.error_message}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data?.videos.map((v) => (
              <div key={v.id} className="panel space-y-3 p-4">
                <div className="overflow-hidden rounded-lg border border-border bg-black">
                  {v.playbackUrl ? (
                    <RenderPlayer src={v.playbackUrl} poster={v.posterUrl} />
                  ) : (
                    <div className="flex aspect-[9/16] items-center justify-center px-4 text-center text-xs text-muted-foreground">
                      Output file missing — re-run this render.
                    </div>
                  )}
                </div>

                <p className="line-clamp-2 text-sm font-medium">{v.hook_text ?? "Untitled"}</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {(v.media_assets as { filename?: string } | null)?.filename ?? "Source clip"} ·{" "}
                  {Math.round(Number(v.duration ?? CLIP_SECONDS))}s · {fmtDate(v.created_at)}
                  {v.is_winner ? " · Winner" : ""}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <StatusPill status={v.playbackUrl ? "completed" : "failed"} />
                  <div className="flex items-center gap-2">
                    {v.playbackUrl ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void downloadRender(
                            v.playbackUrl!,
                            renderFilename(v.output_url, `hook-variant-${v.id.slice(0, 6)}`),
                          ).catch((e) => toast.error((e as Error).message))
                        }
                      >
                        <Download className="size-3.5" />
                        Download
                      </Button>
                    ) : null}
                    <DeleteRenderButton
                      onConfirm={async () => {
                        try {
                          await deleteRender(v);
                          await qc.invalidateQueries({ queryKey: ["project", projectId] });
                          await qc.invalidateQueries({ queryKey: ["studio-results"] });
                          toast.success("Render deleted");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
