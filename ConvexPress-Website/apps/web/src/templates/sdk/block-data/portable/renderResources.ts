import { z } from "zod";
/** Shared media vocabulary for cloud, self-hosted HTTP, and relative assets.
 * URL transport does not grant resource access; server adapters resolve owned IDs. */
export const renderSourceSchema = z.string().max(2048).regex(/^(?:\/(?!\/)[^\s\\]*|https?:\/\/[^\s\\]+)$/u);
export const mediaSchema = z.strictObject({
  src: renderSourceSchema,
  alt: z.string().max(20000),
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
  focalPoint: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
});
export const mediaCaptionsSchema = z.strictObject({
  src: renderSourceSchema,
  language: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/u),
  label: z.string().min(1).max(240),
});
export const renderMediaSchema = mediaSchema.extend({
  mimeType: z.string().max(120).regex(/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/u).optional(),
  filename: z.string().min(1).max(255).regex(/^[^/\\]+$/u).refine(value => [...value].every(char => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127), "Filename cannot include control characters").optional(),
  byteSize: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  captions: mediaCaptionsSchema.optional(),
}).superRefine((media, ctx) => {
  for (const [field, source] of [["src", media.src], ["captions", media.captions?.src]] as const) {
    if (!source) continue;
    try { const url = new URL(source, "https://local.invalid"); if (url.username || url.password) ctx.addIssue({ code: "custom", path: [field], message: "Public media URLs cannot include credentials" }); }
    catch { ctx.addIssue({ code: "custom", path: [field], message: "Use a valid public media URL" }); }
  }
});
export const renderResourcesSchema = z.strictObject({ media: z.record(z.string().min(1).max(256), renderMediaSchema) });
export type RenderMedia = z.infer<typeof renderMediaSchema>;
export type RenderResources = z.infer<typeof renderResourcesSchema>;
