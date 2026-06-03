import { z } from "zod";

export const aswCustomerShowcaseAttrsSchema = z.object({
  heading: z.string().max(140).default("Built with Alaska tonewood"),
  intro: z.string().max(800).default(""),
  items: z.array(z.object({
    quote: z.string().max(900).default(""),
    name: z.string().max(120).default(""),
    role: z.string().max(120).default(""),
    company: z.string().max(140).default(""),
    mediaId: z.string().default(""),
    mediaAlt: z.string().max(200).default(""),
    instrumentType: z.string().max(120).default(""),
    url: z.string().max(500).default(""),
  })).max(24).default([]),
});

export type AswCustomerShowcaseAttrs = z.infer<typeof aswCustomerShowcaseAttrsSchema>;
