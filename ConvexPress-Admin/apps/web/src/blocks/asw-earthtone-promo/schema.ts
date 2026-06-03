import { z } from "zod";

export const aswEarthtonePromoAttrsSchema = z.object({
  eyebrow: z.string().max(80).default("EarthTone Sound"),
  heading: z.string().max(140).default("EarthTone Sound"),
  body: z.string().max(1000).default(""),
  mediaId: z.string().default(""),
  mediaAlt: z.string().max(200).default(""),
  primaryCtaLabel: z.string().max(60).default(""),
  primaryCtaUrl: z.string().max(500).default(""),
  secondaryCtaLabel: z.string().max(60).default(""),
  secondaryCtaUrl: z.string().max(500).default(""),
  details: z.array(z.object({
    label: z.string().max(80).default(""),
    value: z.string().max(180).default(""),
  })).max(6).default([]),
});

export type AswEarthtonePromoAttrs = z.infer<typeof aswEarthtonePromoAttrsSchema>;
