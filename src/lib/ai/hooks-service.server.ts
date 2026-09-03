
  product: string;
  brandContext?: string | null;
  brandMode?: "winner" | "project" | "custom";
  productUrl?: string | null;
/** Analyze the structural DNA of a set of winning hooks. */
export async function analyzeHookStructure(hooks: WinningHookInput[], provider?: AiProvider): Promise<HookAnalysis[]> {
export async function analyzeHookStructure(
  hooks: WinningHookInput[],
  provider?: AiProvider,
  brandContext?: string | null,
): Promise<HookAnalysis[]> {
  if (hooks.length === 0) return [];
      role: "user",
      content: `Analyze these proven hooks without returning a copyable rewrite. Separate creative mechanism from factual/commercial context.
      content: `Analyze these proven hooks without returning a copyable rewrite. Separate creative mechanism from factual/commercial context.${brandContext ? ` The target project brand/product is ${brandContext}. Identify which source brand facts would need adaptation rather than preservation.` : ""}

  const ai = provider ?? getAiProvider();
  const targetBrand = input.brandContext?.trim() || input.product;
  const analysis = input.winners.length ? await analyzeHookStructure(input.winners, ai) : [];
  const analysis = input.winners.length ? await analyzeHookStructure(input.winners, ai, input.brandMode === "winner" ? null : targetBrand) : [];
  const categories = input.categories.length ? input.categories : Object.keys(CATEGORY_BRIEFS);
      content: `Create ${input.count} original hooks.
Creative brief (facts to preserve): product=${input.product}${input.productUrl ? ` (${input.productUrl})` : ""}; audience=${input.audience || "the audience implied by the product only"}; platform=${input.platform}; content style=${input.contentStyle}.
Creative brief (facts to preserve): product=${input.product}${input.productUrl ? ` (${input.productUrl})` : ""}; target brand/project=${targetBrand}; audience=${input.audience || "the audience implied by the product only"}; platform=${input.platform}; content style=${input.contentStyle}.

Brand instruction: ${input.brandMode === "winner" ? "Keep the winner's named brand/retailer and all compatible commercial facts exactly." : `Adapt the hook for ${targetBrand}. Replace any source brand/retailer with ${targetBrand}; never mention the source brand. Do not falsely carry a source-brand-only price, discount, promotion, availability, date, or deadline over to ${targetBrand}. Keep it only when the brief independently confirms it applies to ${targetBrand}; otherwise use the product, audience, scenario, and mechanism without inventing a commercial claim.`}

  psychological_trigger: string;
  emotional_trigger: string;
  format: string;

For each, identify: structure (functional placeholders), psychological_trigger, format, emotional_mechanism, audience_appeal, specificity, information_density, novelty_surprise, situation, voice_tone, product_category, named_entities, offer_or_promotion, price_or_value, date_or_deadline, urgency_or_fomo, context_to_preserve, and winning_mechanism.
For each, identify: structure (functional placeholders), psychological_trigger, emotional_trigger, format, emotional_mechanism, audience_appeal, specificity, information_density, novelty_surprise, situation, voice_tone, product_category, named_entities, offer_or_promotion, price_or_value, date_or_deadline, urgency_or_fomo, context_to_preserve, and winning_mechanism.


Return JSON: [{"text":"","structure":"","psychological_trigger":"","format":"","emotional_mechanism":"","audience_appeal":"","specificity":"","information_density":"","novelty_surprise":"","situation":"","voice_tone":"","product_category":"","named_entities":"","offer_or_promotion":"","price_or_value":"","date_or_deadline":"","urgency_or_fomo":"","context_to_preserve":"","winning_mechanism":""}]`,
Return JSON: [{"text":"","structure":"","psychological_trigger":"","emotional_trigger":"","format":"","emotional_mechanism":"","audience_appeal":"","specificity":"","information_density":"","novelty_surprise":"","situation":"","voice_tone":"","product_category":"","named_entities":"","offer_or_promotion":"","price_or_value":"","date_or_deadline":"","urgency_or_fomo":"","context_to_preserve":"","winning_mechanism":""}]`,
    },
