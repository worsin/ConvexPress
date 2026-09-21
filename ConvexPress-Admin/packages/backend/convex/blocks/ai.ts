"use node";

/**
 * Block-editor AI actions.
 *
 * These power the "✨ Generate page" button and the per-block AI menu in the
 * admin BlockOutline. Each action:
 *
 *   1. builds a system prompt from the block catalog (single source of truth)
 *   2. calls `internal.ai.internals.generateWithClaude` (provider-configurable
 *      via Settings > AI — OpenRouter / Anthropic / OpenAI)
 *   3. parses the JSON response
 *   4. validates against the block schema/envelope
 *   5. writes via `internal.blocks.internalMutations.*` (which run on
 *      Convex runtime, so the action can call them safely)
 *
 * Requires blocks.ai plus current document edit authority. Provider results
 * are rechecked before returning; writes recheck authority atomically.
 */

import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { StoredBlock } from "./helpers";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import {
  buildPageGenerationPrompt,
  buildBlockRegenerationPrompt,
  extractJson,
  getCatalogEntry,
  refinementForImprovePreset,
  validateAttrsForCatalogEntry,
} from "./aiPromptBuilder";

const replaceBlocksMutation = makeFunctionReference<"mutation", { postId: Id<"posts">; blocks: StoredBlock[]; expectedRevision: number }, { postId: Id<"posts">; revision: number }>("blocks/mutations:replaceBlocksFromAi");

const updateAttrsMutation = makeFunctionReference<"mutation", { postId: Id<"posts">; blockId: string; attrs: Record<string, unknown>; expectedRevision: number }, { postId: Id<"posts">; revision: number }>("blocks/mutations:updateBlockAttrsFromAi");

const MAX_TOKENS_PAGE = 4096;
const MAX_TOKENS_BLOCK = 1500;
const MAX_AI_BLOCKS = 60;
const AI_SINGLETON_BLOCKS = new Set(["core/hero", "core/hero-text-only", "core/hero-split"]);

function makeBlockId() {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getDisabledBlockNames(ctx: { runQuery: Function }) {
  const settings = await ctx.runQuery(internal.settings.internals.getInternal, {
    section: "blocks",
  });
  const names = (settings as any)?.disabledBlockNames;
  return Array.isArray(names)
    ? names.filter((name): name is string => typeof name === "string")
    : [];
}

/**
 * Validate + normalize a single block envelope coming back from the LLM.
 */
function normalizeBlockFromAi(raw: unknown): {
  id: string;
  name: string;
  version: number;
  attrs: Record<string, unknown>;
  innerBlocks?: any[];
} | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  if (r.innerBlocks !== undefined && (!Array.isArray(r.innerBlocks) || r.innerBlocks.length > 0)) {
    throw new ConvexError({ code: "PROVIDER_ERROR", message: "AI returned nested blocks. Generate a flat block list; nested authoring is not supported yet." });
  }
  if (typeof r.name !== "string") return null;
  const catalog = getCatalogEntry(r.name);
  if (!catalog) return null;
  const attrs = (r.attrs && typeof r.attrs === "object" && !Array.isArray(r.attrs))
    ? r.attrs as Record<string, unknown>
    : {};
  const validated = validateAttrsForCatalogEntry(catalog.name, attrs);
  if (!validated.ok) return null;
  return {
    id: makeBlockId(),
    name: r.name,
    version: 1,
    attrs: validated.attrs,
  };
}

function catalogAttrsArePlausible(blockName: string, attrs: Record<string, unknown>) {
  const result = validateAttrsForCatalogEntry(blockName, attrs);
  return result.ok;
}

function findBlockById(blocks: any[], blockId: string): any | null {
  for (const block of blocks) {
    if (block?.id === blockId) return block;
    if (Array.isArray(block?.innerBlocks)) {
      const found = findBlockById(block.innerBlocks, blockId);
      if (found) return found;
    }
  }
  return null;
}

