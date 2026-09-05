/**
 * Thumbs up / down rating for a finished render. A thumbs-down asks for the
 * reason (free text + issue tags) so future edits can learn from it.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const ISSUES = ["Freeze frames", "Speed feels off", "Bad cut points", "Hook text", "Audio", "Other"];

type Feedback = { rating: "up" | "down"; reason: string | null; issues: string[] };

export function RenderFeedback({ videoId, projectId }: { videoId: string; projectId?: string | null }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [issues, setIssues] = useState<string[]>([]);

  const { data: current } = useQuery({
    queryKey: ["render-feedback", videoId, user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Feedback | null> => {
      const { data } = await supabase
        .from("render_feedback")
        .select("rating, reason, issues")
        .eq("video_id", videoId)
        .maybeSingle();
      return (data as Feedback | null) ?? null;
    },
  });

  useEffect(() => {
    if (current) {
      setReason(current.reason ?? "");
      setIssues(current.issues ?? []);
    }
  }, [current]);

  const save = useMutation({
    mutationFn: async (input: Feedback) => {
      if (!user) throw new Error("Sign in to rate renders.");
      const { error } = await supabase.from("render_feedback").upsert(
        {
          user_id: user.id,
          video_id: videoId,
          project_id: projectId ?? null,
          rating: input.rating,
          reason: input.reason?.trim() || null,
          issues: input.issues,
        },
        { onConflict: "user_id,video_id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["render-feedback", videoId, user?.id] });
      toast.success("Thanks — feedback saved.");
      setOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rating = current?.rating;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={rating === "up" ? "default" : "ghost"}
          aria-label="Good render"
          onClick={() => save.mutate({ rating: "up", reason: "", issues: [] })}
          disabled={save.isPending}
        >
          <ThumbsUp className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant={rating === "down" ? "destructive" : "ghost"}
          aria-label="Bad render"
          onClick={() => setOpen((v) => !v)}
          disabled={save.isPending}
        >
          <ThumbsDown className="size-3.5" />
        </Button>
        {rating === "down" && !open ? (
          <span className="text-[11px] text-muted-foreground">Reason saved</span>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {ISSUES.map((tag) => {
              const active = issues.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setIssues((prev) => (active ? prev.filter((t) => t !== tag) : [...prev, tag]))
                  }
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What went wrong with this render?"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate({ rating: "down", reason, issues })}
              disabled={save.isPending}
            >
              Save feedback
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
