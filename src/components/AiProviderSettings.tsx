import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Plug, Trash2 } from "lucide-react";
import {
  listAiCredentialsFn,
  saveAiCredentialFn,
  activateAiCredentialFn,
  deleteAiCredentialFn,
  testAiCredentialFn,
  useBuiltInAiFn,
} from "@/lib/ai-credentials.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const PRESETS: Array<{ label: string; baseUrl: string; model: string }> = [
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-3.5-sonnet" },
  { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
];

export function AiProviderSettings() {
  const qc = useQueryClient();
  const list = useServerFn(listAiCredentialsFn);
  const save = useServerFn(saveAiCredentialFn);
  const activate = useServerFn(activateAiCredentialFn);
  const remove = useServerFn(deleteAiCredentialFn);
  const test = useServerFn(testAiCredentialFn);
  const builtIn = useServerFn(useBuiltInAiFn);

  const [form, setForm] = useState({ label: "", baseUrl: "", model: "", apiKey: "" });
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ai-credentials"],
    queryFn: () => list(),
  });
  const creds = data?.credentials ?? [];
  const usingBuiltIn = !creds.some((c) => c.is_active);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ai-credentials"] });

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: { label: form.label, baseUrl: form.baseUrl, model: form.model, apiKey: form.apiKey, makeActive: true },
      }),
    onSuccess: () => {
      setForm({ label: "", baseUrl: "", model: "", apiKey: "" });
      invalidate();
      toast.success("Connection saved and set as active");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="panel space-y-5 p-6 lg:col-span-2">
      <div>
        <h2 className="text-sm font-semibold">AI provider</h2>
        <p className="text-sm text-muted-foreground">
          Bring your own LLM. Any OpenAI-compatible endpoint works — OpenAI, Anthropic via a compatible proxy,
          OpenRouter, Groq or a local server. Keys stay on the server; the browser only ever sees the last 4
          characters.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Built-in model</p>
            <p className="text-xs text-muted-foreground">Works with no setup, billed to this workspace.</p>
          </div>
          {usingBuiltIn ? (
            <Badge>Active</Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await builtIn({ data: undefined });
                invalidate();
              }}
            >
              Use this
            </Button>
          )}
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading connections…</p>
        ) : (
          creds.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Plug className="h-3.5 w-3.5" /> {c.label}
                  {c.is_active && <Badge>Active</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.model} · {c.base_url} · {c.key_hint}
                </p>
              </div>
              <div className="flex gap-2">
                {!c.is_active && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await activate({ data: { id: c.id } });
                      invalidate();
                    }}
                  >
                    <Check className="h-3.5 w-3.5" /> Activate
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testingId === c.id}
                  onClick={async () => {
                    setTestingId(c.id);
                    try {
                      const r = await test({ data: { id: c.id } });
                      r.ok ? toast.success(`Connection works: ${r.reply}`) : toast.error(r.reply);
                    } finally {
                      setTestingId(null);
                    }
                  }}
                >
                  {testingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await remove({ data: { id: c.id } });
                    invalidate();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant="outline"
              onClick={() => setForm((f) => ({ ...f, label: p.label, baseUrl: p.baseUrl, model: p.model }))}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="My OpenAI" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Base URL</Label>
            <Input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Model</Label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="gpt-4o-mini" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">API key</Label>
            <Input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="sk-…"
            />
          </div>
        </div>
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || !form.label || !form.baseUrl || !form.model || form.apiKey.length < 8}
        >
          {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save connection
        </Button>
      </div>
    </section>
  );
}
