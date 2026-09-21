import { z } from "zod";

export const storyTimelineAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(140).default(""),
  intro: z.string().max(800).default(""),
  items: z.array(z.object({
    label: z.string().max(80).default(""),
    title: z.string().max(160).default(""),
    body: z.string().max(1600).default(""),
    mediaId: z.string().default(""),
    mediaAlt: z.string().max(200).default(""),
    side: z.enum(["auto", "left", "right"]).default("auto"),
    linkLabel: z.string().max(60).default(""),
    linkUrl: z.string().max(500).default(""),
  })).max(40).default([]),
});

export type StoryTimelineAttrs = z.infer<typeof storyTimelineAttrsSchema>;
