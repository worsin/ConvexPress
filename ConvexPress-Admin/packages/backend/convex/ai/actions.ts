"use node";

/** AI provider connection checks. Canonical document proposals live in canonicalDocuments/ai. */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { aiFailureMessage } from "../../lib/aiFailure";

// ─── Settings Connection Tests ──────────────────────────────────────────────

export const testProviderConnection = action({
  args: {},
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx): Promise<{ ok: boolean; message: string }> => {
    await ctx.runQuery(internal.settings.internals.requireManageOptionsInternal);

    try {
      const result = await ctx.runAction(internal.ai.internals.generateWithClaude, {
        systemPrompt: "You are a connection test. Reply with exactly: ok",
        userPrompt: "Return ok.",
        maxTokens: 8,
        task: "default",
      });
      return {
        ok: result.trim().length > 0,
        message: "AI provider connection successful.",
      };
    } catch (error) {
      return {
        ok: false,
        message: aiFailureMessage(error, "AI provider connection failed. Check your provider credentials and model in Settings > AI."),
      };
    }
  },
});

export const testTavilyConnection = action({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; message: string }> => {
    await ctx.runQuery(internal.settings.internals.requireManageOptionsInternal);

    try {
      await ctx.runAction(internal.ai.internals.researchTopic, {
        query: "ConvexPress connection test",
        maxResults: 1,
      });
      return { ok: true, message: "Tavily connection successful." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Tavily connection failed.",
      };
    }
  },
});
