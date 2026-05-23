"use node";

/**
 * AI image generation for media blocks.
 *
 * Workflow:
 *   1. Call the configured image-generation provider (OpenAI by default).
 *   2. Fetch the resulting image bytes into a Buffer.
 *   3. Upload to Convex storage.
 *   4. Create a `media` document with `source: "ai"` metadata.
 *   5. Return the media _id so the caller can drop it into a block.
 *
 * Config is read from the `ai` settings section, with env var fallback:
 *   - imageProvider: "openai" (default — only supported provider for now)
 *   - imageApiKey / OPENAI_IMAGE_API_KEY / OPENAI_API_KEY
 *   - imageModel: "gpt-image-1" (default), "dall-e-3"
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { getServiceKeyFromAction } from "../helpers/serviceKeys";

type ImageAspectRatio = "square" | "landscape" | "portrait" | "wide";

function dimensionsFor(aspect: ImageAspectRatio): { width: number; height: number; openaiSize: "1024x1024" | "1792x1024" | "1024x1792" } {
  switch (aspect) {
    case "landscape":
    case "wide":
      return { width: 1792, height: 1024, openaiSize: "1792x1024" };
    case "portrait":
      return { width: 1024, height: 1792, openaiSize: "1024x1792" };
    case "square":
    default:
      return { width: 1024, height: 1024, openaiSize: "1024x1024" };
  }
}

interface ResolvedImageConfig {
  apiKey: string;
  model: string;
  provider: "openai";
}

async function resolveImageConfig(ctx: {
  runQuery: (query: any, args?: any) => Promise<any>;
}): Promise<ResolvedImageConfig> {
  const settings = (await ctx.runQuery(internal.settings.internals.getInternal, {
    section: "ai",
  })) as Record<string, unknown> | null;

  const apiKey =
    (await getServiceKeyFromAction(ctx, "ai", "imageApiKey", "OPENAI_IMAGE_API_KEY")) ??
    (await getServiceKeyFromAction(ctx, "ai", "apiKey", "OPENAI_API_KEY")) ??
    "";

  const model = (settings?.imageModel as string) || "gpt-image-1";

  return { apiKey, model, provider: "openai" };
}

/**
 * Generate an image with OpenAI's image API, fetch bytes, return as a Blob.
 */
async function generateOpenAiImage(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  size: "1024x1024" | "1792x1024" | "1024x1792";
}): Promise<Uint8Array> {
  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: opts.apiKey });
    const response = await client.images.generate({
      model: opts.model,
      prompt: opts.prompt,
      size: opts.size,
      n: 1,
      response_format: "b64_json",
    } as any);
    const first = response.data?.[0] as
      | { b64_json?: string; url?: string }
      | undefined;

    if (!first) {
      throw new Error("OpenAI returned no image data");
    }

    if (first.b64_json) {
      return Uint8Array.from(Buffer.from(first.b64_json, "base64"));
    }

    if (first.url) {
      const imgResponse = await fetch(first.url);
      if (!imgResponse.ok) {
        throw new Error(`Failed to download generated image (${imgResponse.status})`);
      }
      return new Uint8Array(await imgResponse.arrayBuffer());
    }

    throw new Error("OpenAI did not return either b64_json or url");
  } catch (error) {
    throw new ConvexError({
      code: "PROVIDER_ERROR",
      message: `OpenAI image error: ${error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)}`,
    });
  }
}

/**
 * Generate an image from a prompt and store it in the media library.
 * Returns the media _id so callers can drop it into a block's `mediaId`.
 */
export const generateImage = action({
  args: {
    prompt: v.string(),
    aspect: v.optional(
      v.union(
        v.literal("square"),
        v.literal("landscape"),
        v.literal("portrait"),
        v.literal("wide"),
      ),
    ),
    /** Optional alt text override. Defaults to the prompt. */
    alt: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ mediaId: string; url: string }> => {
    const config = await resolveImageConfig(ctx);
    if (!config.apiKey) {
      throw new ConvexError({
        code: "CONFIGURATION_ERROR",
        message:
          "OpenAI image API key not configured. Set it in Settings > AI or as OPENAI_API_KEY / OPENAI_IMAGE_API_KEY.",
      });
    }

    const trimmedPrompt = args.prompt.trim();
    if (!trimmedPrompt) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Prompt cannot be empty",
      });
    }

    const dims = dimensionsFor(args.aspect ?? "square");

    // ── 1. Generate the image bytes ──────────────────────────────────────
    const bytes = await generateOpenAiImage({
      apiKey: config.apiKey,
      model: config.model,
      prompt: trimmedPrompt,
      size: dims.openaiSize,
    });

    // ── 2. Upload to Convex storage ──────────────────────────────────────
    // The Node action can use ctx.storage.store directly. We pass a fresh
    // ArrayBuffer copy because Blob's typed-array overload disagrees with
    // Uint8Array<ArrayBufferLike> in strict TS configurations.
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const blob = new Blob([buf], { type: "image/png" });
    const storageId = await ctx.storage.store(blob);

    // ── 3. Create the media document via the normal create mutation ──────
    const safeSlug = trimmedPrompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "ai-generated";
    const fileName = `ai-${safeSlug}-${Date.now().toString(36)}.png`;

    const mediaId: string = await ctx.runMutation(
      // The media.mutations.create is gated by "media.upload" capability.
      // The caller must have that — this action surface inherits the caller's auth.
      (await import("../_generated/api")).api.media.mutations.create as any,
      {
        storageId,
        fileName,
        fileSize: bytes.byteLength,
        mimeType: "image/png",
        title: trimmedPrompt.slice(0, 120),
        altText: args.alt ?? trimmedPrompt.slice(0, 200),
        caption: "",
        description: `AI-generated image. Prompt: "${trimmedPrompt}". Model: ${config.model}.`,
        width: dims.width,
        height: dims.height,
      } as any,
    );

    // ── 4. Resolve URL for the caller ────────────────────────────────────
    const url = (await ctx.storage.getUrl(storageId)) ?? "";

    return { mediaId, url };
  },
});
