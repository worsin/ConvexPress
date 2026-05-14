"use node";

import { ConvexError } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { resolveServiceKey } from "../helpers/serviceKeys";
import { extractRecipeFromImageArgs } from "./validators";
import { requirePluginEnabled } from "../helpers/plugins";

async function resolveAiSettings(ctx: {
  runQuery: (queryRef: any, args?: any) => Promise<any>;
}) {
  const settings = (await ctx.runQuery(internal.settings.internals.getInternal, {
    section: "ai",
  })) as Record<string, unknown> | null;

  const provider = ((settings?.provider as string) || "openrouter") as
    | "openrouter"
    | "anthropic";

  const envVarName =
    provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENROUTER_API_KEY";

  const fallbackModel =
    provider === "anthropic" ? "claude-opus-4-7" : "anthropic/claude-opus-4.7";

  return {
    provider,
    envVarName,
    apiKey: resolveServiceKey(settings, "apiKey", envVarName) ?? "",
    defaultModel: (settings?.defaultModel as string) || fallbackModel,
  };
}

function parseJsonResponse(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(cleaned) as {
    title?: string;
    excerpt?: string;
    description?: string;
    prepMinutes?: number;
    cookMinutes?: number;
    totalMinutes?: number;
    servings?: string;
    yieldText?: string;
    difficulty?: "easy" | "medium" | "hard";
    ingredients?: string[];
    instructions?: string[];
    notes?: string;
    categorySuggestions?: string[];
    scannedText?: string;
  };
}

async function extractWithAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  mimeType: string,
  base64Data: string,
) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 1800,
    system:
      "You extract structured recipe data from photographed or scanned recipe cards. Return valid JSON only.",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as any,
              data: base64Data,
            },
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || !("text" in textBlock)) {
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: "The AI provider did not return recipe data",
    });
  }

  return textBlock.text;
}

async function extractWithOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  mimeType: string,
  base64Data: string,
) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://convexpress.com",
      "X-Title": "ConvexPress Recipes",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You extract structured recipe data from photographed or scanned recipe cards. Return valid JSON only.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1800,
    }),
  });

  if (!response.ok) {
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: `OpenRouter vision request failed (${response.status})`,
    });
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const extractRecipeFromImage = action({
  args: extractRecipeFromImageArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "recipes");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const media = (await ctx.runQuery(api.media.queries.get, {
      mediaId: args.mediaId,
    })) as
      | {
          url?: string;
          mimeType?: string;
          title?: string;
        }
      | null;

    if (!media?.url || !media.mimeType?.startsWith("image/")) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Select an image from the media library first",
      });
    }

    const { provider, apiKey, defaultModel } = await resolveAiSettings(ctx);
    if (!apiKey) {
      throw new ConvexError({
        code: "CONFIGURATION_ERROR",
        message: "AI provider settings are not configured",
      });
    }

    const imageResponse = await fetch(media.url);
    if (!imageResponse.ok) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "The recipe image could not be fetched from the media library",
      });
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const base64Data = buffer.toString("base64");
    const prompt = `Read the photographed or scanned recipe image and extract the recipe into this exact JSON shape:
{
  "title": string,
  "excerpt": string,
  "description": string,
  "prepMinutes": number | null,
  "cookMinutes": number | null,
  "totalMinutes": number | null,
  "servings": string,
  "yieldText": string,
  "difficulty": "easy" | "medium" | "hard" | null,
  "ingredients": string[],
  "instructions": string[],
  "notes": string,
  "categorySuggestions": string[],
  "scannedText": string
}

Rules:
- Preserve the recipe faithfully from the image.
- If a field is missing, return null for numbers and an empty string or empty array for text/list fields.
- Convert ingredient and instruction lists into clean strings.
- Do not invent nutrition data.
- Return JSON only, with no markdown fences.`;

    const raw =
      provider === "openrouter"
        ? await extractWithOpenRouter(
            apiKey,
            defaultModel,
            prompt,
            media.mimeType,
            base64Data,
          )
        : await extractWithAnthropic(
            apiKey,
            defaultModel,
            prompt,
            media.mimeType,
            base64Data,
          );

    const parsed = parseJsonResponse(raw);
    return {
      ...parsed,
      prepMinutes: parsed.prepMinutes ?? undefined,
      cookMinutes: parsed.cookMinutes ?? undefined,
      totalMinutes: parsed.totalMinutes ?? undefined,
      scanMediaId: args.mediaId,
      aiExtractedFromScan: true,
    };
  },
});
