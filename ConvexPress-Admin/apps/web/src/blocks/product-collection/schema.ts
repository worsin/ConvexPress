import { z } from "zod";

const productCardSchema = z.object({
  title: z.string().max(160).default(""),
  summary: z.string().max(400).default(""),
  href: z.string().max(500).default(""),
  price: z.string().max(60).default(""),
  badge: z.string().max(60).default(""),
  mediaId: z.string().default(""),
  imageAlt: z.string().max(200).default(""),
});

export const productCollectionAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(140).default("Featured products"),
  intro: z.string().max(700).default(""),
  mode: z.enum(["manual", "category", "tag", "sale", "featured", "recent", "recentlyViewed"]).default("manual"),
  display: z.enum(["grid", "carousel", "tabs"]).default("grid"),
  productIds: z.array(z.string().max(120)).max(48).default([]),
  categorySlug: z.string().max(160).default(""),
  tagSlug: z.string().max(160).default(""),
  count: z.number().min(1).max(24).default(4),
  columns: z.number().min(2).max(4).default(4),
  showPrice: z.boolean().default(true),
  showRating: z.boolean().default(false),
  showSaleBadge: z.boolean().default(true),
  showAddToCart: z.boolean().default(false),
  ctaLabel: z.string().max(60).default(""),
  ctaUrl: z.string().max(500).default(""),
  products: z.array(productCardSchema).max(24).default([]),
  groups: z.array(z.object({
    label: z.string().max(80).default("Group"),
    productIds: z.array(z.string().max(120)).max(24).default([]),
    products: z.array(productCardSchema).max(24).default([]),
  })).max(8).default([]),
});

export type ProductCollectionAttrs = z.infer<typeof productCollectionAttrsSchema>;
export type ProductCollectionItem = z.infer<typeof productCardSchema>;
