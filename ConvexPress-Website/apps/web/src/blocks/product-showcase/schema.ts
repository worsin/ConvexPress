import { z } from "zod";

export const productShowcaseAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(140).default("Featured products"),
  intro: z.string().max(700).default(""),
  /** Where the products come from. */
  source: z.enum(["newest", "category", "sale", "slugs"]).default("newest"),
  categorySlug: z.string().max(160).default(""),
  /** Product slugs, used when source is "slugs" (order preserved). */
  productSlugs: z.array(z.string().max(160)).max(24).default([]),
  count: z.number().min(1).max(24).default(4),
  columns: z.number().min(2).max(4).default(4),
  showAddToCart: z.boolean().default(true),
  ctaLabel: z.string().max(60).default(""),
  ctaUrl: z.string().max(500).default(""),
});

export type ProductShowcaseAttrs = z.infer<typeof productShowcaseAttrsSchema>;
