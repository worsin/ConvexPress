import { z } from "zod";

export const tabbedContentAttrsSchema = z.object({
  heading: z.string().max(140).default(""),
  intro: z.string().max(700).default(""),
  orientation: z.enum(["top", "left"]).default("top"),
  tabs: z.array(z.object({
    label: z.string().max(60).default("Tab"),
    title: z.string().max(140).default(""),
    body: z.string().max(3000).default(""),
    mediaId: z.string().default(""),
    mediaAlt: z.string().max(200).default(""),
    ctaLabel: z.string().max(60).default(""),
    ctaUrl: z.string().max(500).default(""),
  })).max(12).default([
    {
      label: "Overview",
      title: "Overview",
      body: "",
      mediaId: "",
      mediaAlt: "",
      ctaLabel: "",
      ctaUrl: ""
    },
    {
      label: "Details",
      title: "Details",
      body: "",
      mediaId: "",
      mediaAlt: "",
      ctaLabel: "",
      ctaUrl: ""
    }
  ]),
});

export type TabbedContentAttrs = z.infer<typeof tabbedContentAttrsSchema>;
