/**
 * Hook creative services. All creative reasoning lives here; the video engine
 * stays deterministic.
 */
import { getAiProvider, type AiProvider, type ChatMessage } from "./provider.server";

export type WinningHookInput = {
  text: string;
  category?: string | null;
  structure?: string | null;
  emotional_trigger?: string | null;
  performance_score?: number | null;
};

export type GenerateHooksInput = {
  product: string;
  brandContext?: string | null;
  brandMode?: "winner" | "project" | "custom";
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

type HookAnalysis = { text: string; structure: string; psychological_trigger: string; format: string; emotional_mechanism: string; specificity: string; information_density: string; audience_appeal: string; winning_mechanism: string };
type HookAnalysis = {
  text: string;
  structure: string;
  psychological_trigger: string;
  emotional_trigger: string;
  format: string;
  emotional_mechanism: string;
  audience_appeal: string;
  specificity: string;
  information_density: string;
  novelty_surprise: string;
  situation: string;
  voice_tone: string;
  product_category: string;
  named_entities: string;
  offer_or_promotion: string;
  price_or_value: string;
  date_or_deadline: string;
  urgency_or_fomo: string;
  context_to_preserve: string;
  winning_mechanism: string;
};

const SYSTEM: ChatMessage = {
  role: "system",
  content: `You are a senior short-form creative strategist. Study why a proven hook works, then create a new hook using its underlying creative mechanism—not its wording, syntax, rhythm, or named details.

Hooks are spoken or on-screen openers. Do not impose a word-count target. Match the requested platform and content style; do not force TikTok slang, lowercase writing, hashtags, emojis, or quotation marks onto every platform. Preserve the actual audience, product, and context.

Originality is mandatory: never copy a winner, substitute synonyms into it, or reuse three or more meaningful words in sequence. Be concrete: prefer a real situation, pain, result, constraint, observation, or product behavior to generic phrases such as "game changer," "you need this," "secret," "obsessed," or "this changed everything." High scores require earned specificity, tension, relevance, and information density.
Originality is mandatory: never copy a winner, preserve its sentence template, or substitute synonyms into it. Preserve factual/commercial context separately from wording: when a winner names a brand, retailer, product, offer, price, discount, date, deadline, promotion, location, or other named entity, retain that same fact unless the user explicitly asks for a different variation. Never invent or swap commercial facts. Be concrete: prefer a real situation, pain, result, constraint, observation, or product behavior to generic phrases such as "game changer," "you need this," "secret," "obsessed," or "this changed everything." High scores require earned specificity, tension, relevance, and information density.

Reply with STRICT JSON only. No prose or markdown fences.`,
};

const CATEGORY_BRIEFS: Record<string, string> = {
  POV: "Put the viewer inside a specific first-person moment or role; do not merely write 'POV'.",
  Curiosity: "Create a precise, relevant information gap or unexpected observation.",
  Story: "Open at a concrete turning point, surprise, or consequence in a narrative.",
  "Problem/Solution": "Name recognizable friction and point toward credible relief or contrast.",
  "Social Proof": "Lead with believable customer/peer evidence; never invent metrics or endorsements.",
  Confession: "Use an honest, surprising admission or changed mind to create trust.",
  Discovery: "Reveal a specific useful find or overlooked detail without generic viral filler.",
  Comparison: "Contrast two methods, choices, states, or expectations to clarify why this matters.",
};

function hasWinnerPhraseOverlap(candidate: string, winners: WinningHookInput[]) {
  const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) ?? [];
  const candidateWords = words(candidate);
  return winners.some(({ text }) => {
    const winner = words(text).join(" ");
    // Three- and four-word overlaps may be necessary factual context (for
    // example, a retailer plus product). Guard against copied phrasing instead.
    return [4, 3].some((size) => candidateWords.some((_, index) => winner.includes(candidateWords.slice(index, index + size).join(" "))));
    return [6, 5].some((size) => candidateWords.some((_, index) => winner.includes(candidateWords.slice(index, index + size).join(" "))));
  });
}

