import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { FolderKanban, Plus, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, PageHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AGE_RANGES, CONTENT_STYLES, GENDERS, PLATFORMS, platformLabel, styleLabel } from "@/lib/constants";
import { audienceSummary, fmtDate } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/projects/")({
  validateSearch: z.object({ new: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Projects — Creative Factory" },
      { name: "description", content: "Every product campaign and its short-form video output." },
      { property: "og:title", content: "Projects — Creative Factory" },
      { property: "og:description", content: "Manage product campaigns and batch video production." },
    ],
  }),
  component: ProjectsPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120),
  productName: z.string().trim().min(1, "Product name is required").max(120),
  productUrl: z.string().trim().max(500).optional().or(z.literal("")),
  productDescription: z.string().trim().max(1000).optional().or(z.literal("")),
  targetGender: z.string().max(20),
  targetAge: z.string().max(20),
  targetLocation: z.string().trim().max(120),
  targetInterests: z.string().trim().max(300),
  platform: z.string().max(20),
  contentStyle: z.string().max(40),
  videosToGenerate: z.number().int().min(1).max(200),
});

const blank = {
  name: "",
  productName: "",
  productUrl: "",
  productDescription: "",
  targetGender: "all",
  targetAge: "18-24",
  targetLocation: "",
  targetInterests: "",
  platform: "both",
  contentStyle: "ugc",
  videosToGenerate: 10,
};

function ProjectsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(Boolean(search.new));
  const [form, setForm] = useState({ ...blank });

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, products(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
      const v = parsed.data;
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");

      const { data: project, error } = await supabase
        .from("projects")
        .insert({
          user_id: userId,
          name: v.name,
          platform: v.platform,
          content_style: v.contentStyle,
          videos_to_generate: v.videosToGenerate,
          target_gender: v.targetGender,
          target_age: v.targetAge,
          target_location: v.targetLocation || null,
          target_interests: v.targetInterests
            ? v.targetInterests.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        })
        .select()
        .single();
      if (error) throw error;

      const { error: prodErr } = await supabase.from("products").insert({
        user_id: userId,
        project_id: project.id,
        name: v.productName,
        url: v.productUrl || null,
        description: v.productDescription || null,
      });
      if (prodErr) throw prodErr;
      return project;
    },
    onSuccess: (project) => {
      toast.success("Project created");
      setOpen(false);
      setForm({ ...blank });
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create project"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project deleted");
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        description="One project per product campaign — audience, media, hooks and renders live inside."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            New project
          </Button>
        }
      />

      {isLoading ? (
        <div className="panel flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (projects?.length ?? 0) === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project to define your product, audience and platform, then start generating hooks and videos."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              New project
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects?.map((p) => {
            const product = Array.isArray(p.products) ? p.products[0] : null;
            return (
              <div key={p.id} className="panel group flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-base font-semibold">{p.name}</h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {product?.name ?? "No product"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => remove.mutate(p.id)}
                    aria-label="Delete project"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>

                <dl className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Platform</dt>
                    <dd>{platformLabel(p.platform)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Style</dt>
                    <dd>{styleLabel(p.content_style)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Target videos</dt>
                    <dd>{p.videos_to_generate}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">Audience</dt>
                    <dd className="truncate text-right">{audienceSummary(p)}</dd>
                  </div>
                </dl>

                <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-xs text-muted-foreground">{fmtDate(p.created_at)}</span>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/projects/$projectId" params={{ projectId: p.id }}>
                      Open
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && search.new) navigate({ to: "/projects", search: {} });
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Define the product and who you're targeting.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-name">Project name</Label>
              <Input
                id="p-name"
                value={form.name}
                maxLength={120}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Q3 Hydration Bottle push"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="p-product">Product name</Label>
                <Input
                  id="p-product"
                  value={form.productName}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, productName: e.target.value })}
                  placeholder="HydroFlow 1L"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-url">Product URL</Label>
                <Input
                  id="p-url"
                  value={form.productUrl}
                  maxLength={500}
                  onChange={(e) => setForm({ ...form, productUrl: e.target.value })}
                  placeholder="https://store.com/product"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-desc">Product description</Label>
              <Textarea
                id="p-desc"
                rows={3}
                maxLength={1000}
                value={form.productDescription}
                onChange={(e) => setForm({ ...form, productDescription: e.target.value })}
                placeholder="What it does, who it's for, key benefit."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={form.targetGender} onValueChange={(v) => setForm({ ...form, targetGender: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Age</Label>
                <Select value={form.targetAge} onValueChange={(v) => setForm({ ...form, targetAge: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGE_RANGES.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-loc">Location</Label>
                <Input
                  id="p-loc"
                  value={form.targetLocation}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, targetLocation: e.target.value })}
                  placeholder="US"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-int">Interests (comma separated)</Label>
              <Input
                id="p-int"
                value={form.targetInterests}
                maxLength={300}
                onChange={(e) => setForm({ ...form, targetInterests: e.target.value })}
                placeholder="fitness, wellness, gym"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Content style</Label>
                <Select value={form.contentStyle} onValueChange={(v) => setForm({ ...form, contentStyle: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTENT_STYLES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-count"># of videos</Label>
                <Input
                  id="p-count"
                  type="number"
                  min={1}
                  max={200}
                  value={form.videosToGenerate}
                  onChange={(e) =>
                    setForm({ ...form, videosToGenerate: Number(e.target.value) || 1 })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
