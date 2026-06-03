import { z } from "zod";

export const aswPageBannerAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  title: z.string().max(140).default("Page title"),
  subtitle: z.string().max(500).default(""),
  mediaId: z.string().default(""),
  mediaAlt: z.string().max(200).default(""),
  breadcrumbLabel: z.string().max(80).default(""),
  ctaLabel: z.string().max(60).default(""),
  ctaUrl: z.string().max(500).default(""),
});

export type AswPageBannerAttrs = z.infer<typeof aswPageBannerAttrsSchema>;
