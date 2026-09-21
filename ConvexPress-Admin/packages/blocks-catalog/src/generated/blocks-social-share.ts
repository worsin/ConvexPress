import { z } from "zod";

export const socialShareAttrsSchema = z.object({
  heading: z.string().max(120).default("Share this page"),
  body: z.string().max(500).default(""),
  networks: z.array(z.enum(["facebook", "x", "pinterest", "linkedin", "email", "copy"])).max(8).default([
    "facebook",
    "x",
    "pinterest",
    "email"
  ]),
  shareUrlMode: z.enum(["currentPage", "custom"]).default("currentPage"),
  customUrl: z.string().max(500).default(""),
});

export type SocialShareAttrs = z.infer<typeof socialShareAttrsSchema>;
