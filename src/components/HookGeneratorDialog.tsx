import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles, Check, Trash2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateHooksFn } from "@/lib/ai.functions";
import { HOOK_CATEGORIES, CONTENT_STYLES, PLATFORMS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Variant = {
  id: string;
  text: string;
  category: string | null;
  structure: string | null;
  emotional_trigger: string | null;
  score: number;
  rationale: string | null;
};

export function HookGeneratorDialog({
  open,
  onOpenChange,
  projectId,
  winners,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  winners: Array<{ id: string; text: string }>;
  defaults?:
    | {
        product: string;
        productUrl?: string | null;
        audience: string;
        platform: string;
        contentStyle: string;
      }
    | undefined;

    product: string;
    productUrl?: string | null;
    audience: string;
    platform: string;
    contentStyle: string;
  };
}) {
  const qc = useQueryClient();
  const generate = useServerFn(generateHooksFn);

  const [product, setProduct] = useState(defaults?.product ?? "");
  const [audience, setAudience] = useState(defaults?.audience ?? "");
  const [platform, setPlatform] = useState(defaults?.platform ?? "both");
  const [contentStyle, setContentStyle] = useState(defaults?.contentStyle ?? "ugc");
  const [count, setCount] = useState(8);
  const [categories, setCategories] = useState<string[]>(["POV", "Curiosity"]);
  const [winnerIds, setWinnerIds] = useState<string[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);

  useEffect(() => {
    if (open && defaults) {
      setProduct((p) => p || defaults.product);
      setAudience((a) => a || defaults.audience);
    }
  }, [open, defaults]);

  const run = useMutation({
    mutationFn: async () => {
      if (!product.trim()) throw new Error("Product name is required");
      const res = await generate({
        data: {
          product: product.trim(),
          productUrl: defaults?.productUrl ?? null,
          audience: audience.trim(),
          platform,
          contentStyle,
          count,
          categories,
          winnerIds,
          projectId,
        },
      });
      return res.variants as Variant[];
    },
    onSuccess: (v) => {
      setVariants(v);
      toast.success(`${v.length} hooks generated`);
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Generation failed";
      if (msg.includes("RATE_LIMIT")) toast.error("AI is rate limited — try again shortly.");
      else if (msg.includes("NO_CREDITS")) toast.error("AI credits exhausted. Add credits to continue.");
      else toast.error(msg);
    },
  });

  const saveVariant = useMutation({
    mutationFn: async ({ variant, winner }: { variant: Variant; winner: boolean }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("hooks").insert({
        user_id: userId,
        project_id: projectId,
        text: variant.text,
        category: variant.category ?? "Curiosity",
        structure: variant.structure,
        emotional_trigger: variant.emotional_trigger,
        audience: audience || null,
        platform,
        source: "ai",
        is_winner: winner,
        performance_score: variant.score,
      });
      if (error) throw error;
      await supabase.from("hook_variants").update({ saved: true }).eq("id", variant.id);
    },
    onSuccess: (_d, vars) => {
      toast.success("Saved to hook library");
      setVariants((list) => list.filter((v) => v.id !== vars.variant.id));
      qc.invalidateQueries({ queryKey: ["hooks"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  async function discard(variant: Variant) {
    setVariants((list) => list.filter((v) => v.id !== variant.id));
    await supabase.from("hook_variants").delete().eq("id", variant.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            AI hook generator
          </DialogTitle>
          <DialogDescription>
            The model analyzes the structure and emotional trigger of your winners, then writes original
            variants — it never copies them.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="g-product">Product</Label>
            <Input
              id="g-product"
              value={product}
              maxLength={200}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="HydroFlow 1L bottle"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-count">Number of hooks</Label>
            <Input
              id="g-count"
              type="number"
              min={1}
              max={25}
              value={count}
              onChange={(e) => setCount(Math.min(25, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="g-aud">Audience</Label>
            <Textarea
              id="g-aud"
              rows={2}
              maxLength={500}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Women 25-34 in the US, into wellness and gym routines"
            />
          </div>
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
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
            <Select value={contentStyle} onValueChange={setContentStyle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTENT_STYLES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Hook categories</Label>
          <div className="flex flex-wrap gap-2">
            {HOOK_CATEGORIES.map((c) => {
              const active = categories.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setCategories((prev) => (active ? prev.filter((x) => x !== c) : [...prev, c]))
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-border-strong"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Winning hooks to learn from</Label>
          {winners.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No winners marked yet. Mark hooks as winners in the library to steer the patterns.
            </p>
          ) : (
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
              {winners.map((w) => (
                <label key={w.id} className="flex items-start gap-2 text-xs">
                  <Checkbox
                    checked={winnerIds.includes(w.id)}
                    onCheckedChange={(checked) =>
                      setWinnerIds((prev) =>
                        checked ? [...prev, w.id] : prev.filter((id) => id !== w.id),
                      )
                    }
                  />
                  <span className="leading-relaxed">{w.text}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {variants.length ? "Regenerate" : "Generate hooks"}
        </Button>

        {variants.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Generated hooks
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {variants.map((v) => (
                <div key={v.id} className="panel p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px]">{v.category}</Badge>
                    <span className="font-mono text-xs text-primary">{Math.round(v.score)}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed">{v.text}</p>
                  {v.rationale ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">{v.rationale}</p>
                  ) : null}
                  <div className="mt-4 flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={() => saveVariant.mutate({ variant: v, winner: false })}
                    >
                      <Check className="size-3" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onClick={() => saveVariant.mutate({ variant: v, winner: true })}
                    >
                      Winner
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Discard"
                      onClick={() => discard(v)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {variants.length ? (
            <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
              <RefreshCw className="size-4" />
              Regenerate all
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
