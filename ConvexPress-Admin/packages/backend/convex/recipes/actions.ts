"use node";

import { ConvexError } from "convex/values";
import { action, type ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { resolveServiceKeyAsync } from "../helpers/serviceKeys";
import { extractRecipeFromImageArgs } from "./validators";
import { requirePluginEnabled } from "../helpers/plugins";

import { v } from "convex/values";
type AiProvider = "openrouter" | "anthropic" | "openai";

function envVarForProvider(provider: AiProvider): string {
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "openai") return "OPENAI_API_KEY";
  return "OPENROUTER_API_KEY";
}

function fallbackModelForProvider(provider: AiProvider): string {
  if (provider === "anthropic") return "claude-opus-4-7";
  if (provider === "openai") return "gpt-5.5";
  return "anthropic/claude-opus-4.7";
}

async function resolveAiSettings(ctx: Pick<ActionCtx, "runQuery">) {
  const settings = (await ctx.runQuery(internal.settings.internals.getInternal, {
    section: "ai",
  })) as Record<string, unknown> | null;

  const provider = ((settings?.provider as string) || "openrouter") as AiProvider;
  const envVarName = envVarForProvider(provider);
  const fallbackModel = fallbackModelForProvider(provider);

  return {
    provider,
    envVarName,
    apiKey: await resolveServiceKeyAsync(settings, "apiKey", envVarName) ?? "",
    defaultModel: (settings?.defaultModel as string) || fallbackModel,
  };
}

interface ExtractedRecipe {
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
}

/**
 * Parse the model's JSON into the exact extraction shape. The model may return
 * nulls, wrong types, or extra keys; those are dropped rather than forwarded.
 */
function parseJsonResponse(raw: string): ExtractedRecipe {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  const parsed: unknown = JSON.parse(cleaned);
  const field = (key: string): unknown =>
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? Object.getOwnPropertyDescriptor(parsed, key)?.value
      : undefined;
  const text = (key: string) => {
    const value = field(key);
    return typeof value === "string" ? value : undefined;
  };
  const count = (key: string) => {
    const value = field(key);
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
  const list = (key: string) => {
    const value = field(key);
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : undefined;
  };
  const difficulty = field("difficulty");
  return {
    title: text("title"),
    excerpt: text("excerpt"),
    description: text("description"),
    prepMinutes: count("prepMinutes"),
    cookMinutes: count("cookMinutes"),
    totalMinutes: count("totalMinutes"),
    servings: text("servings"),
    yieldText: text("yieldText"),
    difficulty:
      difficulty === "easy" || difficulty === "medium" || difficulty === "hard" ? difficulty : undefined,
    ingredients: list("ingredients"),
    instructions: list("instructions"),
    notes: text("notes"),
    categorySuggestions: list("categorySuggestions"),
    scannedText: text("scannedText"),
  };
}

type AnthropicImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function anthropicImageMediaType(mimeType: string): AnthropicImageMediaType {
  if (mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp") {
    return mimeType;
  }
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "image/jpeg";
  throw new ConvexError({
    code: "VALIDATION_ERROR",
    message: "Recipe scans must be JPEG, PNG, GIF, or WebP images for this AI provider.",
  });
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
              media_type: anthropicImageMediaType(mimeType),
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

async function extractWithOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  mimeType: string,
  base64Data: string,
) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
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
    const errorText = await response.text();
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: `OpenAI API error (${response.status}): ${errorText}`,
    });
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: `OpenAI error: ${data.error.message}`,
    });
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: "The AI provider did not return recipe data",
    });
  }
  return content;
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

export const extractRecipeFromImage = action({
  args: extractRecipeFromImageArgs,
  returns: v.object({
    prepMinutes: v.optional(v.number()),
    cookMinutes: v.optional(v.number()),
    totalMinutes: v.optional(v.number()),
    scanMediaId: v.id("media"),
    aiExtractedFromScan: v.boolean(),
    title: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    description: v.optional(v.string()),
    servings: v.optional(v.string()),
    yieldText: v.optional(v.string()),
    difficulty: v.optional(v.union(v.literal("medium"), v.literal("easy"), v.literal("hard"))),
    ingredients: v.optional(v.array(v.string())),
    instructions: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    categorySuggestions: v.optional(v.array(v.string())),
    scannedText: v.optional(v.string()),
  }),
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
      provider === "anthropic"
        ? await extractWithAnthropic(
            apiKey,
            defaultModel,
            prompt,
            media.mimeType,
            base64Data,
          )
        : provider === "openai"
          ? await extractWithOpenAI(
              apiKey,
              defaultModel,
              prompt,
              media.mimeType,
              base64Data,
            )
          : await extractWithOpenRouter(
              apiKey,
              defaultModel,
              prompt,
              media.mimeType,
              base64Data,
            );

    const parsed = parseJsonResponse(raw);
    return {
      ...parsed,
      scanMediaId: args.mediaId,
      aiExtractedFromScan: true,
    };
  },
});