function enforceAiBlockPolicy(blocks: NonNullable<ReturnType<typeof normalizeBlockFromAi>>[]) {
  const seenSingletons = new Set<string>();
  const accepted = [];
  for (const block of blocks.slice(0, MAX_AI_BLOCKS)) {
    if (AI_SINGLETON_BLOCKS.has(block.name)) {
      if (seenSingletons.has(block.name)) continue;
      seenSingletons.add(block.name);
    }
    accepted.push(block);
  }
  return accepted;
}

async function generateBlocksForDocument(
  ctx: {
    runQuery: Function;
    runAction: Function;
  },
  args: {
    postId: any;
    prompt: string;
    pageType?: string;
  },
) {
  const doc: any = await ctx.runQuery(
    (internal as any).blocks.queries.getEditableDocumentForAi,
    {
      postId: args.postId,
    },
  );
  if (!doc) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Content not found" });
  }

  const disabledBlockNames = await getDisabledBlockNames(ctx);
  const disabledBlocks = new Set(disabledBlockNames);

  const systemPrompt = buildPageGenerationPrompt({
    pageType: args.pageType ?? doc.type,
    pageTitle: doc.title,
    disabledBlockNames,
  });

  const llmResponse: string = await ctx.runAction(
    internal.ai.internals.generateWithClaude,
    {
      systemPrompt,
      userPrompt: args.prompt,
      maxTokens: MAX_TOKENS_PAGE,
      task: "pageGeneration",
    },
  );

  let parsed: unknown;
  try {
    parsed = extractJson(llmResponse);
  } catch (err) {
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: `AI returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  if (!Array.isArray(parsed)) {
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: "AI did not return a block array",
    });
  }

  const blocks = enforceAiBlockPolicy(parsed
    .map(normalizeBlockFromAi)
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .filter((block) => !disabledBlocks.has(block.name)));

  if (blocks.length === 0) {
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: "AI did not return any valid blocks",
    });
  }

  return { doc, blocks };
}

async function getEditableDocumentForAi(
  ctx: { runQuery: Function },
  postId: unknown,
) {
  const doc: any = await ctx.runQuery(
    (internal as any).blocks.queries.getEditableDocumentForAi,
    {
      postId,
    },
  );
  if (!doc) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Content not found" });
  }
  return doc;
}

async function recheckProposal(ctx: { runQuery: Function }, postId: unknown, names: string[]) {
  await getEditableDocumentForAi(ctx, postId);
  const disabled = new Set(await getDisabledBlockNames(ctx));
  if (names.some(name => disabled.has(name))) throw new ConvexError({ code: "VALIDATION_ERROR", message: "Block availability changed during generation. Generate again using the current catalog." });
}

export const generatePageDraft = action({
  args: {
    postId: v.id("posts"),
    prompt: v.string(),
    pageType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { blocks } = await generateBlocksForDocument(ctx, args);
    await recheckProposal(ctx, args.postId, blocks.map(block => block.name));
    return { blocks, blocksGenerated: blocks.length };
  },
});

/** Generate first, then apply one revision-checked transaction: never clear before insert. */
export const generatePage = action({
  args: {
    postId: v.id("posts"),
    prompt: v.string(),
    pageType: v.optional(v.string()),
    expectedRevision: v.optional(v.number()),
    strategy: v.optional(v.union(v.literal("replace"), v.literal("append"))),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ blocksGenerated: number; revision: number }> => {
    const { doc, blocks } = await generateBlocksForDocument(ctx, args);
    const nextBlocks = args.strategy === "append" ? [...(doc.blocks ?? []), ...blocks] : blocks;
    const result: { postId: string; revision: number } = await ctx.runMutation(
      replaceBlocksMutation,
      {
        postId: args.postId,
        blocks: nextBlocks,
        expectedRevision: args.expectedRevision ?? doc.blocksRevision ?? 0,
      },
    );
    return { blocksGenerated: blocks.length, revision: result.revision };
  },
});

/**
 * Regenerate the attrs for a single block.
 *
 * Used by the per-block "✨ Regenerate" / "Improve" actions in BlockOutline.
 * Returns the new attrs (caller decides whether to apply).
 */
export const regenerateBlock = action({
  args: {
    postId: v.id("posts"),
    blockId: v.string(),
    refinement: v.optional(v.string()),
    expectedRevision: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ attrs: Record<string, unknown>; revision: number }> => {
    const doc = await getEditableDocumentForAi(ctx, args.postId);

    const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
    const block = findBlockById(blocks, args.blockId);
    if (!block) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Block not found" });
    }
    if ((await getDisabledBlockNames(ctx)).includes(block.name)) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "AI generation is disabled for this block type." });
    }

    const systemPrompt = buildBlockRegenerationPrompt({
      blockName: block.name,
      currentAttrs: block.attrs ?? {},
      pageContext: `Page title: ${doc.title}`,
      refinement: args.refinement,
    });

    const llmResponse: string = await ctx.runAction(
      internal.ai.internals.generateWithClaude,
      {
        systemPrompt,
        userPrompt: "Rewrite the block per the instruction.",
        maxTokens: MAX_TOKENS_BLOCK,
        task: "blockEditing",
      },
    );

    let parsed: unknown;
    try {
      parsed = extractJson(llmResponse);
    } catch (err) {
      throw new ConvexError({
        code: "PROVIDER_ERROR",
        message: `AI returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ConvexError({
        code: "PROVIDER_ERROR",
        message: "AI did not return an attrs object",
      });
    }
    if (!catalogAttrsArePlausible(block.name, parsed as Record<string, unknown>)) {
      throw new ConvexError({
        code: "PROVIDER_ERROR",
        message: "AI returned attrs that do not match the block contract",
      });
    }

    const result: { postId: string; revision: number } = await ctx.runMutation(
      updateAttrsMutation,
      {
        postId: args.postId,
        blockId: args.blockId,
        attrs: parsed as Record<string, unknown>,
        expectedRevision: args.expectedRevision ?? doc.blocksRevision ?? 0,
      },
    );

    return { attrs: parsed as Record<string, unknown>, revision: result.revision };
  },
});

