import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Play, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createBatchFn, processQueueFn } from "@/lib/render.functions";
import { MediaLibraryPanel } from "@/components/MediaLibraryPanel";
import { HookLibraryPanel } from "@/components/HookLibraryPanel";
import { EmptyState, PageHeader, StatCard, StatusPill } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate, audienceSummary } from "@/lib/db";
import { platformLabel, styleLabel } from "@/lib/constants";

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
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const createBatch = useServerFn(createBatchFn);
  const processQueue = useServerFn(processQueueFn);

  const { data, isLoading } = useQuery({
    queryKey: ["project", projectId],
    refetchInterval: 8000,
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
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
        supabase.from("hooks").select("id").eq("project_id", projectId),
        supabase.from("media_assets").select("id").eq("project_id", projectId),
      ]);
      return {
        project: project.data,
        product: product.data,
        jobs: jobs.data ?? [],
        videos: videos.data ?? [],
        hookCount: (hooks.data ?? []).length,
        mediaCount: (media.data ?? []).length,
      };
    },
  });

  const batch = useMutation({
    mutationFn: async () => {
      const [hooks, media] = await Promise.all([
        supabase.from("hooks").select("id").eq("project_id", projectId).limit(20),
        supabase.from("media_assets").select("id").eq("project_id", projectId).limit(20),
      ]);
      if (!hooks.data?.length) throw new Error("Add at least one hook to this project first.");
      if (!media.data?.length) throw new Error("Upload at least one clip to this project first.");
      return createBatch({
        data: {
          projectId,
          hookIds: hooks.data.map((h) => h.id),
          mediaAssetIds: media.data.map((m) => m.id),
          duration: 8,
          overlayPosition: "top",
          fontSize: 64,
          backgroundColor: "#FFFFFF",
          textColor: "#000000",
        },
      });
    },
    onSuccess: async (res) => {
      toast.success(`Queued ${res.jobs} render jobs`);
      setRunning(true);
      try {
        await processQueue({ data: { projectId, limit: 10 } });
      } finally {
        setRunning(false);
        qc.invalidateQueries({ queryKey: ["project", projectId] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
          <Button onClick={() => batch.mutate()} disabled={batch.isPending || running}>
            {batch.isPending || running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Generate batch
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Hooks" value={data?.hookCount ?? 0} icon={Sparkles} accent />
        <StatCard label="Clips" value={data?.mediaCount ?? 0} icon={Play} />
        <StatCard label="Videos" value={data?.videos.length ?? 0} icon={Trophy} />
        <StatCard
          label="Queue"
          value={(data?.jobs ?? []).filter((j) => j.status === "queued" || j.status === "processing").length}
          icon={Loader2}
        />
      </div>

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
              <p className="px-5 py-8 text-center text-xs text-muted-foreground">
                No render jobs yet.
              </p>
            ) : (
              data?.jobs.map((j) => (
                <div key={j.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{j.id.slice(0, 8)}</span>
                    <StatusPill status={j.status} />
                  </div>
                  <Progress value={j.progress} className="mt-3 h-1.5" />
                </div>
              ))
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data?.videos.map((v) => (
              <div key={v.id} className="panel p-4">
                <p className="line-clamp-2 text-sm font-medium">{v.hook_text ?? "Untitled"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtDate(v.created_at)}
                  {v.is_winner ? " · Winner" : ""}
                </p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
