import { z } from "zod";
const safeLink = z.string().max(2000).refine(value => !value || /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(value), "Use an HTTP(S), site-relative, email or telephone link");
export const fieldGuideAttrsSchema = z.object({
 heading: z.string().max(160).default(""), body: z.string().max(4000).default(""),
 count: z.number().int().min(1).max(12).default(3), spacing: z.number().int().min(0).max(8).default(4),
 showDetails: z.boolean().default(true), alignment: z.enum(["left", "center", "right"]).default("left"),
 ink: z.enum(["foreground", "primary", "muted"]).default("foreground"), font: z.enum(["body", "display"]).default("display"),
 mediaId: z.string().max(256).default(""), mediaAlt: z.string().max(250).default(""),
 note: z.string().max(160).nullable().default(null),
 link: z.object({label:z.string().max(80).default(""),href:safeLink.default(""),newTab:z.boolean().default(false)}).default({label:"",href:"",newTab:false}),
 items: z.array(z.object({label:z.string().max(100),value:z.string().max(300)})).max(12).default([]),
});
export type FieldGuideAttrs = z.infer<typeof fieldGuideAttrsSchema>;
