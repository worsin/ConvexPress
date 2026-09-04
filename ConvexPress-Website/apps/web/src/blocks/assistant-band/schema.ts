import { z } from "zod";

export const assistantBandAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(140).default("Not sure what fits? Ask."),
  body: z.string().max(600).default(""),
  /** Example questions; empty falls back to the assistant's starter prompts from settings. */
  prompts: z.array(z.string().max(160)).max(8).default([]),
  ctaLabel: z.string().max(60).default("Browse the shop"),
  ctaUrl: z.string().max(500).default("/products"),
});

export type AssistantBandAttrs = z.infer<typeof assistantBandAttrsSchema>;
