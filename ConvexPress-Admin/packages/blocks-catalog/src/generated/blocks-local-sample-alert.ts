import { z } from "zod";

export const sampleAlertAttrsSchema = z.object({
  heading: z.string().max(120).default("Important update"),
  body: z.string().max(800).default("Add the alert copy here."),
  variant: z.union([
    z.literal("info"),
    z.literal("success"),
    z.literal("warning"),
  ]).default("info"),
  ctaLabel: z.string().max(40).default(""),
  ctaUrl: z.string().max(300).default(""),
});

export type SampleAlertAttrs = z.infer<typeof sampleAlertAttrsSchema>;
