import { z } from "zod";
import { safeLinkSchema } from "./generated/field-runtime.mjs";
/** Explicit BCP 47 language tags; extensions and private-use identifiers are not routes. */
export const localeCodeSchema = z.string().min(2).max(48)
  .regex(/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?(?:-[a-z0-9]{5,8})*$/);
export const localeLabelSchema = z.string().trim().min(1).max(80)
// eslint-disable-next-line no-control-regex -- Reject control and bidi formatting characters in public language labels.
  .refine(value => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value), "Language labels must be plain text");
export const localeArgsSchema = z.strictObject({});
export const localeResultSchema = z.strictObject({
  enabled: z.boolean(),
  currentLocale: localeCodeSchema.nullable(),
  items: z.array(z.strictObject({
    code: localeCodeSchema, label: localeLabelSchema, direction: z.enum(["ltr", "rtl"]),
    href: safeLinkSchema(z, ["relative"]).max(2048)
      .refine(path => /^\/(page|blog)\/.+/.test(path), "A language destination must be a content route"),
    current: z.boolean(), destination: z.enum(["translation", "landing"]),
  })).max(24),
}).superRefine((value, ctx) => {
  if (!value.enabled && (value.items.length || value.currentLocale !== null))
    ctx.addIssue({code: "custom", message: "Disabled language routing cannot expose destinations"});
  if (new Set(value.items.map(item => item.code)).size !== value.items.length ||
      new Set(value.items.map(item => item.href)).size !== value.items.length)
    ctx.addIssue({code: "custom", message: "Language destinations must be distinct"});
  if (value.items.filter(item => item.current).length > 1 ||
      value.items.some(item => item.current && item.code !== value.currentLocale))
    ctx.addIssue({code: "custom", message: "Current language does not match its destination"});
});
export type LocaleResult = z.infer<typeof localeResultSchema>;
