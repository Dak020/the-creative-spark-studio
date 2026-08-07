/**
 * AI provider abstraction.
 *
 * The rest of the app only ever talks to `getAiProvider()`, so swapping in
 * OpenAI-direct or Anthropic later is a single file change — no call-site
 * rewrites. Server-only: never import from client code.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  /** Returns raw text completion for the given messages. */
  complete(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string>;
  /** Returns a parsed JSON object completion. */
  completeJson<T>(messages: ChatMessage[], opts?: { temperature?: number }): Promise<T>;
}

class GatewayProvider implements AiProvider {
  readonly id = "lovable-ai-gateway";
  constructor(
    private apiKey: string,
    readonly model: string,
  ) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        reasoning_effort: "none",
      }),
    });

    if (res.status === 429) throw new Error("RATE_LIMIT: AI is busy, please retry in a moment.");
    if (res.status === 402) throw new Error("NO_CREDITS: AI credits exhausted. Add credits to continue.");
    if (!res.ok) throw new Error(`AI request failed (${res.status}): ${await res.text()}`);

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? "";
  }

  async completeJson<T>(messages: ChatMessage[]): Promise<T> {
    const text = await this.complete(messages);
    return parseJsonLoose<T>(text);
  }
}

export function parseJsonLoose<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const startArr = cleaned.indexOf("[");
    const from = start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (from === -1 || end === -1) throw new Error("AI returned an unparseable response.");
    return JSON.parse(cleaned.slice(from, end + 1)) as T;
  }
}

/**
 * Resolve the active provider. Extension point for OpenAI / Anthropic:
 * add a branch keyed on `AI_PROVIDER` returning another `AiProvider` impl.
 */
export function getAiProvider(): AiProvider {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project.");
  const model = process.env["AI_MODEL"] ?? "openai/gpt-5.6-sol";
  return new GatewayProvider(key, model);
}
