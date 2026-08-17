import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FolderKanban,
  Film,
  Quote,
  Trophy,
  Loader2,
  Plus,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, PageHeader, StatCard, StatusPill } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fmtDate, fmtNumber, audienceSummary } from "@/lib/db";
import { platformLabel, styleLabel } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Creative Factory" },
      { name: "description", content: "Recent projects, active render jobs and hook statistics." },
      { property: "og:title", content: "Dashboard — Creative Factory" },
      { property: "og:description", content: "Your short-form video production overview." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    refetchInterval: 8000,
    queryFn: async () => {
      const [projects, jobs, videos, hooks, media] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(5),
        supabase
          .from("render_jobs")
          .select("*")
          .in("status", ["queued", "processing"])
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("generated_videos")
          .select("id, hook_text, created_at, is_winner, project_id")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase.from("hooks").select("id, is_winner, performance_score, views"),
        supabase.from("media_assets").select("id"),
      ]);
      return {
        projects: projects.data ?? [],
        jobs: jobs.data ?? [],
        videos: videos.data ?? [],
        hooks: hooks.data ?? [],
        media: media.data ?? [],
      };
    },
  });

  const hooks = data?.hooks ?? [];
  const winners = hooks.filter((h) => h.is_winner).length;
  const avgScore = hooks.length
    ? Math.round(hooks.reduce((s, h) => s + Number(h.performance_score ?? 0), 0) / hooks.length)
    : 0;
  const totalViews = hooks.reduce((s, h) => s + Number(h.views ?? 0), 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Everything moving through your production line right now."
        actions={
          <Button asChild>
            <Link to="/projects" search={{ new: true }}>
              <Plus className="size-4" />
              New project
            </Link>
          </Button>
        }
      />

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Projects"
          value={data?.projects.length ?? 0}
          icon={FolderKanban}
          hint="Most recent five shown below"
          accent
        />
        <StatCard label="Media clips" value={data?.media.length ?? 0} icon={Film} hint="In your library" />
        <StatCard
          label="Hooks"
          value={hooks.length}
          icon={Quote}
          hint={`${winners} marked as winners`}
        />
        <StatCard
          label="Avg hook score"
          value={avgScore}
          icon={Trophy}
          hint={`${fmtNumber(totalViews)} tracked views`}
        />
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent projects
            </h2>
            <Link to="/projects" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>

          {isLoading ? (
            <div className="panel flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (data?.projects.length ?? 0) === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="A project holds your product info, audience, media and generated videos."
              action={
                <Button asChild>
                  <Link to="/projects" search={{ new: true }}>
                    <Plus className="size-4" />
                    Create your first project
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="panel min-w-0 divide-y divide-border overflow-hidden">
              {data?.projects.map((p) => (
                <Link
                  key={p.id}
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-raised"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {platformLabel(p.platform)} · {styleLabel(p.content_style)} · {audienceSummary(p)}
                    </p>
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    {fmtDate(p.created_at)}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Active render jobs
          </h2>
          {(data?.jobs.length ?? 0) === 0 ? (
            <div className="panel flex flex-col items-center justify-center px-6 py-12 text-center">
              <CheckCircle2 className="size-6 text-success" />
              <p className="mt-3 text-sm font-medium">Queue is clear</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Batch-generate videos from a project to fill it.
              </p>
            </div>
          ) : (
            <div className="panel min-w-0 divide-y divide-border overflow-hidden">
              {data?.jobs.map((j) => (
                <div key={j.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {j.id.slice(0, 8)}
                    </span>
                    <StatusPill status={j.status} />
                  </div>
                  <Progress value={j.progress} className="mt-3 h-1.5" />
                </div>
              ))}
            </div>
          )}

          <h2 className="pt-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Completed videos
          </h2>
          {(data?.videos.length ?? 0) === 0 ? (
            <div className="panel px-5 py-8 text-center text-xs text-muted-foreground">
              No rendered videos yet.
            </div>
          ) : (
            <div className="panel min-w-0 divide-y divide-border overflow-hidden">
              {data?.videos.map((v) => (
                <Link
                  key={v.id}
                  to="/projects/$projectId"
                  params={{ projectId: v.project_id }}
                  className="block min-w-0 px-5 py-3 transition-colors hover:bg-surface-raised"
                >
                  <p className="truncate text-sm">{v.hook_text ?? "Untitled"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDate(v.created_at)}
                    {v.is_winner ? " · Winner" : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