/**
 * Improve a single block using a preset tone/length adjustment.
 *
 * Convenience wrapper over `regenerateBlock` that maps the preset to a
 * refinement instruction.
 */
export const improveBlock = action({
  args: {
    postId: v.id("posts"),
    blockId: v.string(),
    preset: v.union(
      v.literal("shorter"),
      v.literal("longer"),
      v.literal("formal"),
      v.literal("casual"),
      v.literal("technical"),
      v.literal("playful"),
    ),
    expectedRevision: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ attrs: Record<string, unknown>; revision: number }> => {
    const refinement = refinementForImprovePreset(args.preset);
    // Cast through any — api.blocks.ai is freshly added and the generated
    // types regenerate on next deploy.
    return ctx.runAction((api as any).blocks.ai.regenerateBlock, {
      postId: args.postId,
      blockId: args.blockId,
      refinement,
      expectedRevision: args.expectedRevision,
    });
  },
});

/**
 * Generate N variants of a block without applying them — caller picks.
 *
 * Used by the "Variants" per-block action. Returns N candidate attrs arrays;
 * the UI shows them as options.
 */
export const generateVariants = action({
  args: {
    postId: v.id("posts"),
    blockId: v.string(),
    count: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ variants: Array<Record<string, unknown>> }> => {
    const count = Math.min(5, Math.max(1, args.count ?? 3));

    const doc = await getEditableDocumentForAi(ctx, args.postId);

    const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
    const block = findBlockById(blocks, args.blockId);
    if (!block) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Block not found" });
    }
    if ((await getDisabledBlockNames(ctx)).includes(block.name)) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "AI generation is disabled for this block type." });
    }

    const variants: Array<Record<string, unknown>> = [];
    // Sequential is simpler than streaming for now — N short calls.
    for (let i = 0; i < count; i++) {
      await recheckProposal(ctx, args.postId, [block.name]);
      const systemPrompt = buildBlockRegenerationPrompt({
        blockName: block.name,
        currentAttrs: block.attrs ?? {},
        pageContext: `Page title: ${doc.title}`,
        refinement: `Produce variant #${i + 1} of ${count}. Each variant should feel distinct from the others while keeping the block's intent.`,
      });
      const llmResponse: string = await ctx.runAction(
        internal.ai.internals.generateWithClaude,
        { systemPrompt, userPrompt: "Generate this variant.", maxTokens: MAX_TOKENS_BLOCK, task: "blockEditing" },
      );
      try {
        const parsed = extractJson(llmResponse);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const attrs = parsed as Record<string, unknown>;
          if (catalogAttrsArePlausible(block.name, attrs)) {
            variants.push(attrs);
          }
        }
      } catch {
        // Skip this variant on parse failure.
      }
    }

    if (variants.length === 0) {
      throw new ConvexError({
        code: "PROVIDER_ERROR",
        message: "AI did not produce any usable variants",
      });
    }

    await recheckProposal(ctx, args.postId, [block.name]);
    return { variants };
  },
});