/** Analyze the structural DNA of a set of winning hooks. */
export async function analyzeHookStructure(hooks: WinningHookInput[], provider?: AiProvider): Promise<HookAnalysis[]> {
export async function analyzeHookStructure(
  hooks: WinningHookInput[],
  provider?: AiProvider,
  brandContext?: string | null,
): Promise<HookAnalysis[]> {
  if (hooks.length === 0) return [];
  const ai = provider ?? getAiProvider();
  return ai.completeJson<HookAnalysis[]>([
    SYSTEM,
    {
      role: "user",
      content: `Analyze these proven hooks without returning a copyable rewrite. For each, identify structure (with functional placeholders), psychological_trigger, format, emotional_mechanism, specificity, information_density, audience_appeal, and winning_mechanism—a concise causal explanation with no distinctive wording from the hook.
      content: `Analyze these proven hooks without returning a copyable rewrite. Separate creative mechanism from factual/commercial context.${brandContext ? ` The target project brand/product is ${brandContext}. Identify which source brand facts would need adaptation rather than preservation.` : ""}

For each, identify: structure (functional placeholders), psychological_trigger, emotional_trigger, format, emotional_mechanism, audience_appeal, specificity, information_density, novelty_surprise, situation, voice_tone, product_category, named_entities, offer_or_promotion, price_or_value, date_or_deadline, urgency_or_fomo, context_to_preserve, and winning_mechanism.

context_to_preserve must list every important factual commercial detail that a new hook must keep exactly (brand/retailer, product/category, offer, price/value, date/deadline, promotion, location, named entity). Use "none" only when no such detail is present. Do not infer facts that are not in the hook.

Hooks:
${hooks.map((h, i) => `${i + 1}. ${h.text}`).join("\n")}

Return JSON: [{"text":"","structure":"","psychological_trigger":"","format":"","emotional_mechanism":"","specificity":"","information_density":"","audience_appeal":"","winning_mechanism":""}]`,
Return JSON: [{"text":"","structure":"","psychological_trigger":"","emotional_trigger":"","format":"","emotional_mechanism":"","audience_appeal":"","specificity":"","information_density":"","novelty_surprise":"","situation":"","voice_tone":"","product_category":"","named_entities":"","offer_or_promotion":"","price_or_value":"","date_or_deadline":"","urgency_or_fomo":"","context_to_preserve":"","winning_mechanism":""}]`,
    },
  ]);
}

/** Generate original hook variants patterned on (never copied from) winners. */
export async function generateHookVariants(input: GenerateHooksInput, provider?: AiProvider): Promise<GeneratedHook[]> {
  const ai = provider ?? getAiProvider();
  const targetBrand = input.brandContext?.trim() || input.product;
  const analysis = input.winners.length ? await analyzeHookStructure(input.winners, ai) : [];
  const analysis = input.winners.length ? await analyzeHookStructure(input.winners, ai, input.brandMode === "winner" ? null : targetBrand) : [];
  const categories = input.categories.length ? input.categories : Object.keys(CATEGORY_BRIEFS);

  const raw = await ai.completeJson<{ hooks: GeneratedHook[] } | GeneratedHook[]>([
    SYSTEM,
    {
      role: "user",
      content: `Create ${input.count} original hooks.
Creative brief (facts to preserve): product=${input.product}${input.productUrl ? ` (${input.productUrl})` : ""}; audience=${input.audience || "the audience implied by the product only"}; platform=${input.platform}; content style=${input.contentStyle}.
Creative brief (facts to preserve): product=${input.product}${input.productUrl ? ` (${input.productUrl})` : ""}; target brand/project=${targetBrand}; audience=${input.audience || "the audience implied by the product only"}; platform=${input.platform}; content style=${input.contentStyle}.

Brand instruction: ${input.brandMode === "winner" ? "Keep the winner's named brand/retailer and all compatible commercial facts exactly." : `Adapt the hook for ${targetBrand}. Replace any source brand/retailer with ${targetBrand}; never mention the source brand. Do not falsely carry a source-brand-only price, discount, promotion, availability, date, or deadline over to ${targetBrand}. Keep it only when the brief independently confirms it applies to ${targetBrand}; otherwise use the product, audience, scenario, and mechanism without inventing a commercial claim.`}

Match ${input.platform} specifically. If it includes both TikTok and Instagram Reels, each hook must work on both rather than assuming TikTok conventions. Let ${input.contentStyle} drive voice and staging: UGC is credible creator experience; product-focused foregrounds concrete behavior/payoff; storytelling starts in a scene/turning point; testimonial is first-hand evidence; problem/solution starts with friction before relief.

Requested categories must use distinct mechanisms:
${categories.map((category) => `- ${category}: ${CATEGORY_BRIEFS[category] ?? "a distinct angle appropriate to this label"}`).join("\n")}

${analysis.length ? `Winner mechanisms only—never reuse wording, syntax, named details, or rhythm:
${analysis.map((item, index) => `${index + 1}. ${item.winning_mechanism}; trigger=${item.psychological_trigger}; format=${item.format}; specificity=${item.specificity}; density=${item.information_density}; audience=${item.audience_appeal}`).join("\n")}` : "No winners supplied: invent mechanisms grounded in this brief, not stock viral phrases."}
${analysis.length ? `Creative and commercial DNA from winners. Reuse the mechanism, but write a fresh construction. The listed context is factual and must remain unchanged; do not substitute another retailer, brand, product, price, promotion, date, deadline, or named entity:
${analysis.map((item, index) => `${index + 1}. mechanism=${item.winning_mechanism}; trigger=${item.psychological_trigger}; format=${item.format}; scenario=${item.situation}; tone=${item.voice_tone}; audience=${item.audience_appeal}; context to preserve exactly=${item.context_to_preserve}; entities=${item.named_entities}; product=${item.product_category}; offer=${item.offer_or_promotion}; price/value=${item.price_or_value}; date/deadline=${item.date_or_deadline}; urgency=${item.urgency_or_fomo}; novelty=${item.novelty_surprise}`).join("\n")}` : "No winners supplied: invent mechanisms grounded in this brief, not stock viral phrases."}

Before returning, verify each hook is concrete to this audience/product, platform/style-appropriate, category-distinct, and not generic or a close paraphrase. Return JSON: {"hooks":[{"text":"","category":"","structure":"","emotional_trigger":"","score":0,"rationale":""}]}. Rationale names the concrete mechanism, audience relevance, and platform/style fit. Score conservatively: 85+ needs a specific credible high-density stopping mechanism; generic/interchangeable/copied-sounding hooks score below 60.`,
    },
  ]);

  const list = Array.isArray(raw) ? raw : (raw.hooks ?? []);
  return list
    .map((hook) => ({
      text: String(hook.text ?? "").trim(),
      category: String(hook.category ?? categories[0] ?? "Curiosity"),
      structure: String(hook.structure ?? ""),
      emotional_trigger: String(hook.emotional_trigger ?? ""),
      score: Number.isFinite(Number(hook.score)) ? Math.max(0, Math.min(100, Number(hook.score))) : 0,
      rationale: String(hook.rationale ?? "").trim(),
    }))
    .filter((hook) => hook.text.length > 0 && !hasWinnerPhraseOverlap(hook.text, input.winners))
    .slice(0, input.count);
}

/** Public entry point used by the server function. */
export async function generateHooks(input: GenerateHooksInput, provider?: AiProvider) {
  return generateHookVariants(input, provider);
}

/** Re-score existing hooks against the actual audience/platform, not generic viral conventions. */
export async function scoreHooks(texts: string[], audience: string, platform: string, provider?: AiProvider) {
  if (texts.length === 0) return [];
  const ai = provider ?? getAiProvider();
  const raw = await ai.completeJson<{ scores: Array<{ text: string; score: number; rationale: string }> }>([
    SYSTEM,
    {
      role: "user",
      content: `Score each hook for stopping power on ${platform} for this actual audience: ${audience}.
Assess concrete audience recognition, specificity, information density, credible emotional tension, and platform fit. Penalize generic phrases, unsupported superlatives, interchangeable wording, forced TikTok slang, vague curiosity, and hooks that could sell any product. Do not reward brevity by itself. Be conservative: 85+ requires a clear concrete stopping mechanism; generic hooks should be below 60.
Hooks:
${texts.map((t, i) => `${i + 1}. ${t}`).join("\n")}
Return JSON: {"scores":[{"text":"","score":0,"rationale":""}]}. Each rationale must identify the specific strength or weakness that drove the score.`,
    },
  ]);
  return (raw.scores ?? []).map((item) => ({
    text: String(item.text ?? "").trim(),
    score: Number.isFinite(Number(item.score)) ? Math.max(0, Math.min(100, Number(item.score))) : 0,
    rationale: String(item.rationale ?? "").trim(),
  }));
}
