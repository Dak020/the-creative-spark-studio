/**
 * Hook creative services. All creative reasoning lives here; the video engine
 * stays deterministic.
 */
import { getAiProvider, type ChatMessage } from "./provider.server";

export type WinningHookInput = {
  text: string;
  category?: string | null;
  structure?: string | null;
  emotional_trigger?: string | null;
  performance_score?: number | null;
};

export type GenerateHooksInput = {
  product: string;
  productUrl?: string | null;
  audience: string;
  platform: string;
  contentStyle: string;
  count: number;
  categories: string[];
  winners: WinningHookInput[];
};

export type GeneratedHook = {
  text: string;
  category: string;
  structure: string;
  emotional_trigger: string;
  score: number;
  rationale: string;
};

const SYSTEM: ChatMessage = {
  role: "system",
  content: `You are a senior short-form video strategist writing scroll-stopping opening hooks for TikTok and Instagram Reels.

Rules:
- Hooks are spoken/on-screen openers. 3-14 words. No hashtags, no emojis, no quotation marks.
- Never copy or lightly reword a reference hook. Extract its STRUCTURE (syntactic template), EMOTIONAL TRIGGER and FORMAT, then write an original hook that reuses the pattern with new language and new specifics.
- Vary the openings. Do not start more than one hook with the same first two words.
- Respect the requested hook categories and the product's real use case.
- Reply with STRICT JSON only. No prose, no markdown fences.`,
};

/** Analyze the structural DNA of a set of winning hooks. */
export async function analyzeHookStructure(hooks: WinningHookInput[]) {
  if (hooks.length === 0) return [] as Array<{ text: string; structure: string; emotional_trigger: string; format: string }>;
  const ai = getAiProvider();
  return ai.completeJson<Array<{ text: string; structure: string; emotional_trigger: string; format: string }>>([
    SYSTEM,
    {
      role: "user",
      content: `Analyze these proven hooks. For each, return the abstract structural template (use placeholders like [audience], [outcome], [objection]), the dominant emotional trigger, and the format.

Hooks:
${hooks.map((h, i) => `${i + 1}. ${h.text}`).join("\n")}

Return JSON: [{"text":"","structure":"","emotional_trigger":"","format":""}]`,
    },
  ]);
}

/** Generate original hook variants patterned on (never copied from) winners. */
export async function generateHookVariants(input: GenerateHooksInput): Promise<GeneratedHook[]> {
  const ai = getAiProvider();
  const analysis = input.winners.length ? await analyzeHookStructure(input.winners) : [];

  const raw = await ai.completeJson<{ hooks: GeneratedHook[] } | GeneratedHook[]>([
    SYSTEM,
    {
      role: "user",
      content: `Product: ${input.product}${input.productUrl ? ` (${input.productUrl})` : ""}
Target audience: ${input.audience || "general short-form audience"}
Platform: ${input.platform}
Content style: ${input.contentStyle}
Allowed hook categories: ${input.categories.join(", ") || "any"}
Number of hooks: ${input.count}

${
  analysis.length
    ? `Structural patterns extracted from proven winners (reuse the PATTERN, not the wording):
${analysis.map((a, i) => `${i + 1}. structure: ${a.structure} | trigger: ${a.emotional_trigger} | format: ${a.format}`).join("\n")}`
    : "No reference winners supplied — invent strong patterns yourself."
}

Return JSON: {"hooks":[{"text":"","category":"","structure":"","emotional_trigger":"","score":0,"rationale":""}]}
score = your 0-100 prediction of stopping power.`,
    },
  ]);

  const list = Array.isArray(raw) ? raw : (raw.hooks ?? []);
  return list.slice(0, input.count).map((h) => ({
    text: String(h.text ?? "").trim(),
    category: String(h.category ?? input.categories[0] ?? "Curiosity"),
    structure: String(h.structure ?? ""),
    emotional_trigger: String(h.emotional_trigger ?? ""),
    score: Number.isFinite(Number(h.score)) ? Math.max(0, Math.min(100, Number(h.score))) : 50,
    rationale: String(h.rationale ?? ""),
  }));
}

/** Public entry point used by the server function. */
export async function generateHooks(input: GenerateHooksInput) {
  return generateHookVariants(input);
}

/** Re-score existing hook texts against an audience/platform. */
export async function scoreHooks(texts: string[], audience: string, platform: string) {
  if (texts.length === 0) return [];
  const ai = getAiProvider();
  const raw = await ai.completeJson<{ scores: Array<{ text: string; score: number; rationale: string }> }>([
    SYSTEM,
    {
      role: "user",
      content: `Score each hook 0-100 for stopping power on ${platform} for this audience: ${audience}.
Hooks:
${texts.map((t, i) => `${i + 1}. ${t}`).join("\n")}
Return JSON: {"scores":[{"text":"","score":0,"rationale":""}]}`,
    },
  ]);
  return raw.scores ?? [];
}
