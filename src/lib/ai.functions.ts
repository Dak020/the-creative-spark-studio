import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GenerateHooksSchema = z.object({
  product: z.string().trim().min(1).max(200),
  productUrl: z.string().trim().max(500).nullable().optional(),
  audience: z.string().trim().max(500).default(""),
  platform: z.string().trim().max(30).default("both"),
  contentStyle: z.string().trim().max(50).default("ugc"),
  count: z.number().int().min(1).max(25).default(10),
  categories: z.array(z.string().max(40)).max(10).default([]),
  winnerIds: z.array(z.string().uuid()).max(20).default([]),
  projectId: z.string().uuid().nullable().optional(),
});

export const generateHooksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateHooksSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let winners: Array<{
      text: string;
      category: string | null;
      structure: string | null;
      emotional_trigger: string | null;
      performance_score: number | null;
    }> = [];

    if (data.winnerIds.length > 0) {
      const { data: rows, error } = await supabase
        .from("hooks")
        .select("text, category, structure, emotional_trigger, performance_score")
        .in("id", data.winnerIds);
      if (error) throw new Error(error.message);
      winners = rows ?? [];
    }

    const { generateHooks } = await import("./ai/hooks-service.server");
    const { getProviderForUser } = await import("./ai/provider.server");
    const provider = await getProviderForUser(userId);
    const generated = await generateHooks({
      product: data.product,
      productUrl: data.productUrl ?? null,
      audience: data.audience,
      platform: data.platform,
      contentStyle: data.contentStyle,
      count: data.count,
      categories: data.categories,
      winners,
    });

    if (generated.length === 0) return { variants: [] };

    const { data: inserted, error: insErr } = await supabase
      .from("hook_variants")
      .insert(
        generated.map((g) => ({
          user_id: userId,
          project_id: data.projectId ?? null,
          parent_hook_id: null,
          text: g.text,
          category: g.category,
          structure: g.structure,
          emotional_trigger: g.emotional_trigger,
          score: g.score,
          rationale: g.rationale,
        })),
      )
      .select();
    if (insErr) throw new Error(insErr.message);

    return { variants: inserted ?? [] };
  });

const ScoreSchema = z.object({
  texts: z.array(z.string().min(1).max(300)).min(1).max(25),
  audience: z.string().max(500).default(""),
  platform: z.string().max(30).default("both"),
});

export const scoreHooksFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScoreSchema.parse(input))
  .handler(async ({ data }) => {
    const { scoreHooks } = await import("./ai/hooks-service.server");
    return { scores: await scoreHooks(data.texts, data.audience, data.platform) };
  });
