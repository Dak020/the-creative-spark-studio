

type HookAnalysis = { text: string; structure: string; psychological_trigger: string; format: string; emotional_mechanism: string; specificity: string; information_density: string; audience_appeal: string; winning_mechanism: string };
type HookAnalysis = {
  text: string;
  structure: string;
  psychological_trigger: string;
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


Originality is mandatory: never copy a winner, substitute synonyms into it, or reuse three or more meaningful words in sequence. Be concrete: prefer a real situation, pain, result, constraint, observation, or product behavior to generic phrases such as "game changer," "you need this," "secret," "obsessed," or "this changed everything." High scores require earned specificity, tension, relevance, and information density.
Originality is mandatory: never copy a winner, preserve its sentence template, or substitute synonyms into it. Preserve factual/commercial context separately from wording: when a winner names a brand, retailer, product, offer, price, discount, date, deadline, promotion, location, or other named entity, retain that same fact unless the user explicitly asks for a different variation. Never invent or swap commercial facts. Be concrete: prefer a real situation, pain, result, constraint, observation, or product behavior to generic phrases such as "game changer," "you need this," "secret," "obsessed," or "this changed everything." High scores require earned specificity, tension, relevance, and information density.

    const winner = words(text).join(" ");
    // Three- and four-word overlaps may be necessary factual context (for
    // example, a retailer plus product). Guard against copied phrasing instead.
    return [4, 3].some((size) => candidateWords.some((_, index) => winner.includes(candidateWords.slice(index, index + size).join(" "))));
    return [6, 5].some((size) => candidateWords.some((_, index) => winner.includes(candidateWords.slice(index, index + size).join(" "))));
  });
      role: "user",
      content: `Analyze these proven hooks without returning a copyable rewrite. For each, identify structure (with functional placeholders), psychological_trigger, format, emotional_mechanism, specificity, information_density, audience_appeal, and winning_mechanism—a concise causal explanation with no distinctive wording from the hook.
      content: `Analyze these proven hooks without returning a copyable rewrite. Separate creative mechanism from factual/commercial context.

For each, identify: structure (functional placeholders), psychological_trigger, format, emotional_mechanism, audience_appeal, specificity, information_density, novelty_surprise, situation, voice_tone, product_category, named_entities, offer_or_promotion, price_or_value, date_or_deadline, urgency_or_fomo, context_to_preserve, and winning_mechanism.

context_to_preserve must list every important factual commercial detail that a new hook must keep exactly (brand/retailer, product/category, offer, price/value, date/deadline, promotion, location, named entity). Use "none" only when no such detail is present. Do not infer facts that are not in the hook.

Hooks:

Return JSON: [{"text":"","structure":"","psychological_trigger":"","format":"","emotional_mechanism":"","specificity":"","information_density":"","audience_appeal":"","winning_mechanism":""}]`,
Return JSON: [{"text":"","structure":"","psychological_trigger":"","format":"","emotional_mechanism":"","audience_appeal":"","specificity":"","information_density":"","novelty_surprise":"","situation":"","voice_tone":"","product_category":"","named_entities":"","offer_or_promotion":"","price_or_value":"","date_or_deadline":"","urgency_or_fomo":"","context_to_preserve":"","winning_mechanism":""}]`,
    },

${analysis.length ? `Winner mechanisms only—never reuse wording, syntax, named details, or rhythm:
${analysis.map((item, index) => `${index + 1}. ${item.winning_mechanism}; trigger=${item.psychological_trigger}; format=${item.format}; specificity=${item.specificity}; density=${item.information_density}; audience=${item.audience_appeal}`).join("\n")}` : "No winners supplied: invent mechanisms grounded in this brief, not stock viral phrases."}
${analysis.length ? `Creative and commercial DNA from winners. Reuse the mechanism, but write a fresh construction. The listed context is factual and must remain unchanged; do not substitute another retailer, brand, product, price, promotion, date, deadline, or named entity:
${analysis.map((item, index) => `${index + 1}. mechanism=${item.winning_mechanism}; trigger=${item.psychological_trigger}; format=${item.format}; scenario=${item.situation}; tone=${item.voice_tone}; audience=${item.audience_appeal}; context to preserve exactly=${item.context_to_preserve}; entities=${item.named_entities}; product=${item.product_category}; offer=${item.offer_or_promotion}; price/value=${item.price_or_value}; date/deadline=${item.date_or_deadline}; urgency=${item.urgency_or_fomo}; novelty=${item.novelty_surprise}`).join("\n")}` : "No winners supplied: invent mechanisms grounded in this brief, not stock viral phrases."}
