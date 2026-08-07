import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, Trophy, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, PageHeader, StatCard } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtNumber } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({
    meta: [
      { title: "Performance — Creative Factory" },
      { name: "description", content: "Log views, retention and conversions for every rendered video." },
      { property: "og:title", content: "Performance — Creative Factory" },
      { property: "og:description", content: "Manual performance entry that feeds your winner library." },
    ],
  }),
  component: PerformancePage,
});

const fields = [
  ["views", "Views"],
  ["avg_watch_time", "Avg watch time (s)"],
  ["completion_rate", "Completion rate (%)"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["shares", "Shares"],
  ["saves", "Saves"],
  ["clicks", "Clicks"],
  ["conversions", "Conversions"],
] as const;

type FieldKey = (typeof fields)[number][0];

function PerformancePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [videoId, setVideoId] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [values, setValues] = useState<Record<FieldKey, string>>({
    views: "",
    avg_watch_time: "",
    completion_rate: "",
    likes: "",
    comments: "",
    shares: "",
    saves: "",
    clicks: "",
    conversions: "",
  });

  const { data } = useQuery({
    queryKey: ["performance"],
    queryFn: async () => {
      const [metrics, videos] = await Promise.all([
        supabase
          .from("performance_metrics")
          .select("*, generated_videos(hook_text)")
          .order("created_at", { ascending: false }),
        supabase
          .from("generated_videos")
          .select("id, hook_text, is_winner, hook_id")
          .order("created_at", { ascending: false }),
      ]);
      return { metrics: metrics.data ?? [], videos: videos.data ?? [] };
    },
  });

  const metrics = data?.metrics ?? [];
  const totals = metrics.reduce(
    (acc, m) => ({
      views: acc.views + Number(m.views ?? 0),
      conversions: acc.conversions + Number(m.conversions ?? 0),
      saves: acc.saves + Number(m.saves ?? 0),
    }),
    { views: 0, conversions: 0, saves: 0 },
  );
  const avgCompletion = metrics.length
    ? Math.round(metrics.reduce((s, m) => s + Number(m.completion_rate ?? 0), 0) / metrics.length)
    : 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Pick a video");
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");
      const video = data?.videos.find((v) => v.id === videoId);
      const num = (k: FieldKey) => Number(values[k]) || 0;
      const { error } = await supabase.from("performance_metrics").insert({
        user_id: userId,
        generated_video_id: videoId,
        hook_id: video?.hook_id ?? null,
        platform,
        views: num("views"),
        avg_watch_time: num("avg_watch_time"),
        completion_rate: num("completion_rate"),
        likes: num("likes"),
        comments: num("comments"),
        shares: num("shares"),
        saves: num("saves"),
        clicks: num("clicks"),
        conversions: num("conversions"),
      });
      if (error) throw error;

      if (video?.hook_id) {
        await supabase
          .from("hooks")
          .update({
            views: num("views"),
            retention: num("completion_rate"),
            shares: num("shares"),
            saves: num("saves"),
            conversion_rate: num("views") ? (num("conversions") / num("views")) * 100 : 0,
            performance_score: Math.min(100, Math.round(num("completion_rate"))),
          })
          .eq("id", video.hook_id);
      }

    },
    onSuccess: () => {
      toast.success("Metrics recorded");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["performance"] });
      qc.invalidateQueries({ queryKey: ["hooks"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save metrics"),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Performance"
        description="Enter results manually for now — automatic platform sync comes later."
        actions={
          <Button onClick={() => setOpen(true)} disabled={(data?.videos.length ?? 0) === 0}>
            <Plus className="size-4" />
            Log metrics
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total views" value={fmtNumber(totals.views)} icon={BarChart3} accent />
        <StatCard label="Avg completion" value={`${avgCompletion}%`} icon={BarChart3} />
        <StatCard label="Saves" value={fmtNumber(totals.saves)} icon={BarChart3} />
        <StatCard label="Conversions" value={fmtNumber(totals.conversions)} icon={Trophy} />
      </div>

      {metrics.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No performance data yet"
          description="Render some videos, publish them, then log how each one performed to build your winner signal."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Video</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Completion</TableHead>
                <TableHead className="text-right">Saves</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                <TableHead className="text-right">Logged</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((m) => {
                const gv = m.generated_videos as { hook_text?: string } | null;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="max-w-[280px] truncate">{gv?.hook_text ?? "—"}</TableCell>
                    <TableCell className="capitalize">{m.platform}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(m.views)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(Number(m.completion_rate))}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(m.saves)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(m.conversions)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {fmtDate(m.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log performance</DialogTitle>
            <DialogDescription>Numbers roll up into the hook's winner score.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Video</Label>
              <Select value={videoId} onValueChange={setVideoId}>
                <SelectTrigger><SelectValue placeholder="Select a rendered video" /></SelectTrigger>
                <SelectContent>
                  {data?.videos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {(v.hook_text ?? "Untitled").slice(0, 60)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="instagram">Instagram Reels</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {fields.map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key} className="text-xs">{label}</Label>
                  <Input
                    id={key}
                    type="number"
                    min={0}
                    value={values[key]}
                    onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save metrics</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
