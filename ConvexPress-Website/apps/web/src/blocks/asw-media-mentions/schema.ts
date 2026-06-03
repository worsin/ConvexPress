import { z } from "zod";

export const aswMediaMentionsAttrsSchema = z.object({
  heading: z.string().max(140).default("In the media"),
  intro: z.string().max(800).default(""),
  items: z.array(z.object({
    title: z.string().max(180).default(""),
    source: z.string().max(120).default(""),
    byline: z.string().max(160).default(""),
    summary: z.string().max(700).default(""),
    mediaId: z.string().default(""),
    mediaAlt: z.string().max(200).default(""),
    ctaLabel: z.string().max(60).default("Read more"),
    ctaUrl: z.string().max(500).default(""),
    kind: z.enum(["article", "pdf", "video", "audio"]).default("article"),
  })).max(24).default([]),
});

export type AswMediaMentionsAttrs = z.infer<typeof aswMediaMentionsAttrsSchema>;
