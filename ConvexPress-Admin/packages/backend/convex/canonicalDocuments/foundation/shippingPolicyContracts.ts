import { z } from "zod";
import { safeLinkSchema } from "./generated/field_runtime.mjs";

/** Explicitly published store policy, never inferred from checkout defaults. */
export const shippingPromiseSchema = z.strictObject({
  icon: z.enum(["clock", "check", "heart", "map-pin", "mail"]),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(3000),
  href: safeLinkSchema(z, ["relative", "https"]).max(2048).nullable(),
});
export const shippingPromisesSchema = z.array(shippingPromiseSchema).max(8);
export const shippingPolicyArgsSchema = z.strictObject({});
export const shippingPolicyResultSchema = z.strictObject({ items: shippingPromisesSchema });
export type ShippingPromise = z.infer<typeof shippingPromiseSchema>;
export type ShippingPolicyArgs = z.infer<typeof shippingPolicyArgsSchema>;
export type ShippingPolicyResult = z.infer<typeof shippingPolicyResultSchema>;
