import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { studyWinnersFn } from "@/lib/ai.functions";
import { PLATFORMS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Analyzed = { text: string; structure: string; emotional_trigger: string; format: string };

export function StudyWinnersDialog({
  open,
  onOpenChange,
  projectId,
  defaultAudience,
  defaultPlatform,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string | null;
  defaultAudience?: string;
  defaultPlatform?: string;
}) {
  const qc = useQueryClient();
  const study = useServerFn(studyWinnersFn);
  const [raw, setRaw] = useState("");
  const [audience, setAudience] = useState(defaultAudience ?? "");
  const [platform, setPlatform] = useState(defaultPlatform ?? "both");
  const [result, setResult] = useState<Analyzed[]>([]);

  const texts = raw
    .split("\n")
    .map((l) => l.replace(/^\s*[\d.)-]+\s*/, "").trim())
    .filter((l) => l.length >= 3)
    .slice(0, 25);

  const run = useMutation({
    mutationFn: () => study({ data: { texts, audience, platform, projectId, save: true } }),
    onSuccess: (r) => {
      setResult(r.analyzed);
      qc.invalidateQueries({ queryKey: ["hooks"] });
      toast.success(`Studied and saved ${r.saved.length} winning hooks`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Study winning hooks</DialogTitle>
          <DialogDescription>
            Paste hooks that already performed — one per line. The AI extracts their structure, emotional
            trigger and format, then saves them as winners so generation can pattern on them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Winning hooks ({texts.length})</Label>
            <Textarea
              rows={8}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"I stopped buying X and this happened\nNobody tells you this about Y"}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Audience</Label>
              <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Busy parents" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p.value ?? p} value={String(p.value ?? p)}>
                      {String(p.label ?? p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {result.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Extracted patterns</Label>
              {result.map((r, i) => (
                <div key={i} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{r.text}</p>
                  <p className="text-xs text-muted-foreground">Structure: {r.structure || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    Trigger: {r.emotional_trigger || "—"} · Format: {r.format || "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending || texts.length === 0}>
            {run.isPending && <Loader2 className="size-4 animate-spin" />} Study {texts.length || ""} hooks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
