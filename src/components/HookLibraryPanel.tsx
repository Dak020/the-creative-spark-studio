import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Quote, Plus, Search, Trash2, Trophy, Pencil, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HOOK_CATEGORIES, PLATFORMS } from "@/lib/constants";
import { fmtNumber } from "@/lib/db";
import { EmptyState } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HookGeneratorDialog } from "@/components/HookGeneratorDialog";

export type Hook = {
  id: string;
  project_id: string | null;
  text: string;
  category: string;
  structure: string | null;
  emotional_trigger: string | null;
  audience: string | null;
  platform: string;
  source: string;
  is_winner: boolean;
  performance_score: number;
  views: number;
  retention: number;
  shares: number;
  saves: number;
  conversion_rate: number;
  created_at: string;
};

const emptyHook = {
  text: "",
  category: "Curiosity" as string,
  structure: "",
  emotional_trigger: "",
  audience: "",
  platform: "both",
};

export function HookLibraryPanel({
  projectId,
  generatorContext,
}: {
  projectId?: string;
  generatorContext?: { product: string; productUrl?: string | null; audience: string; platform: string; contentStyle: string };
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [winnersOnly, setWinnersOnly] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyHook });

  const { data: hooks } = useQuery({
    queryKey: ["hooks", projectId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("hooks").select("*").order("created_at", { ascending: false });
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Hook[];
    },
  });

  const filtered = useMemo(() => {
    return (hooks ?? []).filter((h) => {
      if (winnersOnly && !h.is_winner) return false;
      if (category !== "all" && h.category !== category) return false;
      const q = query.trim().toLowerCase();
      return !q || h.text.toLowerCase().includes(q) || (h.emotional_trigger ?? "").toLowerCase().includes(q);
    });
  }, [hooks, category, query, winnersOnly]);

  const save = useMutation({
    mutationFn: async () => {
      const text = form.text.trim();
      if (!text) throw new Error("Hook text is required");
      if (text.length > 300) throw new Error("Hook must be under 300 characters");

      if (editingId) {
        const { error } = await supabase
          .from("hooks")
          .update({
            text,
            category: form.category,
            structure: form.structure || null,
            emotional_trigger: form.emotional_trigger || null,
            audience: form.audience || null,
            platform: form.platform,
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes.user?.id;
        if (!userId) throw new Error("Not signed in");
        const { error } = await supabase.from("hooks").insert({
          user_id: userId,
          project_id: projectId ?? null,
          text,
          category: form.category,
          structure: form.structure || null,
          emotional_trigger: form.emotional_trigger || null,
          audience: form.audience || null,
          platform: form.platform,
          source: "manual",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Hook updated" : "Hook added");
      setEditorOpen(false);
      setEditingId(null);
      setForm({ ...emptyHook });
      qc.invalidateQueries({ queryKey: ["hooks"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save hook"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Hook deleted");
      qc.invalidateQueries({ queryKey: ["hooks"] });
    },
  });

  const toggleWinner = useMutation({
    mutationFn: async (hook: Hook) => {
      const { error } = await supabase
        .from("hooks")
        .update({ is_winner: !hook.is_winner })
        .eq("id", hook.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hooks"] }),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hooks"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {HOOK_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={winnersOnly ? "default" : "outline"}
          onClick={() => setWinnersOnly((v) => !v)}
        >
          <Trophy className="size-4" />
          Winners
        </Button>
        <Button variant="secondary" onClick={() => setGenOpen(true)}>
          <Sparkles className="size-4" />
          Generate
        </Button>
        <Button
          onClick={() => {
            setEditingId(null);
            setForm({ ...emptyHook });
            setEditorOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add hook
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Quote}
          title={hooks?.length ? "No hooks match your filters" : "No hooks yet"}
          description={
            hooks?.length
              ? "Adjust the category, winners toggle or search."
              : "Add proven hooks manually, mark the best as winners, then let the AI generate structural variants."
          }
          action={
            <Button onClick={() => setEditorOpen(true)}>
              <Plus className="size-4" />
              Add your first hook
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((hook) => (
            <div
              key={hook.id}
              className={`panel group flex flex-col p-4 ${hook.is_winner ? "ring-1 ring-primary/40" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {hook.category}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Toggle winner"
                    onClick={() => toggleWinner.mutate(hook)}
                  >
                    <Trophy className={`size-3.5 ${hook.is_winner ? "text-primary" : "text-muted-foreground"}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Edit hook"
                    onClick={() => {
                      setEditingId(hook.id);
                      setForm({
                        text: hook.text,
                        category: hook.category,
                        structure: hook.structure ?? "",
                        emotional_trigger: hook.emotional_trigger ?? "",
                        audience: hook.audience ?? "",
                        platform: hook.platform,
                      });
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Delete hook"
                    onClick={() => remove.mutate(hook.id)}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              <p className="mt-3 flex-1 text-sm leading-relaxed">{hook.text}</p>

              {hook.emotional_trigger ? (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Trigger: {hook.emotional_trigger}
                </p>
              ) : null}

              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border pt-3 text-center">
                {[
                  { label: "Score", value: Math.round(Number(hook.performance_score)) },
                  { label: "Views", value: fmtNumber(hook.views) },
                  { label: "Ret.", value: `${Math.round(Number(hook.retention))}%` },
                  { label: "Saves", value: fmtNumber(hook.saves) },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="font-mono text-xs tabular-nums">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit hook" : "Add hook"}</DialogTitle>
            <DialogDescription>
              Capture the structure and emotional trigger — the AI uses these when generating variants.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="h-text">Hook text</Label>
              <Textarea
                id="h-text"
                rows={2}
                maxLength={300}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder="POV: you finally stopped buying the cheap version"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
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
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="h-struct">Structure</Label>
                <Input
                  id="h-struct"
                  maxLength={200}
                  value={form.structure}
                  onChange={(e) => setForm({ ...form, structure: e.target.value })}
                  placeholder="POV: [audience] [realization]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="h-trigger">Emotional trigger</Label>
                <Input
                  id="h-trigger"
                  maxLength={100}
                  value={form.emotional_trigger}
                  onChange={(e) => setForm({ ...form, emotional_trigger: e.target.value })}
                  placeholder="regret / relief"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="h-aud">Audience</Label>
              <Input
                id="h-aud"
                maxLength={200}
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                placeholder="Women 25-34, wellness"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save hook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HookGeneratorDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        projectId={projectId ?? null}
        winners={(hooks ?? []).filter((h) => h.is_winner)}
        defaults={generatorContext}
      />
    </div>
  );
}