/**
 * Swap a block from one type to another, asking the LLM to map content where
 * it can. The mutation is a separate step — this only proposes new attrs.
 */
export const swapBlockType = action({
  args: {
    postId: v.id("posts"),
    blockId: v.string(),
    targetBlockName: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ attrs: Record<string, unknown>; targetBlockName: string }> => {
    const target = getCatalogEntry(args.targetBlockName);
    if (!target) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Unknown target block type" });
    }
    const disabledBlockNames = await getDisabledBlockNames(ctx);
    if (disabledBlockNames.includes(args.targetBlockName)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "That block type is disabled.",
      });
    }

    const doc = await getEditableDocumentForAi(ctx, args.postId);

    const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
    const block = findBlockById(blocks, args.blockId);
    if (!block) throw new ConvexError({ code: "NOT_FOUND", message: "Block not found" });

    const sourceCatalog = getCatalogEntry(block.name);

    const systemPrompt = [
      "You are converting a content block from one type to another for ConvexPress.",
      "Map fields where the meaning carries over. Where the target type needs new fields the source doesn't have, generate sensible content based on the source.",
      "Return ONLY a JSON object of the new target block's attrs, wrapped in a ```json code fence.",
      "",
      `## SOURCE BLOCK TYPE\n${block.name} — ${sourceCatalog?.title ?? ""}`,
      "Current attrs:",
      "```json",
      JSON.stringify(block.attrs ?? {}, null, 2),
      "```",
      "",
      `## TARGET BLOCK TYPE\n${target.name} — ${target.title}\n${target.description}`,
      "FIELDS:",
      ...target.fields.map((f) => `  - ${f.name}: ${f.type}${f.max ? ` (max ${f.max})` : ""}`),
      "",
      "## OUTPUT",
      "```json",
      "{ /* target attrs */ }",
      "```",
    ].join("\n");

    const llmResponse: string = await ctx.runAction(
      internal.ai.internals.generateWithClaude,
      {
        systemPrompt,
        userPrompt: "Convert the block.",
        maxTokens: MAX_TOKENS_BLOCK,
        task: "blockEditing",
      },
    );

    let parsed: unknown;
    try {
      parsed = extractJson(llmResponse);
    } catch (err) {
      throw new ConvexError({
        code: "PROVIDER_ERROR",
        message: `AI returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ConvexError({
        code: "PROVIDER_ERROR",
        message: "AI did not return an attrs object",
      });
    }
    if (!catalogAttrsArePlausible(args.targetBlockName, parsed as Record<string, unknown>)) {
      throw new ConvexError({
        code: "PROVIDER_ERROR",
        message: "AI returned attrs that do not match the target block contract",
      });
    }

    await recheckProposal(ctx, args.postId, [args.targetBlockName]);
    return { attrs: parsed as Record<string, unknown>, targetBlockName: args.targetBlockName };
  },
});
