import { z } from "zod";

const sourceOptions = z.array(z.object({
  id:z.string().min(1).max(256), name:z.string().trim().min(1).max(160), sortOrder:z.number().finite().optional(),
  values:z.array(z.object({id:z.string().min(1).max(256),label:z.string().trim().min(1).max(160),active:z.boolean().optional(),sortOrder:z.number().finite().optional()})).max(64),
})).max(16);

export type PublicOptionSource = { id: string; name: string; sortOrder?: number; values: { id: string; label: string; active?: boolean; sortOrder?: number }[] };
/** Keep the Zod implementation out of Convex's generated API type graph. */
export function parseSourceOptions(value: unknown): { success: true; data: PublicOptionSource[] } | { success: false } {
  const parsed = sourceOptions.safeParse(value);
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}

/** The same complete, active option combination is required when displaying a
 * public variant and when accepting it for purchase. Legacy public variants
 * without option groups remain supported. */
export function isEligibleProductVariant(productId: string, groups: PublicOptionSource[], variant: {
  productId: string;
  status?: string;
  selections?: { optionTypeId: string; optionValueId: string }[];
}): boolean {
  const selections = variant.selections ?? [];
  return variant.productId === productId && (variant.status === undefined || variant.status === "publish") &&
    selections.length === groups.length && new Set(selections.map(selection => selection.optionTypeId)).size === groups.length &&
    selections.every(selection => groups.some(group => group.id === selection.optionTypeId &&
      group.values.some(value => value.id === selection.optionValueId && value.active !== false)));
}
