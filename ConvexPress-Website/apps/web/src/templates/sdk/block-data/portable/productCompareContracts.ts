import { z } from "zod";
import { publicProductCardSchema } from "./productContracts";

const id = z.string().min(1).max(256);
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const productCompareArgsSchema = z.strictObject({
  products: z.array(id).max(6).default([]),
  attributes: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});
export type ProductCompareArgs = z.infer<typeof productCompareArgsSchema>;
export const compareName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
export function compareAttributeKey(value: string): string {
  const key = compareName(value);
  if (key === "sku" || key === "format") return key;
  if (key === "type" || key === "product type") return "type";
  return key.startsWith("option:") ? `option:${compareName(key.slice(7))}` : `option:${key}`;
}
export const comparePriceSchema = z.strictObject({
  min: amount, max: amount, currencyCode: z.string().regex(/^[A-Z]{3}$/u),
}).refine(value => value.min <= value.max, "Price range must be ordered");
export const compareProductSchema = z.strictObject({
  id, title: publicProductCardSchema.shape.title, href: publicProductCardSchema.shape.href,
  image: publicProductCardSchema.shape.image, price: comparePriceSchema.nullable(),
});
const rowSchema = z.strictObject({
  key: id, label: z.string().min(1).max(160),
  cells: z.array(z.array(z.string().min(1).max(160)).min(1).max(64).nullable()).max(6),
});
export const productCompareResultSchema = z.strictObject({
  items: z.array(compareProductSchema).max(6), rows: z.array(rowSchema).max(20),
}).superRefine((value, ctx) => {
  if (new Set(value.items.map(item => item.id)).size !== value.items.length)
    ctx.addIssue({ code: "custom", path: ["items"], message: "Duplicate comparison product" });
  if (new Set(value.rows.map(row => row.key)).size !== value.rows.length)
    ctx.addIssue({ code: "custom", path: ["rows"], message: "Duplicate comparison row" });
  if (!value.items.length && value.rows.length)
    ctx.addIssue({ code: "custom", path: ["rows"], message: "An empty comparison cannot disclose rows" });
  for (const [index, row] of value.rows.entries()) {
    if (row.cells.length !== value.items.length)
      ctx.addIssue({ code: "custom", path: ["rows", index], message: "Comparison cells must align with product columns" });
    if (row.cells.some(cell => cell && new Set(cell).size !== cell.length))
      ctx.addIssue({ code: "custom", path: ["rows", index], message: "Duplicate comparison value" });
  }
});
export type ProductCompareResult = z.infer<typeof productCompareResultSchema>;
export function productCompareMatchArgs(args: ProductCompareArgs, result: ProductCompareResult): boolean {
  const selected = [...new Set(args.products)]; let previous = -1;
  for (const item of result.items) {
    const index = selected.indexOf(item.id);
    if (index <= previous) return false;
    previous = index;
  }
  if (!result.items.length) return result.rows.length === 0;
  const keys = result.rows.map(row => row.key);
  if (args.attributes.length) {
    const requested = [...new Set(args.attributes.map(compareAttributeKey))];
    return JSON.stringify(keys) === JSON.stringify(requested);
  }
  return keys[0] === "type" && keys[1] === "format" && keys[2] === "sku" && keys.slice(3).every(key => key.startsWith("option:"));
}
export function comparisonRowDiffers(row: ProductCompareResult["rows"][number]): boolean {
  const values = row.cells.map(cell => JSON.stringify(cell ? [...cell].sort() : null));
  return new Set(values).size > 1;
}
