import { z } from "zod";
import { publicProductCardSchema } from "./productContracts";
const id = z.string().min(1).max(256);
const label = z.string().trim().min(1).max(160);
export const productOptionsArgsSchema = z.strictObject({ product: id.optional(), attribute: z.string().max(80).default("") });
export const productOptionGroupSchema = z.strictObject({
  id, name: label, values: z.array(z.strictObject({ id, label })).min(1).max(64),
}).superRefine((group, ctx) => {
  if (new Set(group.values.map(value => value.id)).size !== group.values.length)
    ctx.addIssue({code:"custom",message:"Option values must have distinct identities."});
});
export const productOptionsResultSchema = z.strictObject({
  product: publicProductCardSchema.extend({ pricing: z.null() }).nullable(),
  groups: z.array(productOptionGroupSchema).max(16),
}).superRefine((result, ctx) => {
  if ((!result.product && result.groups.length) || new Set(result.groups.map(group => group.id)).size !== result.groups.length)
    ctx.addIssue({code:"custom",message:"Options require one visible product and distinct groups."});
});
export type ProductOptionsArgs = z.infer<typeof productOptionsArgsSchema>;
export type ProductOptionsResult = z.infer<typeof productOptionsResultSchema>;
export function productOptionsMatchArgs(args: ProductOptionsArgs, result: ProductOptionsResult): boolean {
  if (result.product && result.product.id !== args.product) return false;
  const attribute = args.attribute.trim().toLowerCase();
  return !attribute || result.groups.length <= 1 && result.groups.every(group => group.id === args.attribute.trim() || group.name.toLowerCase() === attribute);
}
/** The destination revalidates these hints against its current public variants. */
export function productOptionHref(href: string, typeId: string, valueId: string): string {
  return `${href}?${new URLSearchParams({optionType:typeId,optionValue:valueId}).toString()}`;
}
