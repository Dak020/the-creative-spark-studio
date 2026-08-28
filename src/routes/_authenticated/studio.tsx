import { useEffect, useMemo, useRef, useState } from "react";
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
  runMultiClipBatch,
  type BatchItem,
} from "@/lib/render/pipeline";
import { Checkbox } from "@/components/ui/checkbox";
import { checkRoles } from "@/lib/dna/solver";
import {
  planDna,
  runDnaVariant,
  runDnaBatch,
  describePlan,
  type DnaClip,
  type DnaPlan,
} from "@/lib/render/dna-pipeline";

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
  const batchAbortRef = useRef<AbortController | null>(null);
  const dnaAbortRef = useRef<AbortController | null>(null);
  const [quantityChoice, setQuantityChoice] = useState("5");
  const [customQuantity, setCustomQuantity] = useState("8");
  const [live, setLive] = useState<BatchItem[]>([]);
  // Same multi-clip rule as Studio: with 2+ clips selected, one batch is split
  // evenly across them (remainder randomly assigned). Defaults to every clip
  // in the project's media library.
  const [selectedClipIds, setSelectedClipIds] = useState<string[] | null>(null);

  // Clip DNA: combine role-tagged clips into one edit instead of a single
  // clip + hook. Separate running/progress state from the existing
  // single-clip flow above, since a DNA render and a regular render are
  // different pipelines that can't run at the same time from this page.
  const [targetDuration, setTargetDuration] = useState("8");
  const [originalSound, setOriginalSound] = useState(false);
  const [dnaRunning, setDnaRunning] = useState(false);
  const [dnaLive, setDnaLive] = useState<BatchItem[]>([]);
  const [dnaPreview, setDnaPreview] = useState<{
    item: BatchItem;
    plan: DnaPlan;
    clips: DnaClip[];
  } | null>(null);


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
          .select("id, filename, duration, storage_path, hook_placement, dna_role, allowed_speeds")
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


  const mediaList = useMemo(() => data?.media ?? [], [data?.media]);
  const activeClipIds = useMemo(
    () =>
      (selectedClipIds ?? mediaList.map((m) => m.id)).filter((id) =>
        mediaList.some((m) => m.id === id),
      ),
    [selectedClipIds, mediaList],
  );

  // Only clips actually tagged with a DNA role participate — untagged clips
  // in this same project are invisible to DNA and keep working with the
  // regular single/multi-clip flow above.
  const dnaClips = useMemo(
    () =>
      mediaList
        .filter((m) => m.dna_role === "start" || m.dna_role === "middle" || m.dna_role === "end")
        .map((m) => ({
          id: m.id,
          role: m.dna_role as "start" | "middle" | "end",
          duration: Number(m.duration ?? 0),
          allowedSpeeds:
            Array.isArray(m.allowed_speeds) && m.allowed_speeds.length > 0
              ? m.allowed_speeds.map(Number)
              : [1.0, 1.5, 1.7, 2.0],
          hookPlacement: m.hook_placement,
          filename: m.filename,
          storage_path: m.storage_path,
        })),
    [mediaList],
  );
  const dnaRoles = useMemo(() => checkRoles(dnaClips), [dnaClips]);

  function toggleClip(id: string) {
    setSelectedClipIds((prev) => {
      const base = prev ?? mediaList.map((m) => m.id);
      return base.includes(id) ? base.filter((c) => c !== id) : [...base, id];
    });
  }

  async function generateBatch() {
    if (!user) return;
    const hooks = data?.hooks ?? [];
    if (hooks.length === 0) {
      toast.error("Add at least one hook to this project first.");
      return;
    }
    const chosenAssets = activeClipIds
      .map((id) => mediaList.find((m) => m.id === id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a));
    if (chosenAssets.length === 0) {
      toast.error("Select at least one clip from this project's media library.");
      return;
    }
    const count = quantity;
    const hookList = hooks.map((h) => ({ id: h.id, text: h.text }));
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setRunning(true);
    setLive([]);
    try {
      let items: BatchItem[];
      if (chosenAssets.length > 1) {
        const withUrls = await Promise.all(
          chosenAssets.map(async (a) => {
            const url = await signedUrl("media", a.storage_path, 60 * 60 * 6);
            return url ? { ...a, url } : null;
          }),
        );
        const ready = withUrls.filter((a): a is NonNullable<typeof a> => Boolean(a));
        if (ready.length === 0) {
          toast.error("The selected clips could not be read from storage.");
          return;
        }
        items = await runMultiClipBatch({
          userId: user.id,
          projectId,
          assets: ready.map((a) => ({
            id: a.id,
            filename: a.filename,
            duration: a.duration,
            storage_path: a.storage_path,
            hook_placement: a.hook_placement,
            url: a.url,
          })),
          hooks: hookList,
          quantity: count,
          signal: controller.signal,
          onUpdate: setLive,
        });
      } else {
        const asset = chosenAssets[0]!;
        const url = await signedUrl("media", asset.storage_path, 60 * 60 * 6);
        if (!url) {
          toast.error("The source clip could not be read from storage.");
          return;
        }
        items = await runBatch({
          userId: user.id,
          projectId,
          asset,
          assetUrl: url,
          hooks: hookList,
          quantity: count,
          signal: controller.signal,
          onUpdate: setLive,
        });
      }
      const done = items.filter((i) => i.stage === "completed").length;
      const cancelled = items.some((i) => i.error === "Cancelled");
      const across = chosenAssets.length > 1 ? ` across ${chosenAssets.length} clips` : "";
      if (cancelled) toast.info(`Cancelled — ${done} of ${count} variants had already finished${across}`);
      else if (done === items.length) toast.success(`${done} of ${count} variants rendered${across}`);
      else toast.warning(`${done} of ${count} variants rendered — check the failed jobs`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      batchAbortRef.current = null;
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }

  function cancelBatch() {
    batchAbortRef.current?.abort();
  }



  /** Sign a playable URL for every DNA-tagged clip. Returns null (with a
   *  toast) if any clip's file can't be read from storage. */
  async function resolveDnaClips(): Promise<DnaClip[] | null> {
    const withUrls = await Promise.all(
      dnaClips.map(async (c): Promise<DnaClip | null> => {
        const url = await signedUrl("media", c.storage_path, 60 * 60 * 6);
        return url ? { ...c, url } : null;
      }),
    );
    const ready = withUrls.filter((c): c is DnaClip => Boolean(c));
    if (ready.length !== dnaClips.length) {
      toast.error("One or more DNA-tagged clips could not be read from storage.");
      return null;
    }
    return ready;
  }

  async function runDnaPreview() {
    if (!user) return;
    if (!dnaRoles.ok) {
      toast.error(dnaRoles.reason);
      return;
    }
    const hooks = data?.hooks ?? [];
    if (hooks.length === 0) {
      toast.error("Add at least one hook to this project first.");
      return;
    }
    const target = Number(targetDuration);
    if (!Number.isFinite(target) || target <= 0) {
      toast.error("Enter a valid target duration.");
      return;
    }

    const controller = new AbortController();
    dnaAbortRef.current = controller;
    setDnaRunning(true);
    setDnaLive([]);
    setDnaPreview(null);
    try {
      const clips = await resolveDnaClips();
      if (!clips) return;

      const planned = planDna(clips, target);
      if (!planned.ok) {
        toast.error(planned.reason);
        return;
      }

      const hookList = hooks.map((h) => ({ id: h.id, text: h.text }));
      const hook = hookList[Math.floor(Math.random() * hookList.length)]!;

      const item = await runDnaVariant({
        userId: user.id,
        projectId,
        plan: planned.plan,
        hook,
        withAudio: originalSound,
        signal: controller.signal,
        onUpdate: (updated) => setDnaLive([updated]),
      });

      if (item.error === "Cancelled") {
        toast.info("Preview render cancelled.");
        return;
      }
      if (item.stage !== "completed") {
        toast.error(item.error ?? "The preview render failed.");
        return;
      }
      setDnaPreview({ item, plan: planned.plan, clips });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDnaRunning(false);
      dnaAbortRef.current = null;
    }
  }

  async function approveDna() {
    if (!user || !dnaPreview) return;
    const hooks = data?.hooks ?? [];
    if (hooks.length === 0) {
      toast.error("Add at least one hook to this project first.");
      return;
    }
    const remaining = Math.max(0, quantity - 1);
    if (remaining === 0) {
      toast.success("Preview approved — that's the full batch.");
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
      return;
    }

    const target = Number(targetDuration);
    const controller = new AbortController();
    dnaAbortRef.current = controller;
    setDnaRunning(true);
    setDnaLive([dnaPreview.item]);
    try {
      const hookList = hooks.map((h) => ({ id: h.id, text: h.text }));
      const items = await runDnaBatch({
        userId: user.id,
        projectId,
        clips: dnaPreview.clips,
        hooks: hookList,
        targetDuration: target,
        quantity: remaining,
        withAudio: originalSound,
        signal: controller.signal,
        onUpdate: (updated) => setDnaLive([dnaPreview.item, ...updated]),
      });
      const done = items.filter((i) => i.stage === "completed").length;
      const cancelled = items.some((i) => i.error === "Cancelled");
      if (cancelled) toast.info(`Cancelled — ${done + 1} of ${quantity} DNA variants had already finished`);
      else if (done === items.length) toast.success(`${done + 1} of ${quantity} DNA variants rendered`);
      else toast.warning(`${done + 1} of ${quantity} DNA variants rendered — check the failed jobs`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDnaRunning(false);
      dnaAbortRef.current = null;
      setDnaPreview(null);
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
    }
  }

  function cancelDna() {
    dnaAbortRef.current?.abort();
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
            {running ? (
              <Button variant="outline" onClick={cancelBatch}>
                Cancel
              </Button>
            ) : null}
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

      {mediaList.length > 0 ? (
        <div className="panel space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Clips used in this batch</p>
              <p className="text-xs text-muted-foreground">
                {activeClipIds.length > 1
                  ? `The ${quantity} variants split evenly across ${activeClipIds.length} clips — any remainder goes to a random pick, and each clip keeps its own hook placement.`
                  : "Pick 2 or more clips to spread the batch across them."}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelectedClipIds(
                  activeClipIds.length === mediaList.length ? [] : mediaList.map((m) => m.id),
                )
              }
            >
              {activeClipIds.length === mediaList.length ? "Clear all" : "Select all"}
            </Button>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {mediaList.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={activeClipIds.includes(m.id)}
                  onCheckedChange={() => toggleClip(m.id)}
                />
                <span className="line-clamp-1">{m.filename}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {Math.round(Number(m.duration ?? 0))}s
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="panel space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Clip DNA</p>
            <p className="text-xs text-muted-foreground">
              Combine Start / Middle / End tagged clips into one edit. Tag clips and set their
              allowed speeds in the Media tab. The hook is burned onto the opening segment only.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={originalSound}
              onCheckedChange={(v) => setOriginalSound(Boolean(v))}
            />
            Original sound
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="dna-duration" className="text-xs">
              Target duration (s)
            </Label>
            <Input
              id="dna-duration"
              type="number"
              min={1}
              max={60}
              step={0.5}
              value={targetDuration}
              onChange={(e) => setTargetDuration(e.target.value)}
              className="w-24"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => void runDnaPreview()}
            disabled={dnaRunning || !dnaRoles.ok}
          >
            {dnaRunning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {dnaPreview ? "Try a different combination" : "Preview one DNA render"}
          </Button>
          {dnaRunning ? (
            <Button variant="outline" onClick={cancelDna}>
              Cancel
            </Button>
          ) : null}
        </div>

        {!dnaRoles.ok ? (
          <p className="text-xs text-destructive">{dnaRoles.reason}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Combination: {dnaRoles.sequence.join(" + ")}
          </p>
        )}

        {dnaLive.length > 0 && dnaRunning ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="line-clamp-1 text-muted-foreground">{dnaLive[0]!.hookText}</span>
              <StatusPill status={STAGE_LABEL[dnaLive[0]!.stage]} />
            </div>
            <Progress value={dnaLive[0]!.progress} className="h-1.5" />
          </div>
        ) : null}

        {dnaPreview ? (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div className="overflow-hidden rounded-lg border border-border bg-black">
                {dnaPreview.item.url ? (
                  <RenderPlayer src={dnaPreview.item.url} />
                ) : (
                  <div className="flex aspect-[9/16] items-center justify-center text-xs text-muted-foreground">
                    No preview file
                  </div>
                )}
              </div>
              <div className="space-y-2 text-xs">
                <p className="font-medium">
                  {dnaPreview.plan.finalDuration.toFixed(2)}s total · hook on the{" "}
                  {dnaPreview.plan.segments[0]!.role} segment ({dnaPreview.plan.placement})
                </p>
                {describePlan(dnaPreview.plan).map((s, i) => (
                  <p key={i} className="text-muted-foreground">
                    {i + 1}. <span className="uppercase">{s.role}</span> · {s.filename} · {s.cut} ·{" "}
                    {s.speed} · {s.outputDuration}
                  </p>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void approveDna()} disabled={dnaRunning}>
                {dnaRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Approve this style — render {Math.max(0, quantity - 1)} more
              </Button>
              <Button variant="ghost" onClick={() => setDnaPreview(null)} disabled={dnaRunning}>
                Discard preview
              </Button>
            </div>
          </div>
        ) : null}
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
}import { DeleteRenderButton } from "@/components/DeleteRenderButton";
import { RenderPlayer } from "@/components/RenderPlayer";
import { downloadRender, renderFilename, resolveRenderUrl } from "@/lib/render/output";


const QUANTITY_PRESETS = [1, 5, 10, 20, 30] as const;
const MAX_HOOKS = 10;
const MAX_QUANTITY = 30;

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "Studio — Creative Factory" },
      {
        name: "description",
        content:
          "Upload one clip, pick your winning hooks, choose a batch size and render vertical videos with the hook burned in.",
      },
      { property: "og:title", content: "Studio — Creative Factory" },
      {
        property: "og:description",
        content: "The complete upload, hook selection, batch render, download and cleanup workflow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioPage,
});

type ResultCard = BatchItem & { videoId: string | null };

function StudioPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [live, setLive] = useState<BatchItem[]>([]);
  const [rendering, setRendering] = useState(false);
  const [requested, setRequested] = useState(0);

  const [quantityChoice, setQuantityChoice] = useState<string>("5");
  const [customQuantity, setCustomQuantity] = useState("8");

  const [text, setText] = useState("");
  const [category, setCategory] = useState<string>(HOOK_CATEGORIES[0]);
  const [notes, setNotes] = useState("");
  const [winner, setWinner] = useState(true);
  const [savingHook, setSavingHook] = useState(false);

  const quantity = useMemo(() => {
    if (quantityChoice !== "custom") return Number(quantityChoice);
    const n = Math.round(Number(customQuantity));
    if (!Number.isFinite(n)) return 1;
    return Math.min(MAX_QUANTITY, Math.max(1, n));
  }, [quantityChoice, customQuantity]);

  // Jobs abandoned by a closed tab must not linger as "in progress" after a refresh.
  useEffect(() => {
    if (!user) return;
    void reapStaleJobs(user.id).then(() =>
      qc.invalidateQueries({ queryKey: ["studio-results"] }),
    );
  }, [user?.id, qc]);



  // Studio can scope itself to a specific project's own media and hooks —
  // pick one from this selector, same idea as the Project page already
  // uses. With nothing selected, Studio keeps its original behavior: the
  // single hidden "Studio" catch-all project used for quick, unsorted work.
  const [scopeProjectId, setScopeProjectId] = useState<string | null>(null);

  const { data: userProjects } = useQuery({
    queryKey: ["studio-projects", user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .neq("name", "Studio")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: defaultStudioProjectId } = useQuery({
    queryKey: ["studio-default-project", user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 60_000,
    queryFn: async () => (user ? ensureStudioProject(user.id) : null),
  });

  const effectiveProjectId = scopeProjectId ?? defaultStudioProjectId ?? null;

  const { data: assets } = useQuery({
    queryKey: ["studio-assets", user?.id ?? "anon", effectiveProjectId],
    enabled: Boolean(user) && Boolean(effectiveProjectId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("media_assets")
        .select("id, filename, storage_path, duration, hook_placement, created_at, project_id")
        .eq("project_id", effectiveProjectId as string)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const { data: hooks } = useQuery({
    queryKey: ["studio-hooks", user?.id ?? "anon", effectiveProjectId],
    enabled: Boolean(user) && Boolean(effectiveProjectId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("hooks")
        .select("id, text, category, notes, is_winner, created_at")
        .eq("project_id", effectiveProjectId as string)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  // Persisted results, so everything survives a page reload.
  const { data: pastResults } = useQuery({
    queryKey: ["studio-results", user?.id ?? "anon"],
    enabled: Boolean(user),
    staleTime: 15_000,
    queryFn: async (): Promise<ResultCard[]> => {

      const [videos, failedJobs] = await Promise.all([
        supabase
          .from("generated_videos")
          .select(
            "id, hook_id, hook_text, output_url, thumbnail_url, duration, status, created_at, render_job_id, recipe_id, media_asset_id, media_assets(filename)",
          )
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("render_jobs")
          .select("id, status, error_message, created_at, video_recipes(overlay_text, media_asset_id)")
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      const done: ResultCard[] = await Promise.all(
        (videos.data ?? []).map(async (r): Promise<ResultCard> => {
          const url = await resolveRenderUrl(r.output_url);
          const ok = Boolean(url) && r.status === "completed";
          return {
            jobId: r.render_job_id ?? r.id,
            videoId: r.id,
            recipeId: r.recipe_id,
            hookId: r.hook_id ?? "",
            hookText: r.hook_text ?? "Untitled hook",
            sourceName: (r.media_assets as { filename?: string } | null)?.filename ?? "Source clip",
            sourceAssetId: r.media_asset_id ?? "",
            durationSeconds: Number(r.duration ?? CLIP_SECONDS),
            createdAt: r.created_at,
            outputPath: r.output_url,
            thumbnailPath: r.thumbnail_url,
            stage: ok ? "completed" : "failed",
            progress: 100,
            ...(url ? { url } : { error: "Output file is missing from storage." }),
            filename: renderFilename(r.output_url, `hook-variant-${r.id.slice(0, 6)}`),
          };
        }),
      );

      const videoJobIds = new Set(done.map((d) => d.jobId));
      const failed: ResultCard[] = (failedJobs.data ?? [])
        .filter((j) => !videoJobIds.has(j.id))
        .map((j) => ({
          jobId: j.id,
          videoId: null,
          recipeId: null,
          hookId: "",
          hookText:
            (j.video_recipes as { overlay_text?: string } | null)?.overlay_text ?? "Untitled hook",
          sourceName: "Source clip",
          sourceAssetId: (j.video_recipes as { media_asset_id?: string } | null)?.media_asset_id ?? "",
          durationSeconds: CLIP_SECONDS,
          createdAt: j.created_at,
          outputPath: null,
          thumbnailPath: null,
          stage: "failed" as const,
          progress: 100,
          error: j.error_message ?? "Render failed.",
        }));

      return [...done, ...failed].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
  });

  const liveIds = new Set(live.map((l) => l.jobId));
  const results: ResultCard[] = [
    ...live.map((l) => ({ ...l, videoId: l.videoId })),
    ...(pastResults ?? []).filter((p) => !liveIds.has(p.jobId)),
  ];

  const completedCount = live.filter((l) => l.stage === "completed").length;
  const failedItems = live.filter((l) => l.stage === "failed");

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

  // Multi-clip batch: when the user turns this on and picks 2+ clips, a
  // single "generate" spreads the requested quantity evenly across all
  // selected clips (remainder randomly assigned) instead of using only the
  // single clip picked above.
  const [multiClipMode, setMultiClipMode] = useState(false);
  const [originalSound, setOriginalSound] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  function toggleClipSelected(id: string) {
    setSelectedClipIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

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
        const projectId = effectiveProjectId ?? (await ensureStudioProject(user.id));
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
    const projectId = effectiveProjectId ?? (await ensureStudioProject(user.id));
    const { error } = await supabase.from("hooks").insert({
      user_id: user.id,
      project_id: projectId,
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
      if (prev.length >= MAX_HOOKS) {
        toast.info(`You can select up to ${MAX_HOOKS} hooks per batch.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  async function createVariants() {
    if (!user) {
      toast.error("Sign in again to continue.");
      return;
    }
    if (selected.length === 0) {
      toast.error("Select at least one hook.");
      return;
    }
    const chosen = selected
      .map((id) => (hooks ?? []).find((h) => h.id === id))
      .filter((h): h is NonNullable<typeof h> => Boolean(h))
      .map((h) => ({ id: h.id, text: h.text }));

    const projectId = effectiveProjectId ?? (await ensureStudioProject(user.id));
    if (!projectId) {
      toast.error("Could not prepare the studio project.");
      return;
    }

    if (multiClipMode) {
      if (selectedClipIds.length === 0) {
        toast.error("Select at least one clip.");
        return;
      }
      const chosenAssets = selectedClipIds
        .map((id) => (assets ?? []).find((a) => a.id === id))
        .filter((a): a is NonNullable<typeof a> => Boolean(a));
      if (chosenAssets.length === 0) {
        toast.error("Selected clips could not be found — try reselecting.");
        return;
      }

      setRendering(true);
      setRequested(quantity);
      setLive([]);
      try {
        const withUrls = await Promise.all(
          chosenAssets.map(async (a) => {
            const url = await signedUrl("media", a.storage_path, 60 * 60 * 6);
            return url ? { ...a, url } : null;
          }),
        );
        const ready = withUrls.filter((a): a is NonNullable<typeof a> => Boolean(a));
        if (ready.length === 0) {
          toast.error("Could not load the selected clips — try again.");
          return;
        }
        const items = await runMultiClipBatch({
          userId: user.id,
          projectId,
          assets: ready.map((a) => ({
            id: a.id,
            filename: a.filename,
            duration: a.duration,
            storage_path: a.storage_path,
            hook_placement: a.hook_placement,
            url: a.url,
          })),
          hooks: chosen,
          quantity,
          withAudio: originalSound,
          onUpdate: setLive,
        });
        const done = items.filter((i) => i.stage === "completed").length;
        if (done === items.length) toast.success(`${done} of ${quantity} variants rendered across ${ready.length} clips`);
        else toast.warning(`${done} of ${quantity} variants rendered — see the failed cards below`);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setRendering(false);
        await qc.invalidateQueries({ queryKey: ["studio-results"] });
        await qc.invalidateQueries({ queryKey: ["project"] });
      }
      return;
    }

    if (!asset || !assetUrl) {
      toast.error("Upload a source video first.");
      return;
    }

    setRendering(true);
    setRequested(quantity);
    setLive([]);
    try {
      const items = await runBatch({
        userId: user.id,
        projectId,
        asset: {
          id: asset.id,
          filename: asset.filename,
          duration: asset.duration,
          storage_path: asset.storage_path,
          hook_placement: asset.hook_placement,
        },
        assetUrl,
        hooks: chosen,
        quantity,
        withAudio: originalSound,
        onUpdate: setLive,
      });
      const done = items.filter((i) => i.stage === "completed").length;
      if (done === items.length) toast.success(`${done} of ${quantity} variants rendered`);
      else toast.warning(`${done} of ${quantity} variants rendered — see the failed cards below`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRendering(false);
      await qc.invalidateQueries({ queryKey: ["studio-results"] });
      await qc.invalidateQueries({ queryKey: ["project"] });
    }
  }

  async function removeResult(card: ResultCard) {
    try {
      if (card.videoId) {
        await deleteRender({
          id: card.videoId,
          output_url: card.outputPath,
          thumbnail_url: card.thumbnailPath,
          render_job_id: card.jobId,
          recipe_id: card.recipeId,
        });
      }
      setLive((prev) => prev.filter((l) => l.jobId !== card.jobId));
      await qc.invalidateQueries({ queryKey: ["studio-results"] });
      await qc.invalidateQueries({ queryKey: ["project"] });
      toast.success("Render deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Studio"
        description="Upload one clip, select your hooks, choose how many variants to render, and export ready-to-post vertical videos."
      />

      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <Label className="text-xs whitespace-nowrap">Working in</Label>
        <Select
          value={scopeProjectId ?? "__default__"}
          onValueChange={(v) => setScopeProjectId(v === "__default__" ? null : v)}
        >
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="Quick Studio work" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">Quick Studio work (unsorted)</SelectItem>
            {(userProjects ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Clips, hooks, and renders you add here go into this project — switch to see or work on a different one.
        </p>
      </div>

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
              <video
                src={assetUrl}
                controls
                playsInline
                preload="metadata"
                className="aspect-[9/16] w-full bg-black object-contain"
              />

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
                  Duration {fmtDuration(asset.duration)} · output {OUT_W}×{OUT_H} ·{" "}
                  {Math.round(Math.min(Number(asset.duration ?? CLIP_SECONDS), CLIP_SECONDS))}s per variant
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
            {(assets ?? []).length > 1 && (
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Generate across multiple clips</Label>
                  <Switch checked={multiClipMode} onCheckedChange={setMultiClipMode} />
                </div>
                {multiClipMode && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Pick 2 or more clips — the batch splits evenly across them (any remainder goes to a
                      random pick). Each clip renders with its own saved hook placement.
                    </p>
                    <div className="max-h-48 space-y-1 overflow-y-auto">
                      {(assets ?? []).map((a) => (
                        <label
                          key={a.id}
                          className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selectedClipIds.includes(a.id)}
                            onCheckedChange={() => toggleClipSelected(a.id)}
                          />
                          <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                          <span className="text-xs text-muted-foreground">{fmtDuration(a.duration)}</span>
                        </label>
                      ))}
                    </div>
                    {selectedClipIds.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedClipIds.length} clip{selectedClipIds.length === 1 ? "" : "s"} selected
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2. Hook library */}
      <section className="panel p-5">
        <h2 className="text-sm font-semibold">2. Hook library</h2>
        <p className="text-xs text-muted-foreground">
          Save your winning openings, then select up to {MAX_HOOKS} for this batch.
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
            <p className="text-xs text-muted-foreground">
              {selected.length}/{MAX_HOOKS} selected
            </p>
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
      <section className="panel space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">3. Create the batch</h2>
          <p className="text-xs text-muted-foreground">
            Each variant trims a different section (up to {CLIP_SECONDS}s — shorter clips keep their full
            length) and burns one hook into the exported file.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
          <div>
            <Label className="text-xs">Original sound</Label>
            <p className="text-xs text-muted-foreground">
              Keep the source clip's own audio in the export instead of a silent render.
            </p>
          </div>
          <Switch checked={originalSound} onCheckedChange={setOriginalSound} />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Batch quantity</Label>
            <Select value={quantityChoice} onValueChange={setQuantityChoice}>
              <SelectTrigger className="w-40">
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
              <Label htmlFor="custom-qty" className="text-xs">
                How many? (1–{MAX_QUANTITY})
              </Label>
              <Input
                id="custom-qty"
                type="number"
                min={1}
                max={MAX_QUANTITY}
                value={customQuantity}
                onChange={(e) => setCustomQuantity(e.target.value)}
                className="w-32"
              />
            </div>
          ) : null}

          <Button
            onClick={() => void createVariants()}
            disabled={rendering || selected.length === 0 || !asset}
          >
            {rendering ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            Render {quantity} variant{quantity === 1 ? "" : "s"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Requesting <span className="font-medium text-foreground">{quantity}</span> variant
          {quantity === 1 ? "" : "s"} from {selected.length || 0} selected hook
          {selected.length === 1 ? "" : "s"}
          {selected.length > 0 && quantity > selected.length
            ? " (hooks cycle across the batch)"
            : ""}
          . Nothing extra is generated.
        </p>

        {requested > 0 ? (
          <div className="rounded-lg border border-border bg-surface-raised/40 px-4 py-3 text-xs">
            <span className="font-medium">
              {completedCount} completed / {requested} requested
            </span>
            {failedItems.length > 0 ? (
              <span className="text-destructive">
                {" "}
                · {failedItems.length} failed:{" "}
                {failedItems.map((f) => f.jobId.slice(0, 8)).join(", ")}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 4. Results */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">4. Results</h2>
        {results.length === 0 ? (
          <EmptyState
            icon={Film}
            title="No variants yet"
            description="Upload a clip, select hooks, choose a batch size and run the render."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((b, i) => (
              <div key={b.jobId} className="panel space-y-3 p-4">
                <div className="overflow-hidden rounded-lg border border-border bg-black">
                  {b.url ? (
                    <RenderPlayer src={b.url} />
                  ) : (
                    <div className="flex aspect-[9/16] items-center justify-center px-4 text-center text-xs text-muted-foreground">
                      {b.stage === "failed" ? "Render failed" : `${STAGE_LABEL[b.stage]}…`}
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 text-sm font-medium">{b.hookText}</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {b.sourceName} · {Math.round(b.durationSeconds)}s · {fmtDate(b.createdAt)}
                  <br />
                  Job {b.jobId.slice(0, 8)}
                  {b.recipeId ? ` · Recipe ${b.recipeId.slice(0, 8)}` : ""}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusPill status={STAGE_LABEL[b.stage]} />
                  <div className="flex items-center gap-2">
                    {b.url ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void downloadRender(b.url!, b.filename ?? `hook-variant-${i + 1}.mp4`).catch((e) =>
                            toast.error((e as Error).message),
                          )
                        }
                      >
                        <Download className="size-3.5" />
                        Download
                      </Button>
                    ) : null}
                    {b.videoId ? (
                      <DeleteRenderButton onConfirm={() => removeResult(b)} />
                    ) : null}
                  </div>
                </div>

                {b.stage !== "completed" && b.stage !== "failed" ? (
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
