import { z } from "zod";

export const categoryTilesAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(140).default("Shop by category"),
  intro: z.string().max(700).default(""),
  /** Category slugs in display order; empty shows every visible category. */
  categorySlugs: z.array(z.string().max(160)).max(24).default([]),
  limit: z.number().min(1).max(24).default(6),
  columns: z.number().min(2).max(4).default(3),
  showCounts: z.boolean().default(true),
  showDescriptions: z.boolean().default(false),
  ctaLabel: z.string().max(60).default(""),
  ctaUrl: z.string().max(500).default(""),
});

export type CategoryTilesAttrs = z.infer<typeof categoryTilesAttrsSchema>;
