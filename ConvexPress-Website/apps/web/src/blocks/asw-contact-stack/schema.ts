import { z } from "zod";

export const aswContactStackAttrsSchema = z.object({
  heading: z.string().max(140).default("Contact Alaska Specialty Woods"),
  intro: z.string().max(800).default(""),
  phone: z.string().max(80).default(""),
  email: z.string().max(160).default(""),
  address: z.string().max(500).default(""),
  hours: z.string().max(500).default(""),
  mapEmbedUrl: z.string().max(1000).default(""),
  items: z.array(z.object({
    label: z.string().max(80).default(""),
    value: z.string().max(300).default(""),
    href: z.string().max(500).default(""),
  })).max(8).default([]),
});

export type AswContactStackAttrs = z.infer<typeof aswContactStackAttrsSchema>;
