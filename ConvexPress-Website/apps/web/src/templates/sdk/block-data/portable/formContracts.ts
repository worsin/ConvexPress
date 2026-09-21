import { z } from "zod";

const id = z.string().min(1).max(256);
const json = z.string().max(32 * 1024).refine(value => {
  try { const parsed = JSON.parse(value); return parsed !== null && typeof parsed === "object"; }
  catch { return false; }
}, "Expected serialized form configuration");
export const formArgsSchema = z.strictObject({ form: id.optional() });
export type FormArgs = z.infer<typeof formArgsSchema>;

// The public wizard only consumes these form-level options. Notification/action
// references, recipient configuration and future administrative keys stay private.
export const publicFormSettingsSchema = z.object({
  disabled: z.boolean().nullable().optional(),
  scheduleStart: z.number().finite().nullable().optional(),
  scheduleEnd: z.number().finite().nullable().optional(),
  schedule: z.object({ startsAt: z.number().finite().nullable().optional(), endsAt: z.number().finite().nullable().optional() }).nullable().optional(),
  entryLimit: z.number().int().positive().nullable().optional(),
  requireLogin: z.boolean().nullable().optional(),
  loginRequired: z.boolean().nullable().optional(),
  orderForm: z.object({
    enabled: z.boolean().optional(), showSummary: z.boolean().optional(),
    summaryTitle: z.string().max(512).optional(), paymentTitle: z.string().max(512).optional(),
    paymentDescription: z.string().max(4000).optional(),
  }).optional(),
});
export function publicFormSettings(value: unknown): string {
  return JSON.stringify(publicFormSettingsSchema.parse(value));
}
function equalOptions(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && equalOptions(left[key], right[key]));
}
export const formFieldSchema = z.strictObject({
  _id: id, label: z.string().max(1000), name: z.string().max(256), key: id,
  type: z.string().min(1).max(128), instructions: z.string().max(8000).nullable(),
  required: z.boolean(), defaultValue: z.string().max(32 * 1024).nullable(),
  settings: json, conditionalLogic: json.nullable(), parentFieldId: id.nullable(),
  menuOrder: z.number().finite(),
});
export const embeddedFormSchema = z.strictObject({
  _id: id, title: z.string().max(1000), slug: z.string().min(1).max(256),
  description: z.string().max(8000).nullable(), settings: json,
  availability: z.strictObject({
    open: z.boolean(), code: z.string().max(128).optional(), message: z.string().max(1000).optional(),
    loginRequired: z.boolean(), entryLimitReached: z.boolean(),
  }),
  security: z.strictObject({
    honeypotEnabled: z.boolean(), honeypotFieldName: z.string().min(1).max(256),
    captchaEnabled: z.boolean(), captchaProvider: z.enum(["none", "turnstile", "hcaptcha", "recaptcha"]),
    captchaSiteKey: z.string().max(1000).nullable(), recaptchaMinScore: z.number().finite(),
  }),
  fields: z.array(formFieldSchema).max(1000),
}).superRefine((form, ctx) => {
  for (const property of ["_id", "key"] as const) {
    if (new Set(form.fields.map(field => field[property])).size !== form.fields.length)
      ctx.addIssue({ code: "custom", path: ["fields"], message: `Duplicate field ${property}` });
  }
  // Re-check serialized options at the consumer boundary; a valid JSON string
  // cannot smuggle private keys through the otherwise closed DTO.
  try {
    const raw = JSON.parse(form.settings);
    if (!equalOptions(raw, JSON.parse(publicFormSettings(raw)))) throw new Error();
  } catch { ctx.addIssue({ code: "custom", path: ["settings"], message: "Unsupported public form options" }); }
});
export type EmbeddedForm = z.infer<typeof embeddedFormSchema>;
export const formResultSchema = z.strictObject({
  form: embeddedFormSchema.nullable(), asOf: z.number().int().nonnegative(),
  nextChangeAt: z.number().int().nonnegative().nullable(),
});
export type FormResult = z.infer<typeof formResultSchema>;
export function formMatchesArgs(args: FormArgs, result: FormResult): boolean {
  return result.form === null || result.form._id === args.form;
}
